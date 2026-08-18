// The vLLM streaming chat-role surface: a stateless OpenAI-style turn streamed over SSE from the loopback
// gen engine, drained through the shared kit openai-compat reducer. Simpler than the openrouter runner —
// one provider, no routing/cache_control choreography, no reasoning strip-and-replay.

import type { ChatContentPart } from "@orb/contracts/chat";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { deepMergeRequestBody } from "@orb/server/kit/custom-parameters";
import type { ChatCompletionStreamChunk, MapTurnContext, StreamDelta } from "../../backends/kit/index.ts";
import {
  buildOpenAiSamplingFields,
  chatHistoryText,
  effortToOpenAIReasoning,
  IDLE_TIMEOUT_MS,
  mapChatCompletionToTurnResult,
  parseOpenAiSse,
  rawResponseFormat,
  rawToolCallDeltas,
  rawToolChoice,
  rawWireTools,
  reduceChatCompletionStream,
  turnAbortSignal,
} from "../../backends/kit/index.ts";
import type {
  ChatEvent,
  ChatHistoryMessage,
  ChatResult,
  HistoryRole,
  ResolvedChatKnobs,
  ResolvedReasoning,
  ResolvedWarning,
  ResponseFormat,
  VllmChatRequest,
  WireCaptureSink,
} from "../../contract/index.ts";
import { resolveChat } from "../../resolve-chat.ts";
import type { VllmEngineClient } from "../engine/index.ts";

// Qwen3-VL-8B-Instruct card default applied when the preset is silent (not in generation_config.json). The
// FALLBACK when compose doesn't inject the resolved getter (tests); the LIVE value comes from
// deps.genPresencePenalty (item 7 — engineLaunch.genPresencePenalty, env floor 1.5 ⊕ AppSettings override).
// 2026-08-10: 1.5 → 0.0 with the THINKING-checkpoint swap, tracking VLLM_GEN_PRESENCE_PENALTY_DEFAULT.
// This is the fallback for the no-getter-injected path only (compose always injects), but a fallback that
// disagrees with the env floor is a second home for the same value waiting to be read as authoritative.
// Qwen's card gives presence_penalty 0.0 for both thinking modes; 1.5 is its non-thinking number.
const CARD_DEFAULT_PRESENCE_PENALTY = 0.0;

// The repetition_penalty applied when the preset is silent AND compose didn't inject the resolved getter
// (tests only — compose always injects `deps.genRepetitionPenalty`, engineLaunch.genRepetitionPenalty =
// VLLM_GEN_REPETITION_PENALTY ⊕ AppSettings). 1.0 = NO penalty, which is what every Qwen checkpoint we serve
// ships in its own generation_config.json — so the fallback is a no-op multiplier, never a second opinion
// about the model's sampling. This value USED to be baked into the serve command as
// `--override-generation-config` because the retired agent-sdk /v1/messages wire carried no per-request
// sampler; that wire is gone (dispatch.ts rejects agent-sdk×vllm), every surviving surface carries samplers
// per request, and a launch bake silently outranked the checkpoint's own config on EVERY request.
const CARD_DEFAULT_REPETITION_PENALTY = 1.0;

const CHAT_PATH = "/v1/chat/completions";

export interface VllmChatDeps {
  readonly client: VllmEngineClient;
  readonly now: () => number;
  /** TASK-24 wire-capture: records the FINAL /v1/chat/completions body this surface POSTs. Absent ⇒ no
   *  capture (the compose default) — a plain send, zero cost. */
  readonly captureWire?: WireCaptureSink | undefined;
  /** Live getter for the per-request presence-penalty default applied when a preset is silent (item 7). Read
   *  per request so an admin retune applies immediately. Absent ⇒ the card-default fallback. */
  readonly genPresencePenalty?: (() => number) | undefined;
  /** Live getter for the per-request repetition-penalty default applied when a preset is silent. Same shape
   *  and same reason as {@link VllmChatDeps.genPresencePenalty}: read per request so an admin retune applies
   *  immediately, with NO engine restart (this default used to be a launch flag). Absent ⇒ the 1.0 no-op. */
  readonly genRepetitionPenalty?: (() => number) | undefined;
}

interface WireMessage {
  readonly role: HistoryRole | "system";
  readonly content: string;
  readonly name?: string;
  readonly tool_calls?: readonly Record<string, unknown>[];
  readonly tool_call_id?: string;
}

function wireToolCalls(content: readonly ChatContentPart[]): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  for (const part of content) {
    if (part.type === "tool-call") {
      calls.push({
        id: part.toolCallId,
        type: "function",
        function: { name: part.name, arguments: part.arguments },
      });
    }
  }
  return calls;
}

function wireToolResults(content: readonly ChatContentPart[]): WireMessage[] {
  const out: WireMessage[] = [];
  for (const part of content) {
    if (part.type === "tool-result") {
      out.push({ role: "tool", tool_call_id: part.toolCallId, content: part.content });
    }
  }
  return out;
}

// null when empty; a text-less assistant tool-call turn is kept — the calls ARE its content.
function wireTurnMessage(turn: ChatHistoryMessage): WireMessage | null {
  const text = chatHistoryText(turn.content);
  const toolCalls = turn.role === "assistant" ? wireToolCalls(turn.content) : [];
  if (text.trim().length === 0 && toolCalls.length === 0) {
    return null;
  }
  return {
    role: turn.role,
    content: text,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(turn.name !== undefined ? { name: turn.name } : {}),
  };
}

function toMessages(req: VllmChatRequest): WireMessage[] {
  const system = [req.systemPrompt.static, req.systemPrompt.dynamic].filter((s) => s.trim().length > 0).join("\n\n");
  const history: WireMessage[] = [];
  for (const turn of req.history) {
    if (turn.role === "tool") {
      history.push(...wireToolResults(turn.content));
      continue;
    }
    const message = wireTurnMessage(turn);
    if (message !== null) {
      history.push(message);
    }
  }
  return system.length > 0 ? [{ role: "system", content: system }, ...history] : history;
}

/** The admin-tier sampler defaults that fill a PRESET-SILENT request (engineLaunch.gen*Penalty, resolved per
 *  request by the caller). A preset value always wins — these only reach the wire when the preset said
 *  nothing, which is the whole reason they are not baked into the serve command. */
interface SamplerDefaults {
  readonly presencePenalty: number;
  readonly repetitionPenalty: number;
}

// ── THE THINKING DOOR ON THIS WIRE — `chat_template_kwargs`.
//
// PROVENANCE OF THE FIELD NAMES (they are DERIVED FROM THIS REPO'S OWN SOURCES, not guessed at an API, and
// NOT yet confirmed by a live probe — the gen engine was down through this lane's window, mid owner-ordered
// model swap): both names are read straight out of the two files that already own them —
//   • `scripts/dev/qwen3_gen_thinking_serve.jinja` (the template WE vendor and serve) branches on the
//     template variables `enable_thinking` (:6, :18) and `reasoning_effort` (:43-52);
//   • `engine/build-argv.ts` (:286) passes those exact two names through
//     `--default-chat-template-kwargs '{"enable_thinking": false, "preserve_thinking": true}'`, which is the
//     BOOT half of the same `chat_template_kwargs` map — so the per-request half is the documented override
//     for the identical keys, and its own comment (:306-309) names `reasoning_effort` as the per-call lever.
// A live `/tokenize` differential (low vs xhigh render DIFFERENT instruction strings, so the token counts
// must differ) is the outstanding confirmation; the probe bodies are staged and named in this lane's report.
//
// Our vendored fixed chat template (`scripts/dev/qwen3_gen_thinking_serve.jinja`, passed by `genArgv`) reads
// TWO template variables: `enable_thinking` (the on/off) and `reasoning_effort` (the depth). The launch bakes
// `--default-chat-template-kwargs {"enable_thinking": false}`, so the checkpoint reasons only when a REQUEST
// overrides that default — and the override door for a chat-template VARIABLE is `chat_template_kwargs`, the
// same map the boot flag supplies defaults for. That is why both fields ride there rather than at the top
// level: `reasoning_effort` alone cannot turn thinking on, because the baked `enable_thinking:false` short-
// circuits the template's whole reasoning branch before any effort is read.
//
// THE EFFORT LADDER. The template recognizes `low` | `medium` | `high`|`xhigh`, and its ELSE branch folds
// anything unrecognized to `xhigh`. `effortToOpenAIReasoning` owns the shared vocab (our `max` → the wire's
// `xhigh`) and is never re-spelled here — but it maps `minimal` to a literal `minimal`, which THIS template
// does not know, so the else-branch would silently buy MAXIMUM thinking for the user who asked for the least.
// The descriptor deliberately still ADVERTISES `minimal` (err-open, owner ruling 2026-08-18 — see
// `VLLM_REASONING`), so the honesty has to live here, in the wire projection: `minimal` lands on the
// template's real floor. Withholding the level would have been the other fix, and it is the one the ruling
// rejects — never hide a knob to prevent a surprise you can instead translate correctly.
const TEMPLATE_EFFORT_FLOOR = "low";
const UNKNOWN_TO_TEMPLATE_EFFORT = "minimal";

/** The funnel's resolved reasoning → this wire's per-request template kwargs. Reasoning OFF (the common path:
 *  the descriptor is `defaultEnabled:false`, so silence means off) emits NOTHING — byte-identical to every
 *  pre-reasoning body, so the baked launch default stands and no prefix-cache entry is disturbed. A resolved
 *  effort emits the pair; a budget never appears (this wire has no per-request budget field, permanently —
 *  the `--reasoning-config` mechanism is owner-ruled out, and the funnel makes that drop loud). */
function reasoningFields(reasoning: ResolvedReasoning): Record<string, unknown> {
  if (!reasoning.enabled || reasoning.effort === undefined) {
    return {};
  }
  const wire = effortToOpenAIReasoning({ enabled: true, effort: reasoning.effort }).effort;
  return {
    chat_template_kwargs: {
      enable_thinking: true,
      reasoning_effort: wire === UNKNOWN_TO_TEMPLATE_EFFORT ? TEMPLATE_EFFORT_FLOOR : wire,
    },
  };
}

function buildBody(req: VllmChatRequest, resolved: ResolvedChatKnobs, defaults: SamplerDefaults, warnings: ResolvedWarning[]): Record<string, unknown> {
  const s = resolved.sampling;
  const sampling = buildOpenAiSamplingFields({
    temperature: s.temperature,
    topP: s.topP,
    topK: s.topK,
    frequencyPenalty: s.frequencyPenalty,
    // The admin-tier defaults still fill a PRESET-SILENT request — the funnel gates and clamps what the
    // preset SAID, it does not invent a value, so `undefined` here still means "the preset said nothing".
    presencePenalty: s.presencePenalty ?? defaults.presencePenalty,
    repetitionPenalty: s.repetitionPenalty ?? defaults.repetitionPenalty,
    minP: s.minP,
    topA: s.topA,
    seed: s.seed,
    logitBias: s.logitBias,
    stop: s.stop,
    // The effective output length is materialized upstream (chat engine pipeline) so this equals the
    // budget's `reserveOutputTokens`; the `?? DEFAULT` is the fail-safe for any non-chat caller (never the
    // window, which would let generation overflow the reserved history and 400 vLLM).
    maxTokens: resolved.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  });
  const modeled: Record<string, unknown> = {
    model: req.model,
    stream: true,
    stream_options: { include_usage: true },
    messages: toMessages(req),
    ...sampling,
    ...reasoningFields(resolved.reasoning),
    ...(req.tools !== undefined ? { tools: rawWireTools(req.tools) } : {}),
    ...(req.toolChoice !== undefined ? { tool_choice: rawToolChoice(req.toolChoice) } : {}),
    ...(req.responseFormat !== undefined ? { response_format: rawResponseFormat(strictByDefault(req.responseFormat)) } : {}),
  };
  // The escape hatch merges LAST but wins NOTHING it collides with — see {@link applyCustomParameters}.
  return applyCustomParameters(modeled, req.customParameters, warnings);
}

// STRICTFMT — the vLLM PIN. `rawResponseFormat` (backends/kit) invents nothing: `strict` rides only when the
// caller set it, because on an arbitrary OpenAI-family endpoint `strict:true` is a 400 (the 2026-08-02 probe
// matrix in backends/openrouter/index.ts). vLLM is the opposite case: its `response_format` is GUIDED DECODING,
// an enforcing wire where strict is the whole point — an 8B skips optional fields unless the compiled grammar
// requires the shape. So this backend internalizes its own quirk (Tier-3b) and defaults the knob HERE, where
// the enforcement claim is true. An explicit caller value still wins.
function strictByDefault(format: ResponseFormat): ResponseFormat {
  return format.strict === undefined ? { ...format, strict: true } : format;
}

// vLLM speaks raw snake_case; reshapes into the kit reducer's camelCase chunk shape.
interface RawDelta {
  readonly content?: string | null;
  /** vLLM 0.26 emits the reasoning delta as `reasoning`; older builds used `reasoning_content`. BOTH are
   *  declared and read (new name first) — LIVE-VERIFIED 2026-08-10 against 0.26 + the thinking checkpoint:
   *  streaming deltas carry ONLY `reasoning`, so a `reasoning_content`-only read silently dropped every
   *  reasoning token (no error, just an empty scratchpad). */
  readonly reasoning?: string | null;
  readonly reasoning_content?: string | null;
  readonly tool_calls?: unknown;
}
interface RawChoice {
  readonly delta?: RawDelta;
  readonly finish_reason?: string | null;
}
interface RawChunk {
  readonly choices?: RawChoice[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number } | null;
}

async function* toChunks(raw: AsyncIterable<unknown>): AsyncGenerator<ChatCompletionStreamChunk> {
  for await (const payload of raw) {
    const chunk = payload as RawChunk;
    const choice = chunk.choices?.[0];
    const usage =
      chunk.usage === null || chunk.usage === undefined
        ? undefined
        : {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
          };
    const toolCalls = rawToolCallDeltas(choice?.delta?.tool_calls);
    yield {
      choices: [
        {
          delta: {
            content: choice?.delta?.content,
            reasoning: choice?.delta?.reasoning ?? choice?.delta?.reasoning_content,
            ...(toolCalls !== undefined ? { toolCalls } : {}),
          },
          finishReason: choice?.finish_reason,
        },
      ],
      ...(usage !== undefined ? { usage } : {}),
    };
  }
}

// ── customParameters ON THE LOCAL ENGINE — owner word 2026-08-18, AMENDING the 2026-07-24 ruling.
//
// LEDGER ANCHOR PENDING: this amendment gets its own D-row, minted by the orchestrator at merge. The row is
// deliberately NOT cited by number here yet — the `d-citation-integrity` gate REDs a bare `D<n>` with no
// anchor in `Core-Path-Registry.md` (the ledger's high-water mark is D128 today), and a citation pointing at
// a ruling a reader cannot resolve is exactly the drift that gate exists to catch. The ruling is identified
// unambiguously by DATE + the commit it amends until then; swap in the number when the row lands.
//
// The escape hatch was locked to BYOK/custom-byo by commit 20ac4154c, whose stated reason was: "OpenRouter is
// a first-class owned integration whose knobs are the modeled sampling surface (the anti-SillyTavern-sprawl
// design); customParameters is a BYOK-only escape hatch." That reasoning read ONTO the local engine too (we
// launch the process — it is the most owned integration here), which is why this surface shipped the blob as a
// LOUD DROP first. The owner AMENDED the ruling rather than accept the drop: vLLM JOINS the escape hatch. The
// motivating case is real and recorded — `Core-ST-Feature-Gap-Register.md` rows 53/55: the exotic samplers
// (DRY, XTC, mirostat, dynatemp, TFS, typical_p, smoothing) have no first-class UI and "ride customParameters
// today", and the local engine is precisely the one that speaks them. OpenRouter's lock is UNCHANGED.
//
// THE POSTURE THIS SOURCE IS BUILT ON (owner ruling, 2026-08-18): vLLM capability varies per CHECKPOINT and
// is not reliably detectable — the gen slot's model is config, and a swapped checkpoint can gain or lose
// support for a knob with nothing on the wire announcing it (the fixed Qwen 3.8 template accepting MID-TURN
// system prompts is the owner's own example: no probe would ever have found it). So on this source the
// descriptor errs PERMISSIVE, user settings are TRUSTED, and we do not force — and the belt denylist below
// is therefore the ONLY load-bearing fence here. That is why it is enumerated so carefully and why each
// entry carries the incident or the mechanism that earned it: nothing else is holding.
//
// TWO TIERS OF PROTECTION, and they are different mechanisms for different reasons:
//   1. PRECEDENCE (below) covers every knob we MODEL. A named param — temperature, max_tokens, the reasoning
//      kwargs — wins over a customParameters key of the same name, because the modeled value is the one the
//      funnel capability-gated and clamped. The escape hatch extends the wire; it does not re-litigate it.
//   2. THE BELT DENYLIST ({@link BELT_OWNED_KEYS}) covers what we do NOT model but infra OWNS. These are
//      dropped outright, never merged, and the drop is loud — precedence alone would not be enough for them,
//      because several are keys the modeled body does not even emit, so there would be nothing to win the
//      collision and the user's value would ride unopposed.
const BELT_OWNED_KEYS: ReadonlySet<string> = new Set([
  // THE HANG KNOB (#165/#173). Sending this converts an over-window request from a fast, honest 400 into an
  // UNBOUNDED HANG — measured on this box's own engines: 21ms refusal without it, >30s (production bound 120s,
  // zero GPU activity, no request even logged) with it. It was removed from the embed + rerank surfaces at the
  // cost of two production incidents, and the window guard is now CLIENT-side (`clampToTokenBudget`). Letting
  // a preset re-add it would restore the exact landmine those issues were closed to remove — which is why this
  // denylist exists at all and is not merely a precedence rule.
  "truncate_prompt_tokens",
  // Its sibling — which END of an over-window prompt the engine cuts. The belt owns the cut, so this is dead
  // weight at best and a silent second opinion about truncation at worst (`rerank.ts` asserts its absence too).
  "truncation_side",
  // THE TRANSPORT SHAPE. This surface hardcodes `stream: true` and drives the response through an SSE reducer;
  // `stream: false` hands `parseOpenAiSse` a plain JSON object, which yields a turn that produces NOTHING while
  // looking healthy. `stream_options.include_usage` is what feeds the usage/cost accounting downstream.
  "stream",
  "stream_options",
  // IDENTITY + ASSEMBLY, owned above this layer. `model` is the resolved connection's model — the capability
  // window math, the cost attribution and the catalog identity all key off it, so overriding it here would
  // silently route a turn to a different model than the one the user picked and every downstream number would
  // describe the wrong one. `messages` is the assembled canon history (persona, world-info, injections, the
  // fit budget); a preset overwriting it discards the entire assembly pipeline.
  "model",
  "messages",
]);

/** Merge the preset's `customParameters` onto the modeled body (the 2026-08-18 amendment), minus the
 *  belt-owned keys. Returns the body UNCHANGED (byte-identical) when there is nothing to merge, so a preset
 *  that sets no escape hatch — every preset today — produces exactly the bytes it did before the amendment.
 *
 *  PRECEDENCE: the MODELED body wins on collision. `deepMergeRequestBody`'s second argument is the patch, so
 *  passing the modeled body there makes it overwrite the user's key rather than the reverse. This is the
 *  OPPOSITE of custom-byo (`runners/chat.ts`, where customParameters deliberately beats the resolved value):
 *  there the endpoint is the user's own and "your endpoint your risk" is the posture, here the endpoint is
 *  OURS and the funnel's capability-gated, clamped value is the one that keeps the turn inside the window. */
function applyCustomParameters(
  base: Record<string, unknown>,
  customParameters: Readonly<Record<string, unknown>> | undefined,
  warnings: ResolvedWarning[],
): Record<string, unknown> {
  if (customParameters === undefined) {
    return base;
  }
  const allowed: Record<string, unknown> = {};
  const denied: string[] = [];
  for (const key of Object.keys(customParameters)) {
    if (BELT_OWNED_KEYS.has(key)) {
      denied.push(key);
      continue;
    }
    allowed[key] = customParameters[key];
  }
  if (denied.length > 0) {
    // D41 no-silent-degrade: a PARTIAL drop still names exactly which keys died, so a user who set one of the
    // belt keys learns it did nothing instead of concluding the escape hatch is broken.
    warnings.push({
      code: "custom_parameters_ignored",
      message: `${CUSTOM_PARAMETERS_BELT_DROPPED}: ${denied.join(", ")}`,
    });
  }
  // `deepMergeRequestBody` is also the Layer-2 prototype-pollution belt (`server/kit/custom-parameters`) —
  // routing through it, rather than spreading, is what keeps the two-layer __proto__/constructor defense real.
  return Object.keys(allowed).length === 0 ? base : deepMergeRequestBody(allowed, base);
}

const CUSTOM_PARAMETERS_BELT_DROPPED = "customParameters keys dropped — owned by the vLLM infra belt and not overridable from a preset";
// The vLLM `tool` message is {role,tool_call_id,content} and nothing else (see `wireToolResults`), so a failed
// tool result reads to the model as an ordinary one — the identical wire limitation custom-byo reports.
const TOOL_RESULT_ERROR_DROPPED = "tool-result isError ignored: the OpenAI-compatible chat-completions wire has no tool-result error field";

/** The funnel's own degrade warnings plus the ones this SURFACE causes. Every drop on this wire is observable
 *  on the turn, never silent (D41). The customParameters drops are appended by {@link applyCustomParameters}
 *  during the body build, since only that pass knows which keys the belt actually took. */
function turnWarnings(resolved: ResolvedChatKnobs, req: VllmChatRequest, bodyWarnings: readonly ResolvedWarning[]): readonly ResolvedWarning[] {
  const warnings = [...resolved.warnings, ...bodyWarnings];
  if (req.history.some((turn) => turn.content.some((part) => part.type === "tool-result" && part.isError === true))) {
    warnings.push({ code: "tool_result_error_dropped", message: TOOL_RESULT_ERROR_DROPPED });
  }
  return warnings;
}

// ResolvedWarning → the turn's `warning` events — the same channel every other runner reports degrades on
// (fired on `onEvent` as the turn completes AND carried on the result).
function warningEvents(warnings: readonly ResolvedWarning[], at: number): ChatEvent[] {
  return warnings.map(({ code, message }) => ({ kind: "warning", at, code, message }));
}

export function createVllmChat(deps: VllmChatDeps): (req: VllmChatRequest) => Promise<ChatResult> {
  return async (req) => {
    const startedAt = deps.now();
    // A rolling idle timeout so a stalled loopback socket can't pin the chat slot forever.
    const { signal, reset, dispose } = turnAbortSignal(req.signal, IDLE_TIMEOUT_MS);

    const chatId = castId<ChatId>(req.chatId ?? "");
    let reasoning = "";
    const onDelta = (d: StreamDelta): void => {
      if (d.kind === "reasoning") {
        reasoning += d.text;
      }
      req.onDelta?.({ chatId, kind: d.kind, text: d.text });
    };

    // ONE funnel pass per turn (the hosted-runner contract, and now this surface's too): the resolved knobs
    // shape the body AND supply the turn's degrade warnings. Before this, the surface read `req.params` RAW —
    // which meant no capability gating, no clamping, and, once the gen slot became a THINKING checkpoint, no
    // path at all from a preset's reasoning dial to the wire.
    const resolved = resolveChat(req.params, req.capability);

    // Collects the drops the BODY BUILD discovers (the belt-denied customParameters keys) — only that pass
    // knows which keys the belt actually took, so it hands them to `turnWarnings` rather than re-deriving.
    const bodyWarnings: ResolvedWarning[] = [];

    try {
      const wireBody = buildBody(
        req,
        resolved,
        {
          presencePenalty: deps.genPresencePenalty?.() ?? CARD_DEFAULT_PRESENCE_PENALTY,
          repetitionPenalty: deps.genRepetitionPenalty?.() ?? CARD_DEFAULT_REPETITION_PENALTY,
        },
        bodyWarnings,
      );
      // TASK-24: capture the LITERAL openai-compat body right before it goes on the wire (the harness reads
      // this to prove the FE setting propagated truthfully into the real bytes). Only fires when compose
      // wired a sink (capture enabled); otherwise absent → zero cost.
      deps.captureWire?.({ chatId: req.chatId, api: req.api, backend: "vllm", model: req.model, body: wireBody });
      const body = await deps.client.engineStream("gen", CHAT_PATH, wireBody, signal);
      const view = await reduceChatCompletionStream(toChunks(parseOpenAiSse(body)), {
        onDelta,
        onChunk: reset,
      });
      const ctx: MapTurnContext = {
        model: req.model,
        startedAt,
        now: deps.now(),
        contextWindow: req.capability.context.window,
        maxOutputTokens: resolved.maxOutputTokens ?? null,
        reasoning,
      };
      const turn = mapChatCompletionToTurnResult(view, ctx);
      const warnings = warningEvents(turnWarnings(resolved, req, bodyWarnings), deps.now());
      for (const event of warnings) {
        req.onEvent?.(event);
      }
      return warnings.length > 0 ? { ...turn, events: [...turn.events, ...warnings] } : turn;
    } finally {
      dispose();
    }
  };
}
