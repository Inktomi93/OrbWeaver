// The credential cross-boundary wire surface — home of the provider-source axis and the
// brand-protected `ResolvedCredential` the `infra/providers` runners consume.
// Two axes: CredentialSource is the DISPATCH axis (resolver+runner arm); CredentialProvider is the
// broader STORAGE axis (a row may persist with no resolver arm yet).
// AES-256-GCM AAD invariant: at-rest ciphertext is bound to `${userId}|${provider}`, so CRED_PROVIDERS
// must stay byte-stable. FLAG[PD-12]: BYO `modelProfile`/per-endpoint transforms deferred.

import type { UserCredentialId } from "@orb/kit/ids";
import { z } from "zod";

const MIN_NON_EMPTY = 1;

// Dispatch axis: every member needs a resolver arm + an infra/providers runner (tsc's assertNever
// red-flags a gap). `@orb/contracts/connection` re-exports this verbatim (under its own name).
export const CRED_SOURCES = [
  "max-pro-sub",
  "openrouter",
  "vllm",
  "local-light",
  "custom_openai",
] as const;
export type CredentialSource = (typeof CRED_SOURCES)[number];
export const credentialSourceSchema = z.enum(CRED_SOURCES);

// Storage axis (the `user_credentials.provider` enum derives from this tuple). `anthropic`/`openai`/
// `google_vertex` are storable with no resolver arm yet — a provider's union member, resolver arm, and
// runner must land TOGETHER (never a stranded partial).
// `gif-search` is a non-LLM storage-only slot (never dispatched, no runner) resolved by its own verb
// (`resolveGifSearchKey`) so it stays outside the LLM credential lifecycle / turn-time `assertNever`.
export const CRED_PROVIDERS = [
  "openrouter",
  "anthropic",
  "openai",
  "google_vertex",
  "custom_openai",
  "gif-search",
] as const;
export type CredentialProvider = (typeof CRED_PROVIDERS)[number];
export const credentialProviderSchema = z.enum(CRED_PROVIDERS);

/** The runtime gate for the `user_credentials.metadata` JSON blob, also used client-side for
 *  custom-endpoint form validation. `.loose()` tolerates forward-compat keys; `null` = no metadata. */
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
      /** User-declared context window (tokens) for the BYO model — trusted input, not probed. */
      contextWindow: z.number().int().positive().optional(),
    })
    .loose(),
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

/** Parse a raw `metadata` column value into the typed shape, or `null` when it matches no arm. */
export function parseProviderMetadata(raw: unknown): ProviderMetadata {
  const parsed = providerMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Result of a credential health probe; `throttled` is a domain-only state the provider can't see. */
export type CredentialHealth =
  | { status: "ok"; checkedAt: number }
  | { status: "revoked"; checkedAt: number; reason: string }
  | { status: "unreachable"; checkedAt: number; reason: string }
  | { status: "throttled"; checkedAt: number };

// Phantom `unique symbol` brand: an arbitrary `{ source, ... }` literal can't satisfy it, so the ONLY
// way to produce a `ResolvedCredential` is the domain `resolve.ts` factory's encapsulated cast.
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

/** In-process transformers.js/ONNX engine (CPU+CUDA) — a pure routing marker; no key, no row. The
 *  owner's-box local-light compute tier (D17/D39): like vllm but in-process (no supervised subprocess),
 *  the "any box" embed/rerank/imageEmbed path for a GPU-less, key-less user. */
export type LocalLightCredential = CredentialBrand & {
  readonly source: "local-light";
  readonly credentialId: null;
};

/** User-defined OpenAI-compatible endpoint. `apiKey` is `null` for no-auth local servers. */
export type CustomOpenAiCredential = CredentialBrand & {
  readonly source: "custom_openai";
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly headers: Record<string, string> | null;
  readonly credentialId: UserCredentialId;
  readonly contextWindow: number | undefined;
  /** Default model string from the credential's `metadata.model`; undefined until the form supplies one. */
  readonly model: string | undefined;
};

/** The decrypted-credential shape every provider runner consumes. Constructed ONLY through the
 *  `domain/credentials/substrate/mint` factories. */
export type ResolvedCredential =
  | MaxProSubCredential
  | OpenRouterCredential
  | VllmCredential
  | LocalLightCredential
  | CustomOpenAiCredential;
