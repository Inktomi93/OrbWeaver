// Boot step: settle the boot secrets the pre-db phase left `absent`. A keyfile is generated only when no
// row depends on it; otherwise the boot refuses and names the file, because a new secret would orphan
// every sealed credential, or every local password, session and live invite link.

import type { DatabaseHandle } from "@orb/db/wiring";
import { hasRedeemableInvite } from "#domain/chat";
import { hasSealedCredentials } from "#domain/credentials";
import { createSettleSessionSecret } from "#domain/sessions";
import type { BootSecretResolution, KeyfileReport } from "#infra/crypto";
import { loadOrCreateKeyfile } from "#infra/crypto";

export interface BootSecretsDeps {
  readonly db: DatabaseHandle;
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
    // The sessions verb probes its own password and session-token rows first; a redeemable invite's token hash
    // is peppered with the same secret, so chat's invite probe is the other dependent.
    sessionSecret = await createSettleSessionSecret({
      db: deps.db,
      resolution: deps.sessionSecret,
      hasOtherDependents: () => hasRedeemableInvite(deps.db, at),
      createKeyfile: (path) => loadOrCreateKeyfile(path, deps.reportKeyfile)?.toString("hex") ?? null,
    })();
  } else {
    sessionSecret = deps.sessionSecret.value;
  }

  return { secretBoxKey, sessionSecret };
}
