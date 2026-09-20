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
    // defense in depth, but it throws a `ProviderError`, which no domain class covers: it reached the wire
    // as an unmapped 500 whose MESSAGE differs for "not yours" and "no such row" — an existence oracle for
    // a foreign id, and a fault log an authenticated stranger could raise at will (caught by the transport
    // cross-tenant sweep, 2026-09-20). `ConnectionNotFoundError` is the domain's one refusal for both.
    if ((await fetchOwnedConnection(ctx.db, params.principal.userId, params.connectionId)) === null) {
      throw new ConnectionNotFoundError(params.connectionId);
    }
    const read = await ctx.runtime.capabilities.for({ connectionId: params.connectionId, principal: params.principal });
    return { capability: read.capability, warnings: read.warnings, tasks: read.tasks };
  };
}
