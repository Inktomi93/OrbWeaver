// Boot step: settle the boot secrets the pre-db phase left `absent`. A keyfile is generated only when no
// row depends on it; otherwise the boot refuses and names the file, because a new secret would orphan
// every sealed credential, or every local password, session and live invite link.

import type { Db } from "@orb/db";
import { chatInvites, sessions, userCredentials } from "@orb/db";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { createSettleSessionSecret } from "#domain/sessions";
import type { BootSecretResolution, KeyfileReport } from "#infra/crypto";
import { loadOrCreateKeyfile } from "#infra/crypto";

const LIMIT_ONE = 1;
// The one invite state whose token can still be redeemed, so whose peppered hash still has to match.
const LIVE_INVITE_STATUS = "pending";

export interface BootSecretsDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly credentialsKey: BootSecretResolution<Buffer>;
  readonly sessionSecret: BootSecretResolution<string>;
  /** Where a generated or unreadable keyfile is reported (`keyfileReport` over the record's `NODE_ENV`). */
  readonly reportKeyfile: KeyfileReport;
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
async function hasSessionTokenOrInviteDependents(db: Db, now: number): Promise<boolean> {
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
    secretBoxKey = loadOrCreateKeyfile(deps.credentialsKey.path, deps.reportKeyfile);
  } else {
    secretBoxKey = deps.credentialsKey.value;
  }

  let sessionSecret: string | null;
  if (deps.sessionSecret.kind === "absent") {
    const at = deps.now();
    sessionSecret = await createSettleSessionSecret({
      db: deps.db,
      resolution: deps.sessionSecret,
      hasOtherDependents: () => hasSessionTokenOrInviteDependents(deps.db, at),
      createKeyfile: (path) => loadOrCreateKeyfile(path, deps.reportKeyfile)?.toString("hex") ?? null,
    })();
  } else {
    sessionSecret = deps.sessionSecret.value;
  }

  return { secretBoxKey, sessionSecret };
}
