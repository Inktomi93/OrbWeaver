// The vLLM streaming chat-role surface: a stateless OpenAI-style turn streamed over SSE from the loopback
// gen engine, drained through the shared kit openai-compat reducer. Simpler than the openrouter runner —
// one provider, no routing/cache_control choreography, no reasoning strip-and-replay.

import type { ChatContentPart } from "@orb/contracts/chat";
import type { ModelCapability } from "@orb/contracts/connection";
import { acceptsAssistantPrefill } from "@orb/contracts/connection";
import { DEFAULT_MAX_OUTPUT_TOKENS, isVllmBeltOwnedParameterKey } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { deepMergeRequestBody } from "@orb/server/kit/custom-parameters";
import type { ChatCompletionStreamChunk, MapTurnContext, StreamDelta } from "../../backends/kit/index.ts";
import {
  buildOpenAiSamplingFields,
  chatHistoryOpenAiContent,
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
  OpenAiRawContentPart,
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
  /** Plain string for a text-only turn (byte-stable — the prefix cache keys on it); the OpenAI-compatible
   *  content-part array when the turn carries image/video parts (D45/#317 — `video_url` is vLLM's
   *  documented multimodal extension, sampled by the engine's launch-time `fps`/`max_frames` kwargs). */
  readonly content: string | OpenAiRawContentPart[];
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

// null when empty; a text-less assistant tool-call turn is kept — the calls ARE its content — and a
// media-carrying turn is kept even when its text is empty (the parts ARE its content).
function wireTurnMessage(turn: ChatHistoryMessage): WireMessage | null {
  const content = chatHistoryOpenAiContent(turn.content);
  const toolCalls = turn.role === "assistant" ? wireToolCalls(turn.content) : [];
  if (typeof content === "string" && content.trim().length === 0 && toolCalls.length === 0) {
    return null;
  }
  return {
    role: turn.role,
    content,
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
//   • `packages/server/src/infra/providers/vllm/engine/templates/qwen3_gen_thinking_serve.jinja` (the template WE vendor and serve) branches on the
//     template variables `enable_thinking` (:6, :18) and `reasoning_effort` (:43-52);
//   • `engine/build-argv.ts` (:286) passes those exact two names through
//     `--default-chat-template-kwargs '{"enable_thinking": false, "preserve_thinking": true}'`, which is the
//     BOOT half of the same `chat_template_kwargs` map — so the per-request half is the documented override
//     for the identical keys, and its own comment (:306-309) names `reasoning_effort` as the per-call lever.
// A live `/tokenize` differential (low vs xhigh render DIFFERENT instruction strings, so the token counts
// must differ) is the outstanding confirmation; the probe bodies are staged and named in this lane's report.
//
// Our vendored fixed chat template (`packages/server/src/infra/providers/vllm/engine/templates/qwen3_gen_thinking_serve.jinja`, passed by `genArgv`) reads
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
 *  the `--reasoning-config` mechanism is owner-ruled out, and the funnel makes that drop loud).
 *
 *  A CONTENT PREFILL TAKES PRECEDENCE OVER THINKING, dropped-and-loud — see {@link PrefillMode} for the
 *  measurement. The two cannot ride the same turn on this wire, and the prefill is the more explicit request
 *  (a user authored the assistant row / pressed continue; `enable_thinking` came off a preset default). */
function reasoningFields(reasoning: ResolvedReasoning, prefill: PrefillMode, warnings: ResolvedWarning[]): Record<string, unknown> {
  if (!reasoning.enabled || reasoning.effort === undefined) {
    return {};
  }
  if (prefill === "content") {
    warnings.push({ code: "reasoning_dropped_for_prefill", message: REASONING_DROPPED_FOR_PREFILL });
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

// ── THE PREFILL DOOR ON THIS WIRE — `continue_final_message` + `add_generation_prompt`.
//
// On an array wire like Anthropic's, prefill IS the array shape: deliver a trailing assistant row and the
// model continues it. Not here. Our vendored template (`packages/server/src/infra/providers/vllm/engine/templates/qwen3_gen_thinking_serve.jinja`, served by
// `genArgv`) decides per RENDER, and its default arm closes the last assistant block and appends a fresh
// `<|im_start|>assistant` header — so a delivered prefill row silently becomes a completed prior turn. Nothing
// errors; the prefill just stops existing. The template's continuation arm (:240) fires on
// `loop.last and role == assistant and (not add_generation_prompt or _assistant_prefill)`, and vLLM forbids
// `continue_final_message` and `add_generation_prompt` both true — hence the PAIR, sent together or not at all.
//
// The kwarg door (`chat_template_kwargs: {"assistant_prefill": true}`) renders byte-identically (measured
// 2026-08-19, `VLLM_TURNS`), and is deliberately NOT the one used: it exists for a caller that cannot set the
// standard flags on a static body. We build the request, so we take the standard flags — the same reason
// `reasoningFields` rides `chat_template_kwargs` and this does not: that one IS a template variable, this one
// is a request-level render mode transformers/vLLM already model by name.
//
// THREE CONDITIONS, and each is a different kind of fact:
//   1. the CAPABILITY (`acceptsAssistantPrefill`) — does this wire × checkpoint continue at all. Read through
//      the contracts helper, never re-spelled: a checkpoint swap that loses the arm flips the descriptor, and
//      the surface must stop sending the pair with it (D143 — capability here varies per checkpoint).
//   2. the DELIVERED SHAPE — the assembled array actually ends on an assistant row. SHAPE decides this
//      upstream (its ends-on-assistant invariant appends a continuation nudge when prefill is NOT honored), so
//      the surface reads the outcome rather than re-deriving the policy; `toMessages` is the last transform
//      before the wire (it drops empty rows), so the check runs on ITS output, not on `req.history`.
//   3. NO `tool_calls` on that row — the template's continuation arm excludes a tool-call turn, so the pair
//      would render a prompt with NO generation prompt at all. The chat pipeline already suppresses prefill
//      when tools ride; this is the surface holding its own end for any other caller of the wire.

/** Which prefill this turn delivers — the axis {@link reasoningFields} also reads, so it is derived ONCE.
 *
 *  `content` vs `open-think` is not decoration: it decides whether the thinking kwargs may ride, and both arms
 *  come off the same template fact. This checkpoint EOSes an assistant turn that lacks a think block, so for a
 *  BARE-CONTENT prefill the template injects an empty, already-CLOSED `<think></think>` ahead of the delivered
 *  text — the model is structurally done reasoning before it writes a token. Ask for thinking anyway and the
 *  reply DISAPPEARS: vLLM's qwen3 reasoning parser, told `enable_thinking:true`, treats the output as reasoning
 *  until a `</think>` the model has no reason to emit. MEASURED 2026-08-19, seed-pinned, on the gen engine —
 *  same messages, same flags, thinking the only difference:
 *    • thinking off ⇒ `content: ". It was cold. It was wet. It ended."`, reasoning null — a true continuation.
 *    • thinking on  ⇒ `content: null`, the identical prose sitting in the reasoning channel. An empty reply.
 *  A prefill that leaves a `<think>` OPEN is the other door the vendored template was built for (the thinking
 *  steer — `tooling/src/model-ab/ops/probes.ts`'s `prefill-thinking-kwarg` probe): there the parser's reasoning-first
 *  assumption is CORRECT, the model closes the block itself, and the kwargs must ride. */
const PREFILL_MODES = ["none", "content", "open-think"] as const;
type PrefillMode = (typeof PREFILL_MODES)[number];

/** Does this delivered text leave a think block open (a thinking-steer prefill)? Last-index comparison, not a
 *  count: `<think>…</think>\n\n<think>` is open, and a closed block followed by prose is not. */
function leavesThinkOpen(content: string): boolean {
  const open = content.lastIndexOf("<think>");
  return open !== -1 && open > content.lastIndexOf("</think>");
}

function prefillMode(capability: ModelCapability, messages: readonly WireMessage[]): PrefillMode {
  const last = messages.at(-1);
  if (!acceptsAssistantPrefill(capability) || last === undefined || last.role !== "assistant" || last.tool_calls !== undefined) {
    return "none";
  }
  // An assistant row is always string content (media parts are user-attachment-only, D45/#317) — the
  // narrow is for the type; a hypothetical array row simply doesn't prefill.
  if (typeof last.content !== "string") {
    return "none";
  }
  return leavesThinkOpen(last.content) ? "open-think" : "content";
}

function continuationFields(prefill: PrefillMode): Record<string, unknown> {
  return prefill === "none" ? {} : { continue_final_message: true, add_generation_prompt: false };
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
  const messages = toMessages(req);
  const prefill = prefillMode(req.capability, messages);
  const modeled: Record<string, unknown> = {
    model: req.model,
    stream: true,
    stream_options: { include_usage: true },
    messages,
    ...sampling,
    ...reasoningFields(resolved.reasoning, prefill, warnings),
    ...continuationFields(prefill),
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

// ── customParameters ON THE LOCAL ENGINE (D143).
//
// THE POSTURE THIS SOURCE IS BUILT ON (D143c): vLLM capability varies per CHECKPOINT and is not reliably
// detectable — the gen slot's model is config, and a swapped checkpoint can gain or lose support for a knob
// with nothing on the wire announcing it. So the descriptor errs PERMISSIVE, user settings are TRUSTED, and
// the belt denylist is the ONLY load-bearing fence here.
//
// TWO TIERS OF PROTECTION, and they are different mechanisms for different reasons:
//   1. PRECEDENCE (below) covers every knob we MODEL. A named param — temperature, max_tokens, the reasoning
//      kwargs — wins over a customParameters key of the same name, because the modeled value is the one the
//      funnel capability-gated and clamped. The escape hatch extends the wire; it does not re-litigate it.
//   2. THE BELT DENYLIST ({@link isVllmBeltOwnedParameterKey}) covers what we do NOT model but infra OWNS.
//      These are dropped outright, never merged, and the drop is loud — precedence alone would not be enough
//      for them, because several are keys the modeled body does not even emit, so there would be nothing to
//      win the collision and the user's value would ride unopposed. The list lives in `contracts/preset`
//      beside `customParametersSchema` because the preset EDITOR warns on the same keys at authoring time.

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
    if (isVllmBeltOwnedParameterKey(key)) {
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

const REASONING_DROPPED_FOR_PREFILL =
  "thinking dropped for this turn: the local engine cannot reason INTO a content prefill (its template closes the think block ahead of the delivered text, and asking for thinking anyway routes the whole continuation into the reasoning channel, leaving an empty reply)";
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
  return warnings.map((warning) => ({ kind: "warning", at, ...warning }));
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
