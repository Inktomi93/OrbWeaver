// Idempotent env→DB seed of the OpenRouter key onto the owner's credentials. Runs only when the env var
// is set and no credential for that provider exists yet.

import type { Principal } from "@orb/contracts/identity";
import { DomainOperationError } from "@orb/kit/errors";
import type { CredentialsService } from "#domain/credentials";
import { CREDENTIALS_OP_CODES } from "#domain/credentials";
import { getLog } from "#foundation/observability";

const OPENROUTER_PROVIDER = "openrouter" as const;

export interface SeedCredentialDeps {
  /** The credentials front door — only the existence check + the add verb are needed. */
  readonly credentials: Pick<CredentialsService, "list" | "add">;
  /** The deployment OWNER principal (rows are scoped by `principal.userId`). */
  readonly owner: Principal;
  /** `env.OPENROUTER_API_KEY` — `undefined` when unset (the seed is then a no-op). */
  readonly openrouterApiKey: string | undefined;
}

/** Seed the OpenRouter key idempotently. Returns whether a row was written. Never logs the key itself. */
export async function seedCredentialFromEnv(deps: SeedCredentialDeps): Promise<boolean> {
  if (deps.openrouterApiKey === undefined) {
    return false;
  }
  const existing = await deps.credentials.list({ principal: deps.owner });
  if (existing.some((credential) => credential.provider === OPENROUTER_PROVIDER)) {
    return false;
  }
  try {
    await deps.credentials.add({ principal: deps.owner, provider: OPENROUTER_PROVIDER, key: deps.openrouterApiKey });
  } catch (err) {
    // An env key with credential storage DISABLED (no CREDENTIALS_KEY) must not kill boot — the seed is a
    // convenience, not a boot invariant. Visible skip, never silent; anything else stays fatal.
    if (err instanceof DomainOperationError && err.code === CREDENTIALS_OP_CODES.disabled) {
      getLog().warn({ provider: OPENROUTER_PROVIDER }, "boot/seed-credential: env key present but credential storage is disabled — seed skipped");
      return false;
    }
    throw err;
  }
  getLog().info({ provider: OPENROUTER_PROVIDER }, "boot/seed-credential: seeded key from env");
  return true;
}
