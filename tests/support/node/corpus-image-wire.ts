// Raw provider JSON and multipart are the only substitutions; no parsed image result or account policy is supplied.
import { readSeedAvatar } from "@orb/default-content";
import { WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import sharp from "sharp";
import { z } from "zod";
import { CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import { terminalSseLine } from "./provider-stream.ts";

export const CORPUS_VARIANT_IMAGE_MODEL = "corpus-output-image-v1";
export const CORPUS_VARIANT_EDIT_MODEL = "corpus-output-edit-v1";
export const CORPUS_VARIANT_TEXT_MODEL = "corpus-output-caption-v1";
export const CORPUS_VARIANT_KEY = "synthetic-private-image-variant-key";
export const CORPUS_VARIANT_PROMPT = "a blue-coated traveller beside an orbital loom";
const IMAGE_MODELS = [CORPUS_VARIANT_IMAGE_MODEL, CORPUS_VARIANT_EDIT_MODEL] as const;
const jsonRequestSchema = z.object({ model: z.string(), prompt: z.string(), n: z.int().positive() });
const chatRequestSchema = z.object({ model: z.string(), stream: z.boolean().optional() });
interface ImageRequest {
  readonly path: string;
  readonly model: string;
  readonly prompt: string;
  readonly n: number;
  readonly authenticated: boolean;
  readonly sourceBytes: Uint8Array | null;
  readonly sourceMime: string | null;
}
export interface CorpusImageWire {
  readonly posts: readonly string[];
  readonly images: readonly ImageRequest[];
  readonly captions: readonly { readonly authenticated: boolean; readonly body: string }[];
  readonly remaining: () => number;
  readonly wrap: (execute: typeof fetch) => typeof fetch;
}

function captionReply(fields: z.output<typeof chatRequestSchema>): Response {
  if (fields.stream === true) {
    return new Response(
      `data: {"choices":[{"delta":{"content":${JSON.stringify(CORPUS_VARIANT_PROMPT)}}}]}\n\n${terminalSseLine({ usage: { promptTokens: 40, completionTokens: 15 } })}\n\ndata: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    );
  }
  return new Response(
    `{"id":"image-caption","object":"chat.completion","created":0,"model":${JSON.stringify(fields.model)},"choices":[{"index":0,"message":{"role":"assistant","content":${JSON.stringify(CORPUS_VARIANT_PROMPT)}},"finish_reason":"stop"}],"usage":{"prompt_tokens":40,"completion_tokens":15}}`,
    { headers: { "content-type": "application/json" } },
  );
}

async function captionResponse(request: Request, authenticated: boolean, captions: CorpusImageWire["captions"][number][]): Promise<Response | undefined> {
  const body = await request.clone().text();
  const fields = chatRequestSchema.parse(JSON.parse(body));
  if (fields.model !== CORPUS_VARIANT_TEXT_MODEL) {
    return undefined;
  }
  captions.push({ authenticated, body });
  return captionReply(fields);
}

async function imageRequest(request: Request, path: string, authenticated: boolean): Promise<ImageRequest | undefined> {
  if (path.endsWith("/images/edits")) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Only the fixture-controlled SDK outbound request is parsed; the native case verifies its one selected local image and exact instruction.
    const form = await request.clone().formData();
    const fields = jsonRequestSchema.parse({ model: form.get("model"), prompt: form.get("prompt"), n: Number(form.get("n")) });
    const image = form.get("image");
    if (!(image instanceof File)) {
      throw new Error("real native edit did not send its image as a multipart file");
    }
    return { path, ...fields, authenticated, sourceBytes: new Uint8Array(await image.arrayBuffer()), sourceMime: image.type };
  }
  if (path.endsWith("/images/generations")) {
    return { path, ...jsonRequestSchema.parse(await request.clone().json()), authenticated, sourceBytes: null, sourceMime: null };
  }
  return undefined;
}

function imageReply(bytes: Uint8Array | undefined, usage: string | undefined, n: number): Response {
  if (bytes === undefined || usage === undefined || n !== 1) {
    throw new Error("native image variant exceeded its physical recipe");
  }
  return new Response(`{"created":0,"data":[{"b64_json":${JSON.stringify(Buffer.from(bytes).toString("base64"))}}]${usage}}`, {
    headers: { "content-type": "application/json" },
  });
}

/** Distinct valid vendor pixels avoid CAS aliasing unrelated generation provenance. */
export async function createCorpusImageWire(): Promise<CorpusImageWire> {
  const avatar = await readSeedAvatar(WELCOME_ASSISTANT_HANDLE);
  if (avatar === null) {
    throw new Error("bundled image variant pixels are missing");
  }
  const pixels = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      sharp(Buffer.from(avatar.bytes))
        .resize({ width: 72 + index, height: 80 + index })
        .png()
        .toBuffer(),
    ),
  );
  const usages = [
    "",
    ',"usage":{"input_tokens":19,"output_tokens":7,"input_tokens_details":{"text_tokens":4,"image_tokens":12},"output_tokens_details":{"image_tokens":5}}',
    ',"usage":{"input_tokens":0,"output_tokens":0,"input_tokens_details":{"text_tokens":0,"image_tokens":0,"cached_tokens":0},"output_tokens_details":{"image_tokens":0,"reasoning_tokens":0}}',
    ',"usage":{"input_tokens":23,"output_tokens":11,"input_tokens_details":{"text_tokens":3,"image_tokens":17,"cached_tokens":2},"output_tokens_details":{"image_tokens":9}}',
  ];
  const posts: string[] = [];
  const images: ImageRequest[] = [];
  const captions: CorpusImageWire["captions"][number][] = [];
  let cursor = 0;
  return {
    posts,
    images,
    captions,
    remaining: () => pixels.length - cursor,
    wrap:
      (execute) =>
      async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin !== new URL(CORPUS_PROVIDER_ENDPOINT).origin || request.method !== "POST") {
          return await execute(request);
        }
        posts.push(url.pathname);
        const authenticated = request.headers.get("authorization") === `Bearer ${CORPUS_VARIANT_KEY}`;
        if (url.pathname.endsWith("/chat/completions")) {
          return (await captionResponse(request, authenticated, captions)) ?? (await execute(request));
        }
        const fields = await imageRequest(request, url.pathname, authenticated);
        if (fields === undefined || !IMAGE_MODELS.some((model) => model === fields.model)) {
          return await execute(request);
        }
        const response = imageReply(pixels[cursor], usages[cursor], fields.n);
        images.push(fields);
        cursor += 1;
        return response;
      },
  };
}
