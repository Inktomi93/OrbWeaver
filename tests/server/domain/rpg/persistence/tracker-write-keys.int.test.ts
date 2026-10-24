// Model tracker writes under inherited object keys land in the rpg_snapshots row as total own values on a plain
// object, or refuse visibly: a __proto__ key is never stored and the turn disclosure names the drop.
// @subject packages/server/src/domain/rpg/tools/apply.ts
// @subject packages/contracts/src/rpg/tools.ts
// @subject packages/server/src/domain/rpg/chat-ops/tracker-view.ts

import { RPG_LITE_TOOL_NAMES, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import { rpgSnapshots } from "@orb/db";
import type { JsonValue } from "@orb/kit/json";
import { PROTO_KEY } from "@orb/kit/objects";
import { expect, test } from "@orb/testkit/node";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import { coreFrame, coreSse } from "../../chat/engine/core-physical.ts";
import { turnRpgRoom } from "../../chat/verbs/turn-rpg-physical.ts";

const SET_TRACKER = RPG_LITE_TOOL_NAMES[3];
const UPDATE_PARTY = RPG_LITE_TOOL_NAMES[0];
// A host label the editor mints to the key `constructor`, which every plain object inherits.
const CONSTRUCTOR = rpgTrackerDefSchema.parse({ key: "constructor", label: "Constructor", shape: "meter", write: "delta", subject: "game", max: 10 });
const RESOLVE = rpgTrackerDefSchema.parse({ key: "resolve", label: "Resolve", shape: "meter", write: "delta", subject: "actor", max: 10 });

function call(index: number, name: string, args: { [key: string]: JsonValue }): JsonValue {
  return { index, id: `tracker-key-${index}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

test("model tracker writes under inherited object keys land as total own values or refuse visibly", async () => {
  let actorName = "";
  await using h = await turnRpgRoom([
    async (): Promise<Response> =>
      coreSse([
        coreFrame({
          choices: [
            {
              delta: {
                content: "The engine coughs and the warden steadies himself.",
                ["tool_calls"]: [
                  call(0, SET_TRACKER, { key: CONSTRUCTOR.key, delta: -3 }),
                  call(1, SET_TRACKER, { key: PROTO_KEY, value: 5 }),
                  call(2, UPDATE_PARTY, { targetRef: actorName, trackerDeltas: [{ key: PROTO_KEY, delta: 2 }] }),
                  call(3, UPDATE_PARTY, { targetRef: actorName, trackerDeltas: [{ key: RESOLVE.key, delta: -1 }] }),
                ],
              },
            },
          ],
        }),
        terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 12, completionTokens: 8 } }),
      ]),
  ]);
  const actor = h.characters[0];
  if (actor === undefined) {
    throw new Error("the tracker-key room has no character carrier");
  }
  actorName = actor.name;
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, patch: { trackers: [CONSTRUCTOR, RESOLVE] } });
  // Before any reading exists, the panel read reports the tracker unset rather than an inherited function.
  const unset = await h.caller.rpg.getTrackerView({ chatId: h.chatId });
  expect.soft(unset.gameTrackers.map(({ def, value }) => ({ key: def.key, value }))).toEqual([{ key: CONSTRUCTOR.key, value: null }]);

  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Push the engine." });
  expect(sent.aborted).toBe(false);
  const assistant = sent.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the tracker-key beat has no selected assistant variant");
  }
  await h.root.settleBackground();

  const [snapshot] = await h.root.db
    .select({ trackerValues: rpgSnapshots.trackerValues, actorState: rpgSnapshots.actorState })
    .from(rpgSnapshots)
    .where(eq(rpgSnapshots.variantId, assistant.selectedVariantId));
  // The meter starts from its def ceiling, and the stored value carries every field instead of a function's spread.
  expect.soft(snapshot?.trackerValues).toEqual({ [CONSTRUCTOR.key]: { value: 7, items: null, max: null } });
  expect.soft(Object.getPrototypeOf(snapshot?.trackerValues)).toBe(Object.prototype);
  const carrier = snapshot?.actorState?.find((entry) => entry.actorRef.kind === "character" && entry.actorRef.characterId === actor.id);
  expect.soft(carrier?.volatile.trackerValues).toEqual({ [RESOLVE.key]: { value: 9, items: null, max: null } });

  // A `__proto__` key can never be stored, so the disclosure names the loss instead of claiming an applied write.
  const disclosed = await h.caller.rpg.listTurnToolCalls({ chatId: h.chatId });
  expect.soft(disclosed.map(({ variantId }) => variantId)).toEqual([assistant.selectedVariantId]);
  expect.soft(disclosed[0]?.calls.map(({ name, verdict }) => ({ name, verdict }))).toEqual([
    { name: SET_TRACKER, verdict: "applied" },
    { name: SET_TRACKER, verdict: "dropped" },
    { name: UPDATE_PARTY, verdict: "salvaged" },
    { name: UPDATE_PARTY, verdict: "applied" },
  ]);
});
