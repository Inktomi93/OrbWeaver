// backends/openrouter embed — carries `dimensions`/`inputType` to the wire and `model` back (the
// embedding-space provenance), converts `number[]` AND base64 embeddings into `Float32Array`, sorts by
// index, and fail-closes on an empty/non-JSON body. The SDK client is a hand-built fake.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { EmbedRequest } from "@orb/server/infra/providers";
import { runEmbed } from "@orb/server/infra/providers/backends/openrouter";
import { describe, expect, test } from "vitest";

const MODEL = "qwen/qwen3-embedding";
const CRED = {
  source: "openrouter",
  apiKey: "sk-or-secret",
  credentialId: null,
} as unknown as ResolvedCredential;

type EmbedClient = Parameters<typeof runEmbed>[0];

function makeRequest(overrides: Partial<EmbedRequest> = {}): EmbedRequest {
  const base: EmbedRequest = {
    credential: CRED,
    model: castId<ModelId>(MODEL),
    input: ["hello", "world"],
    dimensions: 1024,
  };
  return { ...base, ...overrides };
}

interface Captured {
  body: Record<string, unknown> | undefined;
}

function embedClient(response: unknown): { client: EmbedClient; captured: Captured } {
  const captured: Captured = { body: undefined };
  const client = {
    embeddings: {
      generate: (req: { requestBody: Record<string, unknown> }): Promise<unknown> => {
        captured.body = req.requestBody;
        return Promise.resolve(response);
      },
    },
  } as unknown as EmbedClient;
  return { client, captured };
}

function rejectingClient(error: unknown): EmbedClient {
  return {
    embeddings: { generate: (): Promise<unknown> => Promise.reject(error) },
  } as unknown as EmbedClient;
}

describe("runEmbed", () => {
  test("converts number[] embeddings, sorts by index, carries dimensions + model", async () => {
    const { client, captured } = embedClient({
      data: [
        { embedding: [0.3, 0.4], index: 1, object: "embedding" },
        { embedding: [0.1, 0.2], index: 0, object: "embedding" },
      ],
      model: "qwen/qwen3-embedding",
      object: "list",
      usage: { promptTokens: 7, totalTokens: 7 },
    });
    const result = await runEmbed(client, makeRequest());
    expect(captured.body?.["dimensions"]).toBe(1024);
    expect(result.model).toBe("qwen/qwen3-embedding");
    expect(result.usage).toEqual({ promptTokens: 7, totalTokens: 7 });
    // sorted by index: vector 0 first
    expect(Array.from(result.vectors[0] ?? [])).toEqual([0.1, 0.2].map(toF32));
    expect(Array.from(result.vectors[1] ?? [])).toEqual([0.3, 0.4].map(toF32));
  });

  test("decodes a base64 embedding into a Float32Array", async () => {
    const base64 = Buffer.from(new Float32Array([0.5, -0.25]).buffer).toString("base64");
    const { client } = embedClient({
      data: [{ embedding: base64, index: 0, object: "embedding" }],
      model: MODEL,
      object: "list",
      usage: { promptTokens: 1, totalTokens: 1 },
    });
    const result = await runEmbed(client, makeRequest({ input: "x" }));
    expect(Array.from(result.vectors[0] ?? [])).toEqual([0.5, -0.25]);
  });

  test("fail-closes on an empty vector set", async () => {
    const { client } = embedClient({ data: [], model: MODEL, object: "list" });
    await expect(runEmbed(client, makeRequest())).rejects.toMatchObject({ kind: "server" });
  });

  test("a 402 surfaces as a typed billing ProviderError", async () => {
    const client = rejectingClient(Object.assign(new Error("no credit"), { statusCode: 402 }));
    await expect(runEmbed(client, makeRequest())).rejects.toMatchObject({
      kind: "billing",
      retryable: false,
    });
  });
});

// Round-trip a number through a Float32Array to match the precision the runner produces.
function toF32(n: number): number {
  return new Float32Array([n])[0] ?? n;
}
