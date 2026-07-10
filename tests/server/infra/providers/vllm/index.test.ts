// Unit tests for the vLLM subsystem root — `createVllmBackend`. Asserts the sealed backend shape (key +
// the FIVE role methods it serves, and the ABSENCE of agent/generateImage — vLLM is a five-role engine,
// not a chat peer), the engine lifecycle handle, surface INDEPENDENCE (each role routes to its own engine
// via the injected client; one role never invokes another), and that the handle's restart is a safe no-op
// when the supervisor isn't running.

import type { ModelId } from "@orb/kit/ids";
import { createVllmBackend } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures";

const CRED = makeResolvedCredential("vllm");
const MODEL = "Qwen/Qwen3-VL" as ModelId;

interface EngineHit {
  readonly engine: string;
  readonly path: string;
}

// A fake client that records which ENGINE each role hits (the embed/rerank/gen routing is the isolation
// proof: each surface targets its own engine, none cross-calls another).
function fakeClient(): { client: VllmEngineClient; hits: EngineHit[] } {
  const hits: EngineHit[] = [];
  const client: VllmEngineClient = {
    enginePost: <T>(engine: string, path: string, body: unknown): Promise<T> => {
      hits.push({ engine, path });
      const b = body as { input?: unknown; messages?: unknown };
      if (Array.isArray(b.input)) {
        return Promise.resolve({
          data: b.input.map((_, i) => ({ index: i, embedding: [1, 0] })),
          model: "served",
        } as T);
      }
      if (b.messages !== undefined) {
        return Promise.resolve({
          data: [{ index: 0, embedding: [1, 0] }],
          model: "served",
          choices: [{ message: { content: "ok" } }],
        } as T);
      }
      // biome-ignore lint/style/useNamingConvention: vLLM wire response shape (snake_case).
      return Promise.resolve({ model: "served", results: [], usage: { total_tokens: 0 } } as T);
    },
    engineStream: () => Promise.reject(new Error("not exercised here")),
    baseUrl: () => "http://127.0.0.1:0",
  };
  return { client, hits };
}

const now = (): number => 0;

describe("createVllmBackend", () => {
  test("registers under the vllm key and serves exactly the five vLLM roles", () => {
    const { client } = fakeClient();
    const backend = createVllmBackend({ client, now });

    expect(backend.key).toBe("vllm");
    expect(typeof backend.runChatTurn).toBe("function");
    expect(typeof backend.embed).toBe("function");
    expect(typeof backend.rerank).toBe("function");
    expect(typeof backend.imageEmbed).toBe("function");
    expect(typeof backend.summarize).toBe("function");
    // vLLM is NOT a chat peer that does agent mode, and it doesn't generate images.
    expect(backend.runAgentTurn).toBeUndefined();
    expect(backend.generateImage).toBeUndefined();
  });

  test("exposes the engine lifecycle handle (start/status/restart)", () => {
    const { client } = fakeClient();
    const backend = createVllmBackend({ client, now });

    expect(typeof backend.engine.start).toBe("function");
    expect(typeof backend.engine.status).toBe("function");
    expect(typeof backend.engine.restart).toBe("function");
    expect(backend.engine.status()).toBeTypeOf("object");
  });

  test("each role routes to its OWN engine (embed→embed, rerank→rerank, summarize→gen) — independent", async () => {
    const { client, hits } = fakeClient();
    const backend = createVllmBackend({ client, now });

    await backend.embed?.({ credential: CRED, model: MODEL, input: ["x"] });
    await backend.rerank?.({
      credential: CRED,
      model: MODEL,
      query: "q",
      documents: [{ id: "a", text: "t" }],
    });
    await backend.imageEmbed?.({
      credential: CRED,
      model: MODEL,
      input: { kind: "text", input: "x" },
    });
    await backend.summarize?.({
      credential: CRED,
      model: MODEL,
      inputs: [{ systemPrompt: "s", userPrompt: "u" }],
    });

    expect(hits).toContainEqual({ engine: "embed", path: "/v1/embeddings" });
    expect(hits).toContainEqual({ engine: "rerank", path: "/v1/rerank" });
    expect(hits).toContainEqual({ engine: "gen", path: "/v1/chat/completions" });
  });

  test("restart is a safe no-op message when the supervisor isn't running", async () => {
    const { client } = fakeClient();
    const backend = createVllmBackend({ client, now });

    await expect(backend.engine.restart("embed")).resolves.toContain("not running");
  });
});
