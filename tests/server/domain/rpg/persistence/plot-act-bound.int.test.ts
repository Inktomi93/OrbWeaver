// A model's plot act number is bounded: a value past the plot's act maximum is salvaged out of the scene call and
// named on the turn's tool-call disclosure, and an in-range act advances the plot. The beat finishes either way.
// @subject packages/server/src/domain/rpg/tools/apply.ts
// @subject packages/contracts/src/rpg/tools.ts
// @subject packages/contracts/src/rpg/snapshot.ts

import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { RPG_PLOT_ACTS_MAX } from "#contracts/rpg/snapshot.ts";
import { coreFrame, coreSse } from "../../chat/engine/core-physical.ts";
import { TURN_SCENE_TOOL, turnRpgRoom } from "../../chat/verbs/turn-rpg-physical.ts";

// The largest whole number a schema integer admits: the old padding loop never finishes on it.
const HOSTILE_ACT = Number.MAX_SAFE_INTEGER;
const HARBOR = "The salt harbor";

function sceneReply(args: { [key: string]: JsonValue }): () => Response {
  return (): Response =>
    coreSse([
      coreFrame({
        choices: [
          {
            delta: {
              content: "The tide turns and the fleet comes in.",
              ["tool_calls"]: [{ index: 0, id: "plot-act-0", type: "function", function: { name: TURN_SCENE_TOOL, arguments: JSON.stringify(args) } }],
            },
          },
        ],
      }),
      terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 12, completionTokens: 8 } }),
    ]);
}

test("a plot act far past the maximum is salvaged out of the scene call and disclosed, and the beat finishes", async () => {
  await using h = await turnRpgRoom([sceneReply({ location: HARBOR, plot: { act: HOSTILE_ACT, actTitle: "The flood" } })]);

  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Watch the water." });
  expect(sent.aborted).toBe(false);
  await h.root.settleBackground();

  const view = await h.caller.rpg.getTrackerView({ chatId: h.chatId });
  // The sibling field of the same call still lands; only the plot patch is refused.
  expect(view.plot).toBeNull();
  expect(view.ambient?.location).toBe(HARBOR);

  const disclosed = await h.caller.rpg.listTurnToolCalls({ chatId: h.chatId });
  expect(disclosed[0]?.calls.map(({ name, verdict, issues }) => ({ name, verdict, issues }))).toEqual([
    { name: TURN_SCENE_TOOL, verdict: "salvaged", issues: [`${TURN_SCENE_TOOL}.plot`] },
  ]);
});

test("a plot act inside the maximum advances the plot and pads its acts", async () => {
  await using h = await turnRpgRoom([sceneReply({ location: HARBOR, plot: { act: RPG_PLOT_ACTS_MAX, actTitle: "The last tide" } })]);

  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Watch the water." });
  expect(sent.aborted).toBe(false);
  await h.root.settleBackground();

  const view = await h.caller.rpg.getTrackerView({ chatId: h.chatId });
  expect(view.plot?.act).toBe(RPG_PLOT_ACTS_MAX);
  expect(view.plot?.acts).toHaveLength(RPG_PLOT_ACTS_MAX);
  expect(view.plot?.acts.at(-1)).toEqual({ title: "The last tide", summary: "" });

  const disclosed = await h.caller.rpg.listTurnToolCalls({ chatId: h.chatId });
  expect(disclosed[0]?.calls.map(({ verdict }) => verdict)).toEqual(["applied"]);
});
