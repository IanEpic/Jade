// services/commentCheck.js
// Uses the Anthropic API to validate judge comments against program guidelines.
// Returns null if comments pass, or a string of feedback if issues are found.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function checkComments({ excel, improve, other, guidelines }) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!guidelines) return null;

    const commentParts = [];
    if (excel)   commentParts.push(`Excel comment:\n${excel}`);
    if (improve) commentParts.push(`Improve comment:\n${improve}`);
    if (other)   commentParts.push(`Other comment:\n${other}`);
    if (!commentParts.length) return null;

    const prompt = `You are checking judge comments for an awards program against the program's comment guidelines.

GUIDELINES:
${guidelines}

COMMENTS SUBMITTED:
${commentParts.join('\n\n')}

Check whether the comments comply with the guidelines. If they comply, respond with exactly: PASS
If there are issues, respond with a brief, specific explanation of what needs to be fixed (2-4 sentences maximum). Be direct and helpful — the judge will see this message and needs to know exactly what to change.`;

    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text?.trim() || '';
    if (text === 'PASS' || text.startsWith('PASS')) return null;
    return text;
}
