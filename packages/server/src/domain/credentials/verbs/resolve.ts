// verb: resolve — the turn-time credential chokepoint. Dispatches on CredentialSource (assertNever-exhaustive)
// and returns a brand-protected ResolvedCredential built only through substrate/mint. max-pro-sub is
// owner-only; openrouter/custom_openai decrypt the user's active row; a missing/revoked BYO credential is
// DomainNoCredentialError with no silent host-fallback (would spend the owner's quota).

import type { CustomOpenAiCredential, OpenRouterCredential, ResolvedCredential } from "@orb/contracts/credentials";
import { DomainNoCredentialError, DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { CredentialContext } from "../context";
import { CREDENTIALS_OP_CODES } from "../contract/errors";
import type { ResolveCredentialParams } from "../contract/params";
import type { CredentialsService } from "../contract/service";
import { aadFor } from "../persistence/aad";
import { loadActiveCredential } from "../persistence/queries";
import { decryptSealed } from "../substrate/decrypt";
import { mintCustomOpenAi, mintLocalLight, mintMaxProSub, mintOpenRouter, mintVllm } from "../substrate/mint";
import { parseCustomOpenAiEndpoint } from "../substrate/parse-metadata";

function assertNever(value: never): never {
  throw new Error(`unhandled credential source: ${String(value)}`);
}

/** The user's active OpenRouter key, or the typed no-credential floor (active-but-revoked falls through). */
async function resolveOpenRouter(ctx: CredentialContext, ownerId: UserId): Promise<OpenRouterCredential> {
  const active = ctx.box.enabled ? await loadActiveCredential(ctx.db, ownerId, "openrouter") : undefined;
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
async function resolveCustomOpenAi(ctx: CredentialContext, ownerId: UserId): Promise<CustomOpenAiCredential> {
  const active = ctx.box.enabled ? await loadActiveCredential(ctx.db, ownerId, "custom_openai") : undefined;
  if (active === undefined || active.revokedAt !== null) {
    throw new DomainNoCredentialError("custom_openai");
  }
  const endpoint = parseCustomOpenAiEndpoint(active.metadata);
  if (endpoint === null) {
    throw new DomainOperationError(CREDENTIALS_OP_CODES.metadataInvalid, "custom_openai credential is missing its baseUrl metadata.");
  }
  // apiKey may be empty (a no-auth local server) → null. A decrypt failure is also "no key" (null).
  const plaintext = decryptSealed(ctx.box, active, aadFor(ownerId, "custom_openai"));
  return mintCustomOpenAi({
    baseUrl: endpoint.baseUrl,
    apiKey: plaintext !== null && plaintext.length > 0 ? plaintext : null,
    headers: endpoint.headers,
    credentialId: active.id,
    model: endpoint.model ?? undefined,
    contextWindow: endpoint.contextWindow,
    includeBody: endpoint.includeBody,
    excludeBody: endpoint.excludeBody,
    responseMap: endpoint.responseMap,
  });
}

export function createResolve(ctx: CredentialContext): CredentialsService["resolve"] {
  // async so a synchronous throw (e.g. the max-pro-sub owner-gate) surfaces as a rejected promise.
  return async (params: ResolveCredentialParams): Promise<ResolvedCredential> => {
    const { principal } = params;
    const source = params.source;
    switch (source) {
      case "vllm":
        return mintVllm();
      case "local-light":
        return mintLocalLight();
      case "max-pro-sub":
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
