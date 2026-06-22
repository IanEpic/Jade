// services/helpers.js
// Replaces the pure utility functions from EPIC::Common:
//   currency(), currencynoformat(), wholedollars(), addcommastonumbers()
//   parsesqldatetime(), parseexceldatetime(), currentdatetime()
//   parseSQLDate(), parseEpoch(), parseCommonDate(), expiryEpoch()
//   trim(), nameify(), maxwords(), replacecr(), truncatewords()
//   checkemail(), is_integer(), is_decimal(), escapechars()
//   randomFilename(), randomPassword(), randomSalt()
//   encryptPassword(), checkPassword()
//   getCCDYears()

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
// NOTE: Perl used crypt() (DES). Existing passwords
// in the DB are DES-hashed. See checkPassword() below.

// ── Currency ─────────────────────────────────────────────────────────────────

// Replaces: currencynoformat($n)
export function currencyNoFormat(n) {
    const minus = n < 0 ? '-' : '';
    return `${minus}${Math.abs(n).toFixed(2)}`;
}

// Replaces: currency($n) → "$1,234.56"
export function currency(n) {
    const minus = n < 0 ? '-' : '';
    const abs = Math.abs(n).toFixed(2);
    const parts = abs.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `$${minus}${parts.join('.')}`;
}

// Replaces: wholedollars($n)
export function wholeDollars(n) {
    const minus = n < 0 ? '-' : '';
    const rounded = Math.round(Math.abs(n));
    return `$${minus}${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// Replaces: addcommastonumbers($n)
export function addCommas(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Replaces: myobcurrency($n) — MYOB-style with trailing .00
export function myobCurrency(n) {
    const minus = n < 0 ? '-' : '';
    const abs = Math.abs(n).toFixed(2);
    return `${minus}$${abs}`;
}

// ── Dates ─────────────────────────────────────────────────────────────────────

// Replaces: currentdatetime($type, $secondsahead)
// type: 'dateonly' | 'timeonly' | 'filename' | undefined (full datetime)
export function currentDatetime(type, secondsAhead = 0) {
    const d = new Date(Date.now() + secondsAhead * 1000);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    const yr  = d.getFullYear();
    const mth = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hr  = pad(d.getHours());
    const min = pad(d.getMinutes());
    const sec = pad(d.getSeconds());
    if (type === 'dateonly')  return `${yr}-${mth}-${day}`;
    if (type === 'timeonly')  return `${hr}:${min}:${sec}`;
    if (type === 'filename')  return `${yr}-${mth}-${day}-${hr}-${min}`;
    return `${yr}-${mth}-${day} ${hr}:${min}:${sec}`;
}

// Replaces: parsesqldatetime($input, $type)
// Formats a SQL datetime string for display.
// type: 'dateonly' | 'timeonly' | 'dateshorttime' | undefined (full)
export function parseSqlDatetime(input, type) {
    if (!input) return '';
    const [datePart, timePart = ''] = String(input).split(' ');
    const [yr, mth, day] = datePart.split('-');
    const [hr = '00', min = '00', sec = '00'] = timePart.split(':');
    if (type === 'dateonly')     return `${day}/${mth}/${yr}`;
    if (type === 'timeonly')     return `${hr}:${min}:${sec}`;
    if (type === 'dateshorttime') return `${day}/${mth}/${yr} ${hr}:${min}`;
    return `${day}/${mth}/${yr} ${hr}:${min}:${sec}`;
}

// Replaces: parseexceldatetime($input, $type)
// Parses dd/mm/yyyy format (Excel exports) for SQL insertion.
export function parseExcelDatetime(input, type) {
    if (!input) return '';
    const [datePart, timePart] = String(input).split(' ');
    const [day, mth, year] = datePart.split('/');
    if (type === 'dateonly') return `${year}-${mth.padStart(2,'0')}-${day.padStart(2,'0')}`;
    if (type === 'timeonly') return timePart || '';
    return `${year}-${mth.padStart(2,'0')}-${day.padStart(2,'0')}${timePart ? ' ' + timePart : ''}`;
}

// Replaces: parseSQLDate($date) → epoch (milliseconds in JS, not seconds like Perl)
// Input: '2010-09-13 23:59:00'
export function parseSQLDate(date) {
    if (!date) return 0;
    const d = new Date(date.replace(' ', 'T'));  // make ISO 8601
    return isNaN(d) ? 0 : d.getTime();
}

// Replaces: parseEpoch($epoch, $format)
// epoch here is JS milliseconds
export function parseEpoch(epoch, format) {
    const d = new Date(epoch);
    const pad = n => String(n).padStart(2, '0');
    const yr  = d.getFullYear();
    const mth = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hr  = pad(d.getHours());
    const min = pad(d.getMinutes());
    const sec = pad(d.getSeconds());
    if (format === 'yyyy-mm-dd') return `${yr}-${mth}-${day}`;
    if (format === 'dd/mm/yyyy') return `${day}/${mth}/${yr}`;
    return `${yr}-${mth}-${day} ${hr}:${min}:${sec}`;
}

// Replaces: parseCommonDate($datestring) → SQL format 'yyyy-mm-dd 00:00:00'
// Accepts 'dd/mm/yyyy' or 'yyyy-mm-dd ...'
export function parseCommonDate(datestring) {
    if (!datestring) return null;
    // Try dd/mm/yyyy
    let m = datestring.match(/^(\d+)\/(\d+)\/(\d+)/);
    if (m) {
        const [, day, mon, year] = m;
        return `${year}-${mon.padStart(2,'0')}-${day.padStart(2,'0')} 00:00:00`;
    }
    // Try yyyy-mm-dd
    m = datestring.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        const [, year, mon, day] = m;
        return `${year}-${mon}-${day} 00:00:00`;
    }
    return null;
}

// Replaces: expiryEpoch($month, $year) — card expiry to JS timestamp
export function expiryEpoch(month, year) {
    const fullYear = parseInt(year) + 2000;
    const nextMonth = parseInt(month) % 12;
    const nextYear  = month == 12 ? fullYear + 1 : fullYear;
    return new Date(nextYear, nextMonth, 1).getTime();
}

// ── Strings ───────────────────────────────────────────────────────────────────

// Replaces: trim($string)
export function trim(s) {
    if (!s) return undefined;
    const trimmed = String(s).trim();
    return trimmed || undefined;
}

// Replaces: nameify($string) — title-cases names, handles Mc/Mac/De/Di/Da prefixes
export function nameify(str) {
    if (!str) return undefined;
    // Basic title case
    let result = str.toLowerCase().replace(/\b(\w)/g, c => c.toUpperCase());
    // Handle Mc prefix: McSmith
    result = result.replace(/\bMc(\w)/g, (_, c) => `Mc${c.toUpperCase()}`);
    // Preserve Mac/De/Di/Da followed by uppercase in original
    const prefixPatterns = [/\b(St[A-Z]\w*)/g, /\b(Mac[A-Z]\w*)/g, /\b(De[A-Z]\w*)/g,
        /\b(Di[A-Z]\w*)/g,  /\b(Da[A-Z]\w*)/g];
    prefixPatterns.forEach(pattern => {
        const match = str.match(pattern);
        if (match) result = result.replace(new RegExp(match[0], 'i'), match[0]);
    });
    return result || undefined;
}

// Replaces: maxwords($str, $n)
export function maxWords(str, n) {
    if (!str) return str;
    const words = str.trim().split(/\s+/);
    if (words.length <= n) return str;
    return words.slice(0, n).join(' ') + ' [truncated: max words exceeded]';
}

// Replaces: truncatewords($text, $maxwords) → { truncated: bool, text: string }
export function truncateWords(text, maxWords) {
    if (!text) return { truncated: false, text: '' };
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return { truncated: false, text };
    return { truncated: true, text: words.slice(0, maxWords).join(' ') };
}

// A "word" for word-limit purposes excludes list markers — bullet characters
// and list enumerators (1.  2)  (3)  a.  b)) — which are formatting, not content.
// NOTE: the same literal is mirrored client-side in form-responses.js (isListMarker)
// so the live counter, the initial count, and viewEntry truncation all agree.
export const LIST_MARKER_RE = /^([•·‣◦▪▫■*–—-]+|\(?\d+[.)]|\(?[A-Za-z][.)])$/;

// Count content words, ignoring list markers/numbers.
export function countContentWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(w => w && !LIST_MARKER_RE.test(w)).length;
}

// Truncate to `max` CONTENT words. List markers/numbers don't count toward the
// limit but are preserved (so list formatting survives). Original whitespace
// (incl. newlines) up to the cutoff is kept. Returns { truncated, text }.
export function truncateContentWords(text, max) {
    if (!text) return { truncated: false, text: '' };
    const re = /\S+/g;
    let count = 0, idx = 0, m;
    while ((m = re.exec(text)) !== null) {
        if (LIST_MARKER_RE.test(m[0])) continue;
        count++;
        if (count === max) idx = m.index + m[0].length;
        else if (count > max) return { truncated: true, text: text.slice(0, idx) };
    }
    return { truncated: false, text };
}

// Replaces: replacecr($str) — newlines to <br>
export function replaceCr(str) {
    return str ? str.replace(/\r?\n|\r/g, '<br />') : str;
}

// Replaces: escapechars($input) — escapes \ and $ for Perl interpolation
// In Node this is rarely needed — kept for parity during migration
export function escapeChars(input) {
    if (!input) return input;
    return input.replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
}

// ── Validation ────────────────────────────────────────────────────────────────

// Replaces: checkemail($email)
export function checkEmail(email) {
    return /^[a-zA-Z0-9][\w+\-.']* @(?:[\w-]+\.)+[a-zA-Z]{2,}$/.test(email);
}

// Replaces: is_integer($val)
export function isInteger(val) {
    return val !== undefined && val !== null && /^[+-]?\d+$/.test(String(val));
}

// Replaces: is_decimal($val)
export function isDecimal(val) {
    return val !== undefined && val !== null && /^[+-]?\d+(\.\d+)?$/.test(String(val));
}

// ── Random / Security ─────────────────────────────────────────────────────────

// Replaces: randomFilename($length)
export function randomFilename(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz-_0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Human-readable summary of password requirements — shown in all password-change views.
export const PASSWORD_RULES = 'Password must be at least 10 characters and include an uppercase letter, a number, and a special character.';

// Returns an error string if the password fails complexity rules, or null if it passes.
export function validatePassword(password) {
    if (!password || password.length < 10)   return 'Password must be at least 10 characters.';
    if (!/[A-Z]/.test(password))             return 'Password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(password))             return 'Password must contain at least one number.';
    if (!/[^A-Za-z0-9]/.test(password))      return 'Password must contain at least one special character.';
    return null;
}

// Replaces: randomPassword($length) — excludes ambiguous chars like 0/O/1/l
export function randomPassword(length = 10) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// Replaces: randomSalt() — used internally, exposed for parity
export function randomSalt() {
    return crypto.randomBytes(2).toString('hex').slice(0, 2);
}

// Replaces: encryptPassword($string)
// IMPORTANT: The Perl version used UNIX crypt() (DES-based, very weak).
// New passwords use bcrypt. Legacy password checking is handled separately below.
export async function encryptPassword(plaintext) {
    return bcrypt.hash(plaintext, 12);
}

// Replaces: checkPassword($cleartext, $encrypted)
// Handles BOTH legacy DES-crypt hashes (existing DB) and new bcrypt hashes.
// DES crypt hashes are 13 chars starting with a 2-char salt.
// bcrypt hashes start with $2b$.
export async function checkPassword(cleartext, encrypted) {
    if (!cleartext || !encrypted) return false;
    if (encrypted.startsWith('$2b$') || encrypted.startsWith('$2a$')) {
        // New bcrypt hash
        return bcrypt.compare(cleartext, encrypted);
    }
    // Legacy DES crypt — Node doesn't have crypt() built in.
    // Uses apache-crypt which matches Perl's crypt() DES output exactly
    try {
        const { default: crypt } = await import('apache-crypt');
        return crypt(cleartext, encrypted) === encrypted;
    } catch {
        // If unix-crypt not installed, log a warning and fail closed
        console.warn('apache-crypt not available — legacy password check failed');
        return false;
    }
}

// ── Misc ──────────────────────────────────────────────────────────────────────

// Replaces: getCCDYears() — credit card expiry year dropdown
export function getCCDYears() {
    const currentYear = new Date().getFullYear() % 100; // 2-digit year
    return ['', ...Array.from({ length: 11 }, (_, i) => currentYear + i)];
}

// Replaces: days() / months() arrays
export const DAYS   = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
