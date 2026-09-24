// Boot step: settle the boot secrets the pre-db phase left `absent`. A keyfile is generated only when no
// row depends on it; otherwise the boot refuses and names the file, because a new secret would orphan
// every sealed credential, or every local password, session and live invite link.

import type { Db } from "@orb/db";
import { chatInvites, sessions, userCredentials, users } from "@orb/db";
import { and, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import type { BootSecretResolution } from "#infra/crypto";
import { loadOrCreateKeyfile } from "#infra/crypto";

const LIMIT_ONE = 1;
// The one invite state whose token can still be redeemed, so whose peppered hash still has to match.
const LIVE_INVITE_STATUS = "pending";

export interface BootSecretsDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly credentialsKey: BootSecretResolution<Buffer>;
  readonly sessionSecret: BootSecretResolution<string>;
}

/** The settled secrets, in the shapes compose takes. `null` keeps the pre-db meaning: an unusable value. */
export interface BootSecrets {
  readonly secretBoxKey: Buffer | null;
  readonly sessionSecret: string | null;
}

async function hasSealedCredentials(db: Db): Promise<boolean> {
  const rows = await db.select({ id: userCredentials.id }).from(userCredentials).limit(LIMIT_ONE);
  return rows.length > 0;
}

// The pepper's dependents: a local password hash, a session token hash, and a chat invite whose token hash
// can still be redeemed (`pending`, and either open-ended or not yet expired).
async function hasSessionDependents(db: Db, now: number): Promise<boolean> {
  const withPassword = await db.select({ id: users.id }).from(users).where(isNotNull(users.passwordHash)).limit(LIMIT_ONE);
  if (withPassword.length > 0) {
    return true;
  }
  const sessionRows = await db.select({ id: sessions.id }).from(sessions).limit(LIMIT_ONE);
  if (sessionRows.length > 0) {
    return true;
  }
  const liveInvites = await db
    .select({ id: chatInvites.id })
    .from(chatInvites)
    .where(and(eq(chatInvites.status, LIVE_INVITE_STATUS), or(isNull(chatInvites.expiresAt), gt(chatInvites.expiresAt, now))))
    .limit(LIMIT_ONE);
  return liveInvites.length > 0;
}

function missingCredentialsKeyRefusal(path: string): string {
  return `boot: CREDENTIALS_KEY is unset and the keyfile ${path} does not exist, but this database holds sealed provider credentials that were encrypted with it. Restore ${path} from the backup taken with the database, or set CREDENTIALS_KEY to the same value. Generating a new key would make every stored provider key unreadable, so the boot stops here.`;
}

function missingSessionSecretRefusal(path: string): string {
  return `boot: SESSION_SECRET is unset and the keyfile ${path} does not exist, but this database holds local passwords, sessions or live invite links that were hashed with it. Restore ${path} from the backup taken with the database, or set SESSION_SECRET to the same value. Generating a new secret would invalidate every local password, sign-in and outstanding invite, so the boot stops here.`;
}

/**
 * Generate each `absent` keyfile when nothing in the db depends on it; refuse when something does.
 * @throws Error before any write when a dependent secret is missing; the message names the file.
 */
export async function settleBootSecrets(deps: BootSecretsDeps): Promise<BootSecrets> {
  let secretBoxKey: Buffer | null;
  if (deps.credentialsKey.kind === "absent") {
    if (await hasSealedCredentials(deps.db)) {
      throw new Error(missingCredentialsKeyRefusal(deps.credentialsKey.path));
    }
    secretBoxKey = loadOrCreateKeyfile(deps.credentialsKey.path);
  } else {
    secretBoxKey = deps.credentialsKey.value;
  }

  let sessionSecret: string | null;
  if (deps.sessionSecret.kind === "absent") {
    if (await hasSessionDependents(deps.db, deps.now())) {
      throw new Error(missingSessionSecretRefusal(deps.sessionSecret.path));
    }
    sessionSecret = loadOrCreateKeyfile(deps.sessionSecret.path)?.toString("hex") ?? null;
  } else {
    sessionSecret = deps.sessionSecret.value;
  }

  return { secretBoxKey, sessionSecret };
}
