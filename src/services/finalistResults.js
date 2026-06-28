// services/finalistResults.js
// Entrant-facing "your results" block shown on the home page when finalistlistavailable.
// Port of the $finalisttext sub in the Perl home.cgi: builds a per-entry results table
// (National Nominee / State Nominee / Non-Finalist) and substitutes it into the program's
// finalistwelcometext / nonfinalistwelcometext at the literal `<~results~>` token.
//
// Faithful to the Perl: the welcome text positions the results via the token, so if the
// template has no token the results are not shown (admin controls placement).

// The token is stored HTML-encoded (`&lt;~results~&gt;`); tolerate the decoded form too.
const RESULTS_TOKEN = /&lt;~results~&gt;|<~results~>/g;

// Finalist resource page name (logo / promo packs). Matches the Perl hardcoded link.
const RESOURCES_PAGE = '2025FinalistResources';

// Dark-theme card styling for the entrant results block. Scoped under .fr-results so it
// can't bleed into the surrounding welcome copy. Emitted once at the top of the results.
const STYLE = `<style>
.fr-results { max-width: 700px; margin: 0 auto; }
.fr-card { border: 1px solid #444; border-radius: 6px; margin: 0 0 16px; overflow: hidden; background: #181818; }
.fr-card-head { background: #1e1e1e; padding: 10px 16px; border-bottom: 1px solid #333; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.fr-cat { font-size: 14px; font-weight: 600; color: #c48f06; flex: 1 1 auto; }
.fr-meta { font-size: 12px; color: #888; flex: 0 0 auto; }
.fr-badge { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 2px 8px; border-radius: 3px; white-space: nowrap; }
.fr-badge-national { color: #1a1a1a; background: #c48f06; }
.fr-badge-state { color: #cfe8ff; background: #244a63; border: 1px solid #3d6e90; }
.fr-badge-non { color: #ccc; background: #333; border: 1px solid #555; }
.fr-badge-afe { color: #ffe6b0; background: #5a3e1a; border: 1px solid #c48f06; }
.fr-card-body { padding: 12px 16px; }
.fr-card-body, .fr-card-body p, .fr-card-body li, .fr-card-body td { color: #e6e6e6; line-height: 1.6; }
.fr-card-body p:first-child { margin-top: 0; }
.fr-card-body p:last-child { margin-bottom: 0; }
.fr-card-body a { color: #c9b27a; }
.fr-card-body a:hover { color: #cf9702; }
.fr-row { display: flex; gap: 12px; padding: 5px 0; font-size: 13px; }
.fr-row + .fr-row { border-top: 1px solid #222; }
.fr-label { flex: 0 0 130px; color: #888; }
.fr-val { flex: 1 1 auto; color: #e6e6e6; }
.fr-val a { color: #c9b27a; }
.fr-val a:hover { color: #cf9702; }
.fr-soon { color: #b08a4a; }
.fr-intro { text-align: center; color: #ddd; margin: 0 auto 18px; }
.fr-intro h1, .fr-intro h2, .fr-intro h3 { color: #c48f06; }
.fr-topic .fr-card-head { display: block; }
</style>`;

function bodyRow(label, value) {
    return `<div class="fr-row"><span class="fr-label">${label}</span><span class="fr-val">${value}</span></div>`;
}

function scoresLink() {
    return `<a href="/home?action=scorescomments">Check Scores and Comments</a>`;
}

// One entry's result card. `program` provides the two scores-available flags.
function entryCard(entry, program) {
    let badges, rows = '';

    if (entry.finalist) {
        badges = `<span class="fr-badge fr-badge-national">National Nominee</span>`;
        if (entry.afecode) badges += `<span class="fr-badge fr-badge-afe">AFE Nominee</span>`;
        rows += bodyRow('Published Listing', entry.finalisttext || '');
        if (entry.afecode) {
            const url = 'http://www.eventawards.com.au/vote4' + entry.afecode;
            rows += bodyRow('AFE Link', `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
        }
        rows += bodyRow('Actions', `<a href="/viewPage?name=${RESOURCES_PAGE}">Download Logo Pack</a>`);
        if (program.finalistscoresavailable) rows += bodyRow('Scores', scoresLink());
    } else if (entry.statefinalist) {
        badges = `<span class="fr-badge fr-badge-state">State Nominee — ${entry.statefinalist}</span>`;
        rows += bodyRow('Published Listing', entry.finalisttext || '');
        rows += bodyRow('Actions', `<a href="/viewPage?name=${RESOURCES_PAGE}">Download Promo Pack</a>`);
        if (program.finalistscoresavailable) rows += bodyRow('Scores', scoresLink());
    } else {
        badges = `<span class="fr-badge fr-badge-non">Non-Finalist</span>`;
        rows += program.nonfinalistscoresavailable
            ? bodyRow('Actions', scoresLink())
            : bodyRow('Scores', `<span class="fr-soon">Scores and Comments will be available soon. We'll send you an email to let you know.</span>`);
    }

    return `<div class="fr-card">` +
        `<div class="fr-card-head"><span class="fr-cat">${entry.categoryname || ''}</span>${badges}<span class="fr-meta">Entry #${entry.entryid}</span></div>` +
        `<div class="fr-card-body">${rows}</div>` +
    `</div>`;
}

// A "topic" header in the welcome copy is a paragraph whose entire content is bold —
// e.g. <p><strong>Nominee Logo Kits</strong></p>. Inline bold (text after </strong>) is
// NOT a header, so it stays within the preceding topic.
const TOPIC_HEADER = /<p>\s*(?:&nbsp;|\s)*<strong>(.*?)<\/strong>\s*(?:&nbsp;|\s)*<\/p>/gi;

// True when the HTML has visible content (ignoring tags / &nbsp; / whitespace).
function hasContent(html) {
    return !!(html && html.replace(/<[^>]+>|&nbsp;|\s/g, ''));
}

// Split a block of welcome HTML into one card per bold-headed topic. Any content before the
// first header becomes a leading card. Falls back to a single card if no headers are found.
function topicCards(html) {
    if (!hasContent(html)) return '';
    const segs = html.split(TOPIC_HEADER);   // [lead, title1, body1, title2, body2, ...]
    let out = '';
    if (hasContent(segs[0]))
        out += `<div class="fr-card fr-topic"><div class="fr-card-body">${segs[0]}</div></div>`;
    for (let i = 1; i < segs.length; i += 2) {
        const title = segs[i];
        const body  = segs[i + 1] || '';
        out += `<div class="fr-card fr-topic">` +
            `<div class="fr-card-head"><span class="fr-cat">${title}</span></div>` +
            `<div class="fr-card-body">${body}</div></div>`;
    }
    return out;
}

// Build the combined HTML. The welcome template positions the results via `<~results~>`:
// the copy before the token becomes a centred intro, the token becomes the per-entry result
// cards, and the copy after the token is split into one card per topic — matching the
// card-per-section look of the other home pages. With no token the template is returned as-is
// (faithful to the Perl: admin controls placement). Returns '' for no accepted entries.
export function renderFinalistText(entries, program) {
    const list = entries || [];
    const anyFinalist = list.some(e => e.finalist || e.statefinalist);
    const template = (anyFinalist ? program.finalistwelcometext : program.nonfinalistwelcometext) || '';

    RESULTS_TOKEN.lastIndex = 0;
    if (!RESULTS_TOKEN.test(template)) { RESULTS_TOKEN.lastIndex = 0; return template; }
    RESULTS_TOKEN.lastIndex = 0;

    const [beforeRaw, afterRaw = ''] = template.split(RESULTS_TOKEN);
    // The token often sits inside an empty <p></p> wrapper — drop the dangling tags.
    const before = beforeRaw.replace(/<p>\s*$/i, '');
    const after  = afterRaw.replace(/^\s*<\/p>/i, '');

    const cards = list.map(e => entryCard(e, program)).join('');
    const intro = hasContent(before) ? `<div class="fr-intro">${before}</div>` : '';

    return `${STYLE}<div class="fr-results">${intro}${cards}${topicCards(after)}</div>`;
}
