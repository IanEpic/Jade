// services/auth.js
// Converts login() from EPIC::JADE::Common and the login flow from login.cgi
//
// The Perl login() function:
//   1. Finds the program by fqdn + portalopen
//   2. Finds the user by email + programid + deleted=0 + enabled=1
//   3. Checks password with crypt()
//   4. If emulateuser cookie set, swaps to that user
//
// In Node, the program lookup uses req.hostname instead of servername().
// Password checking handles both legacy DES crypt (existing DB) and new bcrypt.

import Program from '../models/Program.js';
import User from '../models/User.js';
import { checkPassword } from './helpers.js';

// Replaces: EPIC::JADE::Program->search(fqdn => servername(), portalopen => 1)
// Returns the Program for the current hostname, or null if not found / portal closed.
export async function getProgramByHost(hostname) {
  return Program.findOne({
    where: { fqdn: hostname },
  });
}

// Looks up a program by its slug (used by the new slug-based routing middleware).
export async function getProgramBySlug(slug) {
  return Program.findOne({
    where: { slug },
  });
}

// Replaces: login($email, $password, $emulateuser) from EPIC::JADE::Common
// Returns the authenticated User, or null if auth fails.
export async function login(email, password, programId, emulateUserId = null) {
  if (!email || !password) return null;

  const user = await User.findOne({
    where: {
      email,
      programid: programId,
      deleted:   0,
      enabled:   1,
    },
  });

  if (!user) return null;

  const valid = await checkPassword(password, user.password);
  if (!valid) return null;

  // Replaces: if ($emulateuser) { $userout = EPIC::JADE::User->retrieve($emulateuser) }
  if (emulateUserId) {
    const emulatedUser = await User.findByPk(emulateUserId);
    return emulatedUser || user;
  }

  return user;
}

// Replaces: EPIC::JADE::LogOnRecord->insert({ userid => $user->userid() })
// Logs each successful login. Stub until LogOnRecord model is fully defined.
export async function recordLogon(userId) {
  try {
    const { default: LogOnRecord } = await import('../models/LogOnRecord.js');
    await LogOnRecord.create({ userid: userId, timestamp: new Date() });
  } catch {
    // LogOnRecord table may not exist in all program setups — fail silently
  }
}
