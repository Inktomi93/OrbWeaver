// A scripted OpenAI-compatible chat endpoint as a `fetch`, plus the request capture it records into.

import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { z } from "zod";
import { finiteReplies } from "../iso/finite-replies.ts";

const objectBody = z.record(z.string(), jsonValueSchema);

export interface RecordedRequest {
  readonly url: string;
  readonly body: z.infer<typeof objectBody>;
  readonly headers: Readonly<Record<string, string>>;
}

/** Read the actual Request produced by the root's egress adapter, including its consumed init fields. */
export async function recordRequest(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<RecordedRequest> {
  const request = new Request(input, init);
  const text = await request.clone().text();
  return { url: request.url, body: objectBody.parse(text === "" ? {} : JSON.parse(text)), headers: Object.fromEntries(request.headers) };
}

export interface OpenAiReply {
  readonly status?: number;
  readonly error?: string;
  readonly content?: string;
  readonly finish?: string;
  readonly usage?: { readonly prompt: number; readonly completion: number };
}

const DEFAULT_USAGE = { prompt: 10, completion: 5 } as const;

/** The vLLM wake probe path; the server answers it awake without spending a scripted reply. */
export const SLEEP_PROBE_SUFFIX = "/is_sleeping";

function chunk(choice: Record<string, unknown>, usage?: Record<string, unknown>): string {
  const data = { id: "gen-openai", object: "chat.completion.chunk", created: 1, model: "m", choices: [choice], ...(usage === undefined ? {} : { usage }) };
  return `data: ${JSON.stringify(data)}\n\n`;
}

export interface OpenAiServer extends Disposable {
  readonly execute: typeof fetch;
}

/** Answer exactly `requests` chat calls from `reply`, streaming or not as the request asks; a further call throws and a call never made fails disposal. */
export function openAiServer(recorded: RecordedRequest[], reply: (body: Record<string, JsonValue>) => OpenAiReply, requests = 1): OpenAiServer {
  using construction = new DisposableStack();
  const nextResponder = construction.use(
    finiteReplies(
      "openai-compatible",
      Array.from({ length: requests }, () => reply),
    ),
  ).take;
  const execute: typeof fetch = async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    if (request.url.endsWith(SLEEP_PROBE_SUFFIX)) {
      return Promise.resolve(Response.json({ ["is_sleeping"]: false }));
    }
    const respond = nextResponder();
    const captured = await recordRequest(request);
    const { body } = captured;
    recorded.push(captured);
    const answer = respond(body);
    if (answer.error !== undefined) {
      return Promise.resolve(Response.json({ error: { message: answer.error, code: answer.status } }, { status: answer.status ?? 400 }));
    }
    const content = answer.content ?? "ok";
    const finish = answer.finish ?? "stop";
    const tokens = answer.usage ?? DEFAULT_USAGE;
    const usage = { ["prompt_tokens"]: tokens.prompt, ["completion_tokens"]: tokens.completion };
    const total = { ...usage, ["total_tokens"]: usage.prompt_tokens + usage.completion_tokens };
    if (body["stream"] === true) {
      const text =
        chunk({ index: 0, delta: { role: "assistant", content }, ["finish_reason"]: null }) + chunk({ index: 0, delta: {}, ["finish_reason"]: finish }, total);
      return Promise.resolve(new Response(`${text}data: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } }));
    }
    const completion = {
      id: "gen-openai",
      object: "chat.completion",
      created: 1,
      model: "m",
      choices: [{ index: 0, message: { role: "assistant", content }, ["finish_reason"]: finish }],
      usage: total,
    };
    return Promise.resolve(Response.json(completion));
  };
  const lifetime = construction.move();
  return { execute, [Symbol.dispose]: () => lifetime.dispose() };
}

/** One scripted reply of the `/responses` protocol: a text turn (optionally reasoned, optionally with a
 *  prompt-cache receipt on the terminal usage), a tool call, or an HTTP error. */
export type ResponsesReply =
  | { readonly kind: "text"; readonly text: string; readonly reasoning?: string; readonly cachedTokens?: number }
  | { readonly kind: "tool-call"; readonly name: string; readonly arguments: string }
  | { readonly kind: "error"; readonly status?: number; readonly message: string };

/**
 * A scripted `/responses` endpoint as a `fetch`, on the same capture discipline as {@link openAiServer}.
 * The events are the OpenAI summary spelling (the arms `@ai-sdk/openai`'s chunk union declares); the raw
 * dialect DeepSeek actually streams (`response.reasoning_text.*`) is spelled inline by the test that
 * pins the dialect rewriter (MEASURED vendor form, 2026-11-17).
 */
export function openAiResponsesServer(
  recorded: RecordedRequest[],
  respond: (body: z.infer<typeof objectBody>) => ResponsesReply,
): {
  execute: typeof fetch;
  [Symbol.dispose]: () => void;
} {
  const execute: typeof fetch = async (request) => {
    const captured = await recordRequest(request);
    recorded.push(captured);
    const answer = respond(captured.body);
    if (answer.kind === "error") {
      return Promise.resolve(Response.json({ error: { message: answer.message, type: "invalid_request_error" } }, { status: answer.status ?? 400 }));
    }
    const frame = (type: string, payload: Record<string, JsonValue>): string => `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
    const response: Record<string, JsonValue> = { id: "resp-1", ["created_at"]: 1, model: "m" };
    const frames: string[] = [frame("response.created", { response }), frame("response.in_progress", { response })];
    if (answer.kind === "tool-call") {
      const item: Record<string, JsonValue> = {
        type: "function_call",
        id: "fc-1",
        ["call_id"]: "call-1",
        name: answer.name,
        arguments: answer.arguments,
        status: "completed",
      };
      frames.push(
        frame("response.output_item.added", { ["output_index"]: 0, item: { ...item, arguments: "", status: "in_progress" } }),
        frame("response.function_call_arguments.delta", { ["item_id"]: "fc-1", ["output_index"]: 0, delta: answer.arguments }),
        frame("response.function_call_arguments.done", { ["item_id"]: "fc-1", ["output_index"]: 0, arguments: answer.arguments }),
        frame("response.output_item.done", { ["output_index"]: 0, item }),
      );
    } else {
      let outputIndex = 0;
      if (answer.reasoning !== undefined) {
        frames.push(
          frame("response.output_item.added", { ["output_index"]: 0, item: { type: "reasoning", id: "rs-1" } }),
          frame("response.reasoning_summary_part.added", { ["item_id"]: "rs-1", ["output_index"]: 0, ["summary_index"]: 0 }),
          frame("response.reasoning_summary_text.delta", { ["item_id"]: "rs-1", ["output_index"]: 0, ["summary_index"]: 0, delta: answer.reasoning }),
          frame("response.reasoning_summary_part.done", { ["item_id"]: "rs-1", ["output_index"]: 0, ["summary_index"]: 0 }),
          frame("response.output_item.done", { ["output_index"]: 0, item: { type: "reasoning", id: "rs-1" } }),
        );
        outputIndex = 1;
      }
      frames.push(
        frame("response.output_item.added", { ["output_index"]: outputIndex, item: { type: "message", id: "msg-1" } }),
        frame("response.output_text.delta", { ["item_id"]: "msg-1", ["output_index"]: outputIndex, delta: answer.text }),
        frame("response.output_text.done", { ["item_id"]: "msg-1", ["output_index"]: outputIndex, text: answer.text }),
        frame("response.output_item.done", {
          ["output_index"]: outputIndex,
          item: { type: "message", id: "msg-1", content: [{ type: "output_text", text: answer.text }] },
        }),
      );
    }
    frames.push(
      frame("response.completed", {
        response: {
          ...response,
          usage: {
            ["input_tokens"]: 10,
            ["output_tokens"]: 5,
            ...(answer.kind === "text" && answer.cachedTokens !== undefined ? { ["input_tokens_details"]: { ["cached_tokens"]: answer.cachedTokens } } : {}),
          },
        },
      }),
    );
    return Promise.resolve(new Response(frames.join(""), { status: 200, headers: { "content-type": "text/event-stream" } }));
  };
  return { execute, [Symbol.dispose]: (): void => undefined };
}
