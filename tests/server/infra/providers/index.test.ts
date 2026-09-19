// The provider executor end-to-end: createProviderExecutor binds a wired registry of FAKE backends and
// the bound role surface routes through the firewall + the sealed dispatch. Exercises the whole CORE
// seam without any real backend (the three backend agents fulfill ProviderBackend against this shape).
//
// FIREWALL RECONCILIATION (flagged for the lead): the brief's "an openrouter cred is REJECTED for the
// agent-sdk backend" conflicts with the AUTHORITATIVE core/Tier-3b-Providers.md (which keeps the agent-sdk
// OpenRouter "skin" — agent-sdk legitimately CONSUMES an openrouter credential). The "openrouter ↛
// agent-sdk" firewall is the ENV/strategy-isolation layer (the sub OAuth token can't leak to an OR
// spawn; no openrouter module imports the agent-sdk backend), enforced by the agent-sdk `env.ts` test +
// the dep-cruiser rule — NOT a dispatch-level credential rejection. This test therefore asserts the
// OR-skin is PERMITTED (per the authoritative spec) and that the REAL fail-closed rules hold.

import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatRequest, ChatResult, EmbedRequest, EmbedResult, ProviderBackend } from "@orb/server/infra/providers";
import { createBackendRegistry, createProviderDiagnostics, createProviderExecutor, ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { createFrozenClock } from "../../../support/clock.ts";
import { makeModelCapability, makeOpenRouterCredential, makeResolvedCredential } from "../../../support/factories/index.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT_RESULT: ChatResult = {
  reply: "ok",
  reasoning: "",
  reasoningRedacted: false,
  warmSpareClaimed: null,
  stopReason: null,
  terminalReason: null,
  finishReason: "stop",
  ttftMs: null,
  durationApiMs: null,
  apiErrorStatus: null,
  numTurns: 1,
  usage: {
    model: "m",
    tokensIn: 0,
    tokensOut: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheCreation5mTokens: null,
    cacheCreation1hTokens: null,
    reasoningTokens: null,
    contextWindow: null,
    maxOutputTokens: null,
    webSearchRequests: 0,
    costUsd: 0,
    costDetails: null,
    isByok: null,
  },
  events: [],
  rateLimit: null,
};

// Spy backends record which role method was invoked so routing is observable.
function spyBackend(key: ProviderBackend["key"], calls: string[]): ProviderBackend {
  return {
    key,
    runChatTurn: (): Promise<ChatResult> => {
      calls.push(`${key}:chat`);
      return Promise.resolve(CHAT_RESULT);
    },
    runAgentTurn: (): Promise<ChatResult> => {
      calls.push(`${key}:agent`);
      return Promise.resolve(CHAT_RESULT);
    },
    embed: (): Promise<EmbedResult> => {
      calls.push(`${key}:embed`);
      return Promise.resolve({
        vectors: [],
        model: "m",
        usage: { promptTokens: null, totalTokens: null },
      });
    },
  };
}

// `over` can swap `api` into the agent-sdk arm without its arm-only required fields (orSkinTierModels
// etc.) — these tests exercise ONLY the firewall/dispatch routing, which reads `api`+`credential.source`
// (+`model`), never the arm-specific fields a real per-arm factory would add.
function chatReq(over: Partial<ChatRequest>): ChatRequest {
  // @orb-waive no-test-fabrication(ChatRequest): partial-arm request (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return {
    api: "chat-completions",
    credential: makeOpenRouterCredential(),
    model: castId<ModelId>("m"),
    capability: makeModelCapability(),
    params: {},
    systemPrompt: { static: "", dynamic: "" },
    history: [],
    ...over,
  } as ChatRequest;
}

function embedReq(over: Partial<EmbedRequest>): EmbedRequest {
  return { credential: makeOpenRouterCredential(), model: castId<ModelId>("m"), input: "x", ...over };
}

describe("createProviderExecutor — routing through the firewall + sealed dispatch", () => {
  test("chat with an openrouter credential routes to the openrouter backend", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["openrouter", spyBackend("openrouter", calls)]]),
    });
    await exec.runChatTurn(chatReq({ api: "chat-completions", credential: makeOpenRouterCredential() }));
    expect(calls).toEqual(["openrouter:chat"]);
  });

  test("OR-SKIN (flagged): an openrouter credential IS permitted on the agent-sdk api and routes to agent-sdk", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["agent-sdk", spyBackend("agent-sdk", calls)]]),
    });
    await exec.runChatTurn(chatReq({ api: "agent-sdk", credential: makeOpenRouterCredential() }));
    // Per authoritative Tier-3b-Providers.md the OR skin runs through the agent-sdk backend — NOT rejected.
    expect(calls).toEqual(["agent-sdk:chat"]);
  });

  test("embed with an openrouter credential routes to the openrouter backend", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["openrouter", spyBackend("openrouter", calls)]]),
    });
    await exec.embed(embedReq({ credential: makeOpenRouterCredential() }));
    expect(calls).toEqual(["openrouter:embed"]);
  });

  test("FIREWALL: embed with a max-pro-sub credential is rejected before any backend is touched", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["agent-sdk", spyBackend("agent-sdk", calls)]]),
    });
    await expect(exec.embed(embedReq({ credential: makeResolvedCredential("max-pro-sub") }))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]); // fail-closed: nothing ran
  });

  test("FIREWALL: a max-pro-sub chat turn without owner consent is rejected; with consent it runs", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["agent-sdk", spyBackend("agent-sdk", calls)]]),
    });
    await expect(exec.runChatTurn(chatReq({ api: "agent-sdk", credential: makeResolvedCredential("max-pro-sub") }))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);

    await exec.runChatTurn(chatReq({ api: "agent-sdk", credential: makeResolvedCredential("max-pro-sub"), ownerConsented: true }));
    expect(calls).toEqual(["agent-sdk:chat"]);
  });

  test("an UNWIRED backend fail-closes (a missing composition-root wire, not a silent default)", async () => {
    const exec = createProviderExecutor({ backends: new Map() });
    await expect(exec.runChatTurn(chatReq({ api: "chat-completions", credential: makeOpenRouterCredential() }))).rejects.toBeInstanceOf(ProviderError);
  });

  test("a backend that doesn't implement the requested role fail-closes", async () => {
    // A backend with NO rerank impl — the rerank role must throw, not call undefined.
    const partial: ProviderBackend = { key: "openrouter" };
    const exec = createProviderExecutor({ backends: new Map([["openrouter", partial]]) });
    await expect(
      exec.rerank({
        credential: makeOpenRouterCredential(),
        model: castId<ModelId>("m"),
        query: "q",
        documents: [],
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("agent role: an openrouter (skin) credential with consent routes to the agent-sdk backend", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["agent-sdk", spyBackend("agent-sdk", calls)]]),
    });
    await exec.runAgentTurn({
      credential: makeOpenRouterCredential(),
      model: castId<ModelId>("m"),
      systemPrompt: "",
      prompt: "hi",
      mcpServer: {},
    });
    expect(calls).toEqual(["agent-sdk:agent"]);
  });
});

describe("createBackendRegistry — the boot-binder factory behind the sealed door", () => {
  // The always-on backends are keyed off each backend's OWN `.key` (the BackendKey axis is sealed —
  // entry can't enumerate it). vLLM is the engine-bearing backend gated by the §D3 escape hatch.
  const nonVllmKeys = ["openrouter", "agent-sdk", "custom-openai", "local-light"] as const;

  test("vllmDisabled:false wires all backends + a live engine handle, each under its own key", () => {
    const clock = createFrozenClock();
    const { backends, vllmEngine } = createBackendRegistry({
      now: clock.now,
      vllmDisabled: false,
      hostClaudeDisabled: false,
    });

    for (const key of nonVllmKeys) {
      // keyed off the returned object's `.key`, not an external enumeration
      expect(backends.get(key)?.key).toBe(key);
    }
    expect(backends.get("vllm")?.key).toBe("vllm");
    expect(backends.size).toBe(5);

    // the engine lifecycle handle is returned so entry/lifecycle can start/stop the supervisor
    expect(vllmEngine).not.toBeNull();
    expect(typeof vllmEngine?.start).toBe("function");
  });

  test("vllmDisabled:true omits the vllm backend and returns a null engine (the §D3 escape hatch)", () => {
    const clock = createFrozenClock();
    const { backends, vllmEngine } = createBackendRegistry({
      now: clock.now,
      vllmDisabled: true,
      hostClaudeDisabled: false,
    });

    for (const key of nonVllmKeys) {
      expect(backends.get(key)?.key).toBe(key);
    }
    expect(backends.has("vllm")).toBe(false);
    expect(backends.size).toBe(4);
    // no engine to supervise — a role resolving to vllm then fail-closes on the unwired key (correct).
    expect(vllmEngine).toBeNull();
  });

  // 2026-09-18 — THE SPAWN THAT COULD ONLY FAIL. A production container with no Claude credential forked the
  // bundled `claude` runtime on every restart: the boot catalog-refresh check enqueues `refresh-model-catalog`,
  // whose agent-sdk lane calls the discovery op, which calls `query()`. REGISTRATION is the chokepoint —
  // with the key absent, `requireBackend` refuses BEFORE anything can reach the SDK. The spy proves the
  // difference between "the call failed" and "the call never happened", which is the whole point: a failed
  // spawn is still a spawn.
  test("hostClaudeDisabled:true omits the agent-sdk backend AND makes the discovery op unreachable — no spawn", async () => {
    const clock = createFrozenClock();
    let querySpawns = 0;
    // `as never` is the house spelling for a fake SDK `query` (catalog.test.ts) — the real type is the SDK's
    // own generator-returning signature and this spy exists to prove it is NEVER called.
    const spyQuery = (): never => {
      querySpawns += 1;
      throw new Error("the SDK query seam must never be reached when host Claude is disabled");
    };

    const { backends } = createBackendRegistry({
      now: clock.now,
      vllmDisabled: false,
      hostClaudeDisabled: true,
      query: spyQuery as never,
    });

    expect(backends.has("agent-sdk")).toBe(false);
    for (const key of ["openrouter", "custom-openai", "local-light", "vllm"] as const) {
      expect(backends.get(key)?.key, `${key} must be unaffected`).toBe(key);
    }

    // The boot catalog warm-up's exact door: a typed refusal, and the SDK seam untouched.
    const diagnostics = createProviderDiagnostics({ backends });
    await expect(diagnostics.fetchAgentSdkModels({})).rejects.toBeInstanceOf(ProviderError);
    expect(querySpawns, "an unregistered backend must not reach the SDK at all — a failed spawn is still a spawn").toBe(0);
  });

  // POSITIVE CONTROL — the gate must not be a blanket removal: a test that only ever asserts absence would
  // pass on a `createAgentSdkBackend` call someone deleted. (The "and then it really does reach the SDK"
  // half is NOT asserted here on purpose: `fetchModels` runs the proactive host-token refresh first, which
  // reads the real credentials file and can dial the live OAuth endpoint. `catalog.test.ts` drives that
  // path hermetically with an injected `query`.)
  test("hostClaudeDisabled:false registers the agent-sdk backend under its own key", () => {
    const clock = createFrozenClock();
    const { backends } = createBackendRegistry({ now: clock.now, vllmDisabled: false, hostClaudeDisabled: false });
    expect(backends.get("agent-sdk")?.key).toBe("agent-sdk");
    expect(backends.size).toBe(5);
  });
});
