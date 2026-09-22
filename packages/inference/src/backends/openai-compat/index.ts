// The `openai-compat` wire's sealed backend: ONE backend, TWO transports (`openai-compatible` +
// `openrouter`), everything else data (§8.1). Serves chat / summarize / structured / embed / imageEmbed /
// rerank / generateImage + the six diagnostics; `WIRE_DEFS["openai-compat"].serves` is pinned against
// these methods by the table test. Nothing here knows a provider id — the row's `features`, `extras` and
// `transport` are the whole configuration.

import type { ProviderBackend } from "../../contract/backend.ts";
import type { ChatRequest, ChatResult, OpenAiCompatChatRequest } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { AddSpanEvent } from "../../contract/runtime.ts";
import type { InferenceDeps } from "../../deps.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../kit/image-normalize.ts";
import { runOpenAiCompatStructured, runOpenAiCompatSummarize } from "./batch.ts";
import { runOpenAiCompatChatTurn } from "./chat.ts";
import { inspectOpenAiCompatEndpoint, listOpenAiCompatModels, openRouterCredits, openRouterGenerationCost, probeOpenAiCompat } from "./diagnostics.ts";
import { runOpenAiCompatEmbed } from "./embed.ts";
import { runOpenAiCompatImageEmbed } from "./image-embed.ts";
import { runOpenAiCompatGenerateImage } from "./images.ts";
import type { TransportDeps } from "./model.ts";
import type { ReachabilityProber } from "./reachability.ts";
import { createReachabilityProber } from "./reachability.ts";
import { runOpenAiCompatRerank } from "./rerank.ts";

export type { ReachabilityProber } from "./reachability.ts";

function isOpenAiCompatChatRequest(req: ChatRequest): req is OpenAiCompatChatRequest {
  return req.api === "chat-completions";
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
  readonly embedSpaceDims: number;
}

export interface OpenAiCompatBackend {
  readonly backend: ProviderBackend;
  /** The reachability probe the availability read consults for `auth: endpoint` rows (§4). */
  readonly reachability: ReachabilityProber;
}

export function createOpenAiCompatBackend(deps: OpenAiCompatBackendDeps): OpenAiCompatBackend {
  const normalize: NormalizeImageBytes = deps.imageToPng !== undefined ? createImageNormalizer(deps.imageToPng) : passthroughImageNormalizer;
  const transport: TransportDeps = {
    fetch: deps.fetch,
    app: deps.app,
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    ...(deps.captureWireReply !== undefined ? { captureWireReply: deps.captureWireReply } : {}),
  };
  const chatDeps = { now: deps.now, random: deps.random, log: deps.log, addSpanEvent: deps.addSpanEvent, transport };
  const batchDeps = { now: deps.now, log: deps.log, transport, normalize };
  const diagnostics = { fetch: deps.fetch, now: deps.now };
  const reachability = createReachabilityProber({ fetch: deps.fetch, now: deps.now });
  return {
    reachability,
    backend: {
      wire: "openai-compat",
      runChatTurn: (req): Promise<ChatResult> => {
        if (!isOpenAiCompatChatRequest(req)) {
          return Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: `openai-compat backend received api="${req.api}"` }));
        }
        return runOpenAiCompatChatTurn(req, chatDeps);
      },
      embed: (req) => runOpenAiCompatEmbed(req, { log: deps.log, transport }),
      rerank: (req) => runOpenAiCompatRerank(req, { fetch: deps.fetch, normalize, log: deps.log }),
      imageEmbed: (req) => runOpenAiCompatImageEmbed(req, { fetch: deps.fetch, normalize, spaceDims: deps.embedSpaceDims }),
      summarize: (req) => runOpenAiCompatSummarize(req, batchDeps),
      structured: (req) => runOpenAiCompatStructured(req, batchDeps),
      generateImage: (req) => runOpenAiCompatGenerateImage(req, { transport, normalize }),
      probe: (req) => probeOpenAiCompat(req, diagnostics),
      accountCredits: (req) => openRouterCredits(req, diagnostics),
      generationCost: (req) => openRouterGenerationCost(req, diagnostics),
      inspect: (req) => inspectOpenAiCompatEndpoint(req, diagnostics),
      listModels: (req) => listOpenAiCompatModels(req, diagnostics),
    },
  };
}
