// The `openai-compat` wire's sealed backend: ONE backend, TWO transports (`openai-compatible` +
// `openrouter`), everything else data (§8.1). Serves chat / summarize / structured / embed / imageEmbed /
// rerank / generateImage + the six diagnostics; `WIRE_DEFS["openai-compat"].serves` is pinned against
// these methods by the table test. Nothing here knows a provider id — the row's `features`, `extras` and
// `transport` are the whole configuration.

import type { ChatRequest, ChatResult, OpenAiCompatChatRequest, Resolved, StructuredRequest, SummarizeRequest } from "#contract";
import { ProviderError } from "#contract";
import { runSideGen } from "#roles";
import type { OpenAiCompatBackend, OpenAiCompatBackendDeps, ReachabilityProber, TransportDeps } from "../../contract/openai-backend.ts";
import type { NormalizeImageBytes } from "../../contract/wire.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../wire/image-normalize.ts";
import { runOpenAiCompatChatTurn } from "./chat.ts";
import { inspectOpenAiCompatEndpoint, listOpenAiCompatModels, openRouterCredits, openRouterGenerationCost, probeOpenAiCompat } from "./diagnostics.ts";
import { runOpenAiCompatEmbed } from "./embed.ts";
import { runOpenAiCompatImageEmbed } from "./image-embed.ts";
import { runOpenAiCompatGenerateImage } from "./images.ts";
import { createReachabilityProber } from "./reachability.ts";
import { runOpenAiCompatRerank } from "./rerank.ts";
import { createTokenLexicon } from "./tokens.ts";

export type { ReachabilityProber } from "./reachability.ts";

function isOpenAiCompatChatRequest(req: ChatRequest): req is OpenAiCompatChatRequest {
  return req.api === "chat-completions";
}

/** What a task carries that the wake reads: its row and its cancel. */
interface WakeRequest {
  readonly connection: Resolved;
  readonly signal?: AbortSignal | undefined;
}

/** A row whose folded features name a sleep pair is woken before any task reaches it: the availability read calls a
 *  sleeping server available because the task wakes it. A row without the pair sends as it is. */
function wakeBeforeSend(reachability: ReachabilityProber): (req: WakeRequest) => Promise<void> {
  return async ({ connection, signal }) => {
    const sleep = connection.features.sleep;
    if (sleep === undefined || connection.baseUrl === null) {
      return;
    }
    const target = {
      baseUrl: connection.baseUrl,
      secret: connection.credential.secret,
      headers: connection.transport?.headers,
      sleepPath: sleep.isSleepingPath,
      wakePath: sleep.wakePath,
    };
    if (!(await reachability.asleep(target, signal))) {
      return;
    }
    if (!(await reachability.wake(target, signal))) {
      throw new ProviderError({
        kind: "model_unavailable",
        retryable: true,
        message: `the server at ${connection.baseUrl} was asleep and did not wake in time`,
        model: connection.model,
      });
    }
  };
}

/** A task runner that wakes the row's server first. */
function woken<R extends WakeRequest, T>(awake: (req: WakeRequest) => Promise<void>, run: (req: R) => Promise<T>): (req: R) => Promise<T> {
  return async (req) => {
    await awake(req);
    return await run(req);
  };
}

export function createOpenAiCompatBackend(deps: OpenAiCompatBackendDeps): OpenAiCompatBackend {
  const normalize: NormalizeImageBytes = deps.imageToPng !== undefined ? createImageNormalizer(deps.imageToPng) : passthroughImageNormalizer;
  const transport: TransportDeps = {
    fetch: deps.fetch,
    app: deps.app,
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    ...(deps.captureWireReply !== undefined ? { captureWireReply: deps.captureWireReply } : {}),
  };
  const tokens = createTokenLexicon({ fetch: deps.fetch, snapshotStore: deps.snapshotStore });
  const chatDeps = {
    now: deps.now,
    random: deps.random,
    scheduleTimeout: deps.scheduleTimeout,
    log: deps.log,
    addSpanEvent: deps.addSpanEvent,
    transport,
    tokens,
  };
  const diagnostics = { fetch: deps.fetch, now: deps.now, scheduleTimeout: deps.scheduleTimeout };
  const reachability = createReachabilityProber({ fetch: deps.fetch, now: deps.now, scheduleTimeout: deps.scheduleTimeout });
  const awake = wakeBeforeSend(reachability);
  const chatTurn = async (req: ChatRequest): Promise<ChatResult> => {
    if (!isOpenAiCompatChatRequest(req)) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: `openai-compat backend received api="${req.api}"` });
    }
    return await runOpenAiCompatChatTurn(req, chatDeps);
  };
  // The server is woken once per batch; each item is a chat turn on it.
  const sideGen = (req: SummarizeRequest | StructuredRequest): ReturnType<typeof runSideGen> =>
    runSideGen(req, { runChatTurn: chatTurn, concurrency: req.connection.features.concurrency?.summarize ?? 1, normalize, log: deps.log, now: deps.now });
  return {
    reachability,
    tokens,
    backend: {
      wire: "openai-compat",
      runChatTurn: async (req): Promise<ChatResult> => {
        await awake(req);
        return await chatTurn(req);
      },
      embed: woken(awake, (req) => runOpenAiCompatEmbed(req, { log: deps.log, transport, scheduleTimeout: deps.scheduleTimeout })),
      rerank: woken(awake, (req) => runOpenAiCompatRerank(req, { fetch: deps.fetch, normalize, log: deps.log })),
      imageEmbed: woken(awake, (req) => runOpenAiCompatImageEmbed(req, { fetch: deps.fetch, normalize })),
      summarize: woken(awake, sideGen),
      structured: woken(awake, sideGen),
      generateImage: woken(awake, (req) => runOpenAiCompatGenerateImage(req, { transport, normalize })),
      probe: (req) => probeOpenAiCompat(req, diagnostics),
      accountCredits: (req) => openRouterCredits(req, diagnostics),
      generationCost: (req) => openRouterGenerationCost(req, diagnostics),
      inspect: woken(awake, (req) => inspectOpenAiCompatEndpoint(req, { fetch: deps.fetch, app: deps.app, scheduleTimeout: deps.scheduleTimeout })),
      listModels: (req) => listOpenAiCompatModels(req, diagnostics),
    },
  };
}

export type { OpenAiCompatBackend, OpenAiCompatBackendDeps } from "../../contract/openai-backend.ts";
