import type { RecordedRequest } from "@orb/testkit/node/helpers";
import { recordRequest } from "@orb/testkit/node/helpers";

export interface SseEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
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
