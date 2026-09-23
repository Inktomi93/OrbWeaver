// The `anthropic-messages` wire's sealed backend (§8.5): a first-party API key over `@ai-sdk/anthropic`.
// Serves chat / summarize / structured + the credential probe and the model list (`GET /v1/models`). No
// agent path (the Claude Code loop needs the runtime — the subscription wire's), no embeddings, no images.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { ModelCatalogEntry, ModelListing } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import type { ProviderBackend } from "../../contract/backend.ts";
import type { AnthropicChatRequest, ChatRequest, ChatResult } from "../../contract/chat.ts";
import type { ListModelsRequest, ProbeRequest } from "../../contract/diagnostics.ts";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { AddSpanEvent } from "../../contract/runtime.ts";
import type { InferenceDeps } from "../../deps.ts";
import { fetchJson } from "../kit/fetch-json.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../kit/image-normalize.ts";
import { bareCatalogEntry, failedListing, listingOf } from "../kit/model-listing.ts";
import { redactSecretsFromText } from "../kit/openai-body.ts";
import { resolvedScrubSet, sanitizeApiError } from "../kit/sanitize.ts";
import { runAnthropicStructured, runAnthropicSummarize } from "./batch.ts";
import { runAnthropicChatTurn } from "./chat.ts";
import type { AnthropicTransportDeps } from "./model.ts";
import { anthropicBaseUrl } from "./model.ts";

const API_KEY_HEADER = "x-api-key";
const VERSION_HEADER = "anthropic-version";
const API_VERSION = "2023-06-01";
const MODELS_PATH = "/models";
const AUTH_FAILURE_RE = /\b401\b|\b403\b|unauthor|forbidden|invalid[\s_-]?api[\s_-]?key/iu;

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string(), display_name: z.string().optional() }).loose()) }).loose();

function isAnthropicChatRequest(req: ChatRequest): req is AnthropicChatRequest {
  return req.api === "anthropic-messages";
}

export interface AnthropicBackendDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly log: InferenceDeps["log"];
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly fetch: typeof fetch;
  readonly captureWire?: InferenceDeps["captureWire"];
  readonly captureWireReply?: InferenceDeps["captureWireReply"];
  readonly imageToPng?: InferenceDeps["imageToPng"];
}

function headersOf(secret: string | null): Record<string, string> {
  return { [VERSION_HEADER]: API_VERSION, ...(secret !== null && secret.length > 0 ? { [API_KEY_HEADER]: secret } : {}) };
}

/** One `GET /v1/models` dial. The key is a plain string: a saved connection's decrypted key, or a key typed into
 *  a draft that has nothing saved yet. `secrets` is what the dial's error text is scrubbed of. */
export interface AnthropicModelsDial {
  readonly baseUrl: string | null;
  readonly secret: string | null;
  readonly secrets: ProviderScrubSet;
  readonly label: string;
  readonly signal?: AbortSignal | undefined;
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

async function fetchModels(dial: AnthropicModelsDial, fetchImpl: typeof fetch): Promise<ModelCatalogEntry[]> {
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
    return listingOf(await fetchModels(dial, fetchImpl));
    // @orb-waive caught-failure-ownership(err): optional model discovery owns refusal as `listed:false` with the scrubbed reason; generation remains usable with an explicit model. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if callers require a successful catalog.
  } catch (err) {
    return failedListing(err, dial.secrets);
  }
}

async function probe(req: ProbeRequest, fetchImpl: typeof fetch, now: () => number): Promise<CredentialHealth> {
  const checkedAt = now();
  try {
    await fetchModels(dialOf(req), fetchImpl);
    return { status: "ok", checkedAt };
    // @orb-waive caught-failure-ownership(err): credential probes own failures as typed revoked/unreachable health with a sanitized reason. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if the returned health stops carrying that disposition.
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
  const chatDeps = { now: deps.now, random: deps.random, log: deps.log, addSpanEvent: deps.addSpanEvent, transport };
  const batchDeps = { now: deps.now, log: deps.log, transport, normalize };
  return {
    wire: "anthropic-messages",
    runChatTurn: (req): Promise<ChatResult> => {
      if (!isAnthropicChatRequest(req)) {
        return Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: `anthropic-messages backend received api="${req.api}"` }));
      }
      return runAnthropicChatTurn(req, chatDeps);
    },
    summarize: (req) => runAnthropicSummarize(req, batchDeps),
    structured: (req) => runAnthropicStructured(req, batchDeps),
    probe: (req) => probe(req, deps.fetch, deps.now),
    listModels: (req) => listAnthropicModels(dialOf(req), deps.fetch),
  };
}
