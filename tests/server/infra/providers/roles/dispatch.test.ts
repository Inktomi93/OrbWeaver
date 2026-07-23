// The sealed routing derivation — deriveRunner (the `runner = f(api, source)` over ChatApi × source)
// and backendForSource (the non-chat axis), plus the fail-closed registry/role lookups. The runner key
// is infra-internal and never leaves providers; this is its only test surface.

import type { BackendKey, BackendRegistry, CredentialSource, ProviderBackend } from "@orb/server/infra/providers";
import { backendForSource, deriveRunner, ProviderError, requireBackend, requireRoleImpl } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

describe("deriveRunner — ChatApi × CredentialSource → the sealed backend key", () => {
  test("agent-sdk api: the sub, the OpenRouter skin, local vllm, and the first-party anthropic key all map to the agent-sdk backend", () => {
    expect(deriveRunner("agent-sdk", "max-pro-sub")).toBe("agent-sdk");
    expect(deriveRunner("agent-sdk", "openrouter")).toBe("agent-sdk");
    expect(deriveRunner("agent-sdk", "vllm")).toBe("agent-sdk");
    // W11 owner ruling: agents may run on a user's own Anthropic key (the native x-api-key agent-sdk path).
    expect(deriveRunner("agent-sdk", "anthropic")).toBe("agent-sdk");
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

  test("the anthropic-messages api (anth-direct): both paid-key sources route to anth-direct — OR skin + first-party anthropic (W11)", () => {
    expect(deriveRunner("anthropic-messages", "openrouter")).toBe("anth-direct");
    expect(deriveRunner("anthropic-messages", "anthropic")).toBe("anth-direct");
  });

  test("THE SUB-EXCLUSION (part 02 §3d): max-pro-sub × anthropic-messages is a fail-closed invalid", () => {
    // The free Max sub can NEVER drive the paid direct endpoint — the st-claude-proxy ban shape.
    expect(() => deriveRunner("anthropic-messages", "max-pro-sub")).toThrow(ProviderError);
  });

  test("the anthropic-messages api rejects every non-paid-key source (§3a routing table)", () => {
    // vllm/local-light/custom_openai never carry the Anthropic-Messages wire.
    for (const source of ["vllm", "local-light", "custom_openai"] as const) {
      expect(() => deriveRunner("anthropic-messages", source)).toThrow(ProviderError);
    }
  });

  test("the first-party anthropic source serves anthropic-messages (anth-direct) AND agent-sdk; the OpenAI wires fail-closed (W11)", () => {
    // Chat → the tool-less direct wire; agents → the native agent-sdk path (owner ruling). Never the OpenAI wires.
    expect(deriveRunner("anthropic-messages", "anthropic")).toBe("anth-direct");
    expect(deriveRunner("agent-sdk", "anthropic")).toBe("agent-sdk");
    for (const api of ["chat-completions", "responses"] as const) {
      expect(() => deriveRunner(api, "anthropic")).toThrow(ProviderError);
    }
  });

  test("local-light is never a chat/agent runner (it serves only embed/rerank/imageEmbed)", () => {
    for (const api of ["agent-sdk", "chat-completions", "responses", "anthropic-messages"] as const) {
      expect(() => deriveRunner(api, "local-light")).toThrow(ProviderError);
    }
  });

  test("venice is never a chat/agent runner (it serves only generateImage — MA-1)", () => {
    for (const api of ["agent-sdk", "chat-completions", "responses", "anthropic-messages"] as const) {
      expect(() => deriveRunner(api, "venice")).toThrow(ProviderError);
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
      // anthropic is chat-only (anth-direct); mapped here for exhaustiveness — the firewall gates non-chat roles.
      ["anthropic", "anth-direct"],
      // venice is generateImage-only (MA-1) — maps to its sealed backend on the non-chat axis.
      ["venice", "venice"],
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
