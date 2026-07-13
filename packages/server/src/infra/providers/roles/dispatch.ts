// Sealed routing derivation: maps {api, source} onto the infra-internal `BackendKey`, never leaked
// outward. Every switch is `assertNever`-exhaustive; an invalid (api, source) pairing fail-closes with a
// typed {@link ProviderError} rather than falling through.

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

/** `runner = f(api, source)` the chat dispatch routes on. Invalid pairings fail-closed. */
export function deriveRunner(api: ChatApi, source: CredentialSource): BackendKey {
  switch (api) {
    case "agent-sdk":
      switch (source) {
        case "max-pro-sub":
        case "openrouter":
        case "vllm":
          // Sub, OR Anthropic skin, and local loopback all run through the one stateful agent-sdk backend.
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
      // anth-direct backend (D67); v1 rides the existing `openrouter` credential only.
      switch (source) {
        case "openrouter":
          return "anth-direct";
        case "max-pro-sub":
          // Sub-exclusion (§3d, non-negotiable): the free Max sub can never drive a paid HTTP endpoint.
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
