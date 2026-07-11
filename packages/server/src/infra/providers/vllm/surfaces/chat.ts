// infra/providers/vllm/surfaces/chat — the vLLM streaming CHAT role surface (the gen engine's chat turn).
//
// A stateless OpenAI-style turn (history assembled by the domain, same shaping the remote chat backends
// get) streamed over SSE from the loopback gen engine, drained through the SHARED kit openai-compat reducer
// (`backends/kit` — the one OpenAI-wire seam, which vLLM may import DOWN since it speaks OpenAI wire). It
// registers against engine/ for the byte stream and imports NO sibling surface.
//
// Deliberately simpler than the openrouter runner: one provider (us), so no provider routing, no
// cache_control choreography (vLLM prefix-caches automatically), no reasoning strip-and-replay (the
// default Instruct checkpoint has no thinking — but `reasoning_content` deltas ARE forwarded if a future
// Thinking model emits them). DETERMINISM: turn timing is an injected `now()` (no perf/Date clock).

import type { ChatContentPart } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatCompletionStreamChunk, MapTurnContext, StreamDelta } from "../../backends/kit";
import {
  buildOpenAiSamplingFields,
  chatHistoryText,
  IDLE_TIMEOUT_MS,
  mapChatCompletionToTurnResult,
  parseOpenAiSse,
  rawResponseFormat,
  rawToolCallDeltas,
  rawToolChoice,
  rawWireTools,
  reduceChatCompletionStream,
  turnAbortSignal,
} from "../../backends/kit";
import type { ChatHistoryMessage, ChatRequest, ChatResult, HistoryRole } from "../../contract";
import { ProviderError } from "../../contract";
import type { VllmEngineClient } from "../engine";

// Qwen3-VL-8B-Instruct card defaults applied when the preset is silent: presence_penalty 1.5 (the VL-task
// anti-repetition lever — NOT in generation_config.json, so the engine would otherwise default to 0) and a
// 16k output cap (the card's conservative VL-task max). temperature/top_p/top_k defaults DO ship in
// generation_config.json (0.7/0.8/20) and vLLM auto-loads them when we omit the fields.
const CARD_DEFAULT_PRESENCE_PENALTY = 1.5;
const CARD_DEFAULT_MAX_TOKENS = 16_384;

const CHAT_PATH = "/v1/chat/completions";

/** Deps the chat surface closes over. `now` is injected (the determinism seam — turn timing). */
export interface VllmChatDeps {
  readonly client: VllmEngineClient;
  readonly now: () => number;
}

// The gen engine's history arm (chat-completions/responses both carry `history`; agent-sdk does not).
type VllmChatTurn = ChatRequest & { readonly api: "chat-completions" | "responses" };

// One wire message (vision is not used on this streaming text path; the domain assembled plain history).
// `role` is the wire axis (`HistoryRole`, one home) plus the local `system` fold; the D48/T2 tool fields
// carry a materialized exchange (raw snake wire names, biome-exempted at the build sites).
interface WireMessage {
  readonly role: HistoryRole | "system";
  readonly content: string;
  readonly name?: string;
  // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field name (snake_case).
  readonly tool_calls?: readonly Record<string, unknown>[];
  // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field name (snake_case).
  readonly tool_call_id?: string;
}

// The materialized tool exchange, raw-wire form (D48/T2 — same mapping as custom-byo's).
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
      // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field name (snake_case).
      out.push({ role: "tool", tool_call_id: part.toolCallId, content: part.content });
    }
  }
  return out;
}

// One user/assistant turn → its wire message, or null when empty (a text-less assistant tool-call turn
// is KEPT — the calls ARE its content).
function wireTurnMessage(turn: ChatHistoryMessage): WireMessage | null {
  const text = chatHistoryText(turn.content);
  const toolCalls = turn.role === "assistant" ? wireToolCalls(turn.content) : [];
  if (text.trim().length === 0 && toolCalls.length === 0) {
    return null;
  }
  return {
    role: turn.role,
    content: text,
    // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field name (snake_case).
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(turn.name !== undefined ? { name: turn.name } : {}),
  };
}

function toMessages(req: VllmChatTurn): WireMessage[] {
  const system = [req.systemPrompt.static, req.systemPrompt.dynamic]
    .filter((s) => s.trim().length > 0)
    .join("\n\n");
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

function buildBody(req: VllmChatTurn): Record<string, unknown> {
  const p = req.params;
  const sampling = buildOpenAiSamplingFields({
    temperature: p.temperature,
    topP: p.topP,
    topK: p.topK,
    frequencyPenalty: p.frequencyPenalty,
    presencePenalty: p.presencePenalty ?? CARD_DEFAULT_PRESENCE_PENALTY,
    repetitionPenalty: p.repetitionPenalty,
    minP: p.minP,
    seed: p.seed,
    logitBias: p.logitBias,
    stop: p.stop,
    maxTokens: p.maxOutputTokens ?? CARD_DEFAULT_MAX_TOKENS,
  });
  return {
    model: req.model,
    stream: true,
    stream_options: { include_usage: true },
    messages: toMessages(req),
    ...sampling,
    // D48/T2: absent means ABSENT — a tool-less/format-less body stays byte-identical to pre-D48; the
    // `auto` toolChoice default is the CALLER's, never hardwired here (04 §3's vLLM json_schema row).
    ...(req.tools !== undefined ? { tools: rawWireTools(req.tools) } : {}),
    // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field names (snake_case).
    ...(req.toolChoice !== undefined ? { tool_choice: rawToolChoice(req.toolChoice) } : {}),
    // biome-ignore lint/style/useNamingConvention: OpenAI-compatible wire field names (snake_case).
    ...(req.responseFormat !== undefined
      ? { response_format: rawResponseFormat(req.responseFormat) }
      : {}),
  };
}

// Reshape the raw vLLM SSE payloads into the kit reducer's camelCase chunk shape (the runner's job per the
// kit stream header). vLLM speaks raw snake_case: delta.content / delta.reasoning_content / finish_reason /
// usage.{prompt,completion}_tokens.
interface RawDelta {
  readonly content?: string | null;
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
            reasoning: choice?.delta?.reasoning_content,
            ...(toolCalls !== undefined ? { toolCalls } : {}),
          },
          finishReason: choice?.finish_reason,
        },
      ],
      ...(usage !== undefined ? { usage } : {}),
    };
  }
}

/** Bind the chat role to the engine client. */
export function createVllmChat(deps: VllmChatDeps): (req: ChatRequest) => Promise<ChatResult> {
  return async (req) => {
    if (req.api === "agent-sdk" || req.api === "anthropic-messages") {
      // vLLM speaks the stateless OpenAI chat-completions wire only — no agent-sdk (prompt-only) arm and
      // no Anthropic-Messages arm (that wire is agent-sdk/anth-direct's; anth-direct is OR-skin-only, so a
      // vLLM anthropic-messages turn never resolves here — this guard keeps the surface's arm honest).
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `vllm chat surface does not serve the "${req.api}" api`,
      });
    }
    const turn: VllmChatTurn = req;
    const startedAt = deps.now();
    // Compose caller-cancel + a rolling IDLE timeout so a stalled loopback socket can't pin the chat slot
    // forever, while a healthy long stream resets the window on every received chunk (idle window armed at
    // connection-open; reset per chunk; disposed in `finally`).
    const { signal, reset, dispose } = turnAbortSignal(req.signal, IDLE_TIMEOUT_MS);

    const chatId = castId<ChatId>(req.chatId ?? "");
    let reasoning = "";
    const onDelta = (d: StreamDelta): void => {
      if (d.kind === "reasoning") {
        reasoning += d.text;
      }
      req.onDelta?.({ chatId, kind: d.kind, text: d.text });
    };

    try {
      const body = await deps.client.engineStream("gen", CHAT_PATH, buildBody(turn), signal);
      const view = await reduceChatCompletionStream(toChunks(parseOpenAiSse(body)), {
        onDelta,
        onChunk: reset,
      });
      const ctx: MapTurnContext = {
        model: req.model,
        startedAt,
        now: deps.now(),
        contextWindow: req.capability.context.window,
        maxOutputTokens: req.params.maxOutputTokens ?? null,
        reasoning,
      };
      return mapChatCompletionToTurnResult(view, ctx);
    } finally {
      dispose();
    }
  };
}
