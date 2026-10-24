// A real game whose one npc is re-stanced to a custom relationship labelled with an inherited member name; the
// production SEND assembles the reminder and the delta, and the model-bound request bytes come back.
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreFrame, coreSse } from "../../chat/engine/core-physical.ts";
import { TURN_SCENE_TOOL, turnRpgRoom, turnWireBody } from "../../chat/verbs/turn-rpg-physical.ts";

/** The label a host can type that is also an inherited member of every plain object. */
export const INHERITED_LABEL = "constructor";
export const NPC_KEY = "warden";
export const PRIOR_KIND = "friend";
export const DELTA_MARKER = "[inherited-label-delta]";
export const SCENE = "The still observatory";

async function requestText(request: Request): Promise<string> {
  const messages = (await turnWireBody(request))["messages"];
  if (!Array.isArray(messages)) {
    throw new Error("the native turn has no message list");
  }
  return messages
    .map((message) => {
      if (message === null || typeof message !== "object" || Array.isArray(message) || typeof message["content"] !== "string") {
        throw new Error("the text-only turn has non-text native message content");
      }
      return message["content"];
    })
    .join("\n\n");
}

/** Send two beats around a hand edit that moves the npc from `friend` to a custom relationship labelled
 *  {@link INHERITED_LABEL}, with no hint configured for it. Returns the request text of the second beat. */
export async function secondBeatWire(): Promise<string> {
  const wires: string[] = [];
  const reply = async (request: Request): Promise<Response> => {
    wires.push(await requestText(request));
    return coreSse([
      coreFrame({
        choices: [
          {
            delta: {
              content: "The keeper remains at the observatory.",
              ["tool_calls"]: [
                {
                  index: 0,
                  id: `inherited-label-beat-${wires.length}`,
                  type: "function",
                  function: { name: TURN_SCENE_TOOL, arguments: JSON.stringify({ location: SCENE, recentEvent: `The keeper records beat ${wires.length}.` }) },
                },
              ],
            },
          },
        ],
      }),
      terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 12, completionTokens: 8 } }),
    ]);
  };
  await using h = await turnRpgRoom([reply, reply], {
    promptConfig: makePromptConfig({
      sections: [
        { type: "literal", id: "inherited-label-delta", name: "Delta", role: "system", content: `${DELTA_MARKER}{{rpgDelta}}${DELTA_MARKER}`, enabled: true },
        ...DEFAULT_PROMPT_CONFIG.sections,
      ],
    }),
  });
  const params = { principal: h.owner, chatId: h.chatId };
  const targetRef = { kind: "npc", npcKey: NPC_KEY } as const;
  await h.root.services.rpg.patchActor({ ...params, targetRef, ops: [{ op: "setRelationship", relationship: { kind: PRIOR_KIND, label: "" } }] });
  await h.root.services.chat.send({ ...params, content: "Establish the observatory." });
  await h.root.settleBackground();
  await h.root.services.rpg.patchActor({ ...params, targetRef, ops: [{ op: "setRelationship", relationship: { kind: "custom", label: INHERITED_LABEL } }] });
  await h.root.services.chat.send({ ...params, content: "Describe the changed state." });
  await h.root.settleBackground();
  const wire = wires[1];
  if (wire === undefined) {
    throw new Error("the second beat never reached the model");
  }
  return wire;
}
