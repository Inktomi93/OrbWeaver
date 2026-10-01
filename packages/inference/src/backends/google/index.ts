import type { CredentialHealth } from "@orb/contracts/credentials";
import { fetchGoogleModels, listGoogleModels } from "../../catalog/google.ts";
import type { ChatRequest, ChatResult, GoogleChatRequest } from "../../contract/chat.ts";
import type { ListModelsRequest, ProbeRequest } from "../../contract/diagnostics.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { GoogleBackend, GoogleBackendDeps } from "../../contract/google.ts";
import { scrubbedReason } from "../kit/model-listing.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { runGoogleBatch } from "./batch.ts";
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
  // @orb-waive caught-failure-ownership(err): the credential probe returns revoked or unreachable with a scrubbed reason. Ends if health stops carrying the failure disposition.
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
  return {
    wire: "google-generative-ai",
    runChatTurn: (req): Promise<ChatResult> => {
      if (!isGoogleRequest(req)) {
        return Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: `Google backend received api=${req.api}` }));
      }
      return runGoogleChat(req, deps);
    },
    summarize: (req) => runGoogleBatch(req, deps),
    structured: (req) => runGoogleBatch(req, deps),
    embed: (req) => runGoogleEmbed(req, deps),
    imageEmbed: (req) => runGoogleImageEmbed(req, deps),
    generateImage: (req) => runGoogleGenerateImage(req, deps),
    probe: (req) => probe(req, deps),
    listModels: (req) => listGoogleModels(dialOf(req), deps.fetch),
  };
}
