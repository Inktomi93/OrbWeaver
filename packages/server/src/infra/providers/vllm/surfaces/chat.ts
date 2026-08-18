// The vLLM streaming chat-role surface: a stateless OpenAI-style turn streamed over SSE from the loopback
// gen engine, drained through the shared kit openai-compat reducer. Simpler than the openrouter runner —
// one provider, no routing/cache_control choreography, no reasoning strip-and-replay.

import type { ChatContentPart } from "@orb/contracts/chat";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
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
// The template's effort ladder is `low` | `medium` | `high`|`xhigh`, and its ELSE branch folds anything else
// to `xhigh` — which is why the capability descriptor (`VLLM_REASONING`, domain/connection) does not advertise
// `minimal`: an unrecognized level buys MAXIMUM thinking, never minimum. `effortToOpenAIReasoning` owns the
// level vocab (our `max` → the wire's `xhigh`) and is never re-spelled here.
/** The funnel's resolved reasoning → this wire's per-request template kwargs. Reasoning OFF (the common path:
 *  the descriptor is `defaultEnabled:false`, so silence means off) emits NOTHING — byte-identical to every
 *  pre-reasoning body, so the baked launch default stands and no prefix-cache entry is disturbed. A resolved
 *  effort emits the pair; a budget never appears (this wire has no per-request budget field — the funnel
 *  already made that drop loud). */
function reasoningFields(reasoning: ResolvedReasoning): Record<string, unknown> {
  if (!reasoning.enabled || reasoning.effort === undefined) {
    return {};
  }
  return {
    chat_template_kwargs: {
      enable_thinking: true,
      reasoning_effort: effortToOpenAIReasoning({ enabled: true, effort: reasoning.effort }).effort,
    },
  };
}

function buildBody(req: VllmChatRequest, resolved: ResolvedChatKnobs, defaults: SamplerDefaults): Record<string, unknown> {
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
  return {
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

// The preset's `customParameters` escape hatch is BYOK/custom-byo-only (locked there deliberately, commit
// 20ac4154c: "OpenRouter is a first-class owned integration whose knobs are the modeled sampling surface (the
// anti-SillyTavern-sprawl design); customParameters is a BYOK-only escape hatch"). The LOCAL gen engine is
// this repo's most first-class owned integration — we launch the process — so the same ruling puts it on the
// OpenRouter side of that line, and the blob does NOT reach this wire. What was wrong until now is that the
// drop was SILENT here while OpenRouter's is loud: compose threads `customParameters` onto the request, this
// surface never read it, and nothing told the user. D41 no-silent-degrade — same code, same spelling as both
// OR runners, so the infra→chat re-map is a MATCH rather than a re-spell.
const CUSTOM_PARAMETERS_IGNORED = "customParameters ignored on the local vLLM engine (BYOK/custom-byo only)";
// The vLLM `tool` message is {role,tool_call_id,content} and nothing else (see `wireToolResults`), so a failed
// tool result reads to the model as an ordinary one — the identical wire limitation custom-byo reports.
const TOOL_RESULT_ERROR_DROPPED = "tool-result isError ignored: the OpenAI-compatible chat-completions wire has no tool-result error field";

/** The funnel's own degrade warnings plus the two this SURFACE causes: a dropped `customParameters` blob and a
 *  dropped tool-result error flag. Every drop on this wire is observable on the turn, never silent (D41). */
function turnWarnings(resolved: ResolvedChatKnobs, req: VllmChatRequest): readonly ResolvedWarning[] {
  const warnings = [...resolved.warnings];
  if (req.customParameters !== undefined && Object.keys(req.customParameters).length > 0) {
    warnings.push({ code: "custom_parameters_ignored", message: CUSTOM_PARAMETERS_IGNORED });
  }
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

    try {
      const wireBody = buildBody(req, resolved, {
        presencePenalty: deps.genPresencePenalty?.() ?? CARD_DEFAULT_PRESENCE_PENALTY,
        repetitionPenalty: deps.genRepetitionPenalty?.() ?? CARD_DEFAULT_REPETITION_PENALTY,
      });
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
      const warnings = warningEvents(turnWarnings(resolved, req), deps.now());
      for (const event of warnings) {
        req.onEvent?.(event);
      }
      return warnings.length > 0 ? { ...turn, events: [...turn.events, ...warnings] } : turn;
    } finally {
      dispose();
    }
  };
}
