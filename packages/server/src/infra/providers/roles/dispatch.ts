// infra/providers/roles/dispatch — the SEALED routing derivation. Maps the user vocab {api, source}
// onto the infra-internal `BackendKey` (the `runner`), and resolves a wired backend + its role impl
// from the registry. `runner`/`family` are derived HERE and never leave providers.
// Every switch is `assertNever`-exhaustive: a new `ChatApi` or `CredentialSource` member
// without an arm is a `tsc` error (exhaustive-dispatch), and an invalid (api, source) pairing
// fail-closes with a typed {@link ProviderError} rather than silently falling through.

import type { ChatApi } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import type { BackendKey, BackendRegistry, ProviderBackend } from "../contract";
import { ProviderError } from "../contract";

/** Compile-time exhaustiveness guard — a member the switch doesn't handle makes this argument
 *  non-`never`, a `tsc` error. */
function assertNever(value: never): never {
  throw new ProviderError({
    kind: "invalid",
    retryable: false,
    message: `provider dispatch: unhandled axis member ${String(value)}`,
  });
}

/**
 * Derive the sealed chat/agent backend key from the protocol axis × the credential source. This is the
 * `runner = f(api, source)` the chat dispatch routes on, expressed as the "dispatch over ChatApi ×
 * source" the contract names. Invalid pairings (a sub credential outside agent-sdk; the responses api
 * off OpenRouter; custom_openai through agent-sdk) fail-closed.
 */
export function deriveRunner(api: ChatApi, source: CredentialSource): BackendKey {
  switch (api) {
    case "agent-sdk":
      switch (source) {
        case "max-pro-sub":
        case "openrouter":
        case "vllm":
          // The sub (its only legal path), the OpenRouter Anthropic skin, and the local loopback all
          // run through the one stateful agent-sdk backend (participants-agents-identity.md §0).
          return "agent-sdk";
        case "local-light":
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message:
              'the "local-light" tier serves only embed/rerank/imageEmbed, never a chat turn',
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
            message:
              'the "local-light" tier serves only embed/rerank/imageEmbed, never a chat turn',
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
    case "anthropic-messages":
      // The anth-direct DIRECT-transport backend (D67, part 02). v1 rides the existing `openrouter`
      // credential (SDK baseURL:openrouter.ai/api + Bearer) — the ONLY coherent source. The first-party
      // `anthropic` source is deferred to W11.
      switch (source) {
        case "openrouter":
          return "anth-direct";
        case "max-pro-sub":
          // THE SUB-EXCLUSION (§3d — load-bearing, non-negotiable): the free Max sub can NEVER drive a
          // paid HTTP endpoint (the st-claude-proxy ban shape). Fail-closed BEFORE any spawn/dispatch.
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message:
              'the "max-pro-sub" credential can never drive the direct Anthropic-Messages api (the sub stays on the agent-sdk CLI)',
          });
        case "vllm":
        case "local-light":
        case "custom_openai":
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message: 'the "anthropic-messages" api is served only by the OpenRouter skin in v1',
          });
        default:
          return assertNever(source);
      }
    default:
      return assertNever(api);
  }
}

/**
 * Derive the sealed backend key for a non-chat role from the credential source alone (the embed/rerank/
 * imageEmbed/summarize/generateImage dispatchers switch on source — providers.md §8.7 correction: they
 * are NOT vLLM-hard-pinned). `max-pro-sub` maps to agent-sdk for exhaustiveness only; the firewall
 * rejects it for every non-chat role before this is reached.
 */
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
export function requireBackend(
  registry: BackendRegistry,
  key: BackendKey,
  role: string,
): ProviderBackend {
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

/** Pull a role's impl off a resolved backend, or fail-closed: a backend that doesn't serve the
 *  requested role (e.g. an OpenRouter backend asked to imageEmbed) throws a typed error rather than a
 *  `TypeError` on an undefined call. */
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
