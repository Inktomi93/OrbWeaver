// The sealed routing derivation — deriveRunner (the `runner = f(api, source)` over ChatApi × source)
// and backendForSource (the non-chat axis), plus the fail-closed registry/role lookups. The runner key
// is infra-internal and never leaves providers; this is its only test surface.

import { getTraceByRequestId, initTracing, withRequestSpan } from "@orb/server/foundation/observability";
import type { BackendKey, BackendRegistry, CredentialSource, EmbedRequest, ProviderBackend } from "@orb/server/infra/providers";
import { backendForSource, createEmbedRole, deriveRunner, ProviderError, requireBackend, requireRoleImpl } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../support/factories/resolved-connection";
import { expect, test } from "../../../../support/fixtures";

// The agent-sdk×vllm rejection message (loopback skin retired) — hoisted for the callback-regex lint.
const VLLM_AGENT_RETIRED_RE = /chat-completions api|retired/i;

describe("deriveRunner — ChatApi × CredentialSource → the sealed backend key", () => {
  test("agent-sdk api: the sub + the OpenRouter skin map to the agent-sdk backend (the two Claude-runtime skins)", () => {
    expect(deriveRunner("agent-sdk", "max-pro-sub")).toBe("agent-sdk");
    expect(deriveRunner("agent-sdk", "openrouter")).toBe("agent-sdk");
  });

  test("agent-sdk api does NOT serve vllm (loopback skin RETIRED 2026-07-27) or custom_openai (fail-closed)", () => {
    // vLLM is chat-completions-only (owner ruling): the SDK loopback skin hung the small local model on real
    // structured schemas while chat-completions handles it. A would-be agent-sdk×vllm turn fails LOUD here.
    expect(() => deriveRunner("agent-sdk", "vllm")).toThrow(ProviderError);
    expect(() => deriveRunner("agent-sdk", "vllm")).toThrow(VLLM_AGENT_RETIRED_RE);
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

// ── runRole — the provider span (the `providerDurationMs: 0` defect) ──────────────────────────────────
// `RequestTraceTotals.providerDurationMs` sums spans named `provider.*`, and NOTHING opened one: the tree
// held only `trpc.*` and `db.*`, so every recorded trace reported provider time as exactly 0 and a slow
// turn read as a slow request. Proved through the REAL dispatcher (`createEmbedRole`) and read back off the
// TRACE RING — the surface `/api/_debug/traces` serves — not off the span API the fix calls.
const PROVIDER_WORK_MS = 5;
const PROVIDER_SPAN_REQUEST_ID = "dispatch-provider-span";

describe("runRole — the provider-call seam opens a provider.<role> span", () => {
  test("a role dispatch lands a provider.embed span in the request's trace, and its duration reaches the totals", async () => {
    initTracing();
    const calls: string[] = [];
    // A backend whose impl takes REAL time, so a duration of 0 can only mean "no span was opened".
    const backend: ProviderBackend = {
      key: "vllm",
      embed: async () => {
        calls.push("embed");
        await new Promise((resolve) => setTimeout(resolve, PROVIDER_WORK_MS));
        return { vectors: [], model: "m", usage: { promptTokens: null, totalTokens: null } };
      },
    };
    const role = createEmbedRole({ backends: new Map<BackendKey, ProviderBackend>([["vllm", backend]]) });
    // The same minimal in-shape request the embed role's own firewall matrix builds.
    // FABRICATION-OK: a minimal in-shape EmbedRequest — this test is about the span, not the wire payload.
    const req = { credential: makeResolvedCredential("vllm"), model: "m", input: "x" } as EmbedRequest;

    await withRequestSpan(PROVIDER_SPAN_REQUEST_ID, "test-root", {}, () => role(req));

    expect(calls).toEqual(["embed"]);
    const trace = getTraceByRequestId(PROVIDER_SPAN_REQUEST_ID);
    if (trace === undefined) {
      throw new Error("expected a recorded trace for the request");
    }
    const providerSpan = trace.spans.find((s) => s.name === "provider.embed");
    expect(providerSpan).toBeDefined();
    // The attributes name WHICH backend served it (metadata only — never RP content).
    expect(providerSpan?.attributes["provider.backend"]).toBe("vllm");
    expect(providerSpan?.attributes["provider.role"]).toBe("embed");
    expect(providerSpan?.attributes["provider.source"]).toBe("vllm");
    // THE PIN: the ring's provider total is no longer structurally 0.
    expect(trace.totals.providerDurationMs).toBeGreaterThan(0);
  });
});
