// Idempotent env→DB seed of the OpenRouter + Tenor gif-search keys onto the owner's credentials. Runs only
// when the env var is set and no credential for that provider exists yet.

import type { Principal } from "@orb/contracts/identity";
import type { CredentialsService } from "#domain/credentials";
import { getLog } from "#foundation/observability";

const OPENROUTER_PROVIDER = "openrouter" as const;
const GIF_SEARCH_PROVIDER = "gif-search" as const;

export interface SeedCredentialDeps {
  /** The credentials front door — only the existence check + the add verb are needed. */
  readonly credentials: Pick<CredentialsService, "list" | "add">;
  /** The deployment OWNER principal (rows are scoped by `principal.userId`). */
  readonly owner: Principal;
  /** `env.OPENROUTER_API_KEY` — `undefined` when unset (the seed is then a no-op). */
  readonly openrouterApiKey: string | undefined;
  /** `env.TENOR_API_KEY` — `undefined` when unset (the gif-search seed is then a no-op). */
  readonly tenorApiKey: string | undefined;
}

/** Seed ONE provider's key idempotently. Returns whether a row was written. Never logs the key itself. */
async function seedProviderKey(
  deps: Pick<SeedCredentialDeps, "credentials" | "owner">,
  provider: typeof OPENROUTER_PROVIDER | typeof GIF_SEARCH_PROVIDER,
  key: string | undefined,
): Promise<boolean> {
  if (key === undefined) {
    return false;
  }
  const existing = await deps.credentials.list({ principal: deps.owner });
  if (existing.some((credential) => credential.provider === provider)) {
    return false;
  }
  await deps.credentials.add({ principal: deps.owner, provider, key });
  getLog().info({ provider }, "boot/seed-credential: seeded key from env");
  return true;
}

/** Seed both provider keys once each. Returns whether ANY row was written. */
export async function seedCredentialFromEnv(deps: SeedCredentialDeps): Promise<boolean> {
  const openrouter = await seedProviderKey(deps, OPENROUTER_PROVIDER, deps.openrouterApiKey);
  const gifSearch = await seedProviderKey(deps, GIF_SEARCH_PROVIDER, deps.tenorApiKey);
  return openrouter || gifSearch;
}
