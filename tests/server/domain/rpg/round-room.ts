// Finite native replies for an RPG room whose state rounds a case holds and releases, so two turns' rounds can
// overlap in a chosen order. Only the provider edge is scripted; the production graph owns every write.

import type { RpgToolName } from "@orb/contracts/rpg";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import type { CoreWireReply } from "../chat/engine/core-physical.ts";
import { coreDispatchRoom, coreFrame, coreProse, coreSse } from "../chat/engine/core-physical.ts";
import { createToolsConnection, turnWireBody } from "../chat/verbs/turn-rpg-physical.ts";

export const SCENE_TOOL = "update_scene" satisfies RpgToolName;
export const QUEST_TOOL = "upsert_quest" satisfies RpgToolName;

/** One state call the scripted round answers with. */
export interface RoundCall {
  readonly name: RpgToolName;
  readonly args: Readonly<Record<string, unknown>>;
}

/** A finished round answer: the tool calls as the vendor streams them, closed by the `tool_calls` terminal. */
function roundAnswer(calls: readonly RoundCall[]): Response {
  return coreSse([
    coreFrame({
      choices: [
        {
          delta: {
            ["tool_calls"]: calls.map((call, index) => ({
              index,
              id: `round-call-${String(index)}`,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args) },
            })),
          },
        },
      ],
    }),
    terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 12, completionTokens: 8 } }),
  ]);
}

/** A narrative reply: the request must carry no tools, which tells it apart from a state round. */
export function narrative(text: string): CoreWireReply {
  return async (request): Promise<Response> => {
    if ((await turnWireBody(request))["tools"] !== undefined) {
      throw new Error(`a state round arrived where the narrative "${text}" was scripted`);
    }
    return coreProse(text);
  };
}

/** A state round reply: the request must carry the state tools. */
export function round(calls: readonly RoundCall[]): CoreWireReply {
  return async (request): Promise<Response> => {
    if ((await turnWireBody(request))["tools"] === undefined) {
      throw new Error("a narrative arrived where a state round was scripted");
    }
    return roundAnswer(calls);
  };
}

/** Hold a scripted reply at the provider edge until the case releases it. `reached` resolves once the request
 *  arrived; the turn's own cancellation still interrupts the hold. */
export function held(reply: CoreWireReply): { readonly reached: Promise<void>; readonly release: () => void; readonly respond: CoreWireReply } {
  const reached = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  return {
    reached: reached.promise,
    release: () => released.resolve(),
    respond: async (request): Promise<Response> => {
      const interrupted = Promise.withResolvers<never>();
      const abort = (): void => interrupted.reject(request.signal.reason);
      request.signal.addEventListener("abort", abort, { once: true });
      try {
        request.signal.throwIfAborted();
        reached.resolve();
        await Promise.race([released.promise, interrupted.promise]);
        return await reply(request);
      } finally {
        request.signal.removeEventListener("abort", abort);
      }
    },
  };
}

/** A room whose physical requests take `next` in arrival order, bound to a tools-capable model, with an engaged
 *  game whose state rides the dedicated post-commit tool round. */
export async function cheapRoundRoom(next: () => CoreWireReply, server: NonNullable<Parameters<typeof coreDispatchRoom>[1]>["server"] = {}): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await coreDispatchRoom(async (request) => await next()(request), { server: { rpgTrace: true, ...server } }));
  const connection = await createToolsConnection(h);
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  await h.root.services.rpg.createGame({ principal: h.owner, chatId: h.chatId, mode: "lite" });
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, extractionMode: "cheap", patch: { stateCaptureVehicle: "tools" } });
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** How many of this chat's state rounds have reached their write boundary's settle. */
export function settledRounds(h: ChatRoot): number {
  return (h.root.app.rpgTrace?.recent({ chatId: h.chatId }) ?? []).filter(({ event }) => event.phase === "flushed").length;
}
