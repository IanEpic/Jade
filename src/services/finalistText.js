// services/finalistText.js
// Generates an entry's "finalist text" label with the Anthropic API, copying the
// per-category style from real examples (the format differs by category group).

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = [
    'You write a short "finalist text" label for an awards entry.',
    'Copy the EXACT style, wording and punctuation of the provided examples for that category.',
    'Event categories usually read "Event Name Year, Organisation, STATE".',
    'Company / team / individual categories are usually just the organisation or person\'s name.',
    'RULES:',
    '1) The Organisation is the body that owns or organised the event — usually the "Entrant organisation"',
    'given to you, but if the entry details clearly identify a different owning organisation, use that.',
    'Drop legal suffixes (Ltd, Pty Ltd, Pty, Inc, Limited). Never use a personal contact name as the organisation.',
    '2) Keep the event name exactly as the entrant wrote it, including its year and word order.',
    '3) Include the state/territory abbreviation (NSW, VIC, QLD, WA, SA, TAS, NT, ACT) when the examples do.',
    '4) Use ONLY facts present in the entry details — do not invent anything.',
    'Output ONLY the label — no quotes, no preamble, no explanation.',
    'If the entry details are insufficient to produce a label, output nothing at all —',
    'NEVER ask for more information or explain why.',
].join(' ');

// The model occasionally returns a sentence (a refusal / request for more info)
// instead of a label, usually for incomplete draft entries. Treat those as blank.
function looksLikeRefusal(s) {
    return /^(i\b|i'm|sorry|to produce|there (is|are)|unfortunately|without|the entry|please)/i.test(s)
        || /\b(i need|i cannot|i can't|more (information|details)|insufficient|unable to)\b/i.test(s);
}

// category, entrant: strings; responses: [{question, value}]; examples: [string];
// globalRules: program-wide rules; typeName / typeRules: the category's group + its rules.
export async function generateFinalistText({ category, entrant, responses, examples, globalRules, typeName, typeRules }) {
    const ruleBlocks = [];
    if (globalRules && globalRules.trim()) ruleBlocks.push('General rules:\n' + globalRules.trim());
    if (typeRules && typeRules.trim())
        ruleBlocks.push(`Rules for the "${typeName || 'this'}" category type:\n` + typeRules.trim());

    const exampleBlock = examples && examples.length
        ? `Example finalist texts for the "${category}" category — copy this exact style:\n` +
          examples.map(e => '- ' + e).join('\n')
        : `No examples are available for the "${category}" category; follow the rules above.`;

    const entryBlock =
        `Entrant organisation: ${entrant || '(unknown)'}\n` +
        `Category: ${category}` + (typeName ? ` (type: ${typeName})` : '') + `\n` +
        `Entry details:\n` +
        responses.map(r => `- ${r.question}: ${r.value}`).join('\n');

    const userContent =
        (ruleBlocks.length ? ruleBlocks.join('\n\n') + '\n\n' : '') +
        exampleBlock + '\n\nProduce the finalist text for this entry:\n' + entryBlock;

    const resp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 80,
        system: SYSTEM,
        messages: [{ role: 'user', content: userContent }],
    });

    // Only the first line — guards against the model adding commentary on hard cases.
    const out = (resp.content?.[0]?.text || '').trim().split('\n')[0].trim().replace(/^["']|["']$/g, '');
    // Blank out refusals / requests for more info (incomplete entries).
    return looksLikeRefusal(out) ? '' : out;
}
