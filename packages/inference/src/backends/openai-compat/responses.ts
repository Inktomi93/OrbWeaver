// ONE chat turn on the openai-compat wire's `/responses` protocol (`CHAT_APIS` member "responses";
// `apis.ts` records the revival ruling). The transport is `@ai-sdk/openai`'s `.responses()` model — the
// SDK folds the Responses SSE events into the SAME V4 stream parts every other wire emits, so the shared
// prompt builder, drain, and result mapper ride here unchanged. What differs is spelled here: stateless
// sends (`store: false` — replay works without item ids, MEASURED 2026-11-16: reasoning items replay
// with id, without id, and omitted alike), effort as `reasoning.effort`, and the structured plan's strict
// flag made explicit (`strictJsonSchema` defaults TRUE SDK-side, and strict grammar rejects optional
// properties — MEASURED — so a plan that did not ask for strict must not get it).
//
// Deliberately absent vs `chat.ts`: the openrouter transports (no OR row serves `/responses` today), the
// explicit cache-marker placement and beta route (implicit prompt caching needs no markers — MEASURED,
// `cached_tokens` rides the terminal usage), assistant prefill and the template kwargs (no local server
// serves this route), and the unmodelled sampler knobs — the Responses body models no `top_k`/`min_p`/
// `logit_bias` arm, so each rides a loud `sampling_knob_dropped`.

import type { LanguageModelV4CallOptions, SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { GenerationCapability, ResolvedWarning } from "@orb/contracts/inference";
import { WARNING_CODE } from "@orb/contracts/inference";
import type { ChatResult, RateLimitSnapshot, ResolvedChatKnobs, ResponsesChatRequest } from "#contract";
import { ProviderError } from "#contract";
import { resolveChat, templateThinkingFor } from "#funnel";
import type { ModelCall, OpenAiCompatChatDeps } from "#src/contract/openai-backend.ts";
import type { StructuredPlan } from "#src/contract/structured.ts";
import type { StreamDrain } from "#src/contract/v4.ts";
import { requireStructuredPlan, structuredChatResult } from "#structured";
import { forbiddenAsRefusal, providerErrorFromHttp, refusalWords, withSchemaRejection } from "../http/error-classify.ts";
import { observeChatResult } from "../http/generation-observation.ts";
import { turnAbortSignal } from "../http/idle-timeout.ts";
import { providerLogger } from "../http/provider-log.ts";
import { rateLimitCanaryEvent, rateLimitFromHeaders } from "../http/rate-limit-headers.ts";
import { runWithPreCommitRetry } from "../http/retry.ts";
import { resolvedScrubSet } from "../http/sanitize.ts";
import { emitTurnSpanEvents } from "../http/turn-span.ts";
import { plannedOptions, standardSampling } from "../v4/options.ts";
import { buildWirePlan } from "../v4/prompt.ts";
import { appliedSampling, DROPPED_SAMPLING_CODES, measuredCostOf, sdkWarnings, toChatResult } from "../v4/result.ts";
import { drainStream } from "../v4/stream.ts";
import { effortWordOf } from "../wire/applied-effort.ts";
import { responsesModelFor } from "./model.ts";
import { compatibleReasoning } from "./reasoning.ts";
import { wireSampling } from "./sampling.ts";
import { resolveWordBias } from "./tokens.ts";

function requireGeneration(connection: ResponsesChatRequest["connection"], label: string): GenerationCapability {
  if (connection.capability.kind !== "generation") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${label}: the connection's model is a ${connection.capability.kind} model, not a generation model`,
    });
  }
  return connection.capability.generation;
}

/** What the Responses option builder reads: the resolved knobs, their wire spelling, the structured plan,
 *  and rule 5b's template-thinking state (a folded turn's mount is off on a row whose switch IS the effort
 *  word — a model that thinks answers the mount call-only and the beat loses its prose). */
interface ResponsesTurn {
  readonly knobs: ResolvedChatKnobs;
  readonly sampling: ReturnType<typeof wireSampling>;
  readonly structured: StructuredPlan;
  readonly templateThinking: boolean | undefined;
}

/** The turn's V4 call options, built ONCE (no mandatory-reasoning replay on this route, so every attempt
 *  sends the same body): modeled samplers, the effort word, the plan's tools/format, and the Responses
 *  knobs the SDK only reads through `providerOptions.openai` — `systemMessageMode: "system"` is
 *  load-bearing (an off-catalog model resolves it to `undefined`, which makes the SDK's converter THROW
 *  on any system row), `store: false` keeps the send stateless, and `strictJsonSchema` carries the PLAN's
 *  strictness because the SDK default (`true`) would hand every schema to the grammar compiler the plan
 *  declined. */
function responsesOptions(
  req: ResponsesChatRequest,
  turn: ResponsesTurn,
  warnings: ResolvedWarning[],
): Omit<LanguageModelV4CallOptions, "prompt" | "abortSignal"> {
  const { connection } = req;
  const { knobs, sampling, structured } = turn;
  const { word: effort, body: budget } = compatibleReasoning(connection.features, knobs.reasoning, turn.templateThinking, warnings);
  // The row-spelled unmodelled knobs (the thinking budget included) have no Responses body arm; each drops loudly.
  for (const knob of Object.keys(budget)) {
    warnings.push({ code: "sampling_knob_dropped", message: `${knob} ignored: the /responses route has no field for it` });
  }
  // The Responses body the SDK builds carries exactly two samplers (MEASURED in `@ai-sdk/openai` 4.0.99's
  // responses `prepareRequest`: `temperature`, `top_p`, plus `max_output_tokens`); `stopSequences`,
  // `seed`, `topK` and the penalties ride the V4 options and the SDK itself warns each off the body, which
  // lands on the sampling receipt through `sdkWarnings`. So only the chat wire's extra body spellings
  // (top_k on this dialect, and whatever `extras`/aliases the row spells) have no home at all here.
  for (const knob of Object.keys(sampling.body)) {
    if (knob !== "temperature" && knob !== "top_p") {
      warnings.push({ code: "sampling_knob_dropped", message: `${knob} ignored: the /responses route carries no such sampler field` });
    }
  }
  const strict = structured.responseFormat?.vehicle === "response-format" ? structured.responseFormat.strict : undefined;
  const providerOptions: SharedV4ProviderOptions = {
    openai: {
      systemMessageMode: "system",
      store: false,
      ...(strict !== undefined ? { strictJsonSchema: strict } : {}),
      ...(knobs.verbosity !== undefined ? { textVerbosity: knobs.verbosity } : {}),
    },
  };
  return {
    ...standardSampling(sampling.v4, knobs.maxOutputTokens),
    ...(effort !== undefined ? { reasoning: effort } : {}),
    ...plannedOptions(structured),
    providerOptions,
  };
}

/** Runs one `/responses` turn (the api-narrowed arm this file serves). */
export async function runOpenAiCompatResponsesTurn(req: ResponsesChatRequest, deps: OpenAiCompatChatDeps): Promise<ChatResult> {
  const { connection } = req;
  const label = `${connection.providerId} responses (${connection.model})`;
  const generation = requireGeneration(connection, label);
  const knobs = resolveChat(req.params, generation, { posture: req.posture, wire: connection.wire });
  const warnings: ResolvedWarning[] = [...knobs.warnings];
  if (req.prefillReasoning !== undefined) {
    // This route models no forced continuation (a trailing assistant input item reads continue-LIKE but may
    // restart — `docs/law/deepseek-api-surface.md`), so an authored chain of thought has no row to ride.
    warnings.push({ code: WARNING_CODE.prefillReasoningDropped, message: "prefill reasoning dropped: the /responses protocol has no continue row to seed" });
  }
  const log = providerLogger(deps.log, connection.wire, connection.providerId);
  const startedAt = deps.now();
  let firstDeltaAt: number | undefined;
  const attempt: { rateLimit: RateLimitSnapshot | null } = { rateLimit: null };
  const secrets = resolvedScrubSet(connection);
  const plan = buildWirePlan({ systemPrompt: req.systemPrompt, history: req.history });
  if (plan.toolResultErrorDropped) {
    warnings.push({ code: "tool_result_error_dropped", message: "tool-result isError ignored: the OpenAI-shaped chat wire has no tool-result error field" });
  }
  const structured = requireStructuredPlan(
    connection,
    {
      formats: req.responseFormat === undefined ? undefined : [req.responseFormat],
      tools: req.tools,
      toolChoice: req.toolChoice,
      reasoningOff: knobs.reasoning.offChosen === true,
    },
    label,
  );
  warnings.push(...structured.downgrades);
  const forbiddenIsNotCredentialVerdict = connection.features.forbiddenIsNotCredentialVerdict === true;
  const classify = (err: unknown): ProviderError => {
    // Same rule as the chat-completions runner: an error the stream drain already typed (a frame's status)
    // meets the same 403 rule as one from before the stream.
    if (err instanceof ProviderError) {
      return forbiddenAsRefusal({ error: err, classified: err, label, secrets, forbiddenIsNotCredentialVerdict });
    }
    const classified = withSchemaRejection(providerErrorFromHttp(err, label, secrets, deps.now), err, {
      log,
      model: connection.model,
      mode: structured.mode,
      secrets,
    });
    return forbiddenAsRefusal({ error: err, classified, label, secrets, forbiddenIsNotCredentialVerdict });
  };

  const sampling = await resolveWordBias({ sampling: knobs.sampling, connection, lexicon: deps.tokens, warnings, signal: req.signal });
  const turnKnobs: ResponsesTurn = {
    knobs,
    sampling: wireSampling(sampling, connection.features, "openai-compatible", warnings),
    structured,
    templateThinking: templateThinkingFor(req.params, generation, req.terminalToolsAttached === true, req.posture),
  };
  const baseOptions = responsesOptions(req, turnKnobs, warnings);
  const deltaTarget = req.chatId === undefined || req.onDelta === undefined ? undefined : { chatId: req.chatId, onDelta: req.onDelta };
  const call: ModelCall = {
    connection,
    deps: deps.transport,
    label,
    api: req.api,
    plan,
    prefillAllowed: false,
    templateThinking: undefined,
    templatePreserveReasoning: undefined,
    foldSameRole: false,
    replyImages: knobs.replyImages,
    warnings,
    ...(req.chatId !== undefined ? { chatId: req.chatId } : {}),
  };

  // The idle window is PER ATTEMPT (a pre-commit retry redials): the same discipline as `chat.ts`.
  const streamOnce = async (markCommitted: () => void): Promise<StreamDrain> => {
    const idle = turnAbortSignal(req.signal, connection.features.requestTimeoutMs, deps.scheduleTimeout);
    const model = responsesModelFor(call, effortWordOf(baseOptions.reasoning) ?? undefined);
    let first = true;
    const commit = (): void => {
      if (first) {
        first = false;
        firstDeltaAt = deps.now();
      }
      markCommitted();
    };
    try {
      const { stream, response } = await model.doStream({ ...baseOptions, prompt: plan.prompt, abortSignal: idle.signal });
      attempt.rateLimit = rateLimitFromHeaders(response?.headers, deps.now());
      return await drainStream(stream, {
        label,
        // The SDK hands a chunk's `error` object as the part's payload; it carries `message` like a refusal body.
        errorWords: (payload) => refusalWords({ error: payload }, secrets),
        onPart: idle.reset,
        onText: (text): void => {
          commit();
          deltaTarget?.onDelta({ chatId: deltaTarget.chatId, kind: "text", text });
        },
        onReasoning: (text): void => {
          commit();
          deltaTarget?.onDelta({ chatId: deltaTarget.chatId, kind: "reasoning", text });
        },
      });
    } finally {
      idle.dispose();
    }
  };

  // The typed-failure boundary, same ruling as `chat.ts`: the raw error feeds the retry policy, the
  // consumer only ever sees `ProviderError`.
  const drain = await runWithPreCommitRetry(streamOnce, classify, {
    scheduleTimeout: deps.scheduleTimeout,
    signal: req.signal,
    now: deps.now,
    random: deps.random,
    ...(deps.addSpanEvent !== undefined ? { addSpanEvent: deps.addSpanEvent } : {}),
  }).catch((err: unknown): never => {
    throw classify(err);
  });
  warnings.push(...sdkWarnings(drain.warnings));
  const finishedAt = deps.now();
  const folded = toChatResult(drain, {
    model: connection.model,
    providerId: connection.providerId,
    generation,
    maxOutputTokens: knobs.maxOutputTokens,
    startedAt,
    firstDeltaAt,
    now: finishedAt,
    measuredCost: measuredCostOf(drain.providerMetadata, drain.usage?.raw),
    pricing: connection.features.pricing,
    // The Responses envelope's own id (`resp_…`/vendor form) — opaque provenance on the row, same as `gen-…`.
    generationId: drain.responseId ?? null,
    // What the built options carried — what was asked, read off the body that went out, never recomputed.
    appliedEffort: effortWordOf(baseOptions.reasoning),
    rateLimit: attempt.rateLimit,
    warnings,
  });
  const canary = rateLimitCanaryEvent(attempt.rateLimit, finishedAt);
  await observeChatResult(req, folded);
  const turn: ChatResult = structuredChatResult(canary === null ? folded : { ...folded, events: [...folded.events, canary] }, structured);
  if (attempt.rateLimit !== null) {
    log.emit(attempt.rateLimit.status === "allowed" ? "debug" : "warn", "provider.rate_limit", { turnId: knobs.turnId, ...attempt.rateLimit });
  }
  log.capability({
    turnId: knobs.turnId,
    api: req.api,
    providerId: connection.providerId,
    requestedModel: connection.model,
    turns: { ...generation.turns },
    droppedWarnings: warnings.map((w) => ({ code: w.code, message: w.message })),
  });
  log.sampling({
    turnId: knobs.turnId,
    requested: { ...req.params },
    applied: { ...appliedSampling(knobs.sampling, warnings), ...(knobs.verbosity !== undefined ? { verbosity: knobs.verbosity } : {}) },
    dropped: warnings.filter((w) => DROPPED_SAMPLING_CODES.has(w.code)).map((w) => ({ knob: w.knob ?? w.code, reason: w.message })),
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
