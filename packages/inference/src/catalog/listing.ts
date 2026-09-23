// THE ONE model-list read (§7.4): what a provider can list, for a connection being AUTHORED (no row yet) or
// for a saved row read through the same draft shape. The provider's `catalog` strategy picks the arm:
//   • `builtin` — the curated rows, no dial;
//   • the OpenRouter dialect — the keyless enriched catalog, through its process-wide mirror;
//   • `agent-sdk` — the daemon's `supportedModels()` under the CALLER's token, through its mirror;
//   • `anthropic-messages` — the backend's own authenticated `GET /v1/models`, under a saved or a typed key;
//   • `openai-compat` — `GET <baseUrl>/v1/models`: a hosted row's fixed URL or the draft's own server.
// A secret is the caller's saved credential, re-read by id through the credentials door (`ResolvedSecret` is
// branded there and never minted here), or a raw draft key where the wire can take one. A credential the
// caller does not hold is a THROWN refusal before any dial; a dial that fails is `listed: false` with its
// scrubbed reason, never an empty list.

import type { ResolvedSecret } from "@orb/contracts/credentials";
import type { AgentSdkModel, ModelCatalogEntry, ModelListing, ProviderDef } from "@orb/contracts/inference";
import { agentSdkCatalogEntry } from "../backends/agent-sdk/index.ts";
import { listAnthropicModels } from "../backends/anthropic-messages/index.ts";
import { bareCatalogEntry, failedListing, listingOf } from "../backends/kit/model-listing.ts";
import { resolvedScrubSet } from "../backends/kit/sanitize.ts";
import { curatedIdsFor, curatedKind } from "../capability/sources/curated/loader.ts";
import type { ProviderDiagnostics } from "../contract/diagnostics.ts";
import { assertNever, ProviderError } from "../contract/errors.ts";
import type { CatalogDraft, MirrorWarm, SpawnIdentity } from "../contract/runtime.ts";
import type { InferenceDeps } from "../deps.ts";
import type { ProviderRegistry } from "../registry/providers.ts";
import { fetchEndpointModels } from "./endpoint.ts";

export interface CatalogListingDeps {
  readonly registry: ProviderRegistry;
  readonly resolveCredential: InferenceDeps["resolveCredential"];
  readonly fetch: typeof fetch;
  readonly warmOpenRouter: () => Promise<MirrorWarm<ModelCatalogEntry[]>>;
  /** The daemon catalog through its mirror, under one user's identity; absent when the wire is not built. */
  readonly warmAgentSdk: ((identity: SpawnIdentity) => Promise<MirrorWarm<AgentSdkModel[]>>) | undefined;
  readonly listModels: ProviderDiagnostics["listModels"];
}

/** A provider's curated rows: the whole of what the in-process runtime can run for it. */
export function builtinCatalog(provider: ProviderDef): ModelCatalogEntry[] {
  return curatedIdsFor(provider.id).map((id) => {
    const kind = curatedKind({ model: id, providerId: provider.id, wire: provider.wire });
    return { ...bareCatalogEntry({ id }), ...(kind !== undefined ? { kind } : {}) };
  });
}

function builtinListing(provider: ProviderDef): ModelListing {
  return listingOf(builtinCatalog(provider));
}

/** A wire whose list authenticates only through a branded `ResolvedSecret` cannot take a raw draft key. */
function savedCredentialOnly(provider: ProviderDef): ModelListing {
  return { listed: false, reason: `${provider.label} lists its models only under a saved credential` };
}

export function createCatalogListing(deps: CatalogListingDeps): (draft: CatalogDraft) => Promise<ModelListing> {
  const credentialFor = (draft: CatalogDraft, provider: ProviderDef, credentialId: ResolvedSecret["credentialId"]): Promise<ResolvedSecret> =>
    deps.resolveCredential({ credentialId, ownerId: draft.principal.userId, providerId: provider.id });

  const agentSdkListing = async (draft: CatalogDraft, provider: ProviderDef): Promise<ModelListing> => {
    if (!("credentialId" in draft.secret)) {
      return savedCredentialOnly(provider);
    }
    if (deps.warmAgentSdk === undefined) {
      return { listed: false, reason: `${provider.label} needs the bundled Claude runtime, which this server does not have` };
    }
    const credential = await credentialFor(draft, provider, draft.secret.credentialId);
    const warmed = await deps.warmAgentSdk({ ownerId: draft.principal.userId, credential });
    return warmed.ok ? listingOf(warmed.value.map(agentSdkCatalogEntry)) : { listed: false, reason: warmed.reason };
  };

  const anthropicListing = async (draft: CatalogDraft, provider: ProviderDef): Promise<ModelListing> => {
    if ("key" in draft.secret) {
      // A key typed into the add dialog, before anything is saved: a plain read, no row and no decrypt.
      const { key } = draft.secret;
      return listAnthropicModels(
        {
          baseUrl: provider.baseUrl ?? draft.baseUrl,
          secret: key,
          secrets: resolvedScrubSet({ credential: { secret: key }, transport: null }),
          label: `${provider.id} models`,
        },
        deps.fetch,
      );
    }
    const credential = await credentialFor(draft, provider, draft.secret.credentialId);
    return deps.listModels({
      connection: {
        wire: provider.wire,
        ownerId: draft.principal.userId,
        providerId: provider.id,
        provider,
        baseUrl: provider.baseUrl ?? draft.baseUrl,
        credential,
        transport: draft.headers === undefined ? null : { headers: draft.headers },
      },
    });
  };

  const endpointListing = async (draft: CatalogDraft, provider: ProviderDef): Promise<ModelListing> => {
    const baseUrl = provider.baseUrl ?? draft.baseUrl;
    if (baseUrl === null) {
      return { listed: false, reason: `${provider.label} needs a server URL to list its models` };
    }
    const secret = "key" in draft.secret ? draft.secret.key : (await credentialFor(draft, provider, draft.secret.credentialId)).secret;
    const secrets = resolvedScrubSet({ credential: { secret }, transport: draft.headers === undefined ? null : { headers: draft.headers } });
    try {
      const rows = await fetchEndpointModels({ fetch: deps.fetch, baseUrl, secret, headers: draft.headers, secrets });
      return listingOf(rows.map((row) => bareCatalogEntry(row)));
      // @orb-waive caught-failure-ownership(err): optional model discovery owns refusal as `listed:false` with the scrubbed reason; the pane offers a typed id. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if callers require a successful catalog.
    } catch (err) {
      return failedListing(err, secrets);
    }
  };

  return async (draft): Promise<ModelListing> => {
    const provider = deps.registry.get(draft.providerId, draft.principal.userId);
    if (provider === undefined) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${draft.providerId}" is not registered` });
    }
    if (provider.catalog === "builtin") {
      return builtinListing(provider);
    }
    if (provider.dialect === "openrouter") {
      const warmed = await deps.warmOpenRouter();
      return warmed.ok ? listingOf(warmed.value) : { listed: false, reason: warmed.reason };
    }
    switch (provider.wire) {
      case "agent-sdk":
        return await agentSdkListing(draft, provider);
      case "anthropic-messages":
        return await anthropicListing(draft, provider);
      case "openai-compat":
        return await endpointListing(draft, provider);
      case "local-light":
        // The in-process tier serves only what it bundles, whatever the row's strategy says.
        return builtinListing(provider);
      default:
        return assertNever(provider.wire, "catalog listing wire");
    }
  };
}
