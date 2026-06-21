// Migration 040: Fix UTF-8 mojibake in Response.value and Response.caption
//
// Root cause: Perl DBI connected with CP1252 charset, so each UTF-8 byte was stored
// as its Latin-1 Unicode equivalent in the nvarchar column.
// Fix: re-read each char as a raw byte (charCode & 0xFF), decode as UTF-8.
//
// Run: node --input-type=module < migrations/040_fix_response_encoding.js
// Or:  node migrations/040_fix_response_encoding.js (if package.json has "type":"module")

import sequelize from '../src/config/sequelize.js';

// CP1252 special chars (0x80–0x9F) stored as their Unicode equivalents.
// We need to reverse these back to byte values when we find them.
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
    // Scan for chars above U+00FF — only acceptable if they're CP1252 specials
    for (let i = 0; i < str.length; i++) {
        const cp = str.charCodeAt(i);
        if (cp > 0xFF && CP1252_REV[cp] === undefined) return str; // real Unicode, leave alone
    }
    // Re-interpret each char as a raw byte (Latin-1 or CP1252 special), then decode as UTF-8.
    const bytes = Buffer.alloc(str.length);
    for (let i = 0; i < str.length; i++) {
        const cp = str.charCodeAt(i);
        bytes[i] = cp > 0xFF ? CP1252_REV[cp] : cp;
    }
    try {
        // fatal:true throws on invalid sequences instead of substituting U+FFFD,
        // so strings that legitimately contain the replacement char are handled correctly.
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return str;
    }
}

const rows = await sequelize.query(
    `SELECT responseid, value, caption FROM Response
     WHERE deleted = 0
       AND (value IS NOT NULL OR caption IS NOT NULL)`,
    { type: sequelize.QueryTypes.SELECT }
);

let fixedValue = 0;
let fixedCaption = 0;
let skipped = 0;

for (const row of rows) {
    const newValue   = row.value   ? fixMojibake(row.value)   : row.value;
    const newCaption = row.caption ? fixMojibake(row.caption) : row.caption;

    const valueChanged   = newValue   !== row.value;
    const captionChanged = newCaption !== row.caption;

    if (!valueChanged && !captionChanged) {
        skipped++;
        continue;
    }

    await sequelize.query(
        `UPDATE Response SET value = :value, caption = :caption WHERE responseid = :responseid`,
        { replacements: { value: newValue, caption: newCaption, responseid: row.responseid } }
    );

    if (valueChanged)   fixedValue++;
    if (captionChanged) fixedCaption++;
}

console.log(`Done. value fixed: ${fixedValue}, caption fixed: ${fixedCaption}, unchanged: ${skipped}`);
await sequelize.close();
