import type { CredentialHealth } from "@orb/contracts/credentials";
import { fetchGoogleModels, listGoogleModels } from "#catalog";
import type {
  ChatRequest,
  ChatResult,
  GoogleBackend,
  GoogleBackendDeps,
  GoogleChatRequest,
  ListModelsRequest,
  ProbeRequest,
  StructuredRequest,
  SummarizeRequest,
} from "#contract";
import { ProviderError } from "#contract";
import { runSideGen } from "#roles";
import { resolvedScrubSet } from "../http/sanitize.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../wire/image-normalize.ts";
import { scrubbedReason } from "../wire/model-listing.ts";
import { runGoogleChat } from "./chat.ts";
import { runGoogleEmbed, runGoogleImageEmbed } from "./embed.ts";
import { runGoogleGenerateImage } from "./images.ts";

const AUTH_FAILURE = /\b401\b|\b403\b|unauthor|forbidden|api.key.not.valid/iu;
function dialOf(req: ListModelsRequest): Parameters<typeof listGoogleModels>[0] {
  return {
    baseUrl: req.connection.baseUrl,
    secret: req.connection.credential.secret,
    secrets: resolvedScrubSet(req.connection),
    label: "Google models",
    signal: req.signal,
  };
}

async function probe(req: ProbeRequest, deps: GoogleBackendDeps): Promise<CredentialHealth> {
  const checkedAt = deps.now();
  // the probe returns the failure as `revoked` or `unreachable` health with a scrubbed reason at google/index.ts:42. Ends if the returned health stops carrying that disposition.
  try {
    await fetchGoogleModels(dialOf(req), deps.fetch);
    return { status: "ok", checkedAt };
  } catch (err) {
    const reason = scrubbedReason(err, resolvedScrubSet(req.connection));
    return { status: AUTH_FAILURE.test(reason) ? "revoked" : "unreachable", checkedAt, reason };
  }
}

function isGoogleRequest(req: ChatRequest): req is GoogleChatRequest {
  return req.api === "google-generative-ai";
}

export function createGoogleBackend(deps: GoogleBackendDeps): GoogleBackend {
  const normalize = deps.imageToPng === undefined ? passthroughImageNormalizer : createImageNormalizer(deps.imageToPng);
  const runChatTurn = (req: ChatRequest): Promise<ChatResult> => {
    if (!isGoogleRequest(req)) {
      return Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: `Google backend received api=${req.api}` }));
    }
    return runGoogleChat(req, deps);
  };
  const sideGen = (req: SummarizeRequest | StructuredRequest): ReturnType<typeof runSideGen> =>
    runSideGen(req, { runChatTurn, concurrency: req.connection.features.concurrency?.summarize ?? 1, normalize, log: deps.log, now: deps.now });
  return {
    wire: "google-generative-ai",
    runChatTurn,
    summarize: sideGen,
    structured: sideGen,
    embed: (req) => runGoogleEmbed(req, deps),
    imageEmbed: (req) => runGoogleImageEmbed(req, deps),
    generateImage: (req) => runGoogleGenerateImage(req, deps),
    probe: (req) => probe(req, deps),
    listModels: (req) => listGoogleModels(dialOf(req), deps.fetch),
  };
}
