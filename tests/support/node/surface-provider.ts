// Only this allocated peer serves scripted text. Its held body ends on physical cancellation, not an elapsed delay.
import { appendFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { SurfaceDataMode, SurfaceProviderEvidence } from "../iso/surface-data.ts";
import { CORPUS_CHAT_ABORT_CUE, CORPUS_CHAT_REPLY } from "./corpus-chat-wire.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_REFINERY_REPLY_NAMES,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  corpusEmbeddingForText,
  createCorpusProviderExecution,
  createCorpusProviderServer,
} from "./corpus-provider.ts";
import { createCorpusProviderTransport } from "./corpus-recipe.ts";

interface HeldBody {
  readonly stop: () => void;
}

const scriptedCompletionRequest = z.union([
  z.object({ model: z.literal(CORPUS_TEXT_MODEL), stream: z.literal(true), ["response_format"]: z.never().optional() }),
  z.object({
    model: z.literal(CORPUS_TEXT_MODEL),
    stream: z.boolean(),
    ["response_format"]: z.object({ type: z.literal("json_schema"), ["json_schema"]: z.object({ name: z.enum(CORPUS_REFINERY_REPLY_NAMES) }) }),
  }),
]);
const canonicalEmbeddingRequest = z.object({ model: z.literal(CORPUS_EMBED_MODEL) });

async function admitScriptedRequest(request: Request): Promise<SurfaceProviderEvidence["structuredSchema"]> {
  const url = new URL(request.url);
  if (url.search === "" && request.method === "GET" && url.pathname === "/v1/models") {
    return;
  }
  if (url.search === "" && request.method === "POST" && url.pathname === "/v1/chat/completions") {
    try {
      const parsed = scriptedCompletionRequest.safeParse(JSON.parse(await request.clone().text()));
      if (parsed.success) {
        return parsed.data.response_format?.json_schema.name;
      }
    } catch (cause) {
      throw new Error("The surface provider refuses malformed scripted input", { cause });
    }
  }
  throw new Error("The surface provider refuses this unscripted method, path or model");
}

function holdUntilCancelled(
  response: Response,
  signal: AbortSignal,
  pending: Set<HeldBody>,
  record: (event: SurfaceProviderEvidence["event"]) => void,
): Promise<Response> {
  return response.text().then((text) => {
    const boundary = text.indexOf("\n\n");
    if (boundary === -1) {
      throw new Error("The scripted provider did not supply its canonical initial SSE frame");
    }
    const first = new TextEncoder().encode(text.slice(0, boundary + 2));
    let cancel: () => void = (): void => undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let settled = false;
        const finish = (event: SurfaceProviderEvidence["event"]): void => {
          if (settled) {
            return;
          }
          settled = true;
          signal.removeEventListener("abort", aborted);
          pending.delete(held);
          record(event);
          controller.error(new DOMException("Scripted provider stream cancelled", "AbortError"));
        };
        const aborted = (): void => finish("aborted");
        const held: HeldBody = { stop: () => finish("disposed") };
        cancel = () => finish("cancelled");
        pending.add(held);
        signal.addEventListener("abort", aborted, { once: true });
        if (signal.aborted) {
          aborted();
        } else {
          controller.enqueue(first);
          record("held");
        }
      },
      cancel() {
        cancel();
      },
    });
    return new Response(body, { status: response.status, headers: response.headers });
  });
}

/** Own a bounded external stand-in beneath an already admitted private run directory. */
export async function createSurfaceProvider(
  runRoot: string,
  dataMode: SurfaceDataMode = "owner",
): Promise<{
  readonly baseUrl: string;
  readonly transport: ReturnType<typeof createCorpusProviderTransport>;
  readonly completionText: string;
  readonly cancelCue: string;
  readonly requestEvidencePath: string;
  readonly canonicalSyntheticEmbedding: boolean;
  readonly privateEndpointAdmissions: readonly string[];
  readonly [Symbol.asyncDispose]: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(runRoot, "provider-"));
  const requestEvidencePath = join(directory, "requests.log");
  writeFileSync(requestEvidencePath, "", { mode: 0o600, flag: "wx" });
  let requestId = 0;
  const record = (event: SurfaceProviderEvidence): void => appendFileSync(requestEvidencePath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
  const pending = new Set<HeldBody>();
  const embeddingEndpoint = new URL(CORPUS_PROVIDER_ENDPOINT);
  const embedding = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: corpusEmbeddingForText,
    chatText: CORPUS_CHAT_REPLY,
    structuredReplies: new Map(),
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  // biome-ignore lint/nursery/useDisposables: construction owns this peer and transfers it to the returned lifetime.
  const provider = construction.use(
    await createCorpusProviderServer((baseUrl) => {
      const script = createCorpusProviderExecution({
        baseUrl,
        modelIds: [CORPUS_TEXT_MODEL],
        embedding: CORPUS_EMBEDDING_VECTOR,
        chatText: CORPUS_CHAT_REPLY,
        structuredReplies: CORPUS_STRUCTURED_REPLIES,
        images: [],
      });
      return Promise.resolve({
        requests: script.requests,
        execute: async (input, init): Promise<Response> => {
          const request = new Request(input, init);
          const structuredSchema = await admitScriptedRequest(request);
          const id = ++requestId;
          const route = request.method === "GET" ? "GET /v1/models" : "POST /v1/chat/completions";
          const recordRequest = (event: SurfaceProviderEvidence["event"]): void =>
            record({ requestId: id, event, request: route, ...(structuredSchema === undefined ? {} : { structuredSchema }) });
          const held = structuredSchema === undefined && request.method === "POST" && (await request.clone().text()).includes(CORPUS_CHAT_ABORT_CUE);
          const response = await script.execute(request);
          recordRequest("request");
          return held ? await holdUntilCancelled(response, request.signal, pending, recordRequest) : response;
        },
      });
    }),
  );
  construction.defer(() => {
    for (const body of pending) {
      body.stop();
    }
  });
  const transport = createCorpusProviderTransport(provider.baseUrl, async (input, init) => {
    const request = new Request(input, init);
    await admitScriptedRequest(request);
    return await fetch(request);
  });
  const lifetime = construction.move();
  return {
    baseUrl: provider.baseUrl,
    transport: {
      resolver: transport.resolver,
      fetch: async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (dataMode === "synthetic" && url.origin === embeddingEndpoint.origin) {
          const valid = request.method === "POST" && url.pathname === "/v1/embeddings" && url.search === "";
          if (!(valid && canonicalEmbeddingRequest.safeParse(JSON.parse(await request.clone().text())).success)) {
            throw new Error("The surface provider refuses an unscripted canonical embedding request");
          }
          record({ requestId: ++requestId, event: "scripted-embedding", request: "POST /v1/embeddings" });
          return await embedding.execute(request);
        }
        return await transport.fetch(request);
      },
    },
    completionText: CORPUS_CHAT_REPLY,
    cancelCue: CORPUS_CHAT_ABORT_CUE,
    requestEvidencePath,
    canonicalSyntheticEmbedding: dataMode === "synthetic",
    privateEndpointAdmissions: [new URL(provider.baseUrl).host, ...(dataMode === "synthetic" ? [embeddingEndpoint.host] : [])],
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}
