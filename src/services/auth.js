// services/auth.js

import Program from '../models/Program.js';
import User from '../models/User.js';
import UserCredential from '../models/UserCredential.js';
import { checkPassword } from './helpers.js';

export async function getProgramByHost(hostname) {
  return Program.findOne({ where: { fqdn: hostname } });
}

export async function getProgramBySlug(slug) {
  return Program.findOne({ where: { slug } });
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

    user = await User.findOne({
      where: { credentialid: credential.credentialid, programid: programId, deleted: 0, enabled: 1 },
    });
  } else {
    // Pre-migration fallback: check User.password directly
    user = await User.findOne({
      where: { email, programid: programId, deleted: 0, enabled: 1 },
    });
    if (!user) return null;
    const valid = await checkPassword(password, user.password);
    if (!valid) return null;
  }

  if (!user) return null;

  if (emulateUserId) {
    const emulated = await User.findByPk(emulateUserId);
    return { user: emulated || user, credential };
  }

  return { user, credential };
}

// Returns all programs this credential has access to (for the switcher).
export async function getLinkedPrograms(credentialId) {
  const users = await User.findAll({
    where: { credentialid: credentialId, deleted: 0, enabled: 1 },
    include: [{ model: Program, as: 'program', attributes: ['programid', 'slug', 'name'] }],
  });
  return users
    .filter(u => u.program)
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
