// The owned peer supplies native vendor bytes; the real root owns admission, identity and turn policy.
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { PromptCacheSettings, RoutableTask } from "@orb/contracts/inference";
import { jsonValueSchema } from "@orb/kit/json";
import { getLog } from "@orb/server/foundation/observability";
import type { NativeHttpBindings } from "@orb/server/infra/network";
import { drainHttpServer, serveHttpServer } from "@orb/server/infra/network";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/chat/composed.ts";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { z } from "zod";

export const B_CHAT_MODEL = "speaker-chat";
export const B_UTILITY_MODEL = "speaker-utility";
const B_RERANK_MODEL = "speaker-rerank";
export const B_HOST_KEY = "owned-speaker-host-key";

const completionSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  ["response_format"]: z.object({ ["json_schema"]: z.object({ name: z.string() }) }).optional(),
  temperature: z.number().optional(),
  ["max_tokens"]: z.number().optional(),
  ["reasoning_effort"]: z.string().optional(),
  modalities: z.array(z.string()).optional(),
});
type SpeakerInput = z.infer<typeof completionSchema>;
const ids = createSeededIds();

export interface SpeakerWirePlan {
  readonly chat?: readonly (string | Response)[];
  readonly picks?: readonly (readonly string[])[];
  readonly rerank?: readonly { readonly index: number; readonly ["relevance_score"]: number }[];
  readonly utilityFailure?: boolean;
  readonly chatFailure?: boolean;
  readonly holdUtility?: boolean;
  readonly holdChat?: boolean;
  readonly pitch?: string;
}

interface SpeakerPeerObservation {
  readonly baseUrl: string;
  readonly requests: readonly Request[];
  readonly reached: Promise<void>;
  readonly closed: Promise<void>;
  readonly release: () => void;
}

export interface SpeakerRoom extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly peer: SpeakerPeerObservation;
  readonly connection: Awaited<ReturnType<ChatRoot["root"]["services"]["connection"]["create"]>>;
  readonly events: readonly ChatBusEvent[];
}

interface SavedConnectionOptions {
  readonly principal?: ChatRoot["owner"];
  readonly key?: string;
  readonly structured?: boolean;
  readonly promptCache?: PromptCacheSettings;
}

/** The actual loopback response-close event is separate from releasing the finite fixture response. */
async function speakerPeer(plan: SpeakerWirePlan, ownership: AsyncDisposableStack): Promise<SpeakerPeerObservation> {
  const requests: Request[] = [];
  const failures: Error[] = [];
  const reached = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const listening = Promise.withResolvers<string>();
  let chat = 0;
  let pick = 0;
  let execution: ReturnType<typeof createCorpusProviderExecution> | undefined;
  async function completion(request: Request, bindings: NativeHttpBindings): Promise<Response | undefined> {
    const body = completionSchema.parse(await request.clone().json());
    const utility = body.model === B_UTILITY_MODEL;
    if ((utility && plan.utilityFailure) || (!utility && plan.chatFailure)) {
      return Response.json({ error: { message: "Controlled provider refusal", type: "invalid_request_error" } }, { status: 400 });
    }
    if ((utility && plan.holdUtility) || (!utility && plan.holdChat)) {
      bindings.outgoing.once("close", () => closed.resolve());
      reached.resolve();
      await released.promise;
    }
    const reply = plan.chat?.[chat];
    if (!utility && reply instanceof Response) {
      chat++;
      return reply.clone();
    }
    return undefined;
  }
  const server = serveHttpServer(
    {
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request, bindings): Promise<Response> => {
        try {
          requests.push(request.clone());
          const path = new URL(request.url).pathname;
          if (path === "/v1/rerank") {
            if (plan.rerank === undefined) {
              throw new Error("unplanned physical rerank request");
            }
            return Response.json({ results: plan.rerank });
          }
          if (path === "/v1/chat/completions") {
            const response = await completion(request, bindings);
            if (response !== undefined) {
              return response;
            }
          }
          if (execution === undefined) {
            throw new Error("speaker peer not initialized");
          }
          return await execution.execute(request);
        } catch (cause) {
          failures.push(new Error("speaker peer rejected unscripted native input", { cause }));
          return new Response("Unscripted physical input", { status: 400 });
        }
      },
    },
    (address) => listening.resolve(`http://127.0.0.1:${address.port}/v1`),
  );
  ownership.defer(async (): Promise<void> => {
    released.resolve();
    await drainHttpServer(server, getLog());
    if (failures.length > 0) {
      throw new AggregateError(failures, "speaker peer had unscripted native requests");
    }
  });
  server.once("error", listening.reject);
  const baseUrl = await listening.promise;
  const structuredReplies = new Map(CORPUS_STRUCTURED_REPLIES);
  if (plan.pitch !== undefined) {
    const original = jsonValueSchema.parse(JSON.parse(structuredReplies.get("character_distillation") ?? "null"));
    if (original === null || typeof original !== "object" || Array.isArray(original)) {
      throw new Error("missing corpus distillation bytes");
    }
    structuredReplies.set("character_distillation", JSON.stringify({ ...original, elevatorPitch: plan.pitch }));
  }
  execution = createCorpusProviderExecution({
    baseUrl,
    modelIds: [B_CHAT_MODEL, B_UTILITY_MODEL, B_RERANK_MODEL, CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies,
    images: [],
    chatText: "Unplanned foreground response",
    completion: (raw) => {
      const body = completionSchema.parse(JSON.parse(raw));
      if (body.response_format?.json_schema.name === "character_distillation") {
        return;
      }
      const text =
        body.model === B_UTILITY_MODEL
          ? JSON.stringify({
              responders:
                plan.picks?.[pick++] ??
                (() => {
                  throw new Error("finite native speaker-pick plan exhausted");
                })(),
            })
          : plan.chat?.[chat++];
      if (typeof text !== "string") {
        throw new Error("finite native foreground plan exhausted");
      }
      return { text, toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } };
    },
  });
  return {
    baseUrl,
    requests,
    reached: reached.promise,
    closed: closed.promise,
    release: () => released.resolve(),
  };
}

/** Save the owner's actual credential and task binding; no resolved connection or capability answer is synthesized. */
export async function saveSpeakerConnection(
  h: ChatRoot,
  baseUrl: string,
  task: RoutableTask,
  options: SavedConnectionOptions = {},
): Promise<SpeakerRoom["connection"]> {
  const { principal = h.owner, key = B_HOST_KEY, structured = true } = options;
  let model = B_UTILITY_MODEL;
  if (task === "chat") {
    model = B_CHAT_MODEL;
  }
  if (task === "rerank") {
    model = B_RERANK_MODEL;
  }
  const credential = await h.root.services.credentials.add({ principal, provider: "custom-openai", key });
  const connection = await h.root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: credential.id,
    baseUrl,
    model,
    allowBackground: true,
    ...(options.promptCache === undefined ? {} : { promptCache: options.promptCache }),
    declared:
      task === "rerank"
        ? {
            kind: "rerank",
            rerank: { maxInputTokens: 512, input: ["text"], instructionAware: false },
            features: { detectServer: false, rerankPath: "/rerank" },
          }
        : {
            kind: "generation",
            generation: { input: ["text"], context: { window: 32_768 }, output: { structured }, tools: null },
            features: { detectServer: false, structuredMode: "guided-decoding" },
          },
  });
  await h.root.services.connection.setBinding({ principal, task, connectionId: connection.id });
  return connection;
}

/** A complete owned production room, including the physical peer and its independently joined teardown. */
export async function speakerRoom(
  plan: SpeakerWirePlan,
  options: Omit<ChatRootOptions, "providerFetch"> = {},
  promptCache?: PromptCacheSettings,
): Promise<SpeakerRoom> {
  await using construction = new AsyncDisposableStack();
  const { baseUrl, requests, reached, closed, release } = await speakerPeer(plan, construction);
  const bootstrap = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: () => {
      throw new Error("unexpected bootstrap chat completion");
    },
  });
  const h = construction.use(
    await createChatRoot({
      characters: ["aria", "bryn"].map((name) => createCharacterSchema.parse({ handle: name, name, description: `The traveller ${name}.` })),
      group: { output: "per-speaker", policy: "smart", smartPicker: "utility", allowSelfResponses: true },
      memoryEnabled: false,
      ...options,
      server: { ids, secretBoxKey: Buffer.alloc(32, 1), ...options.server },
      providerFetch: async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        return new URL(request.url).origin === new URL(baseUrl).origin ? await fetch(request) : await bootstrap.execute(request);
      },
    }),
  );
  const connection = await saveSpeakerConnection(h, baseUrl, "chat", promptCache === undefined ? {} : { promptCache });
  await h.caller.connection.setBinding({ task: "summarize", connectionId: null });
  const events: ChatBusEvent[] = [];
  construction.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      events.push(event);
    }),
  );
  const lifetime = construction.move();
  return { h, peer: { baseUrl, requests, reached, closed, release }, connection, events, [Symbol.asyncDispose]: (): Promise<void> => lifetime.disposeAsync() };
}

/** Inspect actual native JSON bodies, never a reconstructed TurnRequest or private role arguments. */
export async function speakerInputs(requests: readonly Request[], model: string): Promise<SpeakerInput[]> {
  const inputs = await Promise.all(
    requests
      .filter((r) => r.method === "POST" && new URL(r.url).pathname === "/v1/chat/completions")
      .map(async (r) => completionSchema.parse(await r.clone().json())),
  );
  return inputs.filter((body) => body.model === model);
}
