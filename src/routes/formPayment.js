// routes/formPayment.js
// Equivalent of formPayment.cgi
// Handles credit card payment via Eway CVN gateway.
// Two paths:
//   pmtoption=1: pay existing invoices by credit card
//   pmtoption=3: pay for entries directly (creates invoice on the fly)

import { Router }       from 'express';
import { requireAuth }  from '../middleware/auth.js';
import Invoice          from '../models/Invoice.js';
import Entry            from '../models/Entry.js';
import Address          from '../models/Address.js';
import TravelPackage    from '../models/TravelPackage.js';
import { getPool, sql } from '../config/database.js';
import { currency, currentDatetime } from '../services/helpers.js';
import { ewayCharge }   from '../services/eway.js';
import { mailHtml }     from '../services/mailer.js';
import fs               from 'fs/promises';
import path             from 'path';

const EARLY_BIRD_DATE       = new Date('2026-06-01');
const EARLY_BIRD_DISCOUNT   = 80.30;
const BUSINESS_DISCOUNT_INC = 38.50;

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEarlyBird() { return new Date() <= EARLY_BIRD_DATE; }

function calcEntryTotals(entries, status = null) {
    let subtotalEx = 0, subtotalGst = 0;
    for (const e of entries) {
        subtotalEx  += parseFloat(e.costex)  || 0;
        subtotalGst += parseFloat(e.gst)     || 0;
    }
    let partnerDiscountInc = status === 'business' ? BUSINESS_DISCOUNT_INC * entries.length * -1 : 0;
    const partnerDiscountEx  = partnerDiscountInc / 1.1;
    const partnerDiscountGst = partnerDiscountInc / 11;
    let adjEx  = subtotalEx  + partnerDiscountEx;
    let adjGst = subtotalGst + partnerDiscountGst;
    let ebDiscountInc = isEarlyBird() ? EARLY_BIRD_DISCOUNT * entries.length : 0;
    const totalInc    = adjEx + adjGst;
    const chargeAmt   = totalInc - ebDiscountInc;
    return { subtotalEx, subtotalGst, partnerDiscountInc, adjEx, adjGst, totalInc, ebDiscountInc, chargeAmt,
             earlyBirdActive: ebDiscountInc > 0,
             earlyBirdDate: EARLY_BIRD_DATE.toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' }) };
}

function calcInvoiceTotals(invoices) {
    let total = 0;
    for (const inv of invoices) {
        let t = (parseFloat(inv.totalex)||0) + (parseFloat(inv.gst)||0) - (parseFloat(inv.partnerdiscount)||0);
        if (isEarlyBird()) t -= (parseFloat(inv.ebdiscount)||0);
        total += t - (parseFloat(inv.paid)||0);
    }
    return { chargeAmt: total };
}

async function getEntriesWithNames(entryIds) {
    if (!entryIds.length) return [];
    const pool = await getPool();
    const r = await pool.request().query(`
        SELECT Entry.*, Entrant.name AS entrantname, Category.name AS categoryname
        FROM Entry
        LEFT JOIN Entrant  ON Entry.entrantid  = Entrant.entrantid
        LEFT JOIN Category ON Entry.categoryid = Category.categoryid
        WHERE Entry.entryid IN (${entryIds.join(',')}) AND Entry.deleted = 0
    `);
    return r.recordset;
}

async function getInvoicesWithPaid(invoiceIds) {
    if (!invoiceIds.length) return [];
    const pool = await getPool();
    const r = await pool.request().query(`
        SELECT i.*,
               ISNULL((SELECT SUM(pa.amount) FROM PaymentAllocation pa WHERE pa.invoiceid = i.invoiceid), 0) AS paid
        FROM Invoice i
        WHERE i.invoiceid IN (${invoiceIds.join(',')}) AND i.deleted = 0
    `);
    return r.recordset;
}

function invoiceNumber(program, invoiceId) {
    return (program.invoicenoprecursor || '') + String(invoiceId).padStart(5, '0');
}

async function createPaymentRecord(user, body, pool) {
    const r = await pool.request()
        .input('userid',              sql.Int,     user.userid)
        .input('method',              sql.VarChar, body.cardtype)
        .input('amount',              sql.Money,   parseFloat(body.chargeamt))
        .input('ewayCardHoldersName', sql.VarChar, body.ewayCardHoldersName)
        .input('ewayCardNumber',      sql.VarChar, body.ewayCardNumber)
        .input('ewayCardExpiryMonth', sql.VarChar, body.ewayCardExpiryMonth)
        .input('ewayCardExpiryYear',  sql.VarChar, body.ewayCardExpiryYear)
        .input('ewayCVN',             sql.VarChar, body.ewayCVN)
        .query(`
            INSERT INTO Payment (userid, date, method, amount, ewayCardHoldersName, ewayCardNumber,
                ewayCardExpiryMonth, ewayCardExpiryYear, ewayCVN)
            VALUES (@userid, GETDATE(), @method, @amount, @ewayCardHoldersName, @ewayCardNumber,
                @ewayCardExpiryMonth, @ewayCardExpiryYear, @ewayCVN);
            SELECT SCOPE_IDENTITY() AS paymentid
        `);
    return r.recordset[0].paymentid;
}

async function updatePaymentResult(paymentid, data, pool) {
    await pool.request()
        .input('paymentid',         sql.Int,     paymentid)
        .input('ewayTrxnStatus',    sql.VarChar, data.ewayTrxnStatus    || '')
        .input('ewayTrxnError',     sql.VarChar, data.ewayTrxnError     || '')
        .input('ewayReturnAmount',  sql.VarChar, data.ewayReturnAmount  || '')
        .input('ewayTrxnReference', sql.VarChar, data.ewayTrxnReference || '')
        .input('ewayTrxnNumber',    sql.VarChar, data.ewayTrxnNumber    || '')
        .input('ewayAuthCode',      sql.VarChar, data.ewayAuthCode      || '')
        .query(`
            UPDATE Payment SET
                ewayTrxnStatus    = @ewayTrxnStatus,
                ewayTrxnError     = @ewayTrxnError,
                ewayReturnAmount  = @ewayReturnAmount,
                ewayTrxnReference = @ewayTrxnReference,
                ewayTrxnNumber    = @ewayTrxnNumber,
                ewayAuthCode      = @ewayAuthCode
            WHERE paymentid = @paymentid
        `);
}

const CC_YEARS = () => {
    const y = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => String(y + i).slice(-2));
};

// ── GET /formPayment — should not be accessed directly ────────────────────────
router.get('/', (req, res) => res.redirect('/home'));

// ── POST /formPayment ─────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const body    = req.body;

        // Parse entry/invoice IDs from checkboxes
        const entryIds   = Object.keys(body).filter(k => k.startsWith('#ENT#') && body[k] === 'ON').map(k => parseInt(k.replace('#ENT#','')));
        const invoiceIds = Object.keys(body).filter(k => k.startsWith('#INV#') && body[k] === 'ON').map(k => parseInt(k.replace('#INV#','')));

        // ── Step 1: Show payment form ─────────────────────────────────────────
        if (body.submit === 'Continue') {
            let chargeAmt = 0;
            let entries   = [];
            let invoices  = [];
            let totals    = {};

            if (entryIds.length) {
                entries  = await getEntriesWithNames(entryIds);
                totals   = calcEntryTotals(entries, body.status);
                chargeAmt = totals.chargeAmt;
            } else if (invoiceIds.length) {
                invoices  = await getInvoicesWithPaid(invoiceIds);
                totals    = calcInvoiceTotals(invoices);
                chargeAmt = totals.chargeAmt;
            } else {
                return res.redirect(`/formPaymentOptions?pmtoption=${body.pmtoption||1}&action=nodata`);
            }

            return res.renderInShell('formPayment', {
                user, program, entries, invoices, totals, chargeAmt,
                pmtoption: body.pmtoption, status: body.status || '',
                entryIds, invoiceIds, ccYears: CC_YEARS(),
                error: null, isForm: true,
            });
        }

        // ── Step 2: Process payment ───────────────────────────────────────────
        if (body.submit === 'Make Payment') {
            const pool     = await getPool();
            const chargeAmt = parseFloat(body.chargeamt);
            const pmtoption = parseInt(body.pmtoption);

            // Create payment record
            const paymentid = await createPaymentRecord(user, body, pool);
            const paymentNo = invoiceNumber(program, paymentid);

            // Talk to Eway
            let ewayData = {};
            // Get user's postal address for Eway fields
            const userAddress = user.postaladdressid
                ? await Address.findByPk(user.postaladdressid)
                : null;

            try {
                ewayData = await ewayCharge({
                    gatewayUrl:          program.ewaygatewayaddress,
                    customerId:          program.ewaycustomerno,
                    amountCents:         Math.round(chargeAmt * 100),
                    cardName:            body.ewayCardHoldersName,
                    cardNumber:          body.ewayCardNumber,
                    cardExpiryMonth:     body.ewayCardExpiryMonth,
                    cardExpiryYear:      body.ewayCardExpiryYear,
                    cvn:                 body.ewayCVN,
                    reference:           paymentNo,
                    firstName:           user.firstname || '',
                    lastName:            user.lastname  || '',
                    email:               user.email     || '',
                    address:             userAddress?.address || '',
                    postcode:            userAddress?.code    || '',
                    invoiceDescription:  `${program.name} Entry Payment`,
                    invoiceRef:          paymentNo,
                });
            } catch (e) {
                ewayData = { ewayTrxnStatus: 'False', ewayTrxnError: e.message };
            }

            await updatePaymentResult(paymentid, ewayData, pool);

            // ── Payment failed ────────────────────────────────────────────────
            if (ewayData.ewayTrxnStatus !== 'True') {
                let entries  = entryIds.length  ? await getEntriesWithNames(entryIds)   : [];
                let invoices = invoiceIds.length ? await getInvoicesWithPaid(invoiceIds) : [];
                let totals   = entryIds.length ? calcEntryTotals(entries, body.status) : calcInvoiceTotals(invoices);
                return res.renderInShell('formPayment', {
                    user, program, entries, invoices, totals, chargeAmt,
                    pmtoption: body.pmtoption, status: body.status || '',
                    entryIds, invoiceIds, ccYears: CC_YEARS(),
                    error: `Transaction failed: ${ewayData.ewayTrxnError || 'Unknown error'}`,
                    isForm: true,
                });
            }

            // ── Payment succeeded — path A: paying entries directly ───────────
            if (pmtoption === 3 && entryIds.length) {
                const entries = await getEntriesWithNames(entryIds);
                const totals  = calcEntryTotals(entries, body.status);

                // Create invoice
                const invResult = await pool.request()
                    .input('userid',          sql.Int,     user.userid)
                    .input('invoicee',        sql.VarChar, body.invoicee || user.organisation)
                    .input('email',           sql.VarChar, body.email    || user.email)
                    .input('postaladdressid', sql.Int,     user.postaladdressid)
                    .input('totalex',         sql.Money,   totals.subtotalEx)
                    .input('gst',             sql.Money,   totals.subtotalGst)
                    .input('ebdiscount',      sql.Money,   totals.ebDiscountInc)
                    .input('partnerdiscount', sql.Money,   Math.abs(totals.partnerDiscountInc))
                    .query(`
                        INSERT INTO Invoice (userid, date, invoicee, email, postaladdressid, totalex, gst, ebdiscount, partnerdiscount, deleted)
                        VALUES (@userid, GETDATE(), @invoicee, @email, @postaladdressid, @totalex, @gst, @ebdiscount, @partnerdiscount, 0);
                        SELECT SCOPE_IDENTITY() AS invoiceid
                    `);
                const invoiceId = invResult.recordset[0].invoiceid;
                const invoiceNo = invoiceNumber(program, invoiceId);

                // Link entries to invoice and mark accepted
                for (const entry of entries) {
                    await pool.request()
                        .input('invoiceid',     sql.Int, invoiceId)
                        .input('entryaccepted', sql.Bit, 1)
                        .input('entryid',       sql.Int, entry.entryid)
                        .query('UPDATE Entry SET invoiceid=@invoiceid, entryaccepted=@entryaccepted WHERE entryid=@entryid');
                }

                // Create payment allocation
                await pool.request()
                    .input('invoiceid',  sql.Int,   invoiceId)
                    .input('paymentid',  sql.Int,   paymentid)
                    .input('amount',     sql.Money,  parseFloat(ewayData.ewayReturnAmount || chargeAmt * 100) / 100)
                    .query('INSERT INTO PaymentAllocation (invoiceid, paymentid, amount) VALUES (@invoiceid, @paymentid, @amount)');

                const invoice = await Invoice.findByPk(invoiceId);
                const address = await Address.findByPk(invoice.postaladdressid);

                return res.renderInShell('formPayment', {
                    user, program, invoice, invoiceNo, entries, address, totals, paymentid,
                    ewayData, chargeAmt, isForm: false, error: null,
                    receipt: substituteReceiptTokens(program.receipttext, { chargeAmt, ewayData, program }),
                });
            }

            // ── Payment succeeded — path B: paying existing invoices ──────────
            if (pmtoption === 1 && invoiceIds.length) {
                const invoices = await getInvoicesWithPaid(invoiceIds);
                let allEntries = [];

                for (const inv of invoices) {
                    await pool.request()
                        .input('invoiceid',  sql.Int,   inv.invoiceid)
                        .input('paymentid',  sql.Int,   paymentid)
                        .input('amount',     sql.Money,  parseFloat(ewayData.ewayReturnAmount || chargeAmt * 100) / 100)
                        .query('INSERT INTO PaymentAllocation (invoiceid, paymentid, amount) VALUES (@invoiceid, @paymentid, @amount)');

                    const r = await pool.request()
                        .input('invoiceid', sql.Int, inv.invoiceid)
                        .query(`SELECT Entry.*, Entrant.name AS entrantname, Category.name AS categoryname
                                FROM Entry LEFT JOIN Entrant ON Entry.entrantid=Entrant.entrantid
                                LEFT JOIN Category ON Entry.categoryid=Category.categoryid
                                WHERE Entry.invoiceid=@invoiceid AND Entry.deleted=0`);
                    for (const e of r.recordset) {
                        await pool.request()
                            .input('entryid', sql.Int, e.entryid)
                            .query('UPDATE Entry SET entryaccepted=1 WHERE entryid=@entryid');
                        allEntries.push(e);
                    }
                }

                return res.renderInShell('formPayment', {
                    user, program, invoices, allEntries, paymentid,
                    ewayData, chargeAmt, isForm: false, error: null,
                    receipt: substituteReceiptTokens(program.receipttext, { chargeAmt, ewayData, program }),
                });
            }
        }

        return res.redirect('/home');

    } catch (err) { next(err); }
});

function substituteReceiptTokens(text, { chargeAmt, ewayData, program }) {
    if (!text) return '';
    const pmtAmt  = `$${parseFloat(chargeAmt).toFixed(2)}`;
    const pmtDate = new Date().toLocaleDateString('en-AU');
    const recNo   = ewayData.ewayTrxnNumber || '';
    const prog    = program.name || '';
    return text
        .replace(/&lt;~pmtamt~&gt;/g,   pmtAmt)
        .replace(/<~pmtamt~>/g,         pmtAmt)
        .replace(/&lt;~pmtdate~&gt;/g,  pmtDate)
        .replace(/<~pmtdate~>/g,        pmtDate)
        .replace(/&lt;~recno~&gt;/g,    recNo)
        .replace(/<~recno~>/g,          recNo)
        .replace(/&lt;~progname~&gt;/g, prog)
        .replace(/<~progname~>/g,       prog);
}

export default router;
