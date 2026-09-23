// The DIAGNOSTIC front door: probe · accountCredits · generationCost · inspect · verifyAuth · listModels,
// each dispatched on the connection's wire and fail-closed through the shared `requireBackend` +
// `requireMethod`. Deliberately NOT inside the `provider.*` span: a probe or a list read is not inference,
// and folding it into `providerDurationMs` would make "time spent generating" mean something else.

import type { BackendRegistry, ProviderBackend } from "../contract/backend.ts";
import type { ProviderDiagnostics } from "../contract/diagnostics.ts";
import type { Resolved } from "../contract/resolved.ts";
import { requireBackend, requireMethod } from "../registry/dispatch.ts";

type DiagnosticFn<Req extends { readonly connection: Pick<Resolved, "wire"> }, Res> = (req: Req) => Promise<Res>;

function bind<Req extends { readonly connection: Pick<Resolved, "wire"> }, Res>(
  registry: BackendRegistry,
  task: string,
  pick: (backend: ProviderBackend) => DiagnosticFn<Req, Res> | undefined,
): DiagnosticFn<Req, Res> {
  return async (req) => {
    const backend = requireBackend(registry, req.connection.wire, task);
    return await requireMethod(backend, pick(backend), task)(req);
  };
}

export function createProviderDiagnostics(registry: BackendRegistry): ProviderDiagnostics {
  return {
    probe: bind(registry, "probe", (b) => b.probe),
    accountCredits: bind(registry, "accountCredits", (b) => b.accountCredits),
    generationCost: bind(registry, "generationCost", (b) => b.generationCost),
    inspect: bind(registry, "inspect", (b) => b.inspect),
    verifyAuth: bind(registry, "verifyAuth", (b) => b.verifyAuth),
    listModels: bind(registry, "listModels", (b) => b.listModels),
  };
}
