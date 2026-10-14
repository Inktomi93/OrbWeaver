// Finite physical vendor bytes only; native catalog, credential, capability and accounting owners remain installed.
import { builtinProvider } from "@orb/contracts/inference";
import { z } from "zod";
import { terminalSseLine } from "./provider-stream.ts";
import type { ServerHarnessOptions } from "./server.ts";

export const CORPUS_CONNECTION_ENDPOINT = "http://127.0.0.1:8704/connection/v1";
export const CORPUS_CONNECTION_MODEL = "corpus-connection-chat-v1";
export const CORPUS_CONNECTION_FOREIGN_MODEL = "corpus-foreign-chat-v1";
export const CORPUS_CONNECTION_HOSTED_MODEL = "ledger/native-connection";
export const CORPUS_CONNECTION_TURN_CUE = "Record the native account witness.";
export const CORPUS_CONNECTION_REPLY = "The account witness retains the ledger.";
export const CORPUS_CONNECTION_KEY = "synthetic-native-endpoint-private-key";
export const CORPUS_CONNECTION_FOREIGN_KEY = "synthetic-native-foreign-private-key";
export const CORPUS_CONNECTION_HOSTED_KEY = "synthetic-native-hosted-private-key";
const UPSTREAM_ID = "gen-native-corpus-connection";

interface PhysicalRecipe {
  readonly url: string;
  readonly method: string;
  readonly key: string | null;
  readonly cue?: string;
  readonly response: string;
  readonly status: number;
  readonly stream: boolean;
  readonly reject?: boolean;
}
interface PhysicalRequest {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly body: string;
  readonly response: string;
}
interface CorpusConnectionWire {
  readonly hostname: string;
  readonly resolver: NonNullable<NonNullable<ServerHarnessOptions["networkExecution"]>["resolver"]>;
  readonly wrap: (execute: typeof fetch) => typeof fetch;
  readonly requests: readonly PhysicalRequest[];
  readonly remaining: () => number;
  readonly models: (key: string, response?: string, status?: number) => void;
  readonly hostedCatalog: () => void;
  readonly credits: (response?: string, status?: number) => void;
  readonly cost: (generationId: string, response?: string) => void;
  readonly inspection: (response?: string, status?: number, reject?: boolean) => void;
  readonly token: (word: string, malformed?: boolean) => void;
  readonly turn: () => void;
}

function hostedBaseUrl(): string {
  const provider = builtinProvider("openrouter");
  if (provider?.baseUrl === undefined) {
    throw new Error("canonical OpenRouter provider has no fixed endpoint");
  }
  return provider.baseUrl;
}

const generationBodySchema = z.object({
  model: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]) })),
  stream: z.boolean().optional(),
});
const tokenBodySchema = z.object({
  model: z.literal(CORPUS_CONNECTION_MODEL),
  prompt: z.string(),
  ["add_special_tokens"]: z.literal(false),
  ["return_token_strs"]: z.literal(true),
});

function validatePhysicalBody(recipe: PhysicalRecipe, body: string): void {
  if (recipe.method !== "POST") {
    return;
  }
  if (recipe.url.endsWith("/tokenize")) {
    const fields = tokenBodySchema.parse(JSON.parse(body));
    if (fields.prompt !== recipe.cue) {
      throw new Error("native token recipe word mismatch");
    }
    return;
  }
  const fields = generationBodySchema.parse(JSON.parse(body));
  if (
    (fields.stream === true) !== recipe.stream ||
    !body.includes(recipe.cue ?? "") ||
    fields.model !== (recipe.stream ? CORPUS_CONNECTION_HOSTED_MODEL : CORPUS_CONNECTION_MODEL)
  ) {
    throw new Error("native connection generation recipe mismatch");
  }
}

function matchesPhysicalRequest(candidate: PhysicalRecipe, request: Request): boolean {
  const expected = candidate.key === null ? null : `Bearer ${candidate.key}`;
  return candidate.url === request.url && candidate.method === request.method && request.headers.get("authorization") === expected;
}

/** Match each admitted physical ask once; exhausted or unmatched connection recipes never fall through to a live dial. */
export function createCorpusConnectionWire(): CorpusConnectionWire {
  const hosted = hostedBaseUrl();
  const pending: PhysicalRecipe[] = [];
  const requests: PhysicalRequest[] = [];
  const enqueue = (recipe: Omit<PhysicalRecipe, "status" | "stream"> & Partial<Pick<PhysicalRecipe, "status" | "stream">>): void => {
    pending.push({ status: 200, stream: false, ...recipe });
  };
  return {
    hostname: new URL(hosted).hostname,
    resolver: (hostname): Promise<readonly string[]> => {
      if (hostname !== new URL(hosted).hostname) {
        return Promise.reject(new Error("unscripted native connection address resolution"));
      }
      return Promise.resolve(["93.184.215.14"]);
    },
    requests,
    remaining: (): number => pending.length,
    models: (key, response, status): void =>
      enqueue({
        url: `${CORPUS_CONNECTION_ENDPOINT}/models`,
        method: "GET",
        key,
        response:
          response ?? JSON.stringify({ data: [{ id: key === CORPUS_CONNECTION_FOREIGN_KEY ? CORPUS_CONNECTION_FOREIGN_MODEL : CORPUS_CONNECTION_MODEL }] }),
        ...(status === undefined ? {} : { status }),
      }),
    hostedCatalog: (): void => {
      for (const [query, row] of [
        [
          "",
          {
            id: CORPUS_CONNECTION_HOSTED_MODEL,
            name: "Native account witness",
            ["context_length"]: 8192,
            architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] },
            pricing: { prompt: "0.000001", completion: "0.000002", ["input_cache_read"]: "" },
            ["supported_parameters"]: ["temperature"],
            ["top_provider"]: { ["max_completion_tokens"]: 128, ["is_moderated"]: false },
          },
        ],
        [
          "?output_modalities=embeddings",
          {
            id: "ledger/native-encoder",
            architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["embeddings"] },
            pricing: { prompt: "0.000003" },
          },
        ],
        [
          "?output_modalities=rerank",
          { id: "ledger/native-reranker", architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["rerank"] }, pricing: { prompt: "" } },
        ],
      ] as const) {
        enqueue({ url: `${hosted}/models${query}`, method: "GET", key: null, response: JSON.stringify({ data: [row] }) });
      }
    },
    credits: (response, status): void =>
      enqueue({
        url: `${hosted}/credits`,
        method: "GET",
        key: CORPUS_CONNECTION_HOSTED_KEY,
        response: response ?? '{"data":{"total_credits":25,"total_usage":4}}',
        ...(status === undefined ? {} : { status }),
      }),
    cost: (generationId, response): void =>
      enqueue({
        url: `${hosted}/generation?id=${encodeURIComponent(generationId)}`,
        method: "GET",
        key: CORPUS_CONNECTION_HOSTED_KEY,
        response: response ?? '{"data":{"total_cost":0.000011,"tokens_prompt":5,"tokens_completion":3}}',
      }),
    inspection: (response, status, reject): void => {
      enqueue({
        url: `${CORPUS_CONNECTION_ENDPOINT}/models`,
        method: "GET",
        key: CORPUS_CONNECTION_KEY,
        response: JSON.stringify({ data: [{ id: CORPUS_CONNECTION_MODEL }] }),
      });
      enqueue({
        url: `${CORPUS_CONNECTION_ENDPOINT}/chat/completions`,
        method: "POST",
        key: CORPUS_CONNECTION_KEY,
        cue: "ping",
        response:
          response ??
          JSON.stringify({
            id: "inspection-native",
            object: "chat.completion",
            created: 0,
            model: CORPUS_CONNECTION_MODEL,
            choices: [{ index: 0, message: { role: "assistant", content: "ok" }, ["finish_reason"]: "stop" }],
            reflected: CORPUS_CONNECTION_KEY,
          }),
        ...(status === undefined ? {} : { status }),
        ...(reject === undefined ? {} : { reject }),
      });
    },
    token: (word, malformed): void =>
      enqueue({
        url: "http://127.0.0.1:8704/connection/tokenize",
        method: "POST",
        key: CORPUS_CONNECTION_KEY,
        cue: word,
        response: malformed === true ? '{"tokens":["malformed"],"token_strs":[]}' : JSON.stringify({ tokens: [41, 42], ["token_strs"]: [word, " tail"] }),
      }),
    turn: (): void =>
      enqueue({
        url: `${hosted}/chat/completions`,
        method: "POST",
        key: CORPUS_CONNECTION_HOSTED_KEY,
        cue: CORPUS_CONNECTION_TURN_CUE,
        stream: true,
        response: `data: ${JSON.stringify({ id: UPSTREAM_ID, object: "chat.completion.chunk", created: 0, model: CORPUS_CONNECTION_HOSTED_MODEL, choices: [{ index: 0, delta: { role: "assistant", content: CORPUS_CONNECTION_REPLY } }] })}\n\ndata: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}\n\n${terminalSseLine()}\n\ndata: [DONE]\n\n`,
      }),
    wrap:
      (execute): typeof fetch =>
      async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        const url = request.url;
        const belongs =
          url.startsWith(`${CORPUS_CONNECTION_ENDPOINT}/`) || url.startsWith("http://127.0.0.1:8704/connection/tokenize") || url.startsWith(`${hosted}/`);
        if (!belongs) {
          return await execute(request);
        }
        const body = await request.clone().text();
        const authorization = request.headers.get("authorization");
        const index = pending.findIndex((candidate) => matchesPhysicalRequest(candidate, request));
        const recipe = pending[index];
        if (recipe === undefined) {
          throw new Error(`unscripted native connection physical request: ${request.method} ${url}`);
        }
        validatePhysicalBody(recipe, body);
        pending.splice(index, 1);
        requests.push({ url, method: request.method, authorization, body, response: recipe.response });
        if (recipe.reject === true) {
          throw new TypeError(`physical endpoint unavailable ${CORPUS_CONNECTION_KEY}`);
        }
        return new Response(recipe.response, { status: recipe.status, headers: { "content-type": recipe.stream ? "text/event-stream" : "application/json" } });
      },
  };
}
