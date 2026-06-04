// routes/formDiscount.js
// Admin CRUD for ProgramDiscount (early bird dates + promo codes).

import { Router }        from 'express';
import { requireAuth }   from '../middleware/auth.js';
import ProgramDiscount   from '../models/ProgramDiscount.js';
import { getPool, sql }  from '../config/database.js';

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
    if (!req.user?.admin) return res.redirect('/home');
    next();
});

function formatDate(val) {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ── GET /formDiscount ─────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const { action, discountid } = req.query;

        // Delete
        if (action === 'delete' && discountid) {
            await ProgramDiscount.destroy({ where: { discountid: parseInt(discountid), programid: program.programid } });
            return res.redirect('/formDiscount');
        }

        // Edit form
        let editing = null;
        if (action === 'edit' && discountid) {
            editing = await ProgramDiscount.findOne({
                where: { discountid: parseInt(discountid), programid: program.programid },
            });
        }

        const discounts = await ProgramDiscount.findAll({
            where:   { programid: program.programid },
            order:   [['type', 'ASC'], ['discountid', 'ASC']],
        });

        return res.renderInShell('formDiscount', {
            user, program, discounts, editing,
            formatDate,
            error:   req.query.error   || null,
            success: req.query.success || null,
        });

    } catch (err) { next(err); }
});

// ── POST /formDiscount ────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const body    = req.body;

        const name      = (body.name || '').trim() || null;
        const type      = body.type;
        const code      = (type === 'code') ? (body.code || '').trim() || null : null;
        const amount    = parseFloat(body.amount);
        const amounttype = body.amounttype;
        const validfrom = body.validfrom ? new Date(body.validfrom) : null;
        const validto   = body.validto   ? new Date(body.validto)   : null;
        const maxuses   = body.maxuses   ? parseInt(body.maxuses) : null;
        const active    = body.active === '1';

        if (!name || !type || isNaN(amount) || !amounttype) {
            return res.redirect('/formDiscount?error=Missing+required+fields');
        }
        if (type === 'code' && !code) {
            return res.redirect('/formDiscount?error=Code+discount+requires+a+code+value');
        }

        const discountid = body.discountid ? parseInt(body.discountid) : null;

        const pool = await getPool();
        if (discountid) {
            await pool.request()
                .input('discountid', sql.Int,           discountid)
                .input('programid',  sql.Int,           program.programid)
                .input('name',       sql.NVarChar(100), name)
                .input('type',       sql.NVarChar(20),  type)
                .input('code',       sql.NVarChar(50),  code)
                .input('amount',     sql.Decimal(10,2), amount)
                .input('amounttype', sql.NVarChar(10),  amounttype)
                .input('validfrom',  sql.DateTime,      validfrom)
                .input('validto',    sql.DateTime,      validto)
                .input('maxuses',    sql.Int,           maxuses)
                .input('active',     sql.Bit,           active ? 1 : 0)
                .query(`
                    UPDATE ProgramDiscount
                    SET name=@name, type=@type, code=@code, amount=@amount, amounttype=@amounttype,
                        validfrom=@validfrom, validto=@validto, maxuses=@maxuses, active=@active
                    WHERE discountid=@discountid AND programid=@programid
                `);
        } else {
            await pool.request()
                .input('programid',  sql.Int,           program.programid)
                .input('name',       sql.NVarChar(100), name)
                .input('type',       sql.NVarChar(20),  type)
                .input('code',       sql.NVarChar(50),  code)
                .input('amount',     sql.Decimal(10,2), amount)
                .input('amounttype', sql.NVarChar(10),  amounttype)
                .input('validfrom',  sql.DateTime,      validfrom)
                .input('validto',    sql.DateTime,      validto)
                .input('maxuses',    sql.Int,           maxuses)
                .input('active',     sql.Bit,           active ? 1 : 0)
                .query(`
                    INSERT INTO ProgramDiscount
                        (programid, name, type, code, amount, amounttype, validfrom, validto, maxuses, usecount, active)
                    VALUES
                        (@programid, @name, @type, @code, @amount, @amounttype, @validfrom, @validto, @maxuses, 0, @active)
                `);
        }

        return res.redirect('/formDiscount?success=1');

    } catch (err) { next(err); }
});

export default router;
