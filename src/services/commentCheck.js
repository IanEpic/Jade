// services/commentCheck.js
// Uses the Anthropic API to validate judge comments against program guidelines.
// Returns a verdict object:
//   { verdict: 'pass' }                  — clearly complies; save, no flag
//   { verdict: 'fail',   message }       — clear violation; block the judge (rework)
//   { verdict: 'review', message }       — borderline/uncertain; save but flag for admin
// 'review' does NOT block the judge — their experience matches a pass.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PASS = { verdict: 'pass' };

export async function checkComments({ excel, improve, other, guidelines, entryContext = '', examplesGood = '', examplesBad = '' }) {
    if (!process.env.ANTHROPIC_API_KEY) return PASS;
    if (!guidelines) return PASS;

    const commentParts = [];
    if (excel)   commentParts.push(`[Field: "Areas the entrant EXCELLED in" — positive reinforcement about strengths. This field is for praise only; it is NOT meant to contain improvement suggestions.]\n${excel}`);
    if (improve) commentParts.push(`[Field: "Areas the entrant could IMPROVE next year" — constructive, actionable feedback.]\n${improve}`);
    if (other)   commentParts.push(`[Field: "Other constructive comments" — optional additional feedback.]\n${other}`);
    if (!commentParts.length) return PASS;

    const prompt = `You are checking judge comments for an awards program against the program's comment guidelines.

GUIDELINES:
${guidelines}
${examplesGood ? `\nEXAMPLES OF GOOD COMMENTS (these should PASS):\n${examplesGood}\n` : ''}${examplesBad ? `\nEXAMPLES OF UNACCEPTABLE COMMENTS (comments like these should FAIL):\n${examplesBad}\n` : ''}

COMMENTS SUBMITTED (each labelled with the form field it came from):
${commentParts.join('\n\n')}
${entryContext ? `\nTHIS ENTRY'S CONTENT (what the entry is actually about — use this to judge whether the comments are specific to THIS entry):\n${entryContext}\n` : ''}

IMPORTANT — the guidelines above describe expectations that are SPLIT ACROSS THREE SEPARATE form fields: an "excelled" field (positive reinforcement about strengths), an "improve" field (2-3 sentences of constructive feedback for next year), and an "other" field. Evaluate each provided comment ONLY against the guideline points relevant to ITS OWN field:
- Judge the "excelled" comment solely on whether it gives genuine positive reinforcement about strengths. Do NOT require it to contain improvement suggestions or constructive criticism — that is the job of the separate "improve" field, not this one.
- Judge the "improve" comment on whether it gives constructive, actionable feedback.
- Apply the guidelines' "Don't" rules (no revealing the judge's identity, no statements about the outcome, keep comments about the event not the entry document, etc.) to every comment.
A judge may save one field now and add the others later, so do NOT report a missing or empty field as an issue — completeness is tracked separately.

Respond with a verdict on the FIRST line — exactly one of these words — then, for FAIL or REVIEW, a brief specific explanation (2-4 sentences, naming the field) on the following lines:
PASS   — the DEFAULT for any comment that is compliant, substantive, and (where entry content is given) specific to this entry. If the comment is fine, you MUST respond PASS. Do NOT flag good comments "just to be safe" — only the two verdicts below are exceptions.
FAIL   — does NOT meet the guidelines. This is the verdict for ANY comment that fails to comply, including breaching a "Don't" rule:
         • revealing the judge's identity;
         • ANY statement that suggests, hints at, or ranks the outcome — e.g. "this is a winning entry", "one of the strongest entries I've come across", "a clear standout", "the best in its category", "head and shoulders above the rest". Comparative/ranking praise like this is a clear breach, NOT a mild one — FAIL it.
         • critiquing the entry document or its evidence (e.g. "add more photos", "spell-check your entry");
         • being vague, generic, or lacking substance — e.g. "Great event, well done", "Good job overall".
         FAIL BLOCKS the judge to fix before continuing.
REVIEW — use ONLY when you can name a SPECIFIC concern that genuinely does NOT rise to a clear FAIL: either (a) a truly AMBIGUOUS case where you cannot decide whether a mild guideline issue is present (and it is not one of the clear breaches listed under FAIL), or (b) if entry content is provided, the comment is substantive and breaches nothing, yet is GENERIC — it could apply to almost any entry and references nothing specific to THIS entry. If you cannot point to such a concrete concern, it is a PASS — do not flag genuinely clean, specific comments. REVIEW saves the comment and flags it for admin without blocking the judge.
For PASS, output nothing after the word PASS. For REVIEW, name the specific concern.`;

    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text?.trim() || '';
    if (!text) return PASS; // fail-safe: don't block/flag on an empty response
    const upper = text.toUpperCase();
    let verdict = 'pass';
    if (/^FAIL\b/.test(upper))        verdict = 'fail';
    else if (/^REVIEW\b/.test(upper)) verdict = 'review';
    if (verdict === 'pass') return PASS;
    const message = text.replace(/^(FAIL|REVIEW)\b[:.\-\s]*/i, '').trim();
    return { verdict, message };
}

// ── Cross-entry context check (background job) ─────────────────────────────────
// Looks at ONE comment against (a) the same judge's other comments of the same
// type, to detect copy-paste/repetition, and (b) this entry's own content, to
// detect comments that aren't specific to the entry. Returns { flag, reason }.
// This never blocks a judge — it only flags for admin review.
export async function checkCommentContext({ comment, type, otherComments = [], entryContext = '' }) {
    if (!process.env.ANTHROPIC_API_KEY) return { flag: false };
    if (!comment || !comment.trim()) return { flag: false };

    const typeLabel = type === 'excel' ? 'areas the entrant excelled in'
        : type === 'improve' ? 'areas the entrant could improve'
        : 'other constructive feedback';

    const others = otherComments.length
        ? otherComments.map((c, i) => `(${i + 1}) ${c}`).join('\n')
        : '(none)';

    const prompt = `You are auditing one judge's award-entry comment for two specific problems. Do NOT assess general writing quality or guideline compliance — only the two issues below.

THE COMMENT (about "${typeLabel}" for the entry described further down):
${comment}

THE SAME JUDGE'S OTHER "${typeLabel}" COMMENTS ON DIFFERENT ENTRIES:
${others}

THIS ENTRY'S CONTENT (what the entry is actually about):
${entryContext || '(entry content unavailable)'}

Decide:
1. REPETITION — is this comment substantially the same as one or more of the judge's other comments (copy-paste or trivially reworded), rather than written for this entry?
2. NOT ENTRY-SPECIFIC — is this comment so generic it could apply to almost any entry, with nothing tied to THIS entry's actual content?

If NEITHER problem is present, respond with exactly: OK
If either problem is present, respond with: FLAG: <one short sentence naming which problem(s) and why>`;

    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text?.trim() || '';
    if (!text || /^OK\b/i.test(text)) return { flag: false };
    const reason = text.replace(/^FLAG[:.\-\s]*/i, '').trim();
    return { flag: true, reason };
}
