// services/translate.js
// Replaces: translate($programid, $string, $preservecase) from EPIC::JADE::Common
//
// The Perl version hit the DB on every call — fetching Terminology rows each time.
// This version caches terminology per program in memory (invalidated on save).
// The cache means the first call per program hits the DB; subsequent calls are instant.

import Terminology from '../models/Terminology.js';

// In-memory cache: { programId: [ { word, replacement, orda }, ... ] }
const cache = new Map();

export async function loadTerminology(programId) {
    if (cache.has(programId)) return cache.get(programId);
    const terms = await Terminology.findAll({
        where: { programid: programId },
        order: [['orda', 'ASC']],
    });
    const termData = terms.map(t => ({
        word:        t.word,
        replacement: t.replacement,
    }));
    cache.set(programId, termData);
    return termData;
}

// Call this when terminology is updated via admin to bust the cache
export function invalidateTerminologyCache(programId) {
    if (programId) {
        cache.delete(programId);
    } else {
        cache.clear();
    }
}

// Replaces: translate($programid, $string, $preservecase)
// preserveCase: if true, the replacement inherits the casing of the matched word.
export async function translate(programId, string, preserveCase = false) {
    if (!string || !programId) return string;
    const terms = await loadTerminology(programId);
    let result = string;
    for (const { word, replacement } of terms) {
        if (!word || !replacement) continue;
        const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
        if (preserveCase) {
            result = result.replace(pattern, match => preserveCaseReplace(match, replacement));
        } else {
            result = result.replace(pattern, replacement);
        }
    }
    return result;
}

// Equivalent of preserve_case() in EPIC::JADE::Common
// If original was "ENTRANT" and replacement is "participant", returns "PARTICIPANT"
// If original was "Entrant", returns "Participant"
function preserveCaseReplace(original, replacement) {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement.toLowerCase();
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// EJS template helper — call this in your view layer to make translate available
// Usage in app.js: app.locals.translate = translateHelper(programId)
// Then in EJS: <%- await translate('Entrant Name') %>
export function translateHelper(programId) {
    return (string, preserveCase) => translate(programId, string, preserveCase);
}
