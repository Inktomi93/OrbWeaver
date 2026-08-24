// domain/chat/teaching-contribution — CONTRIBUTOR #0, the rpg-gather projection. The seam's whole silence
// claim rests here: a game turn's depth-0 state block must arrive at assembly with the same content, the same
// order and the same `game-state` stamp it had when the merge site stamped it, and a non-game chat must
// contribute nothing at all.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ProseOverrides } from "@orb/contracts/prose";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { ChatRpgGatherResult, TeachingContext, TeachingContribution } from "../../../../packages/server/src/domain/chat/contract/context.ts";
import { createChatTeachingContributions } from "../../../../packages/server/src/domain/chat/teaching-contribution.ts";
import { expect, test } from "../../../support/fixtures.ts";

const STATE_BLOCK: ChatInjection = { position: "in_chat", depth: 0, role: "system", content: "[Scene] a tavern" };

/** The shipped choices teach — the same slot bytes rpg's reminder resolves (S2: NO second prose home). */
const CHOICES_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text;

function tctxOf(rpgGather: ChatRpgGatherResult | null, over: Partial<TeachingContext> = {}): TeachingContext {
  return {
    chatId: castId<ChatId>("chat_game"),
    runAsUserId: castId<UserId>("user_host"),
    knobs: { offerChoices: false },
    prose: {},
    identity: { user: "Nate", char: "Aria" },
    rpgGather,
    ...over,
  };
}

/** Contributor #1 (`chat.offer-choices`) — resolved off the shipped registry, never re-declared here. */
function offerChoices(): TeachingContribution {
  const found = createChatTeachingContributions().find((c) => c.id === "chat.offer-choices");
  if (found === undefined) {
    throw new Error("chat.offer-choices is not registered");
  }
  return found;
}

function gatherOf(over: Partial<ChatRpgGatherResult> = {}): ChatRpgGatherResult {
  return { macros: {}, injections: [STATE_BLOCK], tools: [], cardKeepLastX: 0, ...over };
}

describe("createChatTeachingContributions — chat's own contributions", () => {
  test("chat contributes the gather projection FIRST, then its own offer-choices teach", () => {
    const contributions = createChatTeachingContributions();

    expect(contributions.map((c) => [c.id, c.order])).toEqual([
      ["chat.rpg-gather", 0],
      ["chat.offer-choices", 1],
    ]);
  });

  test("a NON-GAME chat contributes nothing — the byte-identical arm every plain chat takes", async () => {
    const out = await createChatTeachingContributions()[0]?.collect(tctxOf(null));

    expect(out).toEqual({ injections: [], toolNames: [] });
  });

  test("a game turn's injections ride through VERBATIM, stamped `game-state` (the stamp's one home)", async () => {
    const out = await createChatTeachingContributions()[0]?.collect(tctxOf(gatherOf()));

    expect(out?.injections).toEqual([{ ...STATE_BLOCK, origin: "game-state" }]);
  });

  test("multiple gather injections keep their ORDER (the reminder + a reconcile note are one ordered pair)", async () => {
    const second: ChatInjection = { ...STATE_BLOCK, content: "[Reconcile] restate the panel" };
    const out = await createChatTeachingContributions()[0]?.collect(tctxOf(gatherOf({ injections: [STATE_BLOCK, second] })));

    expect(out?.injections.map((i) => i.content)).toEqual([STATE_BLOCK.content, second.content]);
  });

  test("the gather's own `tools` become the contribution's toolNames — not a hard-coded empty set", async () => {
    const empty = await createChatTeachingContributions()[0]?.collect(tctxOf(gatherOf()));
    const withTools = await createChatTeachingContributions()[0]?.collect(tctxOf(gatherOf({ tools: ["skill_check"] })));

    // As built, every rpg mode pins `tools: []` (the fold rides `terminalTools`, which is NOT a registry
    // attach) — so today's turn attaches nothing. The projection still carries what the gather declares, so a
    // mode that DOES contribute a registry tool attaches it through the one seam instead of being dropped.
    expect(empty?.toolNames).toEqual([]);
    expect(withTools?.toolNames).toEqual(["skill_check"]);
  });
});

// CONTRIBUTOR #1 — the B1 offer-choices teach, at the unit tier. The assembled-output half (and the RED-FIRST
// double-teach receipt) is `substrate/teaching.int.test.ts`; these are the contribution's own four laws.
describe("createChatTeachingContributions — the offer-choices teach", () => {
  test("the knob OFF contributes nothing — the byte-identical floor", async () => {
    expect(await offerChoices().collect(tctxOf(null))).toEqual({ injections: [], toolNames: [] });
  });

  test("the knob ON teaches the SHIPPED SLOT's bytes at the reminder's own placement, attaching no tools", async () => {
    const out = await offerChoices().collect(tctxOf(null, { knobs: { offerChoices: true } }));

    expect(out).toEqual({ injections: [{ position: "in_chat", depth: 0, role: "system", content: CHOICES_TEACH }], toolNames: [] });
  });

  test("a host PRESET OVERRIDE of the slot is what gets taught — the teach is preset-editable, never the baseline", async () => {
    const text = "CHOICES: offer three, in the voice of the scene.";
    const prose: ProseOverrides = { "rpg.reminder.cyoaTeach": { text, baseVersion: 1 } };

    const out = await offerChoices().collect(tctxOf(null, { knobs: { offerChoices: true }, prose }));

    expect(out.injections.map((i) => i.content)).toEqual([text]);
  });

  test("an override typing {{user}}/{{char}} renders the NAMES — a teach never ships literal braces", async () => {
    const prose: ProseOverrides = { "rpg.reminder.cyoaTeach": { text: "Offer {{user}} three ways to answer {{char}}.", baseVersion: 1 } };

    const out = await offerChoices().collect(tctxOf(null, { knobs: { offerChoices: true }, prose }));

    expect(out.injections.map((i) => i.content)).toEqual(["Offer Nate three ways to answer Aria."]);
  });

  // The `{{user}}` FLOOR on a personaless turn. Not a style point: rpg's gather floors the same macro to
  // "User" (`chat-ops/gather.ts:126`), so a different floor here would render two different strings from one
  // slot and the containment check below would miss its own duplicate. Pinned so the coupling is a test, not
  // a comment.
  test("with no active persona, {{user}} floors to the SAME word rpg's gather floors it to", async () => {
    const prose: ProseOverrides = { "rpg.reminder.cyoaTeach": { text: "Offer {{user}} three ways.", baseVersion: 1 } };

    const out = await offerChoices().collect(tctxOf(null, { knobs: { offerChoices: true }, prose, identity: { user: undefined, char: "Aria" } }));

    expect(out.injections.map((i) => i.content)).toEqual(["Offer User three ways."]);
  });

  // THE SUPPRESSION, at the granularity rpg actually emits (`chat-ops/gather.ts:183,206` — ONE injection whose
  // content is the joined reminder). Both arms matter: firing on a real duplicate, and NOT firing otherwise.
  test("the gather ALREADY carrying the teach inside its reminder blob ⇒ chat stands down", async () => {
    const gather = gatherOf({ injections: [{ ...STATE_BLOCK, content: `${STATE_BLOCK.content}\n\n${CHOICES_TEACH}` }] });

    const out = await offerChoices().collect(tctxOf(gather, { knobs: { offerChoices: true } }));

    expect(out).toEqual({ injections: [], toolNames: [] });
  });

  test("a game gather WITHOUT the teach ⇒ chat still teaches (the suppression is not 'any game chat')", async () => {
    const out = await offerChoices().collect(tctxOf(gatherOf(), { knobs: { offerChoices: true } }));

    expect(out.injections.map((i) => i.content)).toEqual([CHOICES_TEACH]);
  });
});
