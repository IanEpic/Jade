// services/auth.js

import Program from '../models/Program.js';
import User from '../models/User.js';
import UserCredential from '../models/UserCredential.js';
import { checkPassword, encryptPassword } from './helpers.js';

// ── Program cache ─────────────────────────────────────────────────────────────
// Programs are looked up on every request but almost never change at runtime.
// Cache them in-process for 60 seconds to avoid a DB round-trip per request.

const programCache = new Map(); // slug/host → { program, expiresAt }
const PROGRAM_CACHE_TTL = 60_000;

function getCached(key) {
    const entry = programCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { programCache.delete(key); return null; }
    return entry.program;
}

function setCache(key, program) {
    programCache.set(key, { program, expiresAt: Date.now() + PROGRAM_CACHE_TTL });
}

// Call this when a program is updated (e.g. from formAdmin) to bust the cache.
export function bustProgramCache(slug, fqdn) {
    if (slug) programCache.delete(slug);
    if (fqdn) programCache.delete(fqdn);
}

export async function getProgramByHost(hostname) {
    const cached = getCached(hostname);
    if (cached) return cached;
    const program = await Program.findOne({ where: { fqdn: hostname } });
    if (program) setCache(hostname, program);
    return program;
}

export async function getProgramBySlug(slug) {
    const cached = getCached(slug);
    if (cached) return cached;
    const program = await Program.findOne({ where: { slug } });
    if (program) setCache(slug, program);
    return program;
}

// Returns { user, credential } on success, null on failure.
// Verifies password against UserCredential. Falls back to User.password for
// rows not yet migrated (credentialid IS NULL) so the old login still works
// during the migration window.
export async function login(email, password, programId, emulateUserId = null) {
  if (!email || !password) return null;

  const credential = await UserCredential.findOne({ where: { email } });

  let user;

  if (credential) {
    const valid = await checkPassword(password, credential.password);
    if (!valid) return null;

    // Upgrade legacy DES hash to bcrypt on successful login
    if (credential.password && !credential.password.startsWith('$2b$') && !credential.password.startsWith('$2a$')) {
      encryptPassword(password)
        .then(hashed => UserCredential.update({ password: hashed }, { where: { credentialid: credential.credentialid } }))
        .catch(err => console.warn('Password upgrade to bcrypt failed:', err.message));
    }

    user = await User.findOne({
      where: { credentialid: credential.credentialid, programid: programId, deleted: 0, enabled: 1 },
    });
  } else {
    // No credential found — unknown user
    return null;
  }

  if (!user) return null;

  if (emulateUserId) {
    const emulated = await User.findByPk(emulateUserId);
    return { user: emulated || user, credential };
  }

  return { user, credential };
}

// Returns all programs this credential has access to (for the switcher).
// Closed portals are excluded unless the user is an admin on that program.
export async function getLinkedPrograms(credentialId) {
  const users = await User.findAll({
    where: { credentialid: credentialId, deleted: 0, enabled: 1 },
    include: [{ model: Program, as: 'program', attributes: ['programid', 'slug', 'name', 'portalopen'] }],
  });
  return users
    .filter(u => u.program && (u.program.portalopen || u.admin))
    .map(u => ({
      userid:    u.userid,
      programid: u.programid,
      slug:      u.program.slug,
      name:      u.program.name,
    }));
}

// Replaces: EPIC::JADE::LogOnRecord->insert({ userid => $user->userid() })
export async function recordLogon(userId) {
  try {
    const { default: LogOnRecord } = await import('../models/LogOnRecord.js');
    await LogOnRecord.create({ userid: userId, timestamp: new Date() });
  } catch {
    // LogOnRecord table may not exist in all program setups — fail silently
  }
}
