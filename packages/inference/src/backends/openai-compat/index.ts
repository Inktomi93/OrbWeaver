// The `openai-compat` wire's sealed backend: ONE backend, TWO transports (`openai-compatible` +
// `openrouter`), everything else data (§8.1). Serves chat / summarize / structured / embed / imageEmbed /
// rerank / generateImage + the six diagnostics; `WIRE_DEFS["openai-compat"].serves` is pinned against
// these methods by the table test. Nothing here knows a provider id — the row's `features`, `extras` and
// `transport` are the whole configuration.

import type { ProviderBackend } from "../../contract/backend.ts";
import type { ChatRequest, ChatResult, OpenAiCompatChatRequest } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { StructuredRequest, SummarizeRequest } from "../../contract/roles.ts";
import type { AddSpanEvent } from "../../contract/runtime.ts";
import type { InferenceDeps } from "../../deps.ts";
import { runSideGen } from "../../roles/side-gen.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../kit/image-normalize.ts";
import { runOpenAiCompatChatTurn } from "./chat.ts";
import { inspectOpenAiCompatEndpoint, listOpenAiCompatModels, openRouterCredits, openRouterGenerationCost, probeOpenAiCompat } from "./diagnostics.ts";
import { runOpenAiCompatEmbed } from "./embed.ts";
import { runOpenAiCompatImageEmbed } from "./image-embed.ts";
import { runOpenAiCompatGenerateImage } from "./images.ts";
import type { TransportDeps } from "./model.ts";
import type { ReachabilityProber } from "./reachability.ts";
import { createReachabilityProber } from "./reachability.ts";
import { runOpenAiCompatRerank } from "./rerank.ts";
import type { TokenLexicon } from "./tokens.ts";
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

/** The slice of the runtime deps this backend closes over. */
export interface OpenAiCompatBackendDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly log: InferenceDeps["log"];
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly fetch: typeof fetch;
  readonly captureWire?: InferenceDeps["captureWire"];
  readonly captureWireReply?: InferenceDeps["captureWireReply"];
  readonly app: InferenceDeps["app"];
  readonly imageToPng?: InferenceDeps["imageToPng"];
  /** Where the tokenize lookups persist, beside the endpoint facts. */
  readonly snapshotStore: InferenceDeps["snapshotStore"];
}

export interface OpenAiCompatBackend {
  readonly backend: ProviderBackend;
  /** The reachability probe the availability read consults for `auth: endpoint` rows (§4). */
  readonly reachability: ReachabilityProber;
  /** The per-(server, model, word) tokenize cache: the turn's word-keyed logit bias and the editor's read. */
  readonly tokens: TokenLexicon;
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
  const chatDeps = { now: deps.now, random: deps.random, log: deps.log, addSpanEvent: deps.addSpanEvent, transport, tokens };
  const diagnostics = { fetch: deps.fetch, now: deps.now };
  const reachability = createReachabilityProber({ fetch: deps.fetch, now: deps.now });
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
      embed: woken(awake, (req) => runOpenAiCompatEmbed(req, { log: deps.log, transport })),
      rerank: woken(awake, (req) => runOpenAiCompatRerank(req, { fetch: deps.fetch, normalize, log: deps.log })),
      imageEmbed: woken(awake, (req) => runOpenAiCompatImageEmbed(req, { fetch: deps.fetch, normalize })),
      summarize: woken(awake, sideGen),
      structured: woken(awake, sideGen),
      generateImage: woken(awake, (req) => runOpenAiCompatGenerateImage(req, { transport, normalize })),
      probe: (req) => probeOpenAiCompat(req, diagnostics),
      accountCredits: (req) => openRouterCredits(req, diagnostics),
      generationCost: (req) => openRouterGenerationCost(req, diagnostics),
      inspect: (req) => inspectOpenAiCompatEndpoint(req, diagnostics),
      listModels: (req) => listOpenAiCompatModels(req, diagnostics),
    },
  };
}
