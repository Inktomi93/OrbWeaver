// The sealed routing derivation — deriveRunner (the `runner = f(api, source)` over ChatApi × source)
// and backendForSource (the non-chat axis), plus the fail-closed registry/role lookups. The runner key
// is infra-internal and never leaves providers; this is its only test surface.

import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getTraceByRequestId, initTracing, withRequestSpan } from "@orb/server/foundation/observability";
import type {
  BackendKey,
  BackendRegistry,
  CredentialSource,
  EmbedRequest,
  ProviderBackend,
  StructuredRequest,
  SummarizeResult,
} from "@orb/server/infra/providers";
import {
  backendForSource,
  createEmbedRole,
  createStructuredRole,
  deriveRunner,
  ProviderError,
  requireBackend,
  requireRoleImpl,
} from "@orb/server/infra/providers";
import { NO_PROVIDER_SECRETS, providerErrorFromHttp } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { makeOpenRouterCredential, makeResolvedCredential } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { wireSchema } from "../../../../support/wire-ready.ts";

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

// ── runRole — the caller's abort REASON never reaches the backend (STRUCTURED-ABORT-REASON-LEAK) ──────
// The defect: a role dispatcher handed `req.signal` to the backend UNCHANGED, so the caller's abort reason
// travelled to `fetch` and — per the fetch spec, which undici implements — became the value the request
// promise REJECTS with. `classifyTransportName` reads name+message for /timeout|connection|network|overload/,
// so a cancellation whose reason merely CONTAINED one of those words came back `{kind:"server",
// retryable:true}` and was RE-RUN (our own `retry.ts` on the chat runners; the OpenRouter SDK's default
// `retryConfig.retryConnectionErrors` on the batch roles) — a cancelled call, re-billed.
//
// Asserted through the REAL `structured` dispatcher (the arm the rpg extraction rides) and through the
// classifier the transport path actually calls — never through the flattening helper itself, which would
// only prove the helper works.
const HOSTILE_ABORT_REASON = new Error("connection timeout waiting for the user");

/** A structured backend that behaves like `fetch`: it rejects with the signal's `reason` on abort, and
 *  records the signal it was handed so the test can inspect what crossed the seam. */
function abortObservingBackend(seen: { signal?: AbortSignal | undefined }): ProviderBackend {
  return {
    key: "openrouter",
    structured: (req: StructuredRequest): Promise<SummarizeResult> =>
      new Promise<SummarizeResult>((_resolve, reject): void => {
        seen.signal = req.signal;
        // `fetch`'s abort algorithm, exactly: reject with the signal's REASON — immediately if it is
        // already aborted, else on the abort event.
        if (req.signal?.aborted === true) {
          reject(req.signal.reason);
          return;
        }
        req.signal?.addEventListener("abort", (): void => reject(req.signal?.reason), { once: true });
      }),
  };
}

function structuredReq(signal: AbortSignal): StructuredRequest {
  return {
    credential: makeOpenRouterCredential(),
    model: castId<ModelId>("m"),
    signal,
    inputs: [{ systemPrompt: "", userPrompt: "x" }],
    responseFormat: { name: "x", schema: wireSchema({ type: "object" }) },
  };
}

describe("runRole — the caller's abort reason is flattened before it reaches a backend", () => {
  test("a cancelled STRUCTURED call classifies as aborted+non-retryable even when the caller's reason says 'connection timeout'", async () => {
    const caller = new AbortController();
    const seen: { signal?: AbortSignal | undefined } = {};
    const role = createStructuredRole({ backends: new Map<BackendKey, ProviderBackend>([["openrouter", abortObservingBackend(seen)]]) });

    const pending = role(structuredReq(caller.signal));
    // Let the dispatcher reach the backend before cancelling (the backend attaches its listener on entry).
    await Promise.resolve();
    caller.abort(HOSTILE_ABORT_REASON);
    const thrown: unknown = await pending.then(
      () => undefined,
      (err: unknown) => err,
    );

    // THE PIN, asserted FIRST because it is the defect: the verdict the transport path reaches.
    // `{kind:"server", retryable:true}` here is a cancelled call being re-run (and re-billed).
    const classified = providerErrorFromHttp(thrown, "openrouter structured", NO_PROVIDER_SECRETS);
    expect(classified.kind).toBe("aborted");
    expect(classified.retryable).toBe(false);

    // The mechanism underneath: the wire saw OUR signal, whose reason is a plain AbortError — never the
    // caller's sentence.
    expect(seen.signal).toBeInstanceOf(AbortSignal);
    expect(seen.signal).not.toBe(caller.signal);
    expect(seen.signal?.aborted).toBe(true);
    expect(thrown).not.toBe(HOSTILE_ABORT_REASON);
    expect(Error.isError(thrown) ? thrown.name : "").toBe("AbortError");
  });

  test("cancellation still PROPAGATES (the flattening drops the reason, never the cancel)", async () => {
    const caller = new AbortController();
    const seen: { signal?: AbortSignal | undefined } = {};
    const role = createStructuredRole({ backends: new Map<BackendKey, ProviderBackend>([["openrouter", abortObservingBackend(seen)]]) });

    const pending = role(structuredReq(caller.signal));
    await Promise.resolve();
    expect(seen.signal?.aborted).toBe(false);
    caller.abort();
    await pending.catch(() => undefined);
    expect(seen.signal?.aborted).toBe(true);
  });

  test("a caller who cancels BEFORE the dispatch hands the backend an already-aborted signal", async () => {
    const caller = new AbortController();
    caller.abort(HOSTILE_ABORT_REASON);
    const seen: { signal?: AbortSignal | undefined } = {};
    const role = createStructuredRole({ backends: new Map<BackendKey, ProviderBackend>([["openrouter", abortObservingBackend(seen)]]) });

    const thrown: unknown = await role(structuredReq(caller.signal)).then(
      () => undefined,
      (err: unknown) => err,
    );
    expect(Error.isError(thrown) ? thrown.name : "").toBe("AbortError");
    expect(thrown).not.toBe(HOSTILE_ABORT_REASON);
  });
});
