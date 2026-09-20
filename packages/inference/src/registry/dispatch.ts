// Dispatch is trivial: `backend = registry.get(connection.wire)`. No `(api, source)` matrix — a
// connection's `api` was validated ∈ `PROVIDER.apis` at write and re-checked at resolve. This file is also
// where the PROVIDER SPAN opens (`runTask`): the one seam every task crosses, so wire time is timed exactly
// once and no dispatcher can forget — and where the caller's abort signal is FLATTENED so its REASON never
// reaches a transport classifier (a cancellation whose reason merely contains "timeout" would otherwise
// classify as a retryable server fault and be re-run).

import type { Wire } from "@orb/contracts/inference";
import { flattenAbortSignal } from "../backends/kit/abort-flatten.ts";
import type { BackendRegistry, ProviderBackend } from "../contract/backend.ts";
import { ProviderError } from "../contract/errors.ts";
import type { Resolved } from "../contract/resolved.ts";
import type { SpanAttrs, SpanFn } from "../deps.ts";

/** Look up a WIRED backend, or fail-closed: a task resolving to an unwired wire is an operator error (a
 *  missing composition-root wire, a runtime that did not resolve), never a silent default. */
export function requireBackend(registry: BackendRegistry, wire: Wire, task: string): ProviderBackend {
  const backend = registry.get(wire);
  if (backend === undefined) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `the "${wire}" wire is not wired for the "${task}" task` });
  }
  return backend;
}

/** Pull a method off a resolved backend, or fail-closed with a typed error rather than a `TypeError` on an
 *  undefined call. */
export function requireMethod<F>(backend: ProviderBackend, impl: F | undefined, task: string): F {
  if (impl === undefined) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `the "${backend.wire}" backend does not implement "${task}"` });
  }
  return impl;
}

function connectionAttrs(connection: Resolved): SpanAttrs {
  return {
    "provider.wire": connection.wire,
    "provider.id": connection.providerId,
    "provider.model": connection.model,
    ...(connection.api !== null ? { "provider.api": connection.api } : {}),
  };
}

/** Resolve a task's impl and RUN it inside a `provider.<task>` span with the caller's signal flattened. */
export function runTask<Req extends { readonly signal?: AbortSignal | undefined; readonly connection: Resolved }, Res>(args: {
  readonly span: SpanFn;
  readonly registry: BackendRegistry;
  readonly task: string;
  readonly pick: (backend: ProviderBackend) => ((req: Req) => Promise<Res>) | undefined;
  readonly req: Req;
}): Promise<Res> {
  const backend = requireBackend(args.registry, args.req.connection.wire, args.task);
  const run = requireMethod(backend, args.pick(backend), args.task);
  const attrs: SpanAttrs = { "provider.task": args.task, ...connectionAttrs(args.req.connection) };
  const external = args.req.signal;
  if (external === undefined) {
    return args.span(`provider.${args.task}`, () => run(args.req), attrs);
  }
  const flat = flattenAbortSignal(external);
  const req = { ...args.req, signal: flat.signal };
  return args.span(`provider.${args.task}`, () => run(req), attrs).finally(flat.dispose);
}
