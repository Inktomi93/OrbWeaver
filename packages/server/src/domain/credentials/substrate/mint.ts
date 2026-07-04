// domain/credentials/substrate/mint — THE single construction home for the brand-protected
// `ResolvedCredential` arms (the brand's ONLY legal cast sites). Each factory
// encapsulates the ONE `as <Brand>` cast for its arm; nothing else in the codebase produces a value
// satisfying the brand. It lives in `substrate/` (not `verbs/resolve.ts`) for ONE reason that is physics,
// not preference: `domain-no-cross-verb` forbids a verb importing another verb's value, so `resolve` +
// `test-health` + `inspect-endpoint` could not share a factory homed in `resolve.ts`. Homing them in
// substrate keeps the casts in ONE auditable
// file AND lets every construction site reach them through the DI seam (substrate mediates).
//
// The `max-pro-sub` factory is the load-bearing gate (D17): it is unconstructable except AFTER
// `requireOwner` passes — the owner's box credential, never an admin's. The guard runs INSIDE the
// factory (the DECIDED 2026-06-25 factory signature: it accepts a `Principal`), so the cast can't be reached
// without the owner check.
//
// The casts are object-literal → branded intersection: the branded type is assignable to the plain
// shape, so TS permits the `as` (TS2352 needs NEITHER direction assignable). NOT `as unknown as` — these
// are the brand's sanctioned escape hatch, kept narrow and single-sited.

import type {
  CustomOpenAiCredential,
  LocalLightCredential,
  MaxProSubCredential,
  OpenRouterCredential,
  VllmCredential,
} from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { UserCredentialId } from "@orb/kit/ids";
import type { RequireOwner } from "#domain/admin";

/** Mint the OWNER's box credential (agent-sdk over the host Claude sub). OWNER-ONLY (D17): `requireOwner`
 *  throws `DomainForbiddenError` for any non-owner principal BEFORE the cast is reached — the only gate
 *  site for this arm. No key, no row. */
export function mintMaxProSub(
  principal: Principal,
  requireOwner: RequireOwner,
): MaxProSubCredential {
  requireOwner(principal);
  return { source: "max-pro-sub", credentialId: null } as MaxProSubCredential;
}

/** Mint an OpenRouter credential. `credentialId` is the row id (`null` is allowed by the contract shape
 *  but every live path passes a row id); `apiKey` is the decrypted key. Any authenticated user. */
export function mintOpenRouter(
  apiKey: string,
  credentialId: UserCredentialId | null,
): OpenRouterCredential {
  return { source: "openrouter", apiKey, credentialId } as OpenRouterCredential;
}

/** Mint the supervised loopback vLLM marker — the owner's-box GPU engine. No key, no row. */
export function mintVllm(): VllmCredential {
  return { source: "vllm", credentialId: null } as VllmCredential;
}

/** Mint the in-process transformers.js/ONNX marker — the owner's-box keyless local-light tier (D39). */
export function mintLocalLight(): LocalLightCredential {
  return { source: "local-light", credentialId: null } as LocalLightCredential;
}

/** Mint a user-defined OpenAI-compatible endpoint credential. `apiKey` is `null` for no-auth local
 *  servers; `headers` is the per-endpoint request transform; `credentialId` is the active row's id. */
export function mintCustomOpenAi(args: {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly headers: Record<string, string> | null;
  readonly credentialId: UserCredentialId;
}): CustomOpenAiCredential {
  return {
    source: "custom_openai",
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    headers: args.headers,
    credentialId: args.credentialId,
  } as CustomOpenAiCredential;
}
