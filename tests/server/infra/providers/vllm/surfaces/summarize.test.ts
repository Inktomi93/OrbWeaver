// Unit tests for the vLLM summarize surface — a request SHAPER over the gen chat-completion core (NOT a
// separate engine). Asserts: one item per input (index-aligned), the (system,user) shape reaches the gen
// chat endpoint, `<think>` CoT scaffolding is stripped, usage is carried (cost null for local), and a
// batch fans out, and the caller's AbortSignal reaches the engine POST (the cancellation seam that keeps a
// non-responsive box from hanging its caller — the `smart` arbitration's only way out of a hang).
// Independent — it shapes onto the engine core via the injected client, never a sibling.

import type { ModelId } from "@orb/kit/ids";
import { createVllmSummarize } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

const CRED = makeResolvedCredential("vllm");
const MODEL = "Qwen/Qwen3-VL-8B-Instruct" as ModelId;

interface ChatBody {
  messages: { role: string; content: unknown }[];
}
interface PostCall {
  readonly path: string;
  readonly body: ChatBody;
  readonly signal: AbortSignal | undefined;
}

// A recording fake: echoes the user prompt back as the "summary", wrapped with a <think> block to prove
// the surface strips it.
function fakeClient(): { client: VllmEngineClient; calls: PostCall[] } {
  const calls: PostCall[] = [];
  const client: VllmEngineClient = {
    enginePost: <T>(_engine: unknown, path: string, body: unknown, signal?: AbortSignal): Promise<T> => {
      const b = body as ChatBody;
      calls.push({ path, body: b, signal });
      const user = b.messages.find((m) => m.role === "user")?.content ?? "";
      return Promise.resolve({
        choices: [{ message: { content: `<think>reasoning</think>summary of ${String(user)}` } }],
        // biome-ignore lint/style/useNamingConvention: vLLM wire response shape (snake_case).
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      } as T);
    },
    engineStream: () => Promise.reject(new Error("summarize must not stream")),
    baseUrl: () => "http://127.0.0.1:0",
  };
  return { client, calls };
}

// Narrow an indexed-access result (possibly-undefined under noUncheckedIndexedAccess) or fail the test.
function need<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("expected a defined value");
  }
  return value;
}

describe("createVllmSummarize", () => {
  test("returns one item per input, index-aligned, with <think> stripped", async () => {
    const { client } = fakeClient();
    const summarize = createVllmSummarize({ client, concurrency: 4 });
    const res = await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [
        { systemPrompt: "sys", userPrompt: "first" },
        { systemPrompt: "sys", userPrompt: "second" },
      ],
    });

    expect(res.items).toHaveLength(2);
    expect(need(res.items[0]).text).toBe("summary of first");
    expect(need(res.items[1]).text).toBe("summary of second");
    expect(need(res.items[0]).text).not.toContain("<think>");
    expect(res.model).toBe(MODEL);
  });

  test("shapes each task onto the gen chat-completion endpoint as (system, user)", async () => {
    const { client, calls } = fakeClient();
    const summarize = createVllmSummarize({ client, concurrency: 4 });
    await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [{ systemPrompt: "be terse", userPrompt: "the text" }],
    });

    expect(need(calls[0]).path).toBe("/v1/chat/completions");
    const roles = need(calls[0]).body.messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user"]);
    expect(need(need(calls[0]).body.messages[0]).content).toBe("be terse");
    expect(need(need(calls[0]).body.messages[1]).content).toBe("the text");
  });

  test("carries token usage; cost is null for local inference", async () => {
    const { client } = fakeClient();
    const summarize = createVllmSummarize({ client, concurrency: 4 });
    const res = await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [{ systemPrompt: "s", userPrompt: "u" }],
    });

    expect(need(res.items[0]).usage).toEqual({ tokensIn: 11, tokensOut: 7, costUsd: null });
  });

  test("fans a batch out across the engine (one call per input)", async () => {
    const { client, calls } = fakeClient();
    const summarize = createVllmSummarize({ client, concurrency: 2 });
    const res = await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [
        { systemPrompt: "s", userPrompt: "a" },
        { systemPrompt: "s", userPrompt: "b" },
        { systemPrompt: "s", userPrompt: "c" },
      ],
    });

    expect(calls).toHaveLength(3);
    expect(res.items.map((i) => i.text)).toEqual(["summary of a", "summary of b", "summary of c"]);
  });

  // THE HANG SEAM: a summarize caller that owns a cancellation (a chat turn's active-turn handle) can only
  // escape a box that accepted the socket and never answered if its signal reaches the fetch. Asserted at the
  // engine-POST boundary — the identity check proves the CALLER'S signal arrives, not a fresh one the surface
  // minted (which would abort nothing).
  test("threads the request's AbortSignal into every engine POST", async () => {
    const { client, calls } = fakeClient();
    const summarize = createVllmSummarize({ client, concurrency: 2 });
    const controller = new AbortController();
    await summarize({
      credential: CRED,
      model: MODEL,
      inputs: [
        { systemPrompt: "s", userPrompt: "a" },
        { systemPrompt: "s", userPrompt: "b" },
      ],
      signal: controller.signal,
    });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.signal).toBe(controller.signal);
    }
  });

  test("a request with no signal posts without one (no fabricated controller)", async () => {
    const { client, calls } = fakeClient();
    const summarize = createVllmSummarize({ client, concurrency: 1 });
    await summarize({ credential: CRED, model: MODEL, inputs: [{ systemPrompt: "s", userPrompt: "a" }] });

    expect(need(calls[0]).signal).toBeUndefined();
  });
});
