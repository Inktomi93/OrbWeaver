import { jsonValueSchema } from "@orb/kit/json";
import { z } from "zod";

const objectBody = z.record(z.string(), jsonValueSchema);

export interface SseEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

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

export function eventResponse(events: readonly SseEvent[]): Response {
  return new Response(events.map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

/** One physical response per declared recipe; an extra send is a fixture refusal, never a recycled reply. */
export function scriptedResponses(responses: readonly (() => Response)[], recorded: RecordedRequest[] = []): typeof fetch {
  let next = 0;
  return async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    recorded.push(await recordRequest(request));
    const respond = responses[next++];
    if (respond === undefined) {
      throw new Error(`the physical conformance script exhausted its replies: ${request.method} ${request.url}`);
    }
    return respond();
  };
}
