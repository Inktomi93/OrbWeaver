// SEND preserves tracker hints in standalone macro and CEL deltas and omits an unchanged pair; each reply's
// snapshot row carries the folded location.
// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/rpg/chat-ops/gather.ts
// @subject packages/server/src/domain/rpg/substrate/delta.ts

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import { rpgTrackerDefSchema, rpgTrackerValueSchema } from "@orb/contracts/rpg";
import { rpgSnapshots } from "@orb/db";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import { coreFrame, coreSse } from "../../chat/engine/core-physical.ts";
import { TURN_SCENE_TOOL, turnRpgRoom, turnWireBody } from "../../chat/verbs/turn-rpg-physical.ts";

const MANA = rpgTrackerDefSchema.parse({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", max: 10, hint: "fuels spellcasting" });
const FOCUS = rpgTrackerDefSchema.parse({ key: "focus", label: "Focus", shape: "meter", write: "delta", subject: "actor", max: 10, hint: "steadies the hand" });
const SEALED = rpgTrackerDefSchema.parse({
  key: "sealed",
  label: "Sealed",
  shape: "meter",
  write: "delta",
  subject: "actor",
  max: 10,
  locked: true,
  hint: "the host owns this",
});
const TRUST = rpgTrackerDefSchema.parse({ key: "trust", label: "Trust", shape: "text", write: "set", subject: "actor", hint: "where the traveller stands" });
const LOADOUT = rpgTrackerDefSchema.parse({ key: "loadout", label: "Loadout", shape: "list", write: "set", subject: "game", hint: "equipment ready for use" });
const UNSET = rpgTrackerDefSchema.parse({ key: "bond", label: "Bond", shape: "text", write: "set", subject: "actor", hint: "an unspoken connection" });
const TRACKERS = [MANA, FOCUS, SEALED, TRUST, LOADOUT, UNSET];
const SCENE = "The still observatory";
const MARKERS = { delta: "[tracker-delta-wire]", cel: "[tracker-cel-wire]", cast: "[tracker-cast-wire]", scene: "[tracker-scene-wire]" } as const;

async function requestText(request: Request): Promise<string> {
  const body = await turnWireBody(request);
  const messages = body["messages"];
  if (!Array.isArray(messages)) {
    throw new Error("the native tracker turn has no message list");
  }
  return messages
    .map((message) => {
      if (message === null || typeof message !== "object" || Array.isArray(message) || typeof message["content"] !== "string") {
        throw new Error("the text-only tracker turn has non-text native message content");
      }
      return message["content"];
    })
    .join("\n\n");
}

function fragment(wire: string, marker: string): string {
  const parts = wire.split(marker);
  expect(parts).toHaveLength(3);
  const content = parts[1];
  if (content === undefined) {
    throw new Error("the actual tracker prompt omitted its delimited fragment");
  }
  return content;
}

async function sendBeat(h: ChatRoot, content: string): Promise<void> {
  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content });
  expect(sent.aborted).toBe(false);
  const assistant = sent.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the tracker beat has no selected assistant variant");
  }
  await h.root.settleBackground();
  expect(await h.root.db.select({ location: rpgSnapshots.location }).from(rpgSnapshots).where(eq(rpgSnapshots.variantId, assistant.selectedVariantId))).toEqual(
    [{ location: SCENE }],
  );
}

test("real SEND preserves tracker hints in standalone macro and CEL deltas, then omits an unchanged pair", async () => {
  const wires: string[] = [];
  const reply = async (request: Request): Promise<Response> => {
    wires.push(await requestText(request));
    // Appended beats create real snapshots without inventing a state delta; a same-location write alone stages nothing.
    return coreSse([
      coreFrame({
        choices: [
          {
            delta: {
              content: "The keeper remains at the observatory.",
              ["tool_calls"]: [
                {
                  index: 0,
                  id: `tracker-beat-${wires.length}`,
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
  await using h = await turnRpgRoom([reply, reply, reply, reply], {
    promptConfig: makePromptConfig({
      sections: [
        {
          type: "literal",
          id: "tracker-wire-fragments",
          name: "Tracker wire fragments",
          role: "system",
          content: [
            `${MARKERS.delta}{{rpgDelta}}${MARKERS.delta}`,
            `${MARKERS.cel}{{expr::rpg.delta.text}}${MARKERS.cel}`,
            `${MARKERS.cast}{{rpgCast}}${MARKERS.cast}`,
            `${MARKERS.scene}{{rpgSceneState}}${MARKERS.scene}`,
          ].join("\n"),
          enabled: true,
        },
        ...DEFAULT_PROMPT_CONFIG.sections,
      ],
    }),
  });
  const params = { principal: h.owner, chatId: h.chatId };
  await h.root.services.rpg.updateConfig({ ...params, patch: { trackers: TRACKERS } });
  const actor = h.characters[0];
  if (actor === undefined) {
    throw new Error("the authored tracker room has no character carrier");
  }
  const targetRef = { kind: "character", characterId: actor.id } as const;

  await sendBeat(h, "Establish the observatory.");
  const opening = wires[0] ?? "";
  const openingCast = fragment(opening, MARKERS.cast);
  expect(openingCast).toContain(actor.name);
  expect(fragment(opening, MARKERS.delta)).toBe("");
  expect(fragment(opening, MARKERS.cel)).toBe("");
  for (const def of TRACKERS) {
    expect(opening.split(`${def.label} (${def.hint})`)).toHaveLength(2);
    expect(openingCast).not.toContain(def.hint);
  }
  for (const def of TRACKERS.filter((entry) => entry.subject === "actor")) {
    expect(openingCast).toContain(` — ${def.label}`);
    expect(openingCast).not.toContain(`${def.label} null`);
  }

  expect(
    await h.root.services.rpg.patchActor({
      ...params,
      targetRef,
      ops: [
        { op: "setTracker", key: MANA.key, value: { value: 3 } },
        { op: "setTracker", key: FOCUS.key, value: { max: 6 } },
        { op: "setTracker", key: SEALED.key, value: { value: 4 } },
        { op: "setTracker", key: TRUST.key, value: { value: "guarded" } },
      ],
    }),
  ).toEqual({ ok: true });
  expect(
    await h.root.services.rpg.editSnapshot({
      ...params,
      patch: { trackerValues: { [LOADOUT.key]: rpgTrackerValueSchema.parse({ items: ["Sword", "Shield"] }) } },
    }),
  ).toEqual({ ok: true });
  await sendBeat(h, "Keep watch at the observatory.");

  expect(
    await h.root.services.rpg.patchActor({
      ...params,
      targetRef,
      ops: [
        { op: "setTracker", key: MANA.key, value: { value: 0 } },
        { op: "setTracker", key: FOCUS.key, value: { value: 0 } },
        { op: "setTracker", key: SEALED.key, value: { value: 9 } },
        { op: "setTracker", key: TRUST.key, value: { value: "open" } },
      ],
    }),
  ).toEqual({ ok: true });
  expect(
    await h.root.services.rpg.editSnapshot({
      ...params,
      patch: { trackerValues: { [LOADOUT.key]: rpgTrackerValueSchema.parse({ items: ["Sword", "Bow"] }) } },
    }),
  ).toEqual({ ok: true });
  await sendBeat(h, "Describe the changed state.");

  const changed = wires[2] ?? "";
  const delta = fragment(changed, MARKERS.delta);
  expect(fragment(changed, MARKERS.cel)).toBe(delta);
  const expectedLines = [
    `${actor.name} ${MANA.label} 3→0 (-3) — ${MANA.hint}`,
    `${actor.name} ${FOCUS.label} → 0/6 — ${FOCUS.hint}`,
    `${actor.name} ${SEALED.label} 4→9 (+5) — ${SEALED.hint}`,
    `${actor.name} ${TRUST.label}: guarded → open — ${TRUST.hint}`,
    `${LOADOUT.label}: Sword, Shield → Sword, Bow — ${LOADOUT.hint}`,
  ];
  expect(delta).toBe(`${resolveProseText("rpg.delta.changesHeading", {})}: ${expectedLines.join(" · ")}`);
  expect(delta).not.toContain(UNSET.label);
  const cast = fragment(changed, MARKERS.cast);
  expect(cast).toContain(`${MANA.label} 0/10`);
  expect(cast).toContain(`${FOCUS.label} 0/6`);
  expect(cast).not.toContain(`${FOCUS.label} 0/10`);
  expect(cast).toContain(`${SEALED.label} 9/10`);
  expect(cast).toContain(`${TRUST.label}: open`);
  expect(cast).toContain(UNSET.label);
  for (const def of TRACKERS) {
    expect(cast).not.toContain(def.hint);
  }
  expect(fragment(changed, MARKERS.scene)).toContain(`${LOADOUT.label}: Sword, Bow`);

  await sendBeat(h, "Wait without changing any tracked state.");
  expect(wires).toHaveLength(4);
  const quiet = wires[3] ?? "";
  expect(fragment(quiet, MARKERS.delta)).toBe("");
  expect(fragment(quiet, MARKERS.cel)).toBe("");
  expect(fragment(quiet, MARKERS.cast)).toBe(cast);
  for (const def of TRACKERS) {
    expect(quiet.split(`${def.label} (${def.hint})`)).toHaveLength(2);
  }
});
