// routes/formInvoice.js
// Handles invoice creation (EFT path) and invoice viewing.
// Flow: formPaymentOptions (pmtoption=2) → POST here with entry checkboxes
//       → show invoice form → POST Create Invoice → show completed invoice

import { Router }           from 'express';
import { requireAuth }      from '../middleware/auth.js';
import Invoice              from '../models/Invoice.js';
import Entry                from '../models/Entry.js';
import Address              from '../models/Address.js';
import TravelPackage        from '../models/TravelPackage.js';
import { getPool, sql }     from '../config/database.js';
import { currency, currentDatetime } from '../services/helpers.js';
import { mailHtml, parseSmtp } from '../services/mailer.js';
import { getApplicableDiscounts, computeBestDiscount, incrementDiscountUsecount } from '../services/pricing.js';
import ProgramDiscount from '../models/ProgramDiscount.js';
import fs                   from 'fs/promises';
import path                 from 'path';

const BUSINESS_DISCOUNT_INC = 38.50;  // inc GST per entry — partner/industry discount

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function calcTotals(program, entries, { invoice = null, status = null, promoCode = null } = {}) {
    let subtotalEx  = 0;
    let subtotalGst = 0;
    for (const e of entries) {
        subtotalEx  += parseFloat(e.costex) || 0;
        subtotalGst += parseFloat(e.gst)    || 0;
    }

    // Partner / industry discount
    let partnerDiscountInc = 0;
    if (invoice) {
        partnerDiscountInc = (parseFloat(invoice.partnerdiscount) || 0) * -1;
    } else if (status === 'business') {
        partnerDiscountInc = BUSINESS_DISCOUNT_INC * entries.length * -1;
    }
    const partnerDiscountEx  = partnerDiscountInc / 1.1;
    const partnerDiscountGst = partnerDiscountInc / 11;

    const adjEx  = subtotalEx  + partnerDiscountEx;
    const adjGst = subtotalGst + partnerDiscountGst;
    const totalInc = adjEx + adjGst;

    // Early bird / promo code discount — DB driven
    let ebDiscountInc  = 0;
    let appliedDiscount = null;

    if (invoice) {
        // Already stored on the invoice
        ebDiscountInc = parseFloat(invoice.ebdiscount) || 0;
    } else {
        const discounts = await getApplicableDiscounts(program.programid, new Date(), promoCode);
        const best = computeBestDiscount(discounts, entries.length, totalInc);
        if (best) {
            ebDiscountInc   = best.discountInc;
            appliedDiscount = best.discount;
        }
    }

    const totalAfterEb = totalInc - ebDiscountInc;

    let earlyBirdDate = null;
    if (appliedDiscount?.type === 'earlybird' && appliedDiscount.validto) {
        earlyBirdDate = new Date(appliedDiscount.validto)
            .toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    return {
        subtotalEx, subtotalGst,
        partnerDiscountInc, partnerDiscountEx, partnerDiscountGst,
        adjEx, adjGst, totalInc,
        ebDiscountInc, totalAfterEb,
        earlyBirdActive: ebDiscountInc > 0,
        earlyBirdDate,
        appliedDiscount,
        isPromoCode: appliedDiscount?.type === 'code',
    };
}

async function getEntriesWithNames(where) {
    const pool = await getPool();
    const conditions = Object.entries(where)
        .map(([k]) => `Entry.${k} = @${k}`).join(' AND ');
    const req = pool.request();
    for (const [k, v] of Object.entries(where)) req.input(k, v);
    const r = await req.query(`
        SELECT Entry.entryid, Entry.userid, Entry.entrantid, Entry.categoryid,
               Entry.invoiceid, Entry.userref, Entry.deleted, Entry.entryaccepted, Entry.tpkid,
               Category.costex, Category.gst,
               Entrant.name AS entrantname, Category.name AS categoryname
        FROM Entry
        LEFT JOIN Entrant  ON Entry.entrantid  = Entrant.entrantid
        LEFT JOIN Category ON Entry.categoryid = Category.categoryid
        WHERE ${conditions} AND Entry.deleted = 0
    `);
    return r.recordset;
}

async function getEntriesForInvoice(invoiceId) {
    return getEntriesWithNames({ invoiceid: invoiceId });
}

function invoiceNumber(program, invoiceId) {
    return (program.invoicenoprecursor || '') + String(invoiceId).padStart(5, '0');
}

function substituteInvoiceNo(text, invoiceNo) {
    if (!text) return '';
    return text.replace(/&lt;~invoiceno~&gt;/g, invoiceNo)
               .replace(/<~invoiceno~>/g, invoiceNo);
}

// ── GET /formInvoice — view existing invoice ──────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const { invoiceid, action } = req.query;

        if (!invoiceid) return res.redirect('/home');

        const invoice = await Invoice.findByPk(parseInt(invoiceid));
        if (!invoice || invoice.userid !== user.userid) return res.redirect('/home');

        // Delete action
        if (action === 'delete') {
            const delPool = await getPool();
            await delPool.request()
                .input('invoiceid', sql.Int, invoice.invoiceid)
                .query('UPDATE Invoice SET deleted=1 WHERE invoiceid=@invoiceid');
            await delPool.request()
                .input('invoiceid', sql.Int, invoice.invoiceid)
                .query('UPDATE Entry SET invoiceid=NULL WHERE invoiceid=@invoiceid');
            const tpks = await TravelPackage.findAll({ where: { invoiceid: invoice.invoiceid } });
            for (const tpk of tpks) {
                await delPool.request()
                    .input('entryid', sql.Int, tpk.entryid)
                    .query('UPDATE Entry SET tpkid=NULL WHERE entryid=@entryid');
                await tpk.destroy();
            }
            return res.redirect('/formPaymentOptions?submit=1&pmtoption=1');
        }

        const entries   = await getEntriesForInvoice(invoice.invoiceid);
        const address   = await Address.findByPk(invoice.postaladdressid);
        const totals    = await calcTotals(program, entries, { invoice });
        const invoiceNo = invoiceNumber(program, invoice.invoiceid);

        return res.renderInShell('formInvoice', {
            user, program, invoice, entries, address, totals, invoiceNo,
            pmtInstructions: substituteInvoiceNo(program.paymentinstructionstext, invoiceNo),
            remittance:      substituteInvoiceNo(program.remittanceadvicetext, invoiceNo),
            isNew: false, error: null,
            emailed:    req.query.emailed === '1',
            emailSentTo: req.query.sentto || invoice.email,
        });

    } catch (err) { next(err); }
});

// ── POST /formInvoice ─────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const body    = req.body;

        // ── Email action ──────────────────────────────────────────────────────
        if (req.query.action === 'email' && body.invoiceid) {
            const invoice  = await Invoice.findByPk(parseInt(body.invoiceid));
            if (!invoice || invoice.userid !== user.userid) return res.redirect('/home');
            const entries  = await getEntriesForInvoice(invoice.invoiceid);
            const address  = await Address.findByPk(invoice.postaladdressid);
            const totals   = await calcTotals(program, entries, { invoice });
            const invoiceNo = invoiceNumber(program, invoice.invoiceid);
            const TEMPLATE_ROOT = process.env.TEMPLATE_ROOT;
            const emailShell = await fs.readFile(path.join(TEMPLATE_ROOT, program.emailhtml), 'utf8');
            const invoiceLocals = {
                user, program, invoice, entries, address, totals, invoiceNo,
                pmtInstructions: substituteInvoiceNo(program.paymentinstructionstext, invoiceNo),
                remittance:      substituteInvoiceNo(program.remittanceadvicetext, invoiceNo),
                isNew: false, error: null, forEmail: true,
            };
            res.render('formInvoice-content', invoiceLocals, async (renderErr, content) => {
                if (!renderErr) {
                    const html = emailShell.replace('<CGIINSERT>', content);
                    await mailHtml({
                        to:       body.emailto || invoice.email,
                        subject:  `${program.name} Invoice No ${invoiceNo}`,
                        html,
                        from:     program.emailfromaddress,
                        ...parseSmtp(program.smtpserver),
                    }).catch(e => console.error('Invoice resend failed:', e));
                }
            });
            const sentTo = encodeURIComponent(body.emailto || invoice.email);
            return res.redirect(`/formInvoice?invoiceid=${invoice.invoiceid}&emailed=1&sentto=${sentTo}`);
        }

        // Parse entry IDs from checkbox params (#ENT#id = ON)
        const entryIds = Object.keys(body)
            .filter(k => k.startsWith('#ENT#') && body[k] === 'ON')
            .map(k => parseInt(k.replace('#ENT#', '')));

        if (!entryIds.length) {
            return res.redirect(`/formPaymentOptions?pmtoption=${body.pmtoption || 2}&action=nodata`);
        }

        const pool2  = await getPool();
        const idList = entryIds.join(',');
        const r2     = await pool2.request().query(`
            SELECT Entry.entryid, Entry.userid, Entry.entrantid, Entry.categoryid,
                   Entry.invoiceid, Entry.userref, Entry.deleted, Entry.entryaccepted, Entry.tpkid,
                   Category.costex, Category.gst,
                   Entrant.name AS entrantname, Category.name AS categoryname
            FROM Entry
            LEFT JOIN Entrant  ON Entry.entrantid  = Entrant.entrantid
            LEFT JOIN Category ON Entry.categoryid = Category.categoryid
            WHERE Entry.entryid IN (${idList}) AND Entry.deleted = 0
        `);
        const entries = r2.recordset;

        // ── Step 1: Show invoice form ─────────────────────────────────────────
        if (body.submit === 'Continue') {
            const [addresses, totals, codeDiscountCount] = await Promise.all([
                Address.findAll({ where: { userid: user.userid } }),
                calcTotals(program, entries, { status: body.status }),
                ProgramDiscount.count({ where: { programid: program.programid, type: 'code', active: true } }),
            ]);

            return res.renderInShell('formInvoice', {
                user, program, entries, addresses, totals,
                invoicee: user.organisation || '',
                email:    user.email,
                isNew: true, error: null,
                entryIds, status: body.status || '',
                promoCode: '', hasPromoCodes: codeDiscountCount > 0,
            });
        }

        // ── Step 2: Create invoice ────────────────────────────────────────────
        if (body.submit === 'Create Invoice') {
            if (body.postaladdressid === 'a') {
                const [addresses, totals, codeDiscountCount] = await Promise.all([
                    Address.findAll({ where: { userid: user.userid } }),
                    calcTotals(program, entries, { status: body.status, promoCode: body.promocode }),
                    ProgramDiscount.count({ where: { programid: program.programid, type: 'code', active: true } }),
                ]);
                return res.renderInShell('formInvoice', {
                    user, program, entries, addresses, totals,
                    invoicee: body.invoicee, email: body.email,
                    isNew: true, error: 'Please select or enter a postal address.',
                    entryIds, status: body.status || '',
                    promoCode: body.promocode || '', hasPromoCodes: codeDiscountCount > 0,
                });
            }

            // Handle new address
            let postaladdressid = parseInt(body.postaladdressid);
            if (body.postaladdressid === 'b') {
                const newAddr = await Address.create({
                    userid:  user.userid,
                    address: body.postaladdress,
                    city:    body.postalcity,
                    state:   body.postalstate,
                    code:    body.postalcode,
                    country: body.postalcountry,
                });
                postaladdressid = newAddr.addressid;
            }

            const promoCode = body.promocode || null;
            const totals    = await calcTotals(program, entries, { status: body.status, promoCode });

            const insertPool = await getPool();
            const insertResult = await insertPool.request()
                .input('userid',          sql.Int,     user.userid)
                .input('invoicee',        sql.VarChar,  body.invoicee)
                .input('email',           sql.VarChar,  body.email)
                .input('postaladdressid', sql.Int,      postaladdressid)
                .input('totalex',         sql.Money,    totals.subtotalEx)
                .input('gst',             sql.Money,    totals.subtotalGst)
                .input('ebdiscount',      sql.Money,    totals.ebDiscountInc)
                .input('partnerdiscount', sql.Money,    Math.abs(totals.partnerDiscountInc))
                .input('promocode',       sql.VarChar,  promoCode)
                .query(`
                    INSERT INTO Invoice (userid, date, invoicee, email, postaladdressid, totalex, gst, ebdiscount, partnerdiscount, promocode, deleted)
                    VALUES (@userid, GETDATE(), @invoicee, @email, @postaladdressid, @totalex, @gst, @ebdiscount, @partnerdiscount, @promocode, 0);
                    SELECT SCOPE_IDENTITY() AS invoiceid
                `);
            const invoice = await Invoice.findByPk(insertResult.recordset[0].invoiceid);

            // Increment usecount for code discounts
            if (totals.appliedDiscount?.type === 'code') {
                await incrementDiscountUsecount(totals.appliedDiscount.discountid);
            }

            // Link entries to invoice and lock in the current category cost
            for (const entry of entries) {
                await insertPool.request()
                    .input('invoiceid', sql.Int,   invoice.invoiceid)
                    .input('costex',    sql.Money, parseFloat(entry.costex) || 0)
                    .input('gst',       sql.Money, parseFloat(entry.gst)    || 0)
                    .input('entryid',   sql.Int,   entry.entryid)
                    .query('UPDATE Entry SET invoiceid=@invoiceid, costex=@costex, gst=@gst WHERE entryid=@entryid');
            }

            const invoiceNo = invoiceNumber(program, invoice.invoiceid);
            const address   = await Address.findByPk(postaladdressid);

            const TEMPLATE_ROOT = process.env.TEMPLATE_ROOT;
            const emailShell    = await fs.readFile(path.join(TEMPLATE_ROOT, program.emailhtml), 'utf8');
            const invoiceLocals = {
                user, program, invoice, entries, address, totals, invoiceNo,
                pmtInstructions: substituteInvoiceNo(program.paymentinstructionstext, invoiceNo),
                remittance:      substituteInvoiceNo(program.remittanceadvicetext, invoiceNo),
                isNew: false, error: null, forEmail: true,
            };
            res.render('formInvoice-content', invoiceLocals, async (err, content) => {
                if (!err) {
                    const html = emailShell.replace('<CGIINSERT>', content);
                    await mailHtml({
                        to:       invoice.email,
                        subject:  `${program.name} Invoice No ${invoiceNo}`,
                        html,
                        from:     program.emailfromaddress,
                        ...parseSmtp(program.smtpserver),
                    }).catch(e => console.error('Invoice email failed:', e));
                }
            });

            return res.renderInShell('formInvoice', {
                user, program, invoice, entries, address, totals, invoiceNo,
                pmtInstructions: substituteInvoiceNo(program.paymentinstructionstext, invoiceNo),
                remittance:      substituteInvoiceNo(program.remittanceadvicetext, invoiceNo),
                isNew: false, error: null,
            });
        }

        return res.redirect('/home');

    } catch (err) { next(err); }
});

export default router;
