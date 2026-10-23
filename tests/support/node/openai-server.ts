// A scripted OpenAI-compatible chat endpoint as a `fetch`, plus the request capture it records into.

import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { z } from "zod";

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

/** Answer `requests` chat calls from `reply`, streaming or not as the request asks; a further call throws. */
export function openAiServer(recorded: RecordedRequest[], reply: (body: Record<string, JsonValue>) => OpenAiReply, requests = 1): typeof fetch {
  let remaining = requests;
  return async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    if (request.url.endsWith(SLEEP_PROBE_SUFFIX)) {
      return Promise.resolve(Response.json({ ["is_sleeping"]: false }));
    }
    if (remaining-- <= 0) {
      throw new Error(`the openai-compatible script exhausted its replies: ${request.url}`);
    }
    const captured = await recordRequest(request);
    const { body } = captured;
    recorded.push(captured);
    const answer = reply(body);
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
}
