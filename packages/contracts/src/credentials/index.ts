// The credential cross-boundary wire surface — home of the provider-source axis and the
// brand-protected `ResolvedCredential` the `infra/providers` runners consume.
// Two axes: CredentialSource is the DISPATCH axis (resolver+runner arm); CredentialProvider is the
// broader STORAGE axis (a row may persist with no resolver arm yet).
// AES-256-GCM AAD invariant: at-rest ciphertext is bound to `${userId}|${provider}`, so CRED_PROVIDERS
// must stay byte-stable. The BYO model profile is the flat `model`/`contextWindow` metadata pair (PD-12
// closed: no nested `CustomModelProfile` type — the runner reads the resolved `ModelCapability`, never a
// baked profile object); the per-endpoint request/response transforms are `includeBody`/`excludeBody`/
// `responseMap` (PD-13).

import type { UserCredentialId } from "@orb/kit/ids";
import { z } from "zod";

const MIN_NON_EMPTY = 1;

// Dispatch axis: every member needs a resolver arm + an infra/providers runner (tsc's assertNever
// red-flags a gap). `@orb/contracts/connection` re-exports this verbatim (under its own name).
export const CRED_SOURCES = ["max-pro-sub", "openrouter", "vllm", "local-light", "custom_openai"] as const;
export type CredentialSource = (typeof CRED_SOURCES)[number];
export const credentialSourceSchema = z.enum(CRED_SOURCES);

// Storage axis (the `user_credentials.provider` enum derives from this tuple). `openai` is storable with
// no resolver arm yet — a provider's union member, resolver arm, and runner must land TOGETHER (never a
// stranded partial). `anthropic` stores a first-party `x-api-key` (the agent-sdk paid-key skin).
export const CRED_PROVIDERS = ["openrouter", "anthropic", "openai", "custom_openai"] as const;
export type CredentialProvider = (typeof CRED_PROVIDERS)[number];
export const credentialProviderSchema = z.enum(CRED_PROVIDERS);

/** A user-declared response-shape map for a non-standard BYO endpoint: each field is a dot-path into the
 *  raw reply (a numeric segment indexes an array) that overrides the runner's OpenAI-compatible default.
 *  All optional — an unset path keeps the default. `.loose()` tolerates forward-compat keys. */
export const customOpenAiResponseMapSchema = z
  .object({
    contentPath: z.string().optional(),
    reasoningPath: z.string().optional(),
    finishReasonPath: z.string().optional(),
    promptTokensPath: z.string().optional(),
    completionTokensPath: z.string().optional(),
    errorMessagePath: z.string().optional(),
    errorCodePath: z.string().optional(),
    toolCallsPath: z.string().optional(),
  })
  .loose();

/** The user-declared response-shape overrides for a BYO endpoint (see {@link customOpenAiResponseMapSchema}). */
export type CustomOpenAiResponseMap = z.infer<typeof customOpenAiResponseMapSchema>;

/** The runtime gate for the `user_credentials.metadata` JSON blob, also used client-side for
 *  custom-endpoint form validation. `.loose()` tolerates forward-compat keys; `null` = no metadata (spelled
 *  `.nullable()`, not a hand-written `z.union([…, z.null()])` — same accepted set, one fewer node). */
export const providerMetadataSchema = z
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
    /** Extra request-body fields merged over the base (user wins) — e.g. a `provider`-specific knob. */
    includeBody: z.record(z.string(), z.unknown()).optional(),
    /** Request-body keys stripped LAST (a field the endpoint rejects, even if `includeBody` re-added it). */
    excludeBody: z.array(z.string()).optional(),
    /** Dot-path overrides for a non-standard reply shape (see {@link customOpenAiResponseMapSchema}). */
    responseMap: customOpenAiResponseMapSchema.optional(),
  })
  .loose()
  .nullable();

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
  /** Per-endpoint request-body fields merged over the base (user wins); `null` when the row declares none. */
  readonly includeBody: Record<string, unknown> | null;
  /** Request-body keys stripped LAST (after `includeBody`); `null` when the row declares none. */
  readonly excludeBody: readonly string[] | null;
  /** Dot-path overrides for a non-standard reply shape; `null` when the row uses the OpenAI-compatible defaults. */
  readonly responseMap: CustomOpenAiResponseMap | null;
};

/** The decrypted-credential shape every provider runner consumes. Constructed ONLY through the
 *  `domain/credentials/substrate/mint` factories. */
export type ResolvedCredential = MaxProSubCredential | OpenRouterCredential | VllmCredential | LocalLightCredential | CustomOpenAiCredential;
