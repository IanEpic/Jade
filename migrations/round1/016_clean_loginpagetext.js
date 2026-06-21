// Migration 016: Clean up loginpagetext on all Program rows
// Removes legacy Perl-era "Please Log In..." text and redundant links that
// are now handled inline by the Node login form.
//
// Run: DB_HOST=<prod> DB_NAME=Jade DB_USER=indigo DB_PASS=<pass> NODE_ENV=production node migrations/016_clean_loginpagetext.js

import Program from '../src/models/Program.js';

const programs = await Program.findAll();
const marker = '&lt;~form~&gt;';
let updated = 0;

for (const p of programs) {
    let text = p.loginpagetext;
    if (!text || !text.includes(marker)) continue;
    const original = text;

    // Step 1: keep only 'Still having issues' line after the marker
    const markerIdx = text.indexOf(marker);
    const before = text.substring(0, markerIdx + marker.length);
    const after  = text.substring(markerIdx + marker.length);
    const stillIdx = after.indexOf('Still having issues');
    if (stillIdx !== -1) {
        const tagStart  = after.lastIndexOf('<h', stillIdx);
        const closing   = tagStart !== -1 ? after.slice(tagStart).match(/<(h[0-9])[^>]*>[\s\S]*?<\/\1>/i) : null;
        const stillLine = closing ? closing[0] : '';
        text = before + (stillLine ? '\n' + stillLine : '');
    }

    // Step 2: remove 'Please Log In...' preceded by newline or <p> tag
    text = text.replace(/(?:<p[^>]*>|[\r\n]+)\s*Please\b[\s\S]*?(?=&lt;~form~&gt;)/i, '');

    // Step 3: remove 'Please Log In...' preceded by <br><br> within a <p>
    text = text.replace(/\s*(?:<br\s*\/?>[\s\r\n]*){1,2}\s*Please\b[\s\S]*?(?=&lt;~form~&gt;)/i, '\n');

    // Step 4: shorten support link text
    text = text.replace(
        'Still having issues logging in, click here to contact the support team.',
        'Click here to contact the support team.'
    );

    if (text !== original) {
        await p.update({ loginpagetext: text });
        console.log('Updated', p.programid, p.name);
        updated++;
    }
}

console.log(`Done. ${updated} programs updated.`);
process.exit(0);
