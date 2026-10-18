// Only raw vendor HTTP bytes vary. Resolution, structured validation, vector decoding and accounting stay real.
import { createHash } from "node:crypto";
import { getLog } from "@orb/server/foundation/observability";
import { drainHttpServer, serveHttpServer } from "@orb/server/infra/network";
import { z } from "zod";
import type { TerminalFrameOptions } from "./provider-stream.ts";
import { terminalSseLine } from "./provider-stream.ts";

export const CORPUS_PROVIDER_ENDPOINT = "http://127.0.0.1:8704/v1";
export const CORPUS_EMBED_MODEL = "corpus-embed-v2";
export const CORPUS_TEXT_MODEL = "corpus-text-v1";
const EMBEDDING_DIGEST = "sha512";
const BYTE_MIDPOINT = 0xff / 2;
export const CORPUS_EMBEDDING_VECTOR: readonly number[] = Object.freeze(
  Array.from({ length: createHash(EMBEDDING_DIGEST).digest().length }, (_, index) => Number(index === 0)),
);

/** Stable synthetic geometry retains controlled case/whitespace neighbors without collapsing unrelated inputs. */
export function corpusEmbeddingForText(text: string): readonly number[] {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  return Array.from(createHash(EMBEDDING_DIGEST).update(normalized).digest(), (byte) => (byte - BYTE_MIDPOINT) / BYTE_MIDPOINT);
}
export const CORPUS_REFINERY_SCHEMA_NAME = "corpus_refinery_score";
export const CORPUS_REFINERY_SCHEMA_REVISION = "corpus_refinery_score_revision";

const CUSTOM_SCORE_REPLY = JSON.stringify({ overallScore: 8, notes: "The keeper preserves the ledger's character." });

export const CORPUS_STRUCTURED_REPLIES: ReadonlyMap<string, string> = new Map([
  [
    "comparison_narrative",
    JSON.stringify({ summary: "Both keepers preserve the ledger.", overlap: "Their careful curiosity.", distinction: "One guards the orbital witnesses." }),
  ],
  ["card_answer", JSON.stringify({ answer: "The keeper remembers the orbital ledger.", grounded: true })],
  [
    "refinery_score",
    JSON.stringify({
      fieldScores: [{ field: "description", score: 8, strengths: "A clear keeper.", weaknesses: "The task is broad.", suggestions: "Name the ledger." }],
      overallScore: 8,
      priorityImprovements: ["Make the ledger explicit."],
      summary: "The keeper has a coherent task.",
      inventedDirective: "This unrecognized model field must be itemized and stripped.",
    }),
  ],
  ["refinery_rewrite", JSON.stringify({ fields: [{ field: "description", text: "A curious keeper preserves the orbital ledger and its witnesses." }] })],
  [
    "refinery_analyze",
    JSON.stringify({
      preserved: ["The keeper's curiosity."],
      lost: [],
      gained: ["A concrete ledger."],
      soulScore: 9,
      soulAssessment: "The keeper remains the same character.",
      verdict: "ACCEPT",
      issues: [],
      recommendations: ["Keep the explicit ledger."],
    }),
  ],
  [CORPUS_REFINERY_SCHEMA_NAME, CUSTOM_SCORE_REPLY],
  [CORPUS_REFINERY_SCHEMA_REVISION, CUSTOM_SCORE_REPLY],
  ["refinery_schema_preview", CUSTOM_SCORE_REPLY],
  [
    "refinery_schema_design",
    JSON.stringify({
      name: CORPUS_REFINERY_SCHEMA_NAME,
      description: "Explain how well the card preserves the keeper.",
      fields: [{ path: "notes", type: "string", description: "Explain the score.", required: true, maxLength: 400 }],
    }),
  ],
  [
    "refinery_schema_plan",
    JSON.stringify({
      name: CORPUS_REFINERY_SCHEMA_NAME,
      description: "Explain the keeper's score.",
      fields: [{ path: "notes", intent: "Explain the score." }],
    }),
  ],
  ["refinery_schema_field", JSON.stringify({ field: { path: "notes", type: "string", description: "Explain the score.", required: true, maxLength: 400 } })],
  ["refinery_schema_hints", JSON.stringify({ hints: [{ path: "notes", role: "prose", label: "Keeper notes" }] })],
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
  readonly embedding: readonly number[] | ((input: string) => readonly number[]);
  readonly chatText: string | ((requestBody: string) => string);
  readonly structuredReplies: ReadonlyMap<string, string>;
  readonly images: Uint8Array[];
  readonly usage?: TerminalFrameOptions["usage"];
  readonly toolCall?: { readonly name: string; readonly argumentsJson: string };
  readonly completion?: (requestBody: string) => CorpusProviderCompletion | undefined;
}

/** Physical completion bytes for a request-specific script, before native provider parsing. */
export interface CorpusProviderCompletion {
  readonly text: string;
  readonly toolCalls: readonly NonNullable<CorpusProviderScript["toolCall"]>[];
  readonly usage?: TerminalFrameOptions["usage"];
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

const imageEmbeddingRequestSchema = z.object({
  ["add_generation_prompt"]: z.literal(true),
  dimensions: z.int().positive(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user"]),
        content: z
          .array(
            z.discriminatedUnion("type", [
              z.object({ type: z.literal("text"), text: z.string() }),
              z.object({ type: z.literal("image_url"), ["image_url"]: z.object({ url: z.url() }) }),
            ]),
          )
          .nonempty(),
      }),
    )
    .nonempty(),
});

function embeddingReply(script: CorpusProviderScript, fields: ProviderRequest, requestBody: string): Response {
  const { inputs, dimensions } = embeddingInputs(fields, requestBody);
  const data = inputs.map((input, index) => {
    const embedding = typeof script.embedding === "function" ? script.embedding(input) : script.embedding;
    if (dimensions !== undefined && embedding.length !== dimensions) {
      throw new Error("corpus image embedding request width does not match its scripted model");
    }
    return { object: "embedding", index, embedding };
  });
  return Response.json({ object: "list", model: fields.model, data });
}

function embeddingInputs(fields: ProviderRequest, requestBody: string): { readonly inputs: readonly string[]; readonly dimensions: number | undefined } {
  if (fields.input === undefined) {
    const conversation = imageEmbeddingRequestSchema.parse(JSON.parse(requestBody));
    return { inputs: [JSON.stringify(conversation.messages)], dimensions: conversation.dimensions };
  }
  return { inputs: typeof fields.input === "string" ? [fields.input] : fields.input, dimensions: undefined };
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

function completionText(script: CorpusProviderScript, fields: ProviderRequest, requestBody: string): string {
  const name = fields.response_format?.json_schema?.name;
  if (name === undefined) {
    return typeof script.chatText === "string" ? script.chatText : script.chatText(requestBody);
  }
  const text = script.structuredReplies.get(name);
  if (text === undefined) {
    throw new Error(`unscripted corpus structured response: ${name}`);
  }
  return text;
}

function completionCalls(
  script: CorpusProviderScript,
  fields: ProviderRequest,
  completion: CorpusProviderCompletion | undefined,
): CorpusProviderCompletion["toolCalls"] {
  const calls = completion?.toolCalls ?? ((fields.tools?.length ?? 0) === 0 || script.toolCall === undefined ? [] : [script.toolCall]);
  for (const call of calls) {
    if (!fields.tools?.some((offered) => offered.function.name === call.name)) {
      throw new Error(
        `corpus provider was not offered its scripted tool: ${call.name}; offered ${(fields.tools ?? []).map((offered) => offered.function.name).join(", ")}`,
      );
    }
  }
  return calls;
}

function chatReply(script: CorpusProviderScript, fields: ProviderRequest, requestBody: string): Response {
  const completion = script.completion?.(requestBody);
  const text = completion?.text ?? completionText(script, fields, requestBody);
  const calls = completionCalls(script, fields, completion);
  if (fields.stream === true) {
    const usage = completion?.usage ?? script.usage;
    const tools = calls.map((call, index) => ({
      index,
      id: `corpus-tool-call-${index}`,
      type: "function",
      function: { name: call.name, arguments: call.argumentsJson },
    }));
    const delta = calls.length === 0 ? `{"content":${JSON.stringify(text)}}` : `{"content":${JSON.stringify(text)},"tool_calls":${JSON.stringify(tools)}}`;
    return new Response(
      `data: {"choices":[{"delta":${delta}}]}\n\n${terminalSseLine({ finishReason: calls.length === 0 ? "stop" : "tool_calls", ...(usage === undefined ? {} : { usage }) })}\n\ndata: [DONE]\n\n`,
      {
        headers: { "content-type": "text/event-stream" },
      },
    );
  }
  if (calls.length > 0) {
    throw new Error("corpus tool execution requires the actual streaming chat request");
  }
  return new Response(
    `{"id":"corpus-completion","object":"chat.completion","created":0,"model":${JSON.stringify(fields.model)},"choices":[{"index":0,"message":{"role":"assistant","content":${JSON.stringify(text)}},"finish_reason":"stop"}]}`,
    {
      headers: { "content-type": "application/json" },
    },
  );
}

function postReply(script: CorpusProviderScript, path: string, fields: ProviderRequest, requestBody: string): Response {
  if (!script.modelIds.includes(fields.model)) {
    throw new Error(`unscripted corpus provider model: ${fields.model}`);
  }
  switch (path) {
    case "/v1/embeddings":
      return embeddingReply(script, fields, requestBody);
    case "/v1/images/generations":
      return imageReply(script, fields);
    case "/v1/chat/completions":
      return chatReply(script, fields, requestBody);
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
    const body = await request.text();
    return postReply(script, path, requestSchema.parse(JSON.parse(body)), body);
  };
  return { execute, requests };
}

export const CORPUS_PROVIDER_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

export interface CorpusProviderServer extends AsyncDisposable {
  readonly baseUrl: string;
  readonly requests: readonly string[];
}

/** Bind only a dynamically allocated loopback socket; errors never echo request bodies or credentials. */
export async function createCorpusProviderServer(createExecution: (baseUrl: string) => Promise<CorpusProviderExecution>): Promise<CorpusProviderServer> {
  let execution: CorpusProviderExecution | undefined;
  const listener = Promise.withResolvers<string>();
  const server = serveHttpServer(
    {
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request): Promise<Response> => {
        try {
          if (execution === undefined) {
            return new Response("Corpus provider is starting", { status: 503 });
          }
          const chunks: Uint8Array[] = [];
          let length = 0;
          if (request.body !== null) {
            for await (const chunk of request.body) {
              length += chunk.byteLength;
              if (length > CORPUS_PROVIDER_BODY_LIMIT_BYTES) {
                return new Response("Corpus provider request is too large", { status: 413 });
              }
              chunks.push(chunk);
            }
          }
          return await execution.execute(request.url, {
            method: request.method,
            signal: request.signal,
            ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }),
          });
        } catch {
          // Invalid or unscripted physical input is a failed request, never a server crash or a private diagnostic.
          return new Response("Corpus provider rejected an unscripted request", { status: 400 });
        }
      },
    },
    (address) => listener.resolve(`http://127.0.0.1:${address.port}/v1`),
  );
  server.once("error", listener.reject);
  let disposal: Promise<void> | undefined;
  const dispose = (): Promise<void> => {
    disposal ??= drainHttpServer(server, getLog());
    return disposal;
  };
  try {
    const baseUrl = await listener.promise;
    execution = await createExecution(baseUrl);
    return { baseUrl, requests: execution.requests, [Symbol.asyncDispose]: dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
