// verbs: catalogModels · listEndpointModels · refreshCatalog — delegations to the runtime's catalogs. The
// pane-facing one is `listEndpointModels`: the SERVER-SIDE `GET <baseUrl>/v1/models` for an endpoint row being
// authored (a browser cannot reach a user's loopback box, §7.4), judged by the F12 admission BEFORE the dial
// and riding the SSRF guard on it. An empty or failed list is the typed-id fallback with its reason, never a
// throw — the row is saved `modelListed: false` and the pane says why.

import type { ModelCatalogEntry } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { DomainOperationError } from "@orb/kit/errors";
import { CONNECTION_OP_CODES, ConnectionNotFoundError } from "../contract/errors.ts";
import type { CatalogRefreshOutcome, EndpointModelsResult } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";

export function createCatalogModels(ctx: ConnectionContext): ConnectionService["catalogModels"] {
  return async (params): Promise<readonly ModelCatalogEntry[]> => {
    const row = await fetchOwnedConnection(ctx.db, params.principal.userId, params.connectionId);
    if (row === null) {
      throw new ConnectionNotFoundError(params.connectionId);
    }
    return ctx.runtime.catalogs.models({ connection: row, principal: params.principal });
  };
}

/** The F12 admission belt + the credential-ownership belt a DRAFT endpoint dial passes before any fetch. */
async function admitEndpointDraft(ctx: ConnectionContext, params: Parameters<ConnectionService["listEndpointModels"]>[0]): Promise<void> {
  const admission = ctx.endpointAdmission(params.baseUrl);
  if (admission === "invalid") {
    throw new DomainOperationError(CONNECTION_OP_CODES.baseUrlInvalid, `"${params.baseUrl}" is not an http(s) URL.`);
  }
  if (admission === "refused") {
    throw new DomainOperationError(
      CONNECTION_OP_CODES.baseUrlRefused,
      `"${new URL(params.baseUrl).host}" is a private address this deployment does not admit.`,
    );
  }
  if (params.credentialId !== undefined && !(await ctx.credentialOwned(params.principal.userId, params.credentialId))) {
    throw new DomainOperationError(CONNECTION_OP_CODES.credentialForeign, `credential ${params.credentialId} is not yours.`);
  }
}

export function createListEndpointModels(ctx: ConnectionContext): ConnectionService["listEndpointModels"] {
  return async (params): Promise<EndpointModelsResult> => {
    await admitEndpointDraft(ctx, params);
    try {
      const models = await ctx.runtime.catalogs.endpoint({
        baseUrl: params.baseUrl,
        ownerId: params.principal.userId,
        ...(params.credentialId !== undefined ? { credentialId: params.credentialId } : {}),
        ...(params.key !== undefined ? { key: params.key } : {}),
        ...(params.headers !== undefined ? { headers: params.headers } : {}),
      });
      return models.length === 0 ? { listed: false, models, reason: "the endpoint listed no models" } : { listed: true, models, reason: null };
    } catch (err) {
      // The dial failing is the pane's typed-id arm, not an error: the message is provider-scrubbed by the
      // runtime's fetch seam before it reaches here.
      return { listed: false, models: [], reason: errorMessage(err) };
    }
  };
}

export function createRefreshCatalog(ctx: ConnectionContext): ConnectionService["refreshCatalog"] {
  return async (params): Promise<CatalogRefreshOutcome> => ctx.runtime.catalogs.refresh(params.providerId);
}
