// A scripted Anthropic Messages stream, typed from the SDK's own stream events so a field the wire gains or
// renames fails `tsc` here instead of leaving each suite with its own hand-written frame.
import type {
  Message,
  MessageDeltaUsage,
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
  RawMessageDeltaEvent,
  RawMessageStartEvent,
  RawMessageStopEvent,
  RefusalStopDetails,
  Usage,
} from "@anthropic-ai/sdk/resources/messages";

/** A `message_delta` as a scripted server may send it: any stop word (an unrecognised one is a real provider
 *  behaviour), and the API's `input_transformations` list, which the SDK's event type does not carry. */
interface ScriptedMessageDelta extends Omit<RawMessageDeltaEvent, "delta"> {
  readonly delta: Omit<RawMessageDeltaEvent["delta"], "stop_reason"> & { readonly ["stop_reason"]: string | null };
  readonly ["input_transformations"]?: readonly Readonly<Record<string, string>>[];
}

export type AnthropicStreamEvent =
  | RawMessageStartEvent
  | ScriptedMessageDelta
  | RawMessageStopEvent
  | RawContentBlockStartEvent
  | RawContentBlockDeltaEvent
  | RawContentBlockStopEvent;

export interface AnthropicInputUsage {
  /** The uncached input tokens, which is all Anthropic's `input_tokens` counts. */
  readonly input: number;
  readonly cacheRead?: number;
  readonly output?: number;
}

function usageOf(usage: AnthropicInputUsage): Usage {
  return {
    ["cache_creation"]: null,
    ["cache_creation_input_tokens"]: null,
    ["cache_read_input_tokens"]: usage.cacheRead ?? 0,
    ["inference_geo"]: null,
    ["input_tokens"]: usage.input,
    ["output_tokens"]: usage.output ?? 1,
    ["server_tool_use"]: null,
    ["service_tier"]: null,
    ["output_tokens_details"]: null,
    speed: null,
  };
}

function emptyMessage(model: string, usage: AnthropicInputUsage): Message {
  return {
    id: "msg_wire",
    container: null,
    content: [],
    diagnostics: null,
    model,
    role: "assistant",
    ["stop_details"]: null,
    ["stop_reason"]: null,
    ["stop_sequence"]: null,
    type: "message",
    usage: usageOf(usage),
  };
}

export function messageStart(model: string, usage: AnthropicInputUsage = { input: 10 }): RawMessageStartEvent {
  return { type: "message_start", message: emptyMessage(model, usage) };
}

/** The non-streaming answer to the same ask: one finished text message. */
export function textMessage(model: string, text = "ok", usage: AnthropicInputUsage = { input: 10, output: 3 }): Message {
  return { ...emptyMessage(model, usage), content: [{ type: "text", text, citations: null }], ["stop_reason"]: "end_turn" };
}

function stop(index: number): RawContentBlockStopEvent {
  return { type: "content_block_stop", index };
}

/** One text block that streams each of `texts` as its own delta. */
export function textBlock(index: number, ...texts: readonly string[]): AnthropicStreamEvent[] {
  return [
    { type: "content_block_start", index, ["content_block"]: { type: "text", text: "", citations: null } },
    ...texts.map((text): AnthropicStreamEvent => ({ type: "content_block_delta", index, delta: { type: "text_delta", text } })),
    stop(index),
  ];
}

export function thinkingBlock(index: number, thinking: string, signature: string): AnthropicStreamEvent[] {
  return [
    { type: "content_block_start", index, ["content_block"]: { type: "thinking", thinking: "", signature: "" } },
    { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking } },
    { type: "content_block_delta", index, delta: { type: "signature_delta", signature } },
    stop(index),
  ];
}

export function redactedThinkingBlock(index: number, data: string): AnthropicStreamEvent[] {
  return [{ type: "content_block_start", index, ["content_block"]: { type: "redacted_thinking", data } }, stop(index)];
}

/** One tool call whose input arrives as the raw JSON text `inputJson`. */
export function toolUseBlock(index: number, call: { readonly id: string; readonly name: string; readonly inputJson: string }): AnthropicStreamEvent[] {
  return [
    { type: "content_block_start", index, ["content_block"]: { type: "tool_use", id: call.id, name: call.name, input: {}, caller: { type: "direct" } } },
    { type: "content_block_delta", index, delta: { type: "input_json_delta", ["partial_json"]: call.inputJson } },
    stop(index),
  ];
}

export interface AnthropicMessageEnd {
  readonly stopReason: string;
  readonly stopDetails?: RefusalStopDetails;
  readonly outputTokens?: number;
  /** The API's report of what it changed about the request, as `input_transformations` on the delta. */
  readonly inputTransformations?: readonly Readonly<Record<string, string>>[];
}

/** The closing `message_delta` and `message_stop`. */
export function messageEnd(end: AnthropicMessageEnd): AnthropicStreamEvent[] {
  const usage: MessageDeltaUsage = {
    ["cache_creation_input_tokens"]: null,
    ["cache_read_input_tokens"]: null,
    ["input_tokens"]: null,
    ["output_tokens"]: end.outputTokens ?? 3,
    ["server_tool_use"]: null,
    ["output_tokens_details"]: null,
  };
  const delta: ScriptedMessageDelta = {
    type: "message_delta",
    delta: { container: null, ["stop_details"]: end.stopDetails ?? null, ["stop_reason"]: end.stopReason, ["stop_sequence"]: null },
    usage,
    ...(end.inputTransformations === undefined ? {} : { ["input_transformations"]: end.inputTransformations }),
  };
  return [delta, { type: "message_stop" }];
}

/** A whole turn that answers `text` and ends normally. */
export function anthropicTextReply(model: string, text = "ok", end: Partial<AnthropicMessageEnd> = {}): AnthropicStreamEvent[] {
  return [messageStart(model), ...textBlock(0, text), ...messageEnd({ stopReason: "end_turn", ...end })];
}

/** The events as the server sends them: one `event:`/`data:` frame each. */
export function anthropicSse(events: readonly AnthropicStreamEvent[], headers: Readonly<Record<string, string>> = {}): Response {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream", ...headers } });
}
