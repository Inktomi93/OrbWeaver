// The write-seam refusals a connection row AND a draft of one both pass before anything is stored or dialed:
// the provider is one the caller may use, an endpoint row names an admitted http(s) server (a hosted one
// names none), and a named credential is the caller's. One home, so `create`/`update` and the draft catalog
// reads cannot disagree about what a legal draft is — a draft that lists models is a draft that saves.

import type { ProviderDef } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { ProviderUnknownError } from "../contract/errors.ts";
import type { ConnectionContext } from "../contract/service.ts";

/** The registry row `ownerId` may use (D147: a plugin row only for the owner of an enabled install that
 *  contributes it). A plugin provider's `baseUrl` is its author's host, so this refusal is what keeps one
 *  user's typed key from being dialed at another user's plugin. */
export function requireProvider(ctx: ConnectionContext, ownerId: UserId, providerId: string): ProviderDef {
  const provider = ctx.runtime.providers.registry.get(providerId, ownerId);
  if (provider === undefined) {
    throw new ProviderUnknownError(providerId);
  }
  return provider;
}

/** The base-URL rule: an `auth: endpoint` row NEEDS one (parsed, admitted); every other provider fixes its
 *  own and the row must not carry one. */
export function requireBaseUrl(ctx: ConnectionContext, provider: ProviderDef, baseUrl: string | null): void {
  if (provider.auth !== "endpoint") {
    if (baseUrl !== null) {
      throw new DomainOperationError(CONNECTION_OP_CODES.baseUrlShape, `${provider.label} has a fixed endpoint; a connection may not name one.`);
    }
    return;
  }
  if (baseUrl === null) {
    throw new DomainOperationError(CONNECTION_OP_CODES.baseUrlShape, `${provider.label} is your own server — a base URL is required.`);
  }
  const admission = ctx.endpointAdmission(baseUrl);
  if (admission === "invalid") {
    throw new DomainOperationError(CONNECTION_OP_CODES.baseUrlInvalid, `"${baseUrl}" is not an http(s) URL.`);
  }
  if (admission === "refused") {
    throw new DomainOperationError(CONNECTION_OP_CODES.baseUrlRefused, `"${new URL(baseUrl).host}" is a private address this deployment does not admit.`);
  }
}

/** Not-yours and does-not-exist are ONE refusal (`credentialOwned` answers false for both), so the code is no
 *  existence oracle for a credential id a caller can type. */
export async function requireCredential(ctx: ConnectionContext, ownerId: UserId, credentialId: UserCredentialId | null): Promise<void> {
  if (credentialId === null) {
    return;
  }
  if (!(await ctx.credentialOwned(ownerId, credentialId))) {
    throw new DomainOperationError(CONNECTION_OP_CODES.credentialForeign, `credential ${credentialId} is not yours.`);
  }
}
