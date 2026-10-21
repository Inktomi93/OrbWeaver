// The `anthropic-messages` wire's sealed backend (§8.5): a first-party API key over `@ai-sdk/anthropic`.
// Serves chat / summarize / structured + the credential probe and the model list (`GET /v1/models`). No
// agent path (the Claude Code loop needs the runtime — the subscription wire's), no embeddings, no images.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { ModelCatalogEntry, ModelListing } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import type {
  AnthropicChatRequest,
  ChatRequest,
  ChatResult,
  ListModelsRequest,
  ProbeRequest,
  ProviderBackend,
  StructuredRequest,
  SummarizeRequest,
} from "#contract";
import { ProviderError } from "#contract";
import { runSideGen } from "#roles";
import type { AnthropicBackendDeps, AnthropicModelsDial, AnthropicTransportDeps } from "../../contract/anthropic-backend.ts";
import type { NormalizeImageBytes } from "../../contract/wire.ts";
import { fetchJson } from "../http/fetch-json.ts";
import { resolvedScrubSet, sanitizeApiError } from "../http/sanitize.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../wire/image-normalize.ts";
import { bareCatalogEntry, failedListing, listingOf } from "../wire/model-listing.ts";
import { redactSecretsFromText } from "../wire/openai-body.ts";
import { runAnthropicChatTurn } from "./chat.ts";
import { anthropicBaseUrl } from "./model.ts";

const API_KEY_HEADER = "x-api-key";
const VERSION_HEADER = "anthropic-version";
const API_VERSION = "2023-06-01";
const MODELS_PATH = "/models";
const AUTH_FAILURE_RE = /\b401\b|\b403\b|unauthor|forbidden|invalid[\s_-]?api[\s_-]?key/iu;
/** Side-generation items in flight when the row states no `features.concurrency.summarize`. */
const DEFAULT_CONCURRENCY = 4;

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string(), display_name: z.string().optional() }).loose()) }).loose();

function isAnthropicChatRequest(req: ChatRequest): req is AnthropicChatRequest {
  return req.api === "anthropic-messages";
}

function headersOf(secret: string | null): Record<string, string> {
  return { [VERSION_HEADER]: API_VERSION, ...(secret !== null && secret.length > 0 ? { [API_KEY_HEADER]: secret } : {}) };
}

function dialOf(req: ListModelsRequest): AnthropicModelsDial {
  const { connection } = req;
  return {
    baseUrl: connection.baseUrl,
    secret: connection.credential.secret,
    secrets: resolvedScrubSet(connection),
    label: `${connection.providerId} models`,
    ...(req.signal !== undefined ? { signal: req.signal } : {}),
  };
}

export async function fetchAnthropicModels(dial: AnthropicModelsDial, fetchImpl: typeof fetch): Promise<ModelCatalogEntry[]> {
  const result = await fetchJson({
    fetch: fetchImpl,
    url: `${anthropicBaseUrl(dial, dial.label)}${MODELS_PATH}`,
    headers: headersOf(dial.secret),
    secrets: dial.secrets,
    label: dial.label,
    ...(dial.signal !== undefined ? { signal: dial.signal } : {}),
  });
  return modelsSchema.parse(result.json).data.map((row) => bareCatalogEntry({ id: row.id, name: row.display_name }));
}

/** The model list for one dial, a saved row's or a draft's (`catalog/listing.ts`). */
export async function listAnthropicModels(dial: AnthropicModelsDial, fetchImpl: typeof fetch): Promise<ModelListing> {
  try {
    return listingOf(await fetchAnthropicModels(dial, fetchImpl));
    // the failure becomes `{ listed: false, reason }` through failedListing at anthropic-messages/index.ts:78, which the model pane reads; generation stays usable with an explicit model. Ends if callers require a successful catalog.
  } catch (err) {
    return failedListing(err, dial.secrets);
  }
}

async function probe(req: ProbeRequest, fetchImpl: typeof fetch, now: () => number): Promise<CredentialHealth> {
  const checkedAt = now();
  try {
    await fetchAnthropicModels(dialOf(req), fetchImpl);
    return { status: "ok", checkedAt };
    // the probe returns the failure as `revoked` or `unreachable` health with a sanitized reason at anthropic-messages/index.ts:90. Ends if the returned health stops carrying that disposition.
  } catch (err) {
    const reason = sanitizeApiError(redactSecretsFromText(errorMessage(err), resolvedScrubSet(req.connection)));
    return AUTH_FAILURE_RE.test(reason) ? { status: "revoked", checkedAt, reason } : { status: "unreachable", checkedAt, reason };
  }
}

export function createAnthropicBackend(deps: AnthropicBackendDeps): ProviderBackend {
  const normalize: NormalizeImageBytes = deps.imageToPng !== undefined ? createImageNormalizer(deps.imageToPng) : passthroughImageNormalizer;
  const transport: AnthropicTransportDeps = {
    fetch: deps.fetch,
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    ...(deps.captureWireReply !== undefined ? { captureWireReply: deps.captureWireReply } : {}),
  };
  const chatDeps = { now: deps.now, random: deps.random, scheduleTimeout: deps.scheduleTimeout, log: deps.log, addSpanEvent: deps.addSpanEvent, transport };
  const runChatTurn = (req: ChatRequest): Promise<ChatResult> => {
    if (!isAnthropicChatRequest(req)) {
      return Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: `anthropic-messages backend received api="${req.api}"` }));
    }
    return runAnthropicChatTurn(req, chatDeps);
  };
  const sideGen = (req: SummarizeRequest | StructuredRequest): ReturnType<typeof runSideGen> =>
    runSideGen(req, {
      runChatTurn,
      concurrency: req.connection.features.concurrency?.summarize ?? DEFAULT_CONCURRENCY,
      normalize,
      log: deps.log,
      now: deps.now,
    });
  return {
    wire: "anthropic-messages",
    runChatTurn,
    summarize: sideGen,
    structured: sideGen,
    probe: (req) => probe(req, deps.fetch, deps.now),
    listModels: (req) => listAnthropicModels(dialOf(req), deps.fetch),
  };
}

export type { AnthropicBackendDeps, AnthropicModelsDial } from "../../contract/anthropic-backend.ts";
