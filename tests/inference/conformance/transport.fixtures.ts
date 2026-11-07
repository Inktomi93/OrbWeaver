import { finiteReplies } from "@orb/testkit/iso";
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

interface ScriptedResponses extends Disposable {
  readonly execute: typeof fetch;
}

/** One physical response per declared recipe; an extra send is a fixture refusal, never a recycled reply, and a recipe never sent fails disposal. */
export function scriptedResponses(responses: readonly (() => Response)[], recorded: RecordedRequest[] = []): ScriptedResponses {
  using construction = new DisposableStack();
  const nextResponse = construction.use(finiteReplies("physical conformance", responses)).take;
  const execute: typeof fetch = async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    recorded.push(await recordRequest(request));
    return nextResponse()();
  };
  const lifetime = construction.move();
  return { execute, [Symbol.dispose]: () => lifetime.dispose() };
}
