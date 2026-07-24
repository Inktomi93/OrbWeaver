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

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { AgentTurnRequest, ChatRequest, ChatResult, EmbedRequest, EmbedResult, ProviderBackend } from "@orb/server/infra/providers";
import { createBackendRegistry, createProviderExecutor, ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { createFrozenClock } from "../../../support/clock.ts";
import { expect, test } from "../../../support/fixtures";

// The dispatch + firewall read only `credential.source`; the brand is irrelevant at runtime (these
// `.test.ts` files run through esbuild, not tsc), so a cast keeps the fakes terse.
function cred(source: ResolvedCredential["source"]): ResolvedCredential {
  return { source, credentialId: null } as unknown as ResolvedCredential;
}

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

function chatReq(over: Partial<ChatRequest>): ChatRequest {
  return {
    api: "chat-completions",
    credential: cred("openrouter"),
    model: "m",
    capability: {} as ChatRequest["capability"],
    params: {},
    systemPrompt: { static: "", dynamic: "" },
    history: [],
    ...over,
  } as ChatRequest;
}

function embedReq(over: Partial<EmbedRequest>): EmbedRequest {
  return { credential: cred("openrouter"), model: "m", input: "x", ...over } as EmbedRequest;
}

describe("createProviderExecutor — routing through the firewall + sealed dispatch", () => {
  test("chat with an openrouter credential routes to the openrouter backend", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["openrouter", spyBackend("openrouter", calls)]]),
    });
    await exec.runChatTurn(chatReq({ api: "chat-completions", credential: cred("openrouter") }));
    expect(calls).toEqual(["openrouter:chat"]);
  });

  test("OR-SKIN (flagged): an openrouter credential IS permitted on the agent-sdk api and routes to agent-sdk", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["agent-sdk", spyBackend("agent-sdk", calls)]]),
    });
    await exec.runChatTurn(chatReq({ api: "agent-sdk", credential: cred("openrouter") }));
    // Per authoritative providers.md the OR skin runs through the agent-sdk backend — NOT rejected.
    expect(calls).toEqual(["agent-sdk:chat"]);
  });

  test("embed with an openrouter credential routes to the openrouter backend", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["openrouter", spyBackend("openrouter", calls)]]),
    });
    await exec.embed(embedReq({ credential: cred("openrouter") }));
    expect(calls).toEqual(["openrouter:embed"]);
  });

  test("FIREWALL: embed with a max-pro-sub credential is rejected before any backend is touched", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["agent-sdk", spyBackend("agent-sdk", calls)]]),
    });
    await expect(exec.embed(embedReq({ credential: cred("max-pro-sub") }))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]); // fail-closed: nothing ran
  });

  test("FIREWALL: a max-pro-sub chat turn without owner consent is rejected; with consent it runs", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["agent-sdk", spyBackend("agent-sdk", calls)]]),
    });
    await expect(exec.runChatTurn(chatReq({ api: "agent-sdk", credential: cred("max-pro-sub") }))).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toEqual([]);

    await exec.runChatTurn(chatReq({ api: "agent-sdk", credential: cred("max-pro-sub"), ownerConsented: true }));
    expect(calls).toEqual(["agent-sdk:chat"]);
  });

  test("an UNWIRED backend fail-closes (a missing composition-root wire, not a silent default)", async () => {
    const exec = createProviderExecutor({ backends: new Map() });
    await expect(exec.runChatTurn(chatReq({ api: "chat-completions", credential: cred("openrouter") }))).rejects.toBeInstanceOf(ProviderError);
  });

  test("a backend that doesn't implement the requested role fail-closes", async () => {
    // A backend with NO rerank impl — the rerank role must throw, not call undefined.
    const partial: ProviderBackend = { key: "openrouter" };
    const exec = createProviderExecutor({ backends: new Map([["openrouter", partial]]) });
    await expect(
      exec.rerank({
        credential: cred("openrouter"),
        model: "m",
        query: "q",
        documents: [],
      } as unknown as Parameters<typeof exec.rerank>[0]),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("agent role: an openrouter (skin) credential with consent routes to the agent-sdk backend", async () => {
    const calls: string[] = [];
    const exec = createProviderExecutor({
      backends: new Map([["agent-sdk", spyBackend("agent-sdk", calls)]]),
    });
    await exec.runAgentTurn({
      credential: cred("openrouter"),
      model: "m",
      systemPrompt: "",
      prompt: "hi",
      mcpServer: {},
    } as AgentTurnRequest);
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
    });

    for (const key of nonVllmKeys) {
      expect(backends.get(key)?.key).toBe(key);
    }
    expect(backends.has("vllm")).toBe(false);
    expect(backends.size).toBe(4);
    // no engine to supervise — a role resolving to vllm then fail-closes on the unwired key (correct).
    expect(vllmEngine).toBeNull();
  });
});
