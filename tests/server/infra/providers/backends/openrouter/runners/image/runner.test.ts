// backends/openrouter image — imageEmbed (multimodal embeddings `input` from image / text / multimodal
// kinds; bytes → data URL, string → passthrough) and generateImage (chat.send with image modality; data:
// URL → base64 split). The SDK client is a hand-built fake.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImageEmbedRequest, ImageGenerateRequest } from "@orb/server/infra/providers";
import { runGenerateImage, runImageEmbed } from "@orb/server/infra/providers/backends/openrouter";
import { describe, expect, test } from "vitest";

const EMBED_MODEL = "qwen/qwen3-vl-embedding";
const GEN_MODEL = "openrouter/image-gen";
const CRED = {
  source: "openrouter",
  apiKey: "sk-or-secret",
  credentialId: null,
} as unknown as ResolvedCredential;

type EmbedClient = Parameters<typeof runImageEmbed>[0];
type GenClient = Parameters<typeof runGenerateImage>[0];

interface Captured {
  body: Record<string, unknown> | undefined;
}

function imageEmbedClient(response: unknown): { client: EmbedClient; captured: Captured } {
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

function genClient(response: unknown): { client: GenClient; captured: Captured } {
  const captured: Captured = { body: undefined };
  const client = {
    chat: {
      send: (req: { chatRequest: Record<string, unknown> }): Promise<unknown> => {
        captured.body = req.chatRequest;
        return Promise.resolve(response);
      },
    },
  } as unknown as GenClient;
  return { client, captured };
}

function embedReq(input: ImageEmbedRequest["input"]): ImageEmbedRequest {
  return { credential: CRED, model: castId<ModelId>(EMBED_MODEL), input };
}

// The captured embeddings `input` items are typed `{}` (read off an unknown body), so read the multimodal
// `content` parts through a minimal shape.
interface ContentPart {
  readonly type?: string;
  readonly imageUrl?: { readonly url?: string };
  readonly text?: string;
}
function contentOf(item: unknown): readonly ContentPart[] {
  return (item as { content?: readonly ContentPart[] }).content ?? [];
}

describe("runImageEmbed", () => {
  test("text kind → a plain string/array input; carries model back", async () => {
    const { client, captured } = imageEmbedClient({
      data: [{ embedding: [0.1, 0.2], index: 0, object: "embedding" }],
      model: EMBED_MODEL,
      object: "list",
    });
    const result = await runImageEmbed(client, embedReq({ kind: "text", input: "a cat" }));
    expect(captured.body?.["input"]).toBe("a cat");
    expect(result.model).toBe(EMBED_MODEL);
    expect(Array.from(result.vectors[0] ?? [])).toHaveLength(2);
  });

  test("image kind: bytes → a base64 data-URL content part; string → passthrough URL", async () => {
    const { client, captured } = imageEmbedClient({
      data: [
        { embedding: [0.1], index: 0, object: "embedding" },
        { embedding: [0.2], index: 1, object: "embedding" },
      ],
      model: EMBED_MODEL,
      object: "list",
    });
    await runImageEmbed(
      client,
      embedReq({ kind: "image", input: [new Uint8Array([1, 2, 3]), "https://img.example/x.png"] }),
    );
    const input = captured.body?.["input"];
    const items = Array.isArray(input) ? input : [];
    const firstUrl = contentOf(items[0])[0]?.imageUrl?.url ?? "";
    const secondUrl = contentOf(items[1])[0]?.imageUrl?.url ?? "";
    expect(firstUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(secondUrl).toBe("https://img.example/x.png");
  });

  test("multimodal kind: image + text become two content parts", async () => {
    const { client, captured } = imageEmbedClient({
      data: [{ embedding: [0.9], index: 0, object: "embedding" }],
      model: EMBED_MODEL,
      object: "list",
    });
    await runImageEmbed(
      client,
      embedReq({ kind: "multimodal", input: { image: "https://i/x.png", text: "caption" } }),
    );
    const input = captured.body?.["input"];
    const parts = Array.isArray(input) ? contentOf(input[0]) : [];
    expect(parts[0]?.type).toBe("image_url");
    expect(parts[1]).toEqual({ type: "text", text: "caption" });
  });
});

describe("runGenerateImage", () => {
  test("requests the image modality and splits a data: URL into base64 + mediaType", async () => {
    const { client, captured } = genClient({
      choices: [
        {
          finishReason: "stop",
          index: 0,
          message: {
            role: "assistant",
            images: [{ imageUrl: { url: "data:image/png;base64,AAAA" } }],
          },
        },
      ],
      created: 0,
      id: "g",
      model: GEN_MODEL,
      systemFingerprint: null,
      usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1, cost: 0.04 },
    });
    const req: ImageGenerateRequest = {
      credential: CRED,
      model: castId<ModelId>(GEN_MODEL),
      prompt: "a fox",
    };
    const result = await runGenerateImage(client, req);
    expect(captured.body?.["modalities"]).toEqual(["text", "image"]);
    expect(result.images[0]).toEqual({
      url: undefined,
      base64: "AAAA",
      mediaType: "image/png",
    });
    expect(result.usage.costUsd).toBe(0.04);
  });

  test("fail-closes when no images are returned", async () => {
    const { client } = genClient({
      choices: [{ finishReason: "stop", index: 0, message: { role: "assistant" } }],
      created: 0,
      id: "g",
      model: GEN_MODEL,
      systemFingerprint: null,
    });
    const req: ImageGenerateRequest = {
      credential: CRED,
      model: castId<ModelId>(GEN_MODEL),
      prompt: "x",
    };
    await expect(runGenerateImage(client, req)).rejects.toMatchObject({ kind: "server" });
  });
});
