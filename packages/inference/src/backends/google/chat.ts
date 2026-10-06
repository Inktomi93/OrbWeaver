// Native Google uses the shared funnel, prompt, stream reducer and pre-commit retry boundary.
import type { JSONObject } from "@ai-sdk/provider";
import type { GenerationCapability } from "@orb/contracts/inference";
import { acceptsAssistantPrefill } from "@orb/contracts/inference";
import type { ChatResult, GoogleChatRequest } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { RateLimitSnapshot } from "../../contract/events.ts";
import type { GoogleBackendDeps } from "../../contract/google.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { Resolved } from "../../contract/resolved.ts";
import { resolveChat } from "../../funnel/resolve-chat.ts";
import { requireStructuredPlan } from "../../structured/plan.ts";
import { structuredChatResult } from "../../structured/reply.ts";
import { effortWordOf } from "../kit/applied-effort.ts";
import { providerErrorFromHttp, withSchemaRejection } from "../kit/error-classify.ts";
import { observeChatResult } from "../kit/generation-observation.ts";
import { turnAbortSignal } from "../kit/idle-timeout.ts";
import { providerLogger } from "../kit/provider-log.ts";
import { rateLimitFromHeaders } from "../kit/rate-limit-headers.ts";
import { runWithPreCommitRetry } from "../kit/retry.ts";
import { resolvedScrubSet } from "../kit/sanitize.ts";
import { emitTurnSpanEvents } from "../kit/turn-span.ts";
import { plannedOptions } from "../v4/options.ts";
import { buildWirePlan } from "../v4/prompt.ts";
import { appliedSampling, DROPPED_SAMPLING_CODES, measuredCostOf, sdkWarnings, toChatResult } from "../v4/result.ts";
import { drainStream } from "../v4/stream.ts";
import { GOOGLE_KEY, googleModelId, googleProviderFor } from "./model.ts";
import { googleOptions, googleToolAsk } from "./options.ts";
import { googleServedModelOf, googleTokenDetailsOf, googleTokenUsageOf } from "./usage.ts";

function isJsonObject(value: unknown): value is JSONObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireGoogleGeneration(connection: Resolved): GenerationCapability {
  if (connection.capability.kind !== "generation") {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Google generation requires a generation model" });
  }
  return connection.capability.generation;
}

export async function runGoogleChat(req: GoogleChatRequest, deps: GoogleBackendDeps): Promise<ChatResult> {
  const { connection } = req;
  const label = `${connection.providerId} chat (${connection.model})`;
  const generation = requireGoogleGeneration(connection);
  const knobs = resolveChat(req.params, generation, { posture: req.posture, wire: connection.wire });
  const warnings: ResolvedWarning[] = [...knobs.warnings];
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const startedAt = deps.now();
  let firstDeltaAt: number | undefined;
  const nativeIdentity: { servedModel: string | null } = { servedModel: null };
  const response: { rateLimit: RateLimitSnapshot | null } = { rateLimit: null };
  const plan = buildWirePlan({ systemPrompt: req.systemPrompt, history: req.history, includeAssistantMedia: true });
  if (plan.endsOnAssistant && !acceptsAssistantPrefill(generation)) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: assistant prefill is unsupported` });
  }
  const structured = requireStructuredPlan(
    connection,
    { formats: req.responseFormat === undefined ? undefined : [req.responseFormat], ...googleToolAsk(req, generation, warnings) },
    label,
  );
  warnings.push(...structured.downgrades);
  const options = { ...googleOptions(req, knobs, generation, warnings), ...plannedOptions(structured) };
  const secrets = resolvedScrubSet(connection);
  const classify = (err: unknown): ProviderError =>
    err instanceof ProviderError
      ? err
      : withSchemaRejection(providerErrorFromHttp(err, label, secrets), err, { log, model: connection.model, mode: structured.mode, secrets });
  const drain = await runWithPreCommitRetry(
    async (markCommitted) => {
      const idle = turnAbortSignal(req.signal, connection.features.requestTimeoutMs);
      const commit = (): void => {
        firstDeltaAt ??= deps.now();
        markCommitted();
      };
      const target = req.chatId !== undefined && req.onDelta !== undefined ? { chatId: req.chatId, onDelta: req.onDelta } : undefined;
      try {
        const model = googleProviderFor({ connection, deps, label, api: req.api, chatId: req.chatId }).chat(googleModelId(connection.model));
        const result = await model.doStream({ ...options, includeRawChunks: true, prompt: plan.prompt, abortSignal: idle.signal });
        response.rateLimit = rateLimitFromHeaders(result.response?.headers, deps.now());
        return await drainStream(result.stream, {
          label,
          onRaw: (raw) => {
            nativeIdentity.servedModel = googleServedModelOf(raw) ?? nativeIdentity.servedModel;
          },
          onPart: idle.reset,
          onText: (text) => {
            commit();
            target?.onDelta({ chatId: target.chatId, kind: "text", text });
          },
          onReasoning: (text) => {
            commit();
            target?.onDelta({ chatId: target.chatId, kind: "reasoning", text });
          },
          onImage: commit,
        });
      } finally {
        idle.dispose();
      }
    },
    classify,
    {
      ...(req.signal === undefined ? {} : { signal: req.signal }),
      now: deps.now,
      ...(deps.random === undefined ? {} : { random: deps.random }),
      ...(deps.addSpanEvent === undefined ? {} : { addSpanEvent: deps.addSpanEvent }),
    },
  ).catch((err: unknown): never => {
    throw classify(err);
  });
  warnings.push(...sdkWarnings(drain.warnings));
  const thinking = options.providerOptions?.[GOOGLE_KEY]?.["thinkingConfig"];
  let appliedEffort: ChatResult["appliedEffort"] = null;
  if (isJsonObject(thinking)) {
    appliedEffort = thinking["thinkingBudget"] === 0 ? "none" : effortWordOf(thinking["thinkingLevel"]);
  }
  const folded = toChatResult(drain, {
    model: connection.model,
    providerId: connection.providerId,
    generation,
    maxOutputTokens: knobs.maxOutputTokens,
    startedAt,
    firstDeltaAt,
    now: deps.now(),
    measuredCost: measuredCostOf(drain.providerMetadata, drain.usage?.raw),
    pricing: connection.features.pricing,
    generationId: drain.responseId ?? null,
    appliedEffort,
    rateLimit: response.rateLimit,
    warnings,
    tokenUsage: googleTokenUsageOf(drain.usage?.raw),
    servedModel: nativeIdentity.servedModel,
    tokenDetails: googleTokenDetailsOf(drain.usage?.raw),
  });
  await observeChatResult(req, folded);
  const turn: ChatResult = structuredChatResult(
    folded.finishReason === "filter"
      ? {
          ...folded,
          events: [
            ...folded.events,
            { kind: "refusal", at: deps.now(), model: connection.model, category: folded.stopReason, explanation: null, retried: false, fallbackModel: null },
          ],
        }
      : folded,
    structured,
  );
  log.capability({
    turnId: knobs.turnId,
    api: req.api,
    providerId: connection.providerId,
    requestedModel: connection.model,
    turns: { ...generation.turns },
    droppedWarnings: warnings.map(({ code, message }) => ({ code, message })),
  });
  log.sampling({
    turnId: knobs.turnId,
    requested: { ...req.params },
    applied: appliedSampling(knobs.sampling, warnings),
    dropped: warnings
      .filter((warning) => DROPPED_SAMPLING_CODES.has(warning.code))
      .map((warning) => ({ knob: warning.knob ?? warning.code, reason: warning.message })),
  });
  emitTurnSpanEvents({
    addSpanEvent: deps.addSpanEvent,
    turnId: knobs.turnId,
    model: connection.model,
    startedAt,
    firstDeltaAt,
    turn,
    cache: { breakpointsPlaced: 0, readTokens: turn.usage.cacheReadTokens, writeTokens: turn.usage.cacheWriteTokens },
  });
  for (const event of turn.events) {
    req.onEvent?.(event);
  }
  return turn;
}
