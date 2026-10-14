// Only raw vendor HTTP bytes vary. Resolution, structured validation, vector decoding and accounting stay real.
import { z } from "zod";
import type { TerminalFrameOptions } from "./provider-stream.ts";
import { terminalSseLine } from "./provider-stream.ts";

export const CORPUS_PROVIDER_ENDPOINT = "http://127.0.0.1:8704/v1";
export const CORPUS_EMBED_MODEL = "corpus-embed-v1";
export const CORPUS_TEXT_MODEL = "corpus-text-v1";
export const CORPUS_EMBEDDING_VECTOR = [1, 0, 0] as const;

export const CORPUS_STRUCTURED_REPLIES: ReadonlyMap<string, string> = new Map([
  [
    "run_analysis",
    JSON.stringify({
      arcStatus: "active",
      updatedArc: "Preserve the orbital ledger.",
      successorArc: null,
      twistOps: [{ op: "add", twist: "A courier brings the missing loom tool." }],
      guidance: "Keep the ledger's witnesses and completed scenes consistent.",
    }),
  ],
  [
    "character_distillation",
    JSON.stringify({
      genre: "science-fiction",
      subGenres: ["space-opera"],
      tone: "whimsical",
      setting: "An orbital loom",
      tags: ["loom", "traveller", "orbit"],
      elevatorPitch: "A traveller repairs the orbital loom.",
      overview: "The traveller keeps habitats bound together by the loom.",
    }),
  ],
  [
    "image_breakdown",
    JSON.stringify({
      caption: "An illustrated traveller stands beside an orbital loom.",
      artStyle: "illustration",
      palette: "cool",
      mood: "serene",
      rating: "safe",
      shotType: "portrait",
      cameraAngle: "eye-level",
      gender: "none",
      coverage: "fully-covered",
      bodyType: "not-applicable",
      chestSize: "not-applicable",
      skinTone: "not-applicable",
      outfitType: "other",
      clothingState: "intact",
      nudityLevel: "none",
      exposedParts: [],
      tags: ["traveller", "loom", "orbit"],
    }),
  ],
]);

interface CorpusProviderScript {
  readonly baseUrl?: string;
  readonly modelIds: readonly string[];
  readonly embedding: readonly number[];
  readonly chatText: string;
  readonly structuredReplies: ReadonlyMap<string, string>;
  readonly images: Uint8Array[];
  readonly usage?: TerminalFrameOptions["usage"];
  readonly toolCall?: { readonly name: string; readonly argumentsJson: string };
}

const requestSchema = z.object({
  model: z.string(),
  input: z.union([z.string(), z.array(z.string())]).optional(),
  stream: z.boolean().optional(),
  n: z.int().positive().optional(),
  tools: z.array(z.object({ type: z.literal("function"), function: z.object({ name: z.string() }) })).optional(),
  ["response_format"]: z.object({ ["json_schema"]: z.object({ name: z.string() }).optional() }).optional(),
});

type ProviderRequest = z.infer<typeof requestSchema>;
interface CorpusProviderExecution {
  readonly execute: typeof fetch;
  readonly requests: string[];
}

function embeddingReply(script: CorpusProviderScript, fields: ProviderRequest): Response {
  if (fields.input === undefined) {
    throw new Error("corpus embedding request has no physical input");
  }
  const inputs = typeof fields.input === "string" ? [fields.input] : fields.input;
  const data = inputs.map((_, index) => `{"object":"embedding","index":${index},"embedding":${JSON.stringify(script.embedding)}}`).join(",");
  return new Response(`{"object":"list","model":${JSON.stringify(fields.model)},"data":[${data}]}`, {
    headers: { "content-type": "application/json" },
  });
}

function imageReply(script: CorpusProviderScript, fields: ProviderRequest): Response {
  if (fields.n === undefined || script.images.length < fields.n) {
    throw new Error("corpus image request exceeds its supplied physical image bytes");
  }
  const data = script.images
    .splice(0, fields.n)
    .map((bytes) => `{"b64_json":${JSON.stringify(Buffer.from(bytes).toString("base64"))}}`)
    .join(",");
  return new Response(`{"created":0,"data":[${data}]}`, { headers: { "content-type": "application/json" } });
}

function chatReply(script: CorpusProviderScript, fields: ProviderRequest): Response {
  const name = fields.response_format?.json_schema?.name;
  const text = name === undefined ? script.chatText : script.structuredReplies.get(name);
  if (text === undefined) {
    throw new Error(`unscripted corpus structured response: ${name}`);
  }
  const tool = (fields.tools?.length ?? 0) === 0 ? undefined : script.toolCall;
  if (tool !== undefined && !fields.tools?.some((offered) => offered.function.name === tool.name)) {
    throw new Error(
      `corpus provider was not offered its scripted tool: ${tool.name}; offered ${(fields.tools ?? []).map((offered) => offered.function.name).join(", ")}`,
    );
  }
  if (fields.stream === true) {
    const delta =
      tool === undefined
        ? `{"content":${JSON.stringify(text)}}`
        : `{"content":${JSON.stringify(text)},"tool_calls":[{"index":0,"id":"corpus-tool-call","type":"function","function":{"name":${JSON.stringify(tool.name)},"arguments":${JSON.stringify(tool.argumentsJson)}}}]}`;
    return new Response(
      `data: {"choices":[{"delta":${delta}}]}\n\n${terminalSseLine({ finishReason: tool === undefined ? "stop" : "tool_calls", ...(script.usage === undefined ? {} : { usage: script.usage }) })}\n\ndata: [DONE]\n\n`,
      {
        headers: { "content-type": "text/event-stream" },
      },
    );
  }
  if (tool !== undefined) {
    throw new Error("corpus tool execution requires the actual streaming chat request");
  }
  return new Response(
    `{"id":"corpus-completion","object":"chat.completion","created":0,"model":${JSON.stringify(fields.model)},"choices":[{"index":0,"message":{"role":"assistant","content":${JSON.stringify(text)}},"finish_reason":"stop"}]}`,
    {
      headers: { "content-type": "application/json" },
    },
  );
}

function postReply(script: CorpusProviderScript, path: string, fields: ProviderRequest): Response {
  if (!script.modelIds.includes(fields.model)) {
    throw new Error(`unscripted corpus provider model: ${fields.model}`);
  }
  switch (path) {
    case "/v1/embeddings":
      return embeddingReply(script, fields);
    case "/v1/images/generations":
      return imageReply(script, fields);
    case "/v1/chat/completions":
      return chatReply(script, fields);
    default:
      throw new Error(`unscripted corpus provider execution: POST ${path}`);
  }
}

/** Shared physical input for corpus producers, never a role-client, Resolved or persistence substitute. */
export function createCorpusProviderExecution(script: CorpusProviderScript): CorpusProviderExecution {
  const endpoint = new URL(script.baseUrl ?? CORPUS_PROVIDER_ENDPOINT);
  const requests: string[] = [];
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    requests.push(`${request.method} ${path}`);
    if (url.origin !== endpoint.origin) {
      throw new Error(`unscripted corpus provider origin: ${url.origin}`);
    }
    if (request.method === "GET" && path === "/v1/models") {
      const data = script.modelIds.map((id) => `{"id":${JSON.stringify(id)},"object":"model","created":0,"owned_by":"corpus"}`).join(",");
      return new Response(`{"data":[${data}]}`, { headers: { "content-type": "application/json" } });
    }
    if (request.method !== "POST") {
      throw new Error(`unscripted corpus provider execution: ${request.method} ${path}`);
    }
    return postReply(script, path, requestSchema.parse(await request.json()));
  };
  return { execute, requests };
}
