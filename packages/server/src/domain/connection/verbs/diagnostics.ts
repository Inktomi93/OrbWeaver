// verbs: probe · accountCredits · generationCost · verifyAuth · inspectEndpoint — each against ONE of the
// caller's rows, resolved through the runtime (the credential rides inside `Resolved`, never through this
// domain) and dispatched on the row's WIRE by the runtime's diagnostics. `probe` is the two-domain probe:
// the runtime DIALS, the credentials domain RECORDS (revoke / strike / clear / throttle) — a keyless row's
// verdict is stamped and returned without a row write.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { ModelKind, Task } from "@orb/contracts/inference";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { Resolved } from "@orb/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { isPrivateOrLoopback } from "#infra/network";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { fetchOwnedConnection } from "../persistence/connections.ts";
import { curatedKindOf } from "../substrate/kind.ts";

const LOCALHOST_ALIAS = "localhost";

/** Resolve the row for a diagnostic: its FIRST servable task (a diagnostic is wire-keyed, not task-keyed). */
async function resolveRow(ctx: ConnectionContext, principal: Principal, connectionId: UserConnectionId): Promise<Resolved> {
  const row = await fetchOwnedConnection(ctx.db, principal.userId, connectionId);
  if (row === null) {
    throw new ConnectionNotFoundError(connectionId);
  }
  const provider = ctx.runtime.providers.registry.get(row.providerId);
  const kind = provider === undefined ? "generation" : (curatedKindOf(row, provider) ?? "generation");
  const task: Task = TASK_BY_KIND[kind];
  return (await ctx.runtime.resolve({ task, principal, connectionId })).resolved;
}

/** The task a diagnostic resolves a row UNDER, by its model kind — exhaustive over `ModelKind` (a fourth kind is a
 *  `tsc` error here, never a silent "chat"). */
const TASK_BY_KIND: Record<ModelKind, Task> = { generation: "chat", embedding: "embed", rerank: "rerank" };

/** True when the dialled host is loopback or LAN — an offline box there strikes NOTHING (owner ruling). */
function isLocalEndpoint(baseUrl: string | null): boolean {
  if (baseUrl === null) {
    return false;
  }
  const parsed = URL.parse(baseUrl);
  if (parsed === null) {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return host === LOCALHOST_ALIAS || isPrivateOrLoopback(host);
}

function createProbe(ctx: ConnectionContext): ConnectionService["probe"] {
  return async (params): Promise<CredentialHealth> => {
    const resolved = await resolveRow(ctx, params.principal, params.connectionId);
    const result = await ctx.runtime.diagnostics.probe({ connection: resolved, ...(params.signal !== undefined ? { signal: params.signal } : {}) });
    const credentialId = resolved.credential.credentialId;
    if (credentialId === null) {
      return { ...result, checkedAt: ctx.now() };
    }
    return ctx.recordProbeOutcome({ principal: params.principal, credentialId, result, localEndpoint: isLocalEndpoint(resolved.baseUrl) });
  };
}

function createAccountCredits(ctx: ConnectionContext): ConnectionService["accountCredits"] {
  return async (params): Promise<AccountCredits> =>
    ctx.runtime.diagnostics.accountCredits({
      connection: await resolveRow(ctx, params.principal, params.connectionId),
      ...(params.signal !== undefined ? { signal: params.signal } : {}),
    });
}

function createGenerationCost(ctx: ConnectionContext): ConnectionService["generationCost"] {
  return async (params): Promise<GenerationCost> =>
    ctx.runtime.diagnostics.generationCost({
      connection: await resolveRow(ctx, params.principal, params.connectionId),
      generationId: params.generationId,
      ...(params.signal !== undefined ? { signal: params.signal } : {}),
    });
}

function createVerifyAuth(ctx: ConnectionContext): ConnectionService["verifyAuth"] {
  return async (params): Promise<VerifyAuthResult> =>
    ctx.runtime.diagnostics.verifyAuth({
      connection: await resolveRow(ctx, params.principal, params.connectionId),
      ...(params.signal !== undefined ? { signal: params.signal } : {}),
    });
}

function createInspectEndpoint(ctx: ConnectionContext): ConnectionService["inspectEndpoint"] {
  return async (params): Promise<EndpointInspection> =>
    ctx.runtime.diagnostics.inspect({
      connection: await resolveRow(ctx, params.principal, params.connectionId),
      ...(params.signal !== undefined ? { signal: params.signal } : {}),
    });
}

/** The slice of `ConnectionService` this grouped file owns. */
type DiagnosticVerbs = Pick<ConnectionService, "probe" | "accountCredits" | "generationCost" | "verifyAuth" | "inspectEndpoint">;

/** The diagnostics verb bundle (`verb-naming`: one factory named for the file). */
export function createDiagnostics(ctx: ConnectionContext): DiagnosticVerbs {
  return {
    probe: createProbe(ctx),
    accountCredits: createAccountCredits(ctx),
    generationCost: createGenerationCost(ctx),
    verifyAuth: createVerifyAuth(ctx),
    inspectEndpoint: createInspectEndpoint(ctx),
  };
}
