// One-off: fix the remaining mojibake rows that the first pass missed
import sequelize from '../src/config/sequelize.js';

const CP1252_REV = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F,
};

function fixMojibake(str) {
    if (!str) return str;
    for (let i = 0; i < str.length; i++) {
        const cp = str.charCodeAt(i);
        if (cp > 0xFF && CP1252_REV[cp] === undefined) return str;
    }
    const bytes = Buffer.alloc(str.length);
    for (let i = 0; i < str.length; i++) {
        const cp = str.charCodeAt(i);
        bytes[i] = cp > 0xFF ? CP1252_REV[cp] : cp;
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch { return str; }
}

// Target only the rows still containing mojibake â sequences
const rows = await sequelize.query(
    `SELECT responseid, value, caption FROM Response
     WHERE deleted = 0 AND (value LIKE N'%â%' OR caption LIKE N'%â%')`,
    { type: sequelize.QueryTypes.SELECT }
);

console.log(`Rows to process: ${rows.length}`);
let fixed = 0, skipped = 0;

for (const row of rows) {
    const newValue   = row.value   ? fixMojibake(row.value)   : row.value;
    const newCaption = row.caption ? fixMojibake(row.caption) : row.caption;
    const vc = newValue !== row.value;
    const cc = newCaption !== row.caption;

    if (!vc && !cc) {
        console.log(`SKIP ${row.responseid}: value changed=${vc}, caption changed=${cc}`);
        skipped++;
        continue;
    }

    console.log(`FIX ${row.responseid}: value=${vc}, caption=${cc}`);
    await sequelize.query(
        `UPDATE Response SET value = :value, caption = :caption WHERE responseid = :responseid`,
        { replacements: { value: newValue, caption: newCaption, responseid: row.responseid } }
    );
    fixed++;
}

console.log(`\nDone. fixed: ${fixed}, skipped: ${skipped}`);
await sequelize.close();
