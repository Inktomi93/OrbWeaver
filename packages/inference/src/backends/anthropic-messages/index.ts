// The `anthropic-messages` wire's sealed backend (§8.5): a first-party API key over `@ai-sdk/anthropic`.
// Serves chat / summarize / structured + the credential probe and the model list (`GET /v1/models`). No
// agent path (the Claude Code loop needs the runtime — the subscription wire's), no embeddings, no images.

import type { CredentialHealth } from "@orb/contracts/credentials";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import type { ProviderBackend } from "../../contract/backend.ts";
import type { ChatResult } from "../../contract/chat.ts";
import type { ListModelsRequest, ListModelsResult, ProbeRequest } from "../../contract/diagnostics.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { InferenceDeps } from "../../deps.ts";
import { fetchJson } from "../kit/fetch-json.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../kit/image-normalize.ts";
import { redactSecretsFromText } from "../kit/openai-body.ts";
import type { AddSpanEvent } from "../kit/retry.ts";
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

async function listModels(req: ListModelsRequest, fetchImpl: typeof fetch): Promise<ListModelsResult> {
  const { connection } = req;
  const label = `${connection.providerId} models`;
  const result = await fetchJson({
    fetch: fetchImpl,
    url: `${anthropicBaseUrl(connection, label)}${MODELS_PATH}`,
    headers: headersOf(connection.credential.secret),
    secrets: resolvedScrubSet(connection),
    label,
    ...(req.signal !== undefined ? { signal: req.signal } : {}),
  });
  const models = modelsSchema.parse(result.json).data.map((row) => ({
    id: row.id,
    name: row.display_name ?? row.id,
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: [],
    outputModalities: [],
    supportedParameters: [],
    maxCompletionTokens: null,
    reasoning: null,
  }));
  return { listed: models.length > 0, models };
}

async function probe(req: ProbeRequest, fetchImpl: typeof fetch, now: () => number): Promise<CredentialHealth> {
  const checkedAt = now();
  try {
    await listModels(req, fetchImpl);
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
      if (req.api !== "anthropic-messages") {
        return Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: `anthropic-messages backend received api="${req.api}"` }));
      }
      return runAnthropicChatTurn(req, chatDeps);
    },
    summarize: (req) => runAnthropicSummarize(req, batchDeps),
    structured: (req) => runAnthropicStructured(req, batchDeps),
    probe: (req) => probe(req, deps.fetch, deps.now),
    // @orb-waive caught-failure-ownership(listModels): optional model discovery owns refusal as `listed:false`; generation remains usable with an explicit model. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if callers require a successful catalog.
    listModels: (req) => listModels(req, deps.fetch).catch((): ListModelsResult => ({ listed: false, models: [] })),
  };
}
