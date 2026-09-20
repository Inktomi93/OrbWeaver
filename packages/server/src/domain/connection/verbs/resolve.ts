// verbs: resolve · availability · resolveChatCapability · capabilities — THIN DELEGATIONS to the runtime
// (inference program §3.3: "connection is the domain door; resolution executes in `@orb/inference`"). The one
// thing decided here is the PROJECTION: `resolveChatCapability` hands back the credential-free
// `ResolvedConnectionView`, never the `Resolved` a backend consumes.

import type { ResolvedConnectionView, SendAvailability } from "@orb/contracts/inference";
import type { ResolveOutcome } from "@orb/inference";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { ResolveChatCapabilityParams, ResolveTaskParams } from "../contract/params.ts";
import type { ConnectionCapabilityView } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";
import { toResolvedView } from "../substrate/resolved-view.ts";

/** The credential-free half of a `Resolved` — what crosses to a client or a bus payload. */
export function createResolve(ctx: ConnectionContext): ConnectionService["resolve"] {
  return (params: ResolveTaskParams): Promise<ResolveOutcome> =>
    ctx.runtime.resolve({
      task: params.task,
      principal: params.principal,
      ...(params.actor !== undefined ? { actor: params.actor } : {}),
      ...(params.connectionId !== undefined ? { connectionId: params.connectionId } : {}),
    });
}

export function createAvailability(ctx: ConnectionContext): ConnectionService["availability"] {
  return (params: ResolveTaskParams): Promise<SendAvailability> =>
    ctx.runtime.availability({
      task: params.task,
      principal: params.principal,
      ...(params.actor !== undefined ? { actor: params.actor } : {}),
      ...(params.connectionId !== undefined ? { connectionId: params.connectionId } : {}),
    });
}

export function createResolveChatCapability(ctx: ConnectionContext): ConnectionService["resolveChatCapability"] {
  return async (params: ResolveChatCapabilityParams): Promise<ResolvedConnectionView> => {
    const outcome = await ctx.runtime.resolve({ task: "chat", principal: params.principal });
    return toResolvedView(outcome.resolved);
  };
}

export function createCapabilities(ctx: ConnectionContext): ConnectionService["capabilities"] {
  return async (params): Promise<ConnectionCapabilityView> => {
    // The OWNER BELT runs HERE, before the runtime read — the same pre-gate every other id-taking verb in
    // this domain runs (`diagnostics.ts::resolveRow`, `catalogs.ts::catalogModels`, `bindings.ts`). The
    // runtime holds its own belt (`@orb/inference` `ownedConnection` → `requireOwned`) and keeps it as
    // defense in depth, but it throws a `ProviderError`, which no domain class covers, so it reaches the
    // wire as a raw provider failure rather than this domain's curated 404. It USED TO answer "not yours"
    // and "no such row" differently — an existence oracle for a foreign id (caught by the transport
    // cross-tenant sweep, 2026-09-20); that belt now collapses both arms itself, so the two layers agree
    // and neither depends on the other for confidentiality. `ConnectionNotFoundError` is the domain's one
    // refusal for both, and it is what a client keys on.
    if ((await fetchOwnedConnection(ctx.db, params.principal.userId, params.connectionId)) === null) {
      throw new ConnectionNotFoundError(params.connectionId);
    }
    const read = await ctx.runtime.capabilities.for({ connectionId: params.connectionId, principal: params.principal });
    return { capability: read.capability, warnings: read.warnings, tasks: read.tasks };
  };
}
