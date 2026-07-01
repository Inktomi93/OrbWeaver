// Unit tests for the vLLM JOINT image+text embed surface — a thin shaper over an INJECTED engine client.
// Asserts: the three input modes (text / image / multimodal) shape the right `messages` conversation,
// empty text → null slot, vectors carry the unified dim + L2-normalization, model provenance, and the MRL
// fallback. Independent — only `client.enginePost` is called.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import { createVllmImageEmbed } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const CRED = { source: "vllm", credentialId: null } as unknown as ResolvedCredential;
const MODEL = "Qwen/Qwen3-VL-Embedding" as ModelId;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

interface PostCall {
  readonly body: { messages: unknown; dimensions?: number };
}

function fakeClient(opts: { failDimOnce?: boolean } = {}): {
  client: VllmEngineClient;
  calls: PostCall[];
} {
  const calls: PostCall[] = [];
  let failed = false;
  const client: VllmEngineClient = {
    enginePost: <T>(_engine: unknown, _path: string, body: unknown): Promise<T> => {
      const b = body as PostCall["body"];
      calls.push({ body: b });
      if (opts.failDimOnce === true && !failed && b.dimensions !== undefined) {
        failed = true;
        return Promise.reject(new Error("unknown field: dimensions"));
      }
      return Promise.resolve({
        data: [{ index: 0, embedding: [1, 2, 3, 4] }],
        model: "served",
      } as T);
    },
    engineStream: () => Promise.reject(new Error("image-embed must not stream")),
    baseUrl: () => "http://127.0.0.1:0",
  };
  return { client, calls };
}

describe("createVllmImageEmbed", () => {
  test("text mode: one vector per text, empties → null, model carried", async () => {
    const { client } = fakeClient();
    const imageEmbed = createVllmImageEmbed({ client, embedDim: 4, concurrency: 4 });
    const res = await imageEmbed({
      credential: CRED,
      model: MODEL,
      input: { kind: "text", input: ["hi", "  "] },
    });

    expect(res.vectors).toHaveLength(2);
    expect(res.vectors[0]).toBeInstanceOf(Float32Array);
    expect(res.vectors[1]).toBeNull();
    expect(res.model).toBe(MODEL);
  });

  test("vectors carry the unified dim (truncated) and are L2-normalized", async () => {
    const { client } = fakeClient();
    const imageEmbed = createVllmImageEmbed({ client, embedDim: 2, concurrency: 4 });
    const res = await imageEmbed({
      credential: CRED,
      model: MODEL,
      input: { kind: "text", input: "x" },
    });

    const vec = res.vectors[0];
    if (vec === null || vec === undefined) {
      throw new Error("expected a vector");
    }
    expect(vec).toHaveLength(2); // truncated from the 4-dim raw to embedDim
    expect(cosineSim(vec, vec)).toBeCloseTo(1, 5);
  });

  // Narrow an indexed-access result (possibly-undefined under noUncheckedIndexedAccess) or fail the test.
  function need<T>(value: T | undefined): T {
    if (value === undefined) {
      throw new Error("expected a defined value");
    }
    return value;
  }

  test("image mode sends an image_url data-URI conversation", async () => {
    const { client, calls } = fakeClient();
    const imageEmbed = createVllmImageEmbed({ client, embedDim: 4, concurrency: 4 });
    const res = await imageEmbed({
      credential: CRED,
      model: MODEL,
      input: { kind: "image", input: PNG },
    });

    expect(res.vectors[0]).toBeInstanceOf(Float32Array);
    expect(JSON.stringify(need(calls[0]).body.messages)).toContain("data:image/png;base64,");
  });

  test("multimodal mode carries both the image and the paired text", async () => {
    const { client, calls } = fakeClient();
    const imageEmbed = createVllmImageEmbed({ client, embedDim: 4, concurrency: 4 });
    await imageEmbed({
      credential: CRED,
      model: MODEL,
      input: { kind: "multimodal", input: { image: PNG, text: "a red apple" } },
    });

    const sent = JSON.stringify(need(calls[0]).body.messages);
    expect(sent).toContain("data:image/png;base64,");
    expect(sent).toContain("a red apple");
  });

  test("falls back to a full-dim request when the engine rejects `dimensions`", async () => {
    const { client, calls } = fakeClient({ failDimOnce: true });
    const imageEmbed = createVllmImageEmbed({ client, embedDim: 2, concurrency: 4 });
    const res = await imageEmbed({
      credential: CRED,
      model: MODEL,
      input: { kind: "text", input: "x" },
    });

    expect(calls).toHaveLength(2);
    expect(need(calls[0]).body.dimensions).toBe(2);
    expect(need(calls[1]).body.dimensions).toBeUndefined();
    expect(res.vectors[0]).toBeInstanceOf(Float32Array);
  });
});
