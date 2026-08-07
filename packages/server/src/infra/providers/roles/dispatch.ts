// Sealed routing derivation: maps {api, source} onto the infra-internal `BackendKey`, never leaked
// outward. Every switch is `assertNever`-exhaustive; an invalid (api, source) pairing fail-closes with a
// typed {@link ProviderError} rather than falling through.
//
// It is also where the PROVIDER SPAN is opened (`runRole`) — the one line every role dispatcher's body ends
// on, and therefore the only place the whole provider surface can be timed once. See `runRole`'s header for
// why the trace ring was reporting `providerDurationMs: 0` forever.

import type { ChatApi } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import type { SpanAttrs } from "#foundation/observability";
import { span } from "#foundation/observability";
import { flattenAbortSignal } from "../backends/kit/index.ts";
import type { BackendKey, BackendRegistry, ProviderBackend } from "../contract/index.ts";
import { ProviderError } from "../contract/index.ts";

/** Compile-time exhaustiveness guard — a member the switch doesn't handle makes this argument
 *  non-`never`, a `tsc` error. */
function assertNever(value: never): never {
  throw new ProviderError({
    kind: "invalid",
    retryable: false,
    message: `provider dispatch: unhandled axis member ${String(value)}`,
  });
}

/** `runner = f(api, source)` the chat dispatch routes on. Invalid pairings fail-closed. */
export function deriveRunner(api: ChatApi, source: CredentialSource): BackendKey {
  switch (api) {
    case "agent-sdk":
      switch (source) {
        case "max-pro-sub":
        case "openrouter":
          // The sub + the OR-Anthropic skin — the two Claude-runtime skins — run through the one stateful
          // agent-sdk backend.
          return "agent-sdk";
        case "vllm":
          // REMOVED 2026-07-27 (owner ruling): the local vLLM loopback agent skin is retired — the small
          // local model hung on real structured-output schemas over the SDK wire, while the SAME engine's
          // chat-completions surface handles everything. Local vLLM is chat-completions-ONLY. The loopback
          // env builder (buildClaudeVllmEnv) is deleted; a would-be agent-sdk×vllm turn fails LOUD here.
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message: 'the local "vllm" engine serves chat only through the chat-completions api (the agent-sdk loopback skin was retired)',
          });
        case "local-light":
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message: 'the "local-light" tier serves only embed/rerank/imageEmbed, never a chat turn',
          });

        case "custom_openai":
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message: 'the agent-sdk api does not serve "custom_openai" credentials',
          });
        default:
          return assertNever(source);
      }
    case "chat-completions":
      switch (source) {
        case "openrouter":
          return "openrouter";
        case "vllm":
          return "vllm";
        case "custom_openai":
          return "custom-openai";

        case "local-light":
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message: 'the "local-light" tier serves only embed/rerank/imageEmbed, never a chat turn',
          });
        case "max-pro-sub":
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message: 'the "max-pro-sub" credential is reachable only through the agent-sdk api',
          });
        default:
          return assertNever(source);
      }
    case "responses":
      switch (source) {
        case "openrouter":
          return "openrouter";
        case "max-pro-sub":
        case "vllm":
        case "local-light":
        case "custom_openai":
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message: 'the "responses" api is OpenRouter-only',
          });
        default:
          return assertNever(source);
      }
    default:
      return assertNever(api);
  }
}

/** Sealed backend key for a non-chat role from source alone. `max-pro-sub` maps to agent-sdk for
 *  exhaustiveness only; the firewall rejects it for every non-chat role before this is reached. */
export function backendForSource(source: CredentialSource): BackendKey {
  switch (source) {
    case "openrouter":
      return "openrouter";
    case "vllm":
      return "vllm";
    case "local-light":
      return "local-light";
    case "custom_openai":
      return "custom-openai";
    case "max-pro-sub":
      return "agent-sdk";
    default:
      return assertNever(source);
  }
}

/** Look up a WIRED backend, or fail-closed: a role resolving to an unwired key is an operator error
 *  (a missing composition-root wire), never a silent default. */
export function requireBackend(registry: BackendRegistry, key: BackendKey, role: string): ProviderBackend {
  const backend = registry.get(key);
  if (backend === undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `provider "${key}" is not wired for the "${role}" role`,
    });
  }
  return backend;
}

/**
 * Resolve a role's impl and RUN it inside a `provider.<role>` span — the ONE provider-call seam, so every
 * role's wire time is timed in exactly one place and no dispatcher can forget.
 *
 * WHY IT EXISTS: `RequestTraceTotals.providerDurationMs` sums spans named `provider.*`, and NOTHING opened
 * one — the tree held only `trpc.*` and `db.*`, so every trace reported provider time as 0 and a slow turn
 * was indistinguishable from a slow request. The provider log/event vocabulary (`provider.turn`,
 * `provider.structured-item`, the `provider.retry` span EVENTS) all rides INSIDE this window; none of it is
 * a span, so none of it ever contributed a duration.
 *
 * The span is opened HERE and not in each backend runner because the runner is the sealed implementation —
 * the dispatcher is the boundary the domain actually crosses, and it is the only layer that knows the role
 * name the span is keyed by. Attributes are metadata only (backend key, source, model): RP content never
 * reaches a span attribute.
 *
 * The DIAGNOSTICS dispatch (`../diagnostics.ts`) deliberately stays on the bare `requireRoleImpl`: probes,
 * catalog fetches and credit reads are not inference, and folding them into `providerDurationMs` would make
 * "time this request spent generating" mean something else.
 *
 * IT IS ALSO WHERE THE CALLER'S ABORT SIGNAL IS FLATTENED (STRUCTURED-ABORT-REASON-LEAK, 2026-08-06). Every
 * role request carries an optional caller `signal`, and handing it to a backend UNCHANGED lets the caller's
 * abort REASON reach `fetch` and become the error text `classifyTransportName` reads — a cancellation whose
 * reason merely contains "timeout"/"connection"/"network" classifies as a retryable `server` fault and gets
 * RE-RUN (by `backends/kit/retry.ts` on the chat runners, and by the OpenRouter SDK's own default
 * `retryConfig` on the batch roles). The streaming chat runners were already protected because they re-wrap
 * through `turnAbortSignal`; the batch roles (`structured` — the rpg extraction's arm — plus summarize /
 * embed / rerank / imageEmbed / generateImage) passed `req.signal` straight through. Flattening HERE, at the
 * ONE seam every role dispatch crosses, covers all of them and makes the mistake unavailable to a FUTURE
 * role: a dispatcher cannot forget a step it never performs. The full law lives in
 * `backends/kit/abort-flatten.ts`. Cancellation semantics are unchanged (same instant, same propagation);
 * only the reason — which was never the provider layer's to interpret — is dropped.
 */
export function runRole<Req extends { readonly signal?: AbortSignal | undefined }, Res>(args: {
  readonly backend: ProviderBackend;
  readonly impl: ((req: Req) => Promise<Res>) | undefined;
  readonly role: string;
  readonly req: Req;
  /** Per-role metadata for the span (source / model / api) — never RP content. */
  readonly attrs?: SpanAttrs;
}): Promise<Res> {
  const { backend, role } = args;
  const run = requireRoleImpl(backend, args.impl, role);
  const attrs: SpanAttrs = { "provider.backend": backend.key, "provider.role": role, ...args.attrs };
  const external = args.req.signal;
  if (external === undefined) {
    return span(`provider.${role}`, () => run(args.req), attrs);
  }
  // Our own mirror of the caller's signal — the backend never sees the caller's reason.
  const flat = flattenAbortSignal(external);
  const req = { ...args.req, signal: flat.signal };
  return span(`provider.${role}`, () => run(req), attrs).finally(flat.dispose);
}

/** Pull a role's impl off a resolved backend, or fail-closed: a backend that doesn't serve the
 *  requested role (e.g. an OpenRouter backend asked to imageEmbed) throws a typed error rather than a
 *  `TypeError` on an undefined call. Prefer {@link runRole}, which also opens the provider span. */
export function requireRoleImpl<F>(backend: ProviderBackend, impl: F | undefined, role: string): F {
  if (impl === undefined) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `provider "${backend.key}" does not implement the "${role}" role`,
    });
  }
  return impl;
}
