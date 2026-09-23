// verbs: catalogModels · draftCatalogModels · refreshCatalog — delegations to the runtime's ONE catalog read
// (`runtime.catalogs.models`, a draft-shaped read). The door's job is the refusals, judged BEFORE any dial by the
// same substrate `create` uses: the provider is one the caller may use, an endpoint draft names an admitted
// server (the F12 admission; the SSRF guard judges the dial itself), and a named credential is the caller's. A
// dial that fails or lists nothing is `listed: false` with its reason, never a throw and never an empty success
// — the pane offers the typed-id fallback and says why (§7.4).
//   • `draftCatalogModels` — the add dialog, before the row exists: the provider being authored, its saved
//     credential or raw key, and an endpoint row's own server. The provider id is the one the key was sealed
//     under, so a re-list by a saved credential opens it (a probe judged under another id cannot decrypt).
//   • `catalogModels` — a saved row, read through the same draft built from the row.

import type { ModelListing } from "@orb/contracts/inference";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { CatalogRefreshOutcome } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";
import { requireBaseUrl, requireCredential, requireProvider } from "../substrate/admission.ts";

function createCatalogModels(ctx: ConnectionContext): ConnectionService["catalogModels"] {
  return async (params): Promise<ModelListing> => {
    const row = await fetchOwnedConnection(ctx.db, params.principal.userId, params.connectionId);
    if (row === null) {
      throw new ConnectionNotFoundError(params.connectionId);
    }
    // A saved row is re-judged, not trusted: it may name a plugin provider the owner no longer holds enabled.
    const provider = requireProvider(ctx, row.ownerId, row.providerId);
    return ctx.runtime.catalogs.models({
      principal: params.principal,
      providerId: provider.id,
      secret: { credentialId: row.credentialId },
      baseUrl: row.baseUrl,
      headers: row.transport?.headers,
    });
  };
}

/** A named credential is gated even when a raw key rides beside it, so naming a stranger's id is always refused. */
function createDraftCatalogModels(ctx: ConnectionContext): ConnectionService["draftCatalogModels"] {
  return async (params): Promise<ModelListing> => {
    const provider = requireProvider(ctx, params.principal.userId, params.providerId);
    const baseUrl = params.baseUrl ?? null;
    const credentialId = params.credentialId ?? null;
    requireBaseUrl(ctx, provider, baseUrl);
    await requireCredential(ctx, params.principal.userId, credentialId);
    return ctx.runtime.catalogs.models({
      principal: params.principal,
      providerId: provider.id,
      secret: params.key !== undefined ? { key: params.key } : { credentialId },
      baseUrl,
      ...(params.headers !== undefined ? { headers: params.headers } : {}),
    });
  };
}

function createRefreshCatalog(ctx: ConnectionContext): ConnectionService["refreshCatalog"] {
  return async (params): Promise<CatalogRefreshOutcome> => ctx.runtime.catalogs.refresh(params.providerId);
}

/** The slice of `ConnectionService` this grouped file owns. */
type CatalogVerbs = Pick<ConnectionService, "catalogModels" | "draftCatalogModels" | "refreshCatalog">;

/** The catalog verb bundle (`verb-naming`: one factory named for the file). */
export function createCatalogs(ctx: ConnectionContext): CatalogVerbs {
  return {
    catalogModels: createCatalogModels(ctx),
    draftCatalogModels: createDraftCatalogModels(ctx),
    refreshCatalog: createRefreshCatalog(ctx),
  };
}
