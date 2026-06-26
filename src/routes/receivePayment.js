// routes/receivePayment.js
// Admin: record an EFT or credit-card (MOTO) payment against outstanding invoices.
// One payment can cover several invoices; amounts are allocated per invoice and the
// entries can be accepted even if the amount doesn't match exactly. Early-bird discount
// is applied to the invoice when the payment date is on/before the EB cutoff.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getPool, sql } from '../config/database.js';
import { ewayCharge } from '../services/eway.js';
import { getApplicableDiscounts, computeBestDiscount } from '../services/pricing.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const back = (extra = '') => '/home?action=receivepayment' + extra;
const maskCard = n => { const d = (n || '').replace(/\D/g, ''); return d ? '****' + d.slice(-4) : ''; };

router.post('/', async (req, res, next) => {
    try {
        const program = req.program;
        const body    = req.body;
        const pool    = await getPool();

        // Invoices with an amount in their allocate box are the ones being paid.
        const allocations = Object.keys(body)
            .filter(k => k.startsWith('amt~') && parseFloat(body[k]) > 0)
            .map(k => ({ invoiceid: parseInt(k.slice(4)), amount: parseFloat(body[k]) }));
        if (!allocations.length) return res.redirect(back());

        const allocatedTotal = allocations.reduce((s, a) => s + a.amount, 0);
        const received = parseFloat(body.amountreceived);
        // The allocations must fully account for the amount received.
        if (!isNaN(received) && Math.abs(received - allocatedTotal) > 0.005) {
            return res.redirect(back('&allocerror=1'));
        }
        const total = !isNaN(received) ? received : allocatedTotal;  // recorded payment amount
        const method   = body.method === 'card' ? 'card' : 'eft';
        const paymentDate = body.paymentdate ? new Date(body.paymentdate) : new Date();

        // Payment.userid = the invoice owner (entrant), for reporting.
        const owner = (await pool.request().input('id', sql.Int, allocations[0].invoiceid)
            .query('SELECT userid FROM Invoice WHERE invoiceid = @id')).recordset[0];
        const payUserId = owner?.userid || req.user.userid;

        // ── Credit card: charge via eWay (MOTO) ──────────────────────────────
        let eway = {};
        if (method === 'card') {
            try {
                eway = await ewayCharge({
                    gatewayUrl:         program.ewaygatewayaddress,
                    customerId:         program.ewaycustomerno,
                    amountCents:        Math.round(total * 100),
                    cardName:           body.ewayCardHoldersName,
                    cardNumber:         body.ewayCardNumber,
                    cardExpiryMonth:    body.ewayCardExpiryMonth,
                    cardExpiryYear:     body.ewayCardExpiryYear,
                    cvn:                body.ewayCVN,
                    reference:          'ADMIN-' + allocations[0].invoiceid,
                    invoiceDescription: `${program.name} Entry Payment`,
                    invoiceRef:         'ADMIN-' + allocations[0].invoiceid,
                });
            } catch (e) { eway = { ewayTrxnStatus: 'False', ewayTrxnError: e.message }; }
            if (eway.ewayTrxnStatus !== 'True') {
                return res.redirect(back('&carderror=' + encodeURIComponent(eway.ewayTrxnError || 'Card declined')));
            }
        }

        // ── Create the payment record ────────────────────────────────────────
        const pr = await pool.request()
            .input('userid',  sql.Int,      payUserId)
            .input('procby',  sql.Int,      req.user.userid)
            .input('date',    sql.DateTime, paymentDate)
            .input('method',  sql.VarChar,  method === 'card' ? 'Credit Card' : 'EFT')
            .input('amount',  sql.Money,    total)
            .input('ref',     sql.VarChar,  method === 'eft'  ? (body.directDepositRef || '') : null)
            .input('chName',  sql.VarChar,  method === 'card' ? (body.ewayCardHoldersName || '') : null)
            .input('chNum',   sql.VarChar,  method === 'card' ? maskCard(body.ewayCardNumber) : null)
            .input('status',  sql.VarChar,  method === 'card' ? (eway.ewayTrxnStatus || '') : null)
            .input('trxnNo',  sql.VarChar,  method === 'card' ? (eway.ewayTrxnNumber || '') : null)
            .input('auth',    sql.VarChar,  method === 'card' ? (eway.ewayAuthCode || '') : null)
            .input('retAmt',  sql.VarChar,  method === 'card' ? (eway.ewayReturnAmount || '') : null)
            .query(`
                INSERT INTO Payment (userid, processedby, date, method, amount, directDepositRef,
                    ewayCardHoldersName, ewayCardNumber, ewayTrxnStatus, ewayTrxnNumber, ewayAuthCode, ewayReturnAmount)
                VALUES (@userid, @procby, @date, @method, @amount, @ref,
                    @chName, @chNum, @status, @trxnNo, @auth, @retAmt);
                SELECT SCOPE_IDENTITY() AS paymentid;
            `);
        const paymentid = pr.recordset[0].paymentid;

        // ── Early-bird: discounts still valid at the payment date (multi-tier) ─
        const ebDiscounts = (await getApplicableDiscounts(program.programid, paymentDate))
            .filter(d => d.type === 'earlybird');

        for (const a of allocations) {
            await pool.request()
                .input('inv', sql.Int,   a.invoiceid)
                .input('pmt', sql.Int,   paymentid)
                .input('amt', sql.Money, a.amount)
                .query('INSERT INTO PaymentAllocation (invoiceid, paymentid, amount) VALUES (@inv, @pmt, @amt)');

            if (ebDiscounts.length) {
                const inv = (await pool.request().input('id', sql.Int, a.invoiceid).query(`
                    SELECT totalex, gst, partnerdiscount, multientryadjustment,
                           (SELECT COUNT(*) FROM Entry e WHERE e.invoiceid = Invoice.invoiceid AND e.deleted = 0) AS cnt
                    FROM Invoice WHERE invoiceid = @id`)).recordset[0];
                const full = (+inv.totalex || 0) + (+inv.gst || 0) - (+inv.partnerdiscount || 0) - (+inv.multientryadjustment || 0);
                const ebDisc = computeBestDiscount(ebDiscounts, inv.cnt, full)?.discountInc || 0;
                // Only apply the discount if they actually paid (about) the discounted
                // amount — if they paid the full amount they didn't take the discount.
                const tookDiscount = ebDisc > 0 && Math.abs(a.amount - (full - ebDisc)) <= 0.50;
                if (tookDiscount) {
                    await pool.request().input('id', sql.Int, a.invoiceid).input('eb', sql.Money, ebDisc)
                        .query('UPDATE Invoice SET ebdiscount = @eb WHERE invoiceid = @id');
                }
            }

            // Recording a payment accepts the invoice's entries (admin has confirmed
            // any amount discrepancy on the form before submitting).
            await pool.request().input('inv', sql.Int, a.invoiceid)
                .query('UPDATE Entry SET entryaccepted = 1 WHERE invoiceid = @inv AND deleted = 0');
        }

        res.redirect(back('&saved=1'));
    } catch (err) { next(err); }
});

// Delete an admin-recorded payment (e.g. one assigned to the wrong invoice). Removes the
// payment + its allocations; any invoice left with no remaining payment is reverted to
// unpaid — its entries un-accepted and the at-payment early-bird discount cleared.
// Only admin-recorded payments (processedby set) in this program can be deleted; entrant
// online payments must be refunded instead.
router.post('/deletePayment', async (req, res, next) => {
    try {
        const pool = await getPool();
        const paymentid = parseInt(req.body.paymentid);
        if (!paymentid) return res.redirect(back('&delerror=1'));

        const pay = (await pool.request().input('p', sql.Int, paymentid)
            .query('SELECT processedby FROM Payment WHERE paymentid = @p')).recordset[0];
        if (!pay || pay.processedby == null) return res.redirect(back('&delerror=notadmin'));

        // Affected invoices that belong to THIS program (also the authorization check).
        const invs = (await pool.request().input('p', sql.Int, paymentid).input('pid', sql.Int, req.program.programid).query(`
            SELECT DISTINCT pa.invoiceid
            FROM PaymentAllocation pa
            JOIN Invoice i ON i.invoiceid = pa.invoiceid
            JOIN [User] u  ON u.userid = i.userid
            WHERE pa.paymentid = @p AND u.programid = @pid`)).recordset.map(r => r.invoiceid);
        if (!invs.length) return res.redirect(back('&delerror=1'));

        await pool.request().input('p', sql.Int, paymentid).query('DELETE FROM PaymentAllocation WHERE paymentid = @p');
        await pool.request().input('p', sql.Int, paymentid).query('DELETE FROM Payment WHERE paymentid = @p AND processedby IS NOT NULL');

        for (const invId of invs) {
            const remaining = (await pool.request().input('i', sql.Int, invId)
                .query('SELECT COUNT(*) AS c FROM PaymentAllocation WHERE invoiceid = @i')).recordset[0].c;
            if (remaining === 0) {
                await pool.request().input('i', sql.Int, invId).query(`
                    UPDATE Entry   SET entryaccepted = NULL WHERE invoiceid = @i AND deleted = 0;
                    UPDATE Invoice SET ebdiscount = 0       WHERE invoiceid = @i;`);
            }
        }
        res.redirect(back('&deleted=1'));
    } catch (err) { next(err); }
});

export default router;
