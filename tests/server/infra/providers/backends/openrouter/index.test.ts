// backends/openrouter index — the family barrel factory: the backend `key`, the role surface it exposes
// (NO runAgentTurn), the credential firewall (a wrong source fail-closes), the api guard (agent-sdk is
// rejected), the `getClient` injection (resolves the credential's API key), and the summarize shaper (a
// sequential per-input chat turn with `<think>` stripped). The SDK client is a hand-built fake.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  ChatRequest,
  EmbedRequest,
  ProviderBackend,
  SummarizeRequest,
  SummarizeResult,
} from "@orb/server/infra/providers";
import type { OrClient } from "@orb/server/infra/providers/backends/openrouter";
import { createOpenRouterBackend } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const FIXED_NOW = 1000;
const OR_KEY = "sk-or-secret";
const CRED = {
  source: "openrouter",
  apiKey: OR_KEY,
  credentialId: null,
} as unknown as ResolvedCredential;

// A summarize chat reply carrying CoT scaffolding the shaper must strip.
function summarizeReply(content: string): unknown {
  return {
    choices: [{ message: { content }, finishReason: "stop", index: 0 }],
    created: 0,
    id: "g",
    model: "m",
    object: "chat.completion",
    systemFingerprint: null,
    usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7, cost: 0.001 },
  };
}

interface Tracker {
  apiKeys: string[];
  sends: number;
}

// A backend wired with an injected `getClient` that records the API key it was handed and returns a fake
// whose chat.send replies (non-streaming) for the summarize shaper.
function backendWith(reply: (n: number) => unknown): {
  backend: ProviderBackend;
  tracker: Tracker;
} {
  const tracker: Tracker = { apiKeys: [], sends: 0 };
  const getClient = (apiKey: string): OrClient => {
    tracker.apiKeys.push(apiKey);
    return {
      chat: {
        send: (): Promise<unknown> => {
          tracker.sends += 1;
          return Promise.resolve(reply(tracker.sends));
        },
      },
    } as unknown as OrClient;
  };
  const backend = createOpenRouterBackend({ now: (): number => FIXED_NOW, getClient });
  return { backend, tracker };
}

// Pull the optional summarize method through a typed helper so the await is unambiguously on a Promise.
function callSummarize(backend: ProviderBackend, req: SummarizeRequest): Promise<SummarizeResult> {
  const fn = backend.summarize;
  if (fn === undefined) {
    throw new Error("openrouter backend must implement summarize");
  }
  return fn(req);
}

describe("createOpenRouterBackend — surface", () => {
  test("registers under key 'openrouter' and serves chat + the non-chat roles, NOT agent", () => {
    const { backend } = backendWith(() => summarizeReply("x"));
    expect(backend.key).toBe("openrouter");
    expect(backend.runChatTurn).toBeDefined();
    expect(backend.embed).toBeDefined();
    expect(backend.rerank).toBeDefined();
    expect(backend.imageEmbed).toBeDefined();
    expect(backend.summarize).toBeDefined();
    expect(backend.generateImage).toBeDefined();
    expect(backend.runAgentTurn).toBeUndefined();
  });
});

describe("createOpenRouterBackend — firewall + dispatch", () => {
  test("the agent-sdk api is rejected (that api is the agent-sdk backend's)", async () => {
    const { backend } = backendWith(() => summarizeReply("x"));
    const req = {
      api: "agent-sdk",
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-opus-4-5"),
      prompt: "hi",
    } as unknown as ChatRequest;
    await expect(backend.runChatTurn?.(req)).rejects.toMatchObject({ kind: "invalid" });
  });

  test("a non-openrouter credential fail-closes the credential guard (rejected, not sync-thrown)", async () => {
    const { backend } = backendWith(() => summarizeReply("x"));
    const vllmCred = { source: "vllm", credentialId: null } as unknown as ResolvedCredential;
    const req: EmbedRequest = {
      credential: vllmCred,
      model: castId<ModelId>("qwen/embed"),
      input: "x",
    };
    await expect(backend.embed?.(req)).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("createOpenRouterBackend — summarize shaper", () => {
  test("runs one chat turn per input (sequentially), strips <think>, maps usage + model", async () => {
    const { backend, tracker } = backendWith((n) => summarizeReply(`<think>cot${n}</think>S${n}`));
    const req: SummarizeRequest = {
      credential: CRED,
      model: castId<ModelId>("anthropic/claude-haiku-4-5"),
      inputs: [
        { systemPrompt: "sys", userPrompt: "one" },
        { systemPrompt: "sys", userPrompt: "two" },
      ],
    };
    const result = await callSummarize(backend, req);
    expect(tracker.sends).toBe(2); // one chat turn per input
    expect(tracker.apiKeys).toContain(OR_KEY); // the credential's key was resolved + handed to getClient
    expect(result?.items.map((item) => item.text)).toEqual(["S1", "S2"]); // CoT stripped
    expect(result?.items[0]?.usage).toEqual({ tokensIn: 5, tokensOut: 2, costUsd: 0.001 });
    expect(result?.model).toBe("anthropic/claude-haiku-4-5");
  });
});
