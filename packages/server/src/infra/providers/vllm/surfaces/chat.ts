// The vLLM streaming chat-role surface: a stateless OpenAI-style turn streamed over SSE from the loopback
// gen engine, drained through the shared kit openai-compat reducer. Simpler than the openrouter runner —
// one provider, no routing/cache_control choreography, no reasoning strip-and-replay.

import type { ChatContentPart } from "@orb/contracts/chat";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "@orb/contracts/preset";
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
import type { ChatHistoryMessage, ChatRequest, ChatResult, HistoryRole, WireCaptureSink } from "../../contract";
import { ProviderError } from "../../contract";
import type { VllmEngineClient } from "../engine";

// Qwen3-VL-8B-Instruct card default applied when the preset is silent (not in generation_config.json). The
// FALLBACK when compose doesn't inject the resolved getter (tests); the LIVE value comes from
// deps.genPresencePenalty (item 7 — engineLaunch.genPresencePenalty, env floor 1.5 ⊕ AppSettings override).
const CARD_DEFAULT_PRESENCE_PENALTY = 1.5;

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
}

type VllmChatTurn = ChatRequest & { readonly api: "chat-completions" | "responses" };

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

function toMessages(req: VllmChatTurn): WireMessage[] {
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

function buildBody(req: VllmChatTurn, presencePenaltyDefault: number): Record<string, unknown> {
  const p = req.params;
  const sampling = buildOpenAiSamplingFields({
    temperature: p.temperature,
    topP: p.topP,
    topK: p.topK,
    frequencyPenalty: p.frequencyPenalty,
    presencePenalty: p.presencePenalty ?? presencePenaltyDefault,
    repetitionPenalty: p.repetitionPenalty,
    minP: p.minP,
    topA: p.topA,
    seed: p.seed,
    logitBias: p.logitBias,
    stop: p.stop,
    // The effective output length is materialized upstream (chat engine pipeline) so this equals the
    // budget's `reserveOutputTokens`; the `?? DEFAULT` is the fail-safe for any non-chat caller (never the
    // window, which would let generation overflow the reserved history and 400 vLLM).
    maxTokens: p.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  });
  return {
    model: req.model,
    stream: true,
    stream_options: { include_usage: true },
    messages: toMessages(req),
    ...sampling,
    ...(req.tools !== undefined ? { tools: rawWireTools(req.tools) } : {}),
    ...(req.toolChoice !== undefined ? { tool_choice: rawToolChoice(req.toolChoice) } : {}),
    ...(req.responseFormat !== undefined ? { response_format: rawResponseFormat(req.responseFormat) } : {}),
  };
}

// vLLM speaks raw snake_case; reshapes into the kit reducer's camelCase chunk shape.
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

export function createVllmChat(deps: VllmChatDeps): (req: ChatRequest) => Promise<ChatResult> {
  return async (req) => {
    if (req.api === "agent-sdk") {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `vllm chat surface does not serve the "${req.api}" api`,
      });
    }
    const turn: VllmChatTurn = req;
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

    try {
      const wireBody = buildBody(turn, deps.genPresencePenalty?.() ?? CARD_DEFAULT_PRESENCE_PENALTY);
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
        maxOutputTokens: req.params.maxOutputTokens ?? null,
        reasoning,
      };
      return mapChatCompletionToTurnResult(view, ctx);
    } finally {
      dispose();
    }
  };
}
