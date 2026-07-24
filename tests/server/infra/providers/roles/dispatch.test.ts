// The sealed routing derivation — deriveRunner (the `runner = f(api, source)` over ChatApi × source)
// and backendForSource (the non-chat axis), plus the fail-closed registry/role lookups. The runner key
// is infra-internal and never leaves providers; this is its only test surface.

import type { BackendKey, BackendRegistry, CredentialSource, ProviderBackend } from "@orb/server/infra/providers";
import { backendForSource, deriveRunner, ProviderError, requireBackend, requireRoleImpl } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

describe("deriveRunner — ChatApi × CredentialSource → the sealed backend key", () => {
  test("agent-sdk api: the sub, the OpenRouter skin, and local vllm all map to the agent-sdk backend", () => {
    expect(deriveRunner("agent-sdk", "max-pro-sub")).toBe("agent-sdk");
    expect(deriveRunner("agent-sdk", "openrouter")).toBe("agent-sdk");
    expect(deriveRunner("agent-sdk", "vllm")).toBe("agent-sdk");
  });

  test("agent-sdk api does NOT serve a custom_openai credential (fail-closed)", () => {
    expect(() => deriveRunner("agent-sdk", "custom_openai")).toThrow(ProviderError);
  });

  test("chat-completions api: each source maps to its own stateless backend", () => {
    expect(deriveRunner("chat-completions", "openrouter")).toBe("openrouter");
    expect(deriveRunner("chat-completions", "vllm")).toBe("vllm");
    expect(deriveRunner("chat-completions", "custom_openai")).toBe("custom-openai");
  });

  test("max-pro-sub is reachable ONLY through the agent-sdk api (not chat-completions)", () => {
    expect(() => deriveRunner("chat-completions", "max-pro-sub")).toThrow(ProviderError);
  });

  test("the responses api is OpenRouter-only", () => {
    expect(deriveRunner("responses", "openrouter")).toBe("openrouter");
    for (const source of ["max-pro-sub", "vllm", "local-light", "custom_openai"] as const) {
      expect(() => deriveRunner("responses", source)).toThrow(ProviderError);
    }
  });

  test("local-light is never a chat/agent runner (it serves only embed/rerank/imageEmbed)", () => {
    for (const api of ["agent-sdk", "chat-completions", "responses"] as const) {
      expect(() => deriveRunner(api, "local-light")).toThrow(ProviderError);
    }
  });
});

describe("backendForSource — the non-chat role axis", () => {
  test("each source maps to its sealed backend key", () => {
    const cases: readonly (readonly [CredentialSource, BackendKey])[] = [
      ["openrouter", "openrouter"],
      ["vllm", "vllm"],
      ["local-light", "local-light"],
      ["custom_openai", "custom-openai"],
      ["max-pro-sub", "agent-sdk"],
    ];
    for (const [source, key] of cases) {
      expect(backendForSource(source)).toBe(key);
    }
  });
});

describe("requireBackend / requireRoleImpl — fail-closed lookups", () => {
  const fakeBackend: ProviderBackend = {
    key: "openrouter",
    embed: () =>
      Promise.resolve({
        vectors: [],
        model: "m",
        usage: { promptTokens: null, totalTokens: null },
      }),
  };
  const registry: BackendRegistry = new Map([["openrouter", fakeBackend]]);

  test("requireBackend returns a wired backend", () => {
    expect(requireBackend(registry, "openrouter", "embed")).toBe(fakeBackend);
  });

  test("requireBackend on an UNWIRED key throws (no silent default)", () => {
    expect(() => requireBackend(registry, "vllm", "embed")).toThrow(ProviderError);
  });

  test("requireRoleImpl returns a present impl and throws on a missing one", () => {
    expect(requireRoleImpl(fakeBackend, fakeBackend.embed, "embed")).toBe(fakeBackend.embed);
    // The openrouter fake doesn't implement rerank → fail-closed, not a TypeError-on-undefined-call.
    expect(() => requireRoleImpl(fakeBackend, fakeBackend.rerank, "rerank")).toThrow(ProviderError);
  });
});
