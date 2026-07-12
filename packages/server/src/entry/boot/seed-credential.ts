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
// The non-LLM external-service slot (D61 gallery-design §5): the Tenor gif-search key. Seeded the same
// idempotent env→DB way as OpenRouter; resolved at runtime by `credentials.resolveGifSearchKey`.
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

/** Seed ONE provider's key from env into the owner's credentials, idempotently: no-op when the key is
 *  unset or a credential for that provider already exists. Returns whether a row was written. The key is
 *  NEVER logged (only the provider name). */
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

/**
 * Boot step 4: seed the OpenRouter + Tenor gif-search keys from env into the owner's credentials, ONCE
 * each. No-op per provider when its env var is unset or a credential already exists (the list-then-add
 * guard makes re-runs idempotent). Returns whether ANY row was written.
 */
export async function seedCredentialFromEnv(deps: SeedCredentialDeps): Promise<boolean> {
  const openrouter = await seedProviderKey(deps, OPENROUTER_PROVIDER, deps.openrouterApiKey);
  const gifSearch = await seedProviderKey(deps, GIF_SEARCH_PROVIDER, deps.tenorApiKey);
  return openrouter || gifSearch;
}
