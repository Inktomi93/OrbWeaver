// verb: resolve — the turn-time credential CHOKEPOINT. Every
// chat/connection/buddy turn calls this before running. It dispatches on the DISPATCH axis
// `CredentialSource` (5 arms) and returns the brand-protected `ResolvedCredential` the runners consume —
// constructed ONLY through the `substrate/mint` factories (invariant #1). The switch is `assertNever`-
// exhaustive: a new `CredentialSource` member fails `tsc` here until its arm + a runner arm land (§7.5).
//
// Arm security:
//   • max-pro-sub  OWNER-ONLY (D17) — `mintMaxProSub` runs `requireOwner(principal)` before the cast; a
//                  non-owner gets `DomainForbiddenError`, never the owner's box credential.
//   • vllm / local-light  keyless local-compute markers (the owner's box) — open to any authenticated turn.
//   • openrouter / custom_openai  the user's ACTIVE row, decrypted (AAD = `${ownerId}|${provider}`).
// A missing/revoked BYO credential is `DomainNoCredentialError` (the floor — the client surfaces a banner
// pointing at Connections); there is NO silent host-fallback (a host key would spend the owner's quota).

import type {
  CustomOpenAiCredential,
  OpenRouterCredential,
  ResolvedCredential,
} from "@orb/contracts/credentials";
import { DomainNoCredentialError, DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { CREDENTIALS_OP_CODES } from "../contract/errors";
import type { ResolveCredentialParams } from "../contract/params";
import type { CredentialContext, CredentialsService } from "../contract/service";
import { aadFor } from "../persistence/aad";
import { loadActiveCredential } from "../persistence/queries";
import { decryptSealed } from "../substrate/decrypt";
import {
  mintCustomOpenAi,
  mintLocalLight,
  mintMaxProSub,
  mintOpenRouter,
  mintVllm,
} from "../substrate/mint";
import { parseCustomOpenAiEndpoint } from "../substrate/parse-metadata";

function assertNever(value: never): never {
  throw new Error(`unhandled credential source: ${String(value)}`);
}

/** The user's active OpenRouter key, or the typed no-credential floor (active-but-revoked falls through). */
async function resolveOpenRouter(
  ctx: CredentialContext,
  ownerId: UserId,
): Promise<OpenRouterCredential> {
  const active = ctx.box.enabled
    ? await loadActiveCredential(ctx.db, ownerId, "openrouter")
    : undefined;
  if (active === undefined || active.revokedAt !== null) {
    throw new DomainNoCredentialError("openrouter");
  }
  const plaintext = decryptSealed(ctx.box, active, aadFor(ownerId, "openrouter"));
  if (plaintext === null) {
    throw new DomainNoCredentialError("openrouter");
  }
  return mintOpenRouter(plaintext, active.id);
}

/** The user's active custom_openai endpoint (the active row IS the endpoint selection). */
async function resolveCustomOpenAi(
  ctx: CredentialContext,
  ownerId: UserId,
): Promise<CustomOpenAiCredential> {
  const active = ctx.box.enabled
    ? await loadActiveCredential(ctx.db, ownerId, "custom_openai")
    : undefined;
  if (active === undefined || active.revokedAt !== null) {
    throw new DomainNoCredentialError("custom_openai");
  }
  const endpoint = parseCustomOpenAiEndpoint(active.metadata);
  if (endpoint === null) {
    throw new DomainOperationError(
      CREDENTIALS_OP_CODES.metadataInvalid,
      "custom_openai credential is missing its baseUrl metadata.",
    );
  }
  // apiKey may be empty (a no-auth local server) → null. A decrypt failure is also "no key" (null).
  const plaintext = decryptSealed(ctx.box, active, aadFor(ownerId, "custom_openai"));
  return mintCustomOpenAi({
    baseUrl: endpoint.baseUrl,
    apiKey: plaintext !== null && plaintext.length > 0 ? plaintext : null,
    headers: endpoint.headers,
    credentialId: active.id,
    // GAP-6: carry the convenience default model from metadata (parse-metadata extracts it as `string|null`).
    model: endpoint.model ?? undefined,
  });
}

export function createResolve(ctx: CredentialContext): CredentialsService["resolve"] {
  // `async` so a synchronous throw (e.g. the max-pro-sub owner-gate) surfaces as a REJECTED promise, not
  // a sync throw at the call site — every caller awaits resolve.
  return async (params: ResolveCredentialParams): Promise<ResolvedCredential> => {
    const { principal } = params;
    const source = params.source;
    switch (source) {
      case "vllm":
        return mintVllm();
      case "local-light":
        // PD-9 (D39): the keyless in-process transformers.js/ONNX tier — mirror of vllm, no row/key.
        return mintLocalLight();
      case "max-pro-sub":
        // Owner-gate (D17) runs inside the factory; throws DomainForbiddenError for a non-owner.
        return mintMaxProSub(principal, ctx.requireOwner);
      case "openrouter":
        return await resolveOpenRouter(ctx, principal.userId);
      case "custom_openai":
        return await resolveCustomOpenAi(ctx, principal.userId);
      default:
        return assertNever(source);
    }
  };
}
