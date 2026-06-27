// The credential cross-boundary wire surface — the CANONICAL home of the provider-source axis (D31)
// and the brand-protected `ResolvedCredential` the `infra/providers` runners consume. Both the
// `credentials` DOMAIN (which mints the values) and the runners (which read them) sit DOWN from this
// node: contracts is the one place both consumers can reach without an infra→domain edge.
//
// TWO distinct axes live here — never conflate them (credentials.md §7.5):
//   • CredentialSource (CRED_SOURCES) — the DISPATCH axis. The 4 sources the turn-time resolver has a
//     runner arm for: `max-pro-sub | openrouter | vllm | custom_openai`. THE provider-source axis
//     (D31); `@orb/contracts/connection` re-exports it verbatim as `ChatSource` rather than declaring
//     a second tuple — routing's `source` IS the credential source.
//   • CredProvider (CRED_PROVIDERS) — the STORAGE axis. The broader set of providers a row may be
//     persisted under: `openrouter | anthropic | openai | google_vertex | custom_openai`. The
//     `anthropic`/`openai`/`google_vertex` members are forward-compat storage slots with NO resolver
//     arm yet — storable, never dispatched. The two axes overlap only on `openrouter` + `custom_openai`.
//
// AAD invariant (credentials.md "AES-256-GCM AAD invariant"): the at-rest ciphertext is bound to
// `${userId}|${provider}` where `provider` is a CredProvider. No wire shape in THIS node carries the
// AAD — it is a domain `persistence/aad.ts` concern — but the storage axis defined here is the
// `provider` half of that binding, so the CRED_PROVIDERS tuple must stay byte-stable.
//
// v1 deferral (shared-dissolution §1.3 cycle break + credentials.md Open decisions): the metadata
// schema is `baseUrl`/`headers` (custom_openai) + project/region (google_vertex) only. The BYO
// `modelProfile?: CustomModelProfile` is DEFERRED — defining it here would tempt importing
// `connection.ModelCapability` and invert the D31 `connection → credentials` edge into a cycle. When
// it lands, `CustomModelProfile` is homed HERE as an independent subset shape (never importing
// `ModelCapability`). The per-endpoint request/response transforms (`includeBody`/`excludeBody`/
// `responseMap`) are likewise deferred to the custom-endpoint runner.

import type { UserCredentialId } from "@orb/kit/ids";
import { z } from "zod";

// Zod `.min(MIN_NON_EMPTY)` reads as "non-empty string"; named so the boundary intent is explicit
// (noMagicNumbers) and every metadata arm shares the one floor.
const MIN_NON_EMPTY = 1;

// --- The provider-SOURCE axis (D31 canonical) --------------------------------
// The dispatch axis: every member has a resolver arm + an infra/providers runner. Adding a source is
// a member here + a resolver arm + a runner arm — `tsc` (the resolver's `assertNever`) red-flags any
// of the three left undone. `@orb/contracts/connection` re-exports `CredentialSource` as `ChatSource`.
export const CRED_SOURCES = ["max-pro-sub", "openrouter", "vllm", "custom_openai"] as const;
export type CredentialSource = (typeof CRED_SOURCES)[number];
export const credentialSourceSchema = z.enum(CRED_SOURCES);

// --- The provider-STORAGE axis -----------------------------------------------
// The broader storable set (the `user_credentials.provider` enum derives from this tuple). Distinct
// from CredentialSource: `anthropic`/`openai`/`google_vertex` are storable with no resolver arm yet —
// a row with one is persisted but never reached at turn time (do NOT add a partial runner; see
// credentials.md Open decisions). The neo `CredProvider` re-export collapses to this one home.
export const CRED_PROVIDERS = [
  "openrouter",
  "anthropic",
  "openai",
  "google_vertex",
  "custom_openai",
] as const;
export type CredProvider = (typeof CRED_PROVIDERS)[number];
/** Spelled-out alias of {@link CredProvider} (credentials.md §7.5 names it `CredentialProvider`). */
export type CredentialProvider = CredProvider;
export const credentialProviderSchema = z.enum(CRED_PROVIDERS);

// --- Provider metadata (the `metadata` JSON column wire shape) ----------------
/**
 * The SINGLE runtime gate for the `user_credentials.metadata` JSON blob, also imported by the client
 * for custom-endpoint form validation (same pattern as `createCharacterSchema`). `.loose()` on each
 * arm tolerates forward-compat keys without dropping them; the `null` arm is the no-metadata case
 * (openrouter/anthropic/openai have fixed base URLs). v1 scope per the file header.
 */
export const providerMetadataSchema = z.union([
  z
    .object({
      kind: z.literal("custom_openai"),
      /** The user-supplied OpenAI-compatible base URL — the endpoint selection itself. */
      baseUrl: z.string().min(MIN_NON_EMPTY),
      /** Convenience default model string for the Connections picker. */
      model: z.string().optional(),
      /** Per-endpoint request headers the runner applies. */
      headers: z.record(z.string(), z.string()).optional(),
    })
    .loose(),
  // `project` (NOT `projectId`) — Google's identifier is an assigned string, not a branded id.
  z
    .object({
      kind: z.literal("google_vertex"),
      project: z.string().min(MIN_NON_EMPTY),
      region: z.string().min(MIN_NON_EMPTY),
    })
    .loose(),
  z.null(),
]);

/** Provider-specific metadata, inferred from the schema so the type and the runtime gate can't drift. */
export type ProviderMetadata = z.infer<typeof providerMetadataSchema>;

/**
 * Parse a raw `metadata` column value (Drizzle hands it back as `unknown`) into the typed shape, or
 * `null` when it matches no arm. The single read-side seam: a corrupt `{kind:"custom_openai"}` row
 * with no `baseUrl` yields `null` here, so `undefined` can never escape into an outbound fetch URL.
 */
export function parseProviderMetadata(raw: unknown): ProviderMetadata {
  const parsed = providerMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// --- Credential health (probe result) ----------------------------------------
/**
 * Result of a credential health probe. Cross-role contract: the `infra/providers` `probe()` returns a
 * subset (ok/revoked/unreachable); the domain `testHealth` surfaces the full set including
 * `throttled` (service-side throttle state the provider has no knowledge of).
 */
export type CredentialHealth =
  | { status: "ok"; checkedAt: number }
  | { status: "revoked"; checkedAt: number; reason: string }
  | { status: "unreachable"; checkedAt: number; reason: string }
  | { status: "throttled"; checkedAt: number };

// --- The ResolvedCredential brand (load-bearing) -----------------------------
// A phantom `unique symbol` intersection: an arbitrary `{ source, ... }` literal can NOT satisfy a
// branded member (the brand key is unreachable outside this module), so the ONLY way to produce a
// `ResolvedCredential` is the domain `resolve.ts` factory's encapsulated cast. `max-pro-sub` is the
// critical arm — it is the OWNER's box credential (D17), mintable only after the `requireOwner` gate;
// the opaque `MaxProSubCredential` type carries no key material a non-owner path could fabricate.
declare const credentialBrand: unique symbol;
interface CredentialBrand {
  readonly [credentialBrand]: true;
}

/** Owner-only (D17) opaque box credential — agent-sdk over the host Claude sub. No row, no key. */
export type MaxProSubCredential = CredentialBrand & {
  readonly source: "max-pro-sub";
  readonly credentialId: null;
};

/** OpenRouter aggregator — a bare API key. `credentialId` is `null` when seeded from env (no row). */
export type OpenRouterCredential = CredentialBrand & {
  readonly source: "openrouter";
  readonly apiKey: string;
  readonly credentialId: UserCredentialId | null;
};

/** Supervised loopback vLLM engine — a pure routing marker; ports come from env, no key, no row. */
export type VllmCredential = CredentialBrand & {
  readonly source: "vllm";
  readonly credentialId: null;
};

/**
 * User-defined OpenAI-compatible endpoint. The active `custom_openai` row IS the endpoint selection.
 * `apiKey` is `null` for no-auth local servers; `headers` carries the per-endpoint request transform
 * resolved from the credential's metadata. (Request/response body transforms are v1-deferred.)
 */
export type CustomOpenAiCredential = CredentialBrand & {
  readonly source: "custom_openai";
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly headers: Record<string, string> | null;
  readonly credentialId: UserCredentialId;
};

/**
 * The decrypted-credential shape every provider runner consumes, discriminated by `source` and
 * brand-protected. Constructed ONLY inside `domain/credentials/verbs/resolve.ts` (+ the boot helpers
 * `mint-vllm` / `build-keyless-catalog`). One credential = one backend = N roles.
 */
export type ResolvedCredential =
  | MaxProSubCredential
  | OpenRouterCredential
  | VllmCredential
  | CustomOpenAiCredential;
