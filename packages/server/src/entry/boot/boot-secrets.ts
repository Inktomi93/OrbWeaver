// Boot step: settle the boot secrets the pre-db phase left `absent`. A keyfile is generated only when no
// row depends on it; otherwise the boot refuses and names the file, because a new secret would orphan
// every sealed credential, or every local password and session.

import type { Db } from "@orb/db";
import { sessions, userCredentials, users } from "@orb/db";
import { isNotNull } from "drizzle-orm";
import type { BootSecretResolution } from "#infra/crypto";
import { loadOrCreateKeyfile } from "#infra/crypto";

const LIMIT_ONE = 1;

export interface BootSecretsDeps {
  readonly db: Db;
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

async function hasSessionDependents(db: Db): Promise<boolean> {
  const withPassword = await db.select({ id: users.id }).from(users).where(isNotNull(users.passwordHash)).limit(LIMIT_ONE);
  if (withPassword.length > 0) {
    return true;
  }
  const rows = await db.select({ id: sessions.id }).from(sessions).limit(LIMIT_ONE);
  return rows.length > 0;
}

function missingCredentialsKeyRefusal(path: string): string {
  return `boot: CREDENTIALS_KEY is unset and the keyfile ${path} does not exist, but this database holds sealed provider credentials that were encrypted with it. Restore ${path} from the backup taken with the database, or set CREDENTIALS_KEY to the same value. Generating a new key would make every stored provider key unreadable, so the boot stops here.`;
}

function missingSessionSecretRefusal(path: string): string {
  return `boot: SESSION_SECRET is unset and the keyfile ${path} does not exist, but this database holds local passwords or sessions that were hashed with it. Restore ${path} from the backup taken with the database, or set SESSION_SECRET to the same value. Generating a new secret would invalidate every local password and sign-in, so the boot stops here.`;
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
    if (await hasSessionDependents(deps.db)) {
      throw new Error(missingSessionSecretRefusal(deps.sessionSecret.path));
    }
    sessionSecret = loadOrCreateKeyfile(deps.sessionSecret.path)?.toString("hex") ?? null;
  } else {
    sessionSecret = deps.sessionSecret.value;
  }

  return { secretBoxKey, sessionSecret };
}
