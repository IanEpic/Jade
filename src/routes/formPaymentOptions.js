// routes/formPaymentOptions.js
// Equivalent of formPaymentOptions.cgi.
// Two-step payment flow:
//   Step 1: Choose payment method (pay invoice / create invoice / pay now)
//   Step 2: Show entries or invoices to select, then proceed to formPayment or formInvoice

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPool, sql } from '../config/database.js';
import { currency } from '../services/helpers.js';
import { getApplicableDiscounts } from '../services/pricing.js';

const router = Router();
router.use(requireAuth);

// ── Data helpers ──────────────────────────────────────────────────────────────

async function getAllInvoices(userId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
            SELECT i.*,
                   ISNULL((SELECT SUM(pa.amount) FROM PaymentAllocation pa WHERE pa.invoiceid = i.invoiceid), 0) AS paid
            FROM Invoice i
            WHERE i.userid  = @userId
              AND i.deleted = 0
        `);
    return result.recordset;
}

async function getUnpaidInvoices(userId) {
    const invoices = await getAllInvoices(userId);
    return invoices.filter(inv => {
        const total = (parseFloat(inv.totalex)||0) + (parseFloat(inv.gst)||0) - (parseFloat(inv.partnerdiscount)||0);
        return total > (parseFloat(inv.paid)||0);
    });
}

const ENTRY_COLS = `
    e.entryid, e.userid, e.entrantid, e.categoryid, e.invoiceid,
    e.userref, e.deleted, e.entryaccepted, e.tpkid,
    c.costex, c.gst,
    en.name AS entrantname, c.name AS categoryname`;

async function getUninvoicedEntries(userId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
            SELECT ${ENTRY_COLS}
            FROM Entry e
            INNER JOIN Entrant  en ON e.entrantid  = en.entrantid
            INNER JOIN Category c  ON e.categoryid = c.categoryid
            WHERE e.userid    = @userId
              AND e.invoiceid IS NULL
              AND e.deleted   = 0
        `);
    return result.recordset;
}

async function getAllEntries(userId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
            SELECT ${ENTRY_COLS}
            FROM Entry e
            INNER JOIN Entrant  en ON e.entrantid  = en.entrantid
            INNER JOIN Category c  ON e.categoryid = c.categoryid
            WHERE e.userid  = @userId
              AND e.deleted = 0
        `);
    return result.recordset;
}

async function getEarlyBirdDiscount(programId) {
    const discounts = await getApplicableDiscounts(programId);
    return discounts.find(d => d.type === 'earlybird') || null;
}

// ── GET /formPaymentOptions ───────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;

        if (!user.paymentsopen) {
            return res.renderInShell('formPaymentOptions', {
                user, program, mode: 'closed',
                unpaidInvoices: [], uninvoicedEntries: [], allEntries: [],
                pmtoption: null, alert: null, currency,
            });
        }

        // ccdpaymentonly — skip straight to step 2 (pay now)
        if (program.ccdpaymentonly) {
            const [allEntries, earlyBird] = await Promise.all([
                getAllEntries(user.userid),
                getEarlyBirdDiscount(program.programid),
            ]);
            return res.renderInShell('formPaymentOptions', {
                user, program, mode: 'step2',
                pmtoption: 3,
                allEntries, uninvoicedEntries: [], unpaidInvoices: [],
                alert: null, caption: 'Choose entries to pay for now, then click Continue',
                nextAction: '/formPayment', currency, earlyBird,
            });
        }

        const [unpaidInvoices, uninvoicedEntries] = await Promise.all([
            getUnpaidInvoices(user.userid),
            getUninvoicedEntries(user.userid),
        ]);

        res.renderInShell('formPaymentOptions', {
            user, program, mode: 'step1',
            unpaidInvoices, uninvoicedEntries,
            pmtoption: null, alert: null, currency,
        });

    } catch (err) {
        next(err);
    }
});

// ── POST /formPaymentOptions ──────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const body    = req.body;
        const action  = body.action || '';

        // Step 1 submit — validate and move to step 2
        if (!body.pmtoption) {
            const [unpaidInvoices, uninvoicedEntries] = await Promise.all([
                getUnpaidInvoices(user.userid),
                getUninvoicedEntries(user.userid),
            ]);
            return res.renderInShell('formPaymentOptions', {
                user, program, mode: 'step1',
                unpaidInvoices, uninvoicedEntries,
                pmtoption: null, alert: '! No Data. Please select from the list below', currency,
            });
        }

        const pmtoption = parseInt(body.pmtoption, 10);
        const [unpaidInvoices, uninvoicedEntries, allEntries, earlyBird] = await Promise.all([
            getUnpaidInvoices(user.userid),
            getUninvoicedEntries(user.userid),
            getAllEntries(user.userid),
            getEarlyBirdDiscount(program.programid),
        ]);

        let caption, nextAction;
        if (pmtoption === 1) {
            caption    = 'Choose invoices to pay using your credit card then click Continue';
            nextAction = '/formPayment';
        } else if (pmtoption === 2) {
            caption    = 'Choose entries to appear on an invoice for payment by EFT, then click Continue';
            nextAction = '/formInvoice';
        } else if (pmtoption === 3) {
            caption    = 'Choose entries to pay for now, then click Continue';
            nextAction = '/formPayment';
        }

        res.renderInShell('formPaymentOptions', {
            user, program, mode: 'step2',
            pmtoption, unpaidInvoices, uninvoicedEntries, allEntries,
            alert: action === 'nodata' ? '! No Data. Please select from the list below' : null,
            caption, nextAction, currency, earlyBird,
        });

    } catch (err) {
        next(err);
    }
});

export default router;
