// entry/boot/seed-credential — boot step 4: idempotent env→DB seed of the `OPENROUTER_API_KEY` (core/Tier-5-Entry.md
// §"Boot order"). It runs ONLY when the env var is set AND the
// owner has no openrouter credential yet, so re-running never duplicates a row. The credential is the OWNER's
// (rows are scoped by `principal.userId`; the OpenRouter key is a box credential the owner holds).
//
// The raw key value + the owner `Principal` are INJECTED (env is read once at the top boot seam; the owner
// Principal is built from the boot owner-seed). This step calls the credentials front-door `add` verb (which
// seals the secret under AAD `${ownerId}|openrouter`); it never reaches into the domain internals.

import type { Principal } from "@orb/contracts/identity";
import type { CredentialsService } from "#domain/credentials";
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

/**
 * Boot step 4: seed the OpenRouter key from env into the owner's credentials, ONCE. No-op when the env var
 * is unset or an openrouter credential already exists (the list-then-add guard makes re-runs idempotent).
 * Returns whether a row was actually written.
 */
export async function seedCredentialFromEnv(deps: SeedCredentialDeps): Promise<boolean> {
  if (deps.openrouterApiKey === undefined) {
    return false;
  }
  const existing = await deps.credentials.list({ principal: deps.owner });
  if (existing.some((credential) => credential.provider === OPENROUTER_PROVIDER)) {
    return false;
  }
  await deps.credentials.add({
    principal: deps.owner,
    provider: OPENROUTER_PROVIDER,
    key: deps.openrouterApiKey,
  });
  getLog().info(
    { provider: OPENROUTER_PROVIDER },
    "boot/seed-credential: seeded OpenRouter key from env",
  );
  return true;
}
