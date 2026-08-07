// The single construction home for the brand-protected `ResolvedCredential` arms — the brand's only legal
// cast sites. Lives in `substrate/` (not a verb) so `resolve`/`test-health`/`inspect-endpoint` can share it
// without a cross-verb import.
//
// The `max-pro-sub` factory is the load-bearing gate: it is unconstructable except after `requireOwner`
// passes — the guard runs inside the factory, so the cast can't be reached without the owner check.
//
// WHAT THAT GATE ACTUALLY ASSERTS (truth-repair 2026-08-07, D135 clause G): it decides on
// `principal.role`, so it is exactly as strong as the PROVENANCE of the `Principal` handed to it — "an
// owner asked" only if no upstream site can stamp `role:"owner"` on a `UserId` it merely received. That
// premise was false for two months: `entry/compose/role-clients.ts` minted a synthetic owner over an
// arbitrary id, and once `/autobg` bound a bundle for an automation rule's author, a non-owner reached this
// factory wearing `owner` (settings let any user pin `roleDefaults.summarize.source` to `max-pro-sub`).
// Only the credential firewall's summarize row stopped the resulting call. The premise now holds because
// every `Principal` is row-derived (D135), and it is the ONLY thing making this gate mean what it says —
// so a new synthetic-`Principal` site is a change to THIS gate, wherever it lives.
//
// The casts are object-literal → branded intersection (not `as unknown as`) — the brand's sanctioned escape
// hatch, kept narrow and single-sited.

import type {
  CustomOpenAiCredential,
  CustomOpenAiResponseMap,
  LocalLightCredential,
  MaxProSubCredential,
  OpenRouterCredential,
  VllmCredential,
} from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { UserCredentialId } from "@orb/kit/ids";
import type { RequireOwner } from "#domain/admin";

/** Mint the owner's box credential (agent-sdk over the host Claude sub). Owner-only: `requireOwner` throws
 *  for any non-owner principal before the cast is reached. No key, no row. */
export function mintMaxProSub(principal: Principal, requireOwner: RequireOwner): MaxProSubCredential {
  requireOwner(principal);
  return { source: "max-pro-sub", credentialId: null } as MaxProSubCredential;
}

/** Mint an OpenRouter credential. `credentialId` is the row id (`null` is allowed by the contract shape
 *  but every live path passes a row id); `apiKey` is the decrypted key. Any authenticated user. */
export function mintOpenRouter(apiKey: string, credentialId: UserCredentialId | null): OpenRouterCredential {
  return { source: "openrouter", apiKey, credentialId } as OpenRouterCredential;
}

/** Mint the supervised loopback vLLM marker — the owner's-box GPU engine. No key, no row. */
export function mintVllm(): VllmCredential {
  return { source: "vllm", credentialId: null } as VllmCredential;
}

/** Mint the in-process transformers.js/ONNX marker — the owner's-box keyless local-light tier. */
export function mintLocalLight(): LocalLightCredential {
  return { source: "local-light", credentialId: null } as LocalLightCredential;
}

/** Mint a user-defined OpenAI-compatible endpoint credential. `apiKey` is `null` for no-auth local
 *  servers; `headers` is the per-endpoint request transform; `model` is the convenience default model
 *  string from `metadata.model`, `undefined` when the row carries none. `includeBody`/`excludeBody`/
 *  `responseMap` are the per-endpoint request/response transforms (PD-13; `null` when the row declares none). */
export function mintCustomOpenAi(args: {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly headers: Record<string, string> | null;
  readonly credentialId: UserCredentialId;
  readonly model: string | undefined;
  readonly contextWindow: number | undefined;
  readonly includeBody: Record<string, unknown> | null;
  readonly excludeBody: readonly string[] | null;
  readonly responseMap: CustomOpenAiResponseMap | null;
}): CustomOpenAiCredential {
  return {
    source: "custom_openai",
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    headers: args.headers,
    credentialId: args.credentialId,
    model: args.model,
    contextWindow: args.contextWindow,
    includeBody: args.includeBody,
    excludeBody: args.excludeBody,
    responseMap: args.responseMap,
  } as CustomOpenAiCredential;
}
