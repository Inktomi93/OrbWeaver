// backends/openrouter image — imageEmbed (multimodal embeddings `input` from image / text / multimodal
// kinds; bytes → data URL, string → passthrough) and generateImage (chat.send with image modality; data:
// URL → base64 split). The SDK client is a hand-built fake.
//
// MA-6: the runners take an injected `NormalizeImageBytes` op (GIF → first-frame PNG via a real sharp
// transform, else passthrough). The op is NOT stubbed here (the ct-stub-lie lesson) — the tests build the
// REAL `createImageNormalizer` over a FAKE sharp adapter so the sniff/decode/label logic is exercised.

import { Buffer } from "node:buffer";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImageEmbedRequest, ImageGenerateRequest } from "@orb/server/infra/providers";
import { createImageNormalizer, passthroughImageNormalizer } from "@orb/server/infra/providers/backends/kit";
import { runGenerateImage, runImageEmbed } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../../../support/fixtures.ts";

const EMBED_MODEL = "qwen/qwen3-vl-embedding";
const GEN_MODEL = "openrouter/image-gen";
const CRED = {
  source: "openrouter",
  apiKey: "sk-or-secret",
  credentialId: null,
} as unknown as ResolvedCredential;

// The passthrough op (no sharp wired) is what the non-gif call sites below exercise — byte-identical
// passthrough with the historical `image/png` label.
const NORMALIZE = passthroughImageNormalizer;

// GIF89a magic ("GIF8" + "9a") — the sniff gate; the trailing bytes stand in for the animated payload.
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00]);
// PNG magic — a non-gif input that must pass through byte-identically.
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad]);
// The fake sharp adapter's first-frame-PNG output (a recognizable marker, distinct from the GIF input).
const DECODED_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xbe, 0xef, 0xca, 0xfe]);

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

/** Decode a `data:<mime>;base64,<b64>` URL back into its `{ mime, bytes }`. */
function decodeDataUrl(url: string): { mime: string; bytes: Uint8Array } {
  const semicolon = url.indexOf(";");
  const comma = url.indexOf(",");
  return {
    mime: url.slice("data:".length, semicolon),
    bytes: new Uint8Array(Buffer.from(url.slice(comma + 1), "base64")),
  };
}

describe("runImageEmbed", () => {
  test("text kind → a plain string/array input; carries model back", async () => {
    const { client, captured } = imageEmbedClient({
      data: [{ embedding: [0.1, 0.2], index: 0, object: "embedding" }],
      model: EMBED_MODEL,
      object: "list",
    });
    const result = await runImageEmbed(client, embedReq({ kind: "text", input: "a cat" }), NORMALIZE);
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
    await runImageEmbed(client, embedReq({ kind: "image", input: [new Uint8Array([1, 2, 3]), "https://img.example/x.png"] }), NORMALIZE);
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
    await runImageEmbed(client, embedReq({ kind: "multimodal", input: { image: "https://i/x.png", text: "caption" } }), NORMALIZE);
    const input = captured.body?.["input"];
    const parts = Array.isArray(input) ? contentOf(input[0]) : [];
    expect(parts[0]?.type).toBe("image_url");
    expect(parts[1]).toEqual({ type: "text", text: "caption" });
  });

  test("MA-6: a GIF image input is decoded to first-frame PNG (via the real normalizer over a fake sharp)", async () => {
    const calls: Uint8Array[] = [];
    const normalize = createImageNormalizer((bytes) => {
      calls.push(bytes);
      return Promise.resolve(DECODED_PNG);
    });
    const { client, captured } = imageEmbedClient({
      data: [{ embedding: [0.1], index: 0, object: "embedding" }],
      model: EMBED_MODEL,
      object: "list",
    });
    await runImageEmbed(client, embedReq({ kind: "image", input: GIF_BYTES }), normalize);
    const input = captured.body?.["input"];
    const url = contentOf(Array.isArray(input) ? input[0] : undefined)[0]?.imageUrl?.url ?? "";
    const decoded = decodeDataUrl(url);
    expect(decoded.mime).toBe("image/png");
    expect([...decoded.bytes]).toEqual([...DECODED_PNG]);
    // The sharp transform was fed the ORIGINAL gif bytes exactly once.
    expect(calls).toHaveLength(1);
    expect([...(calls[0] ?? [])]).toEqual([...GIF_BYTES]);
  });

  test("MA-6: a non-gif (PNG) input passes through byte-identically — sharp is never called", async () => {
    let called = false;
    const normalize = createImageNormalizer(() => {
      called = true;
      return Promise.resolve(DECODED_PNG);
    });
    const { client, captured } = imageEmbedClient({
      data: [{ embedding: [0.1], index: 0, object: "embedding" }],
      model: EMBED_MODEL,
      object: "list",
    });
    await runImageEmbed(client, embedReq({ kind: "image", input: PNG_BYTES }), normalize);
    const input = captured.body?.["input"];
    const url = contentOf(Array.isArray(input) ? input[0] : undefined)[0]?.imageUrl?.url ?? "";
    const decoded = decodeDataUrl(url);
    expect(decoded.mime).toBe("image/png");
    expect([...decoded.bytes]).toEqual([...PNG_BYTES]);
    expect(called).toBe(false);
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
    const result = await runGenerateImage(client, req, NORMALIZE);
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
    await expect(runGenerateImage(client, req, NORMALIZE)).rejects.toMatchObject({ kind: "server" });
  });
});

// ── I2: the widened request (edit / references / negative fold / size hint) + the edit-strip belt ──

const OK_RESPONSE = {
  choices: [{ finishReason: "stop", index: 0, message: { role: "assistant", images: [{ imageUrl: { url: "data:image/png;base64,AAAA" } }] } }],
  created: 0,
  id: "g",
  model: GEN_MODEL,
  systemFingerprint: null,
  usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1, cost: 0.04 },
};

// FABRICATION-OK: minimal ModelCapability double — the runner reads only `capability.input.imageEdit`.
const EDIT_CAPABLE = { input: { vision: true, imageEdit: true } } as unknown as ImageGenerateRequest["capability"];

function genReq(over: Partial<ImageGenerateRequest> = {}): ImageGenerateRequest {
  return { credential: CRED, model: castId<ModelId>(GEN_MODEL), prompt: "a fox", ...over };
}

interface UserMessage {
  readonly role?: string;
  readonly content?: string | readonly ContentPart[];
}
function userContent(body: Record<string, unknown> | undefined): string | readonly ContentPart[] {
  const messages = (body?.["messages"] ?? []) as readonly UserMessage[];
  return messages.find((m) => m.role === "user")?.content ?? [];
}

describe("runGenerateImage — widened request (I2)", () => {
  test("text-only is byte-identical to the pre-widening turn (plain-string content, no warnings)", async () => {
    const { client, captured } = genClient(OK_RESPONSE);
    const result = await runGenerateImage(client, genReq(), NORMALIZE);
    expect(userContent(captured.body)).toBe("a fox");
    expect(result.warnings).toEqual([]);
  });

  test("the negative prompt folds into a trailing 'Do not include:' line", async () => {
    const { client, captured } = genClient(OK_RESPONSE);
    await runGenerateImage(client, genReq({ negativePrompt: "watermark, text" }), NORMALIZE);
    expect(userContent(captured.body)).toBe("a fox\nDo not include: watermark, text");
  });

  test("size rides the SDK image-config hint map", async () => {
    const { client, captured } = genClient(OK_RESPONSE);
    await runGenerateImage(client, genReq({ size: { width: 1024, height: 1536 } }), NORMALIZE);
    expect(captured.body?.["imageConfig"]).toEqual({ width: 1024, height: 1536 });
  });

  test("an edit + references become image_url parts before the text (capable model)", async () => {
    const { client, captured } = genClient(OK_RESPONSE);
    await runGenerateImage(
      client,
      genReq({ capability: EDIT_CAPABLE, edit: { image: new Uint8Array([1, 2, 3]), references: ["https://ref/a.png"] } }),
      NORMALIZE,
    );
    const content = userContent(captured.body);
    const parts = (Array.isArray(content) ? content : []) as readonly ContentPart[];
    expect(parts[0]?.type).toBe("image_url");
    expect(parts[0]?.imageUrl?.url?.startsWith("data:image/png;base64,")).toBe(true);
    expect(parts[1]?.imageUrl?.url).toBe("https://ref/a.png");
    expect(parts[2]).toEqual({ type: "text", text: "a fox" });
  });

  test("MA-6: a GIF edit image is decoded to first-frame PNG before the wire", async () => {
    const normalize = createImageNormalizer(async () => DECODED_PNG);
    const { client, captured } = genClient(OK_RESPONSE);
    await runGenerateImage(client, genReq({ capability: EDIT_CAPABLE, edit: { image: GIF_BYTES } }), normalize);
    const content = userContent(captured.body);
    const parts = (Array.isArray(content) ? content : []) as readonly ContentPart[];
    const decoded = decodeDataUrl(parts[0]?.imageUrl?.url ?? "");
    expect(decoded.mime).toBe("image/png");
    expect([...decoded.bytes]).toEqual([...DECODED_PNG]);
  });

  test("references clamp at 4 (image + 4 refs + text = 6 parts)", async () => {
    const { client, captured } = genClient(OK_RESPONSE);
    const references = ["r0", "r1", "r2", "r3", "r4", "r5"];
    await runGenerateImage(client, genReq({ capability: EDIT_CAPABLE, edit: { image: "init", references } }), NORMALIZE);
    const content = userContent(captured.body);
    expect(Array.isArray(content) ? content.length : 0).toBe(6);
  });

  test("BELT: an edit whose model lacks imageEdit is stripped + warned, never thrown", async () => {
    const { client, captured } = genClient(OK_RESPONSE);
    const result = await runGenerateImage(client, genReq({ edit: { image: new Uint8Array([1, 2, 3]) } }), NORMALIZE);
    // Stripped: the content fell back to the plain text→image string, no image parts.
    expect(userContent(captured.body)).toBe("a fox");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("image_edit_dropped");
    // Never a throw — a real image still came back.
    expect(result.images).toHaveLength(1);
  });

  test("BELT: a mask on a capable model is dropped with the same code (no chat-completions mask channel)", async () => {
    const { client } = genClient(OK_RESPONSE);
    const result = await runGenerateImage(client, genReq({ capability: EDIT_CAPABLE, edit: { image: "init", mask: "m" } }), NORMALIZE);
    expect(result.warnings.map((w) => w.code)).toEqual(["image_edit_dropped"]);
  });
});
