// services/citation.js
// Generates an awards-night winner citation with the Anthropic API. A citation has two parts:
//   1. a short, celebratory description of what the winning event / achievement / company did
//      (drawn from the entry details), then
//   2. a line "The judges said:" followed by praise paraphrased from the judging comments.
// Headline-award citations are written to differ from the entry's category citation, since the
// audience will already have heard that one earlier in the evening.

import Anthropic from '@anthropic-ai/sdk';
import { getPool, sql } from '../config/database.js';
import { loadBestState, saveStateCitation } from './bestState.js';
import { getEntryResponsesForText } from '../queries/entryQueries.js';

const STATE_FULL = {
    NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia',
    SA: 'South Australia', TAS: 'Tasmania', NT: 'Northern Territory', ACT: 'Australian Capital Territory',
};

const SYSTEM = [
    'You write a short, celebratory WINNER CITATION to be read aloud at an awards night.',
    'Structure — output EXACTLY these two parts and nothing else:',
    '  1) One or two sentences describing what the winning event/achievement/company did,',
    '     written in a polished, celebratory awards-night voice. Use ONLY facts present in the',
    '     entry details provided. Do not invent figures, names, or outcomes.',
    '  2) On a new line, the literal text "The judges said:" and then one or two sentences of',
    '     praise PARAPHRASED from the judging comments (warm, specific, addressed to the winner',
    '     as "you/your"). Do not quote at length; capture the spirit.',
    'Drop legal suffixes (Pty Ltd, Ltd, Inc). No preamble, no category name, no winner name,',
    'no headings other than "The judges said:". Output only the citation text.',
].join(' ');

export async function generateCitation({
    category, entrant, finalisttext, responses = [], comments = [],
    rules = '', headline = false, categoryCitation = '',
}) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI is not configured (no API key).');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const blocks = [];
    if (rules && rules.trim()) blocks.push('Style rules (length, tone, etc.) — follow these:\n' + rules.trim());

    blocks.push(
        `Award category: ${category || ''}\n` +
        `Winner: ${entrant || ''}\n` +
        (finalisttext ? `Finalist label: ${finalisttext}\n` : '') +
        'Entry details:\n' + (responses.length
            ? responses.map(r => `- ${r.question}: ${r.value}`).join('\n')
            : '(none provided)')
    );

    blocks.push('Judging comments (paraphrase the praise from these):\n' + (comments.length
        ? comments.map(c => '- ' + c).join('\n')
        : '(none provided)'));

    if (headline) {
        blocks.push(
            'This is a HEADLINE award — the top award of the night. The audience already heard ' +
            'this winner’s category citation earlier, so write a DISTINCT citation: take a ' +
            'broader, grander view of why they stood out across the whole field, and do NOT reuse ' +
            'the same phrasing or facts as the category citation below.' +
            (categoryCitation ? '\nCategory citation (do not repeat):\n' + categoryCitation : '')
        );
    }

    const resp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: 'user', content: blocks.join('\n\n') + '\n\nWrite the citation:' }],
    });

    return (resp.content?.[0]?.text || '').trim();
}

// Page/export data: category winners (with warnings for categories that have finalists but no
// recorded winner) and the headline awards with their nominees (the feeder categories' winners).
export async function getCitationData(programId) {
    const pool = await getPool();

    const targetRows = (await pool.request().query(`
        SELECT DISTINCT feedsto FROM CategoryType
        WHERE programid = ${programId} AND deleted = 0 AND feedsto IS NOT NULL
    `)).recordset.map(r => r.feedsto);
    const targetSet = new Set(targetRows);

    // Real award categories (have finalists), excluding headline targets.
    const cats = (await pool.request().query(`
        SELECT c.categoryid, c.name, c.orda
        FROM Category c
        WHERE c.programid = ${programId} AND c.deleted = 0
          AND c.categoryid NOT IN (${targetRows.length ? targetRows.join(',') : 'NULL'})
          AND EXISTS (SELECT 1 FROM Entry e WHERE e.categoryid = c.categoryid AND e.deleted = 0 AND ISNULL(e.finalist,0) = 1)
        ORDER BY c.orda, c.categoryid
    `)).recordset;

    const winners = (await pool.request().query(`
        SELECT e.entryid, e.categoryid, e.finalisttext, e.citation, e.headlinecitation,
               COALESCE(NULLIF(en.legalentity,''), en.name) AS entrant
        FROM Entry e JOIN Entrant en ON en.entrantid = e.entrantid
        WHERE e.programid = ${programId} AND e.deleted = 0 AND ISNULL(e.nominated,0) = 1
        ORDER BY e.entryid DESC
    `)).recordset;
    const winnerByCat = {};
    for (const w of winners) if (!winnerByCat[w.categoryid]) winnerByCat[w.categoryid] = w;

    const categories = cats.map(c => ({
        categoryid: c.categoryid, category: c.name, orda: c.orda,
        winner: winnerByCat[c.categoryid] || null,
    }));

    // Headline awards: feeder types' winners feed the target category.
    const headTargets = (await pool.request().query(`
        SELECT DISTINCT hc.categoryid, hc.name, hc.orda
        FROM CategoryType t JOIN Category hc ON hc.categoryid = t.feedsto AND hc.deleted = 0
        WHERE t.programid = ${programId} AND t.deleted = 0 AND t.feedsto IS NOT NULL
        ORDER BY hc.orda, hc.categoryid
    `)).recordset;
    const headWinners = (await pool.request().query(`
        SELECT t.feedsto AS categoryid, e.entryid, e.finalisttext, e.headlinecitation,
               ISNULL(e.headlinewinner,0) AS headlinewinner,
               COALESCE(NULLIF(en.legalentity,''), en.name) AS entrant
        FROM CategoryType t
        JOIN Category c ON c.categorytypeid = t.categorytypeid AND c.deleted = 0
        JOIN Entry e    ON e.categoryid = c.categoryid AND e.deleted = 0 AND ISNULL(e.nominated,0) = 1
        JOIN Entrant en ON en.entrantid = e.entrantid
        WHERE t.programid = ${programId} AND t.deleted = 0 AND t.feedsto IS NOT NULL
        ORDER BY e.entryid DESC
    `)).recordset;
    const headlines = headTargets.map(h => ({
        categoryid: h.categoryid, category: h.name, orda: h.orda,
        nominees: headWinners.filter(w => w.categoryid === h.categoryid),
    }));

    return { categories, headlines };
}

// State/Territory Award: the winning state (from Calc Best State / BestStateResult) and the
// national winners + nominees it hosted. Returns null until Calc Best State has been run.
export async function getStateAward(programId) {
    const stored = await loadBestState(programId);
    const winner = stored?.snapshot?.winner;
    if (!winner) return null;
    const row = (stored.snapshot.rows || []).find(r => r.state === winner.state);
    const entries = (row?.entries || []);
    const winners  = entries.filter(e => e.nominated);
    const nominees = entries.filter(e => e.finalist && !e.nominated);

    const pool = await getPool();
    const cat = (await pool.request().query(
        `SELECT TOP 1 name FROM Category WHERE programid=${programId} AND deleted=0 AND name LIKE '%State or Territory%'`
    )).recordset[0];
    const year = (cat?.name?.match(/\b(20\d\d)\b/) || [])[1] || String(new Date().getFullYear());

    return {
        state: winner.state, stateFull: STATE_FULL[winner.state] || winner.state, year,
        winners, nominees, citation: stored.snapshot.statecitation || '',
    };
}

// Generate the State/Territory Award citation (one descriptive paragraph — no "judges said").
export async function generateStateCitation(programId, rules = '') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI is not configured (no API key).');
    const d = await getStateAward(programId);
    if (!d) throw new Error('Run Calc Best State first to determine the winning state.');

    // Brief source detail per named entry (finalist label + a few short responses).
    const ids = [...d.winners, ...d.nominees].map(e => e.entryid);
    const ftById = {};
    if (ids.length) {
        const pool = await getPool();
        for (const r of (await pool.request().query(
            `SELECT entryid, finalisttext FROM Entry WHERE entryid IN (${ids.join(',')})`)).recordset) {
            ftById[r.entryid] = r.finalisttext || '';
        }
    }
    async function describe(list) {
        const out = [];
        for (const e of list) {
            const resp = await getEntryResponsesForText({ entryId: e.entryid }).catch(() => []);
            const detail = resp.slice(0, 5).map(r => `${r.question}: ${r.value}`).join('; ');
            out.push(`- ${ftById[e.entryid] || e.entrant}${detail ? ' — ' + detail : ''}`);
        }
        return out.join('\n');
    }
    const [winBlock, nomBlock] = await Promise.all([describe(d.winners), describe(d.nominees)]);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const userContent =
        (rules && rules.trim() ? 'Style rules (length, tone) — follow these:\n' + rules.trim() + '\n\n' : '') +
        `Write a single-paragraph citation for the State or Territory Award, read aloud at an awards night.\n` +
        `Winner: ${d.stateFull}. Over the last 12 months it hosted ${d.winners.length} national winner(s) ` +
        `and ${d.nominees.length} national nominee(s).\n\n` +
        `National winners:\n${winBlock || '(none)'}\n\nNational nominees:\n${nomBlock || '(none)'}\n\n` +
        `Name each event with a brief, vivid description drawn ONLY from the details above. Use one ` +
        `flowing paragraph in a celebratory voice. End with exactly this sentence: ` +
        `"${d.stateFull} is the ${d.year} Winner of Australia’s best event region."`;

    const resp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: 'You write a celebratory single-paragraph awards citation. Use only the facts given. ' +
            'No headings, no bullet points, no "the judges said" — one paragraph only.',
        messages: [{ role: 'user', content: userContent }],
    });
    const text = (resp.content?.[0]?.text || '').trim();
    await saveStateCitation(programId, text);
    return text;
}

// Fetch the judging comments recorded for an entry (newest-quality first, capped for the prompt).
export async function getEntryComments(entryId) {
    const pool = await getPool();
    const rows = (await pool.request().input('e', sql.Int, entryId).query(`
        SELECT comment FROM JudgeComment
        WHERE entryid = @e AND comment IS NOT NULL AND LEN(comment) > 0
    `)).recordset;
    const clean = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return rows.map(r => clean(r.comment)).filter(Boolean);
}
