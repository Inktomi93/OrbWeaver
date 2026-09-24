// domain/chat/teaching-contribution — CONTRIBUTOR #0, the rpg-gather projection. The seam's whole silence
// claim rests here: a game turn's depth-0 state block must arrive at assembly with the same content, the same
// order and the same `game-state` stamp it had when the merge site stamped it, and a non-game chat must
// contribute nothing at all.

import type { ChatInjection } from "@orb/contracts/chat";
import { CHAT_REACT_TOOL_NAME } from "@orb/contracts/chat";
import type { ProseOverrides } from "@orb/contracts/prose";
import { PROSE_SLOTS, resolveProseText } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId, mintTypeId } from "@orb/kit/ids";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { describe } from "vitest";
import { MERGE_SEPARATOR } from "../../../../packages/server/src/domain/chat/assembly/role-squash.ts";
import { shape } from "../../../../packages/server/src/domain/chat/assembly/shape.ts";
import type {
  ChatRpgGatherResult,
  TeachingContext,
  TeachingContribution,
  TeachingKnobs,
} from "../../../../packages/server/src/domain/chat/contract/context.ts";
import { convertsToEmptyWireRow } from "../../../../packages/server/src/domain/chat/substrate/wire-history.ts";
import { createChatTeachingContributions } from "../../../../packages/server/src/domain/chat/teaching-contribution.ts";
import { expect, test } from "../../../support/fixtures.ts";

const STATE_BLOCK: ChatInjection = { position: "in_chat", depth: 0, role: "system", content: "[Scene] a tavern" };

/** The shipped choices teach — the same slot bytes rpg's reminder resolves (S2: NO second prose home). */
const CHOICES_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text;

/** A teach as the contribution emits it: inside the shipped `chat.teach.choicesFrame` delimiter. */
function framed(teach: string): string {
  return resolveProseText("chat.teach.choicesFrame", {}, { teach });
}

/** The unit tier has no database; only the ATTRIBUTION contributor reads one, and no test here collects
 *  it (its behavior is `teaching-contribution.int.test.ts`'s). The `workloads/_support.ts` spelling. */
// @orb-waive no-test-fabrication(Db): a deliberately INERT Db stand-in — nothing here may touch a database, and any collect that did would throw loudly on it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const UNIT_DB = {} as Db;

/** Every knob at its SHIPPED default (plane on, react tool off), overridable per test. */
function knobsOf(over: Partial<TeachingKnobs> = {}): TeachingKnobs {
  return { offerChoices: false, charactersCanReact: false, reactionsEnabled: true, ...over };
}

function tctxOf(rpgGather: ChatRpgGatherResult | null, over: Partial<TeachingContext> = {}): TeachingContext {
  return {
    chatId: castId<ChatId>("chat_game"),
    runAsUserId: castId<UserId>("user_host"),
    knobs: knobsOf(),
    prose: {},
    identity: { user: "Alex", char: "Aria" },
    rpgGather,
    ...over,
  };
}

/** One shipped contributor by id — resolved off the shipped registry, never re-declared here. */
function contributor(id: string): TeachingContribution {
  const found = createChatTeachingContributions({ db: UNIT_DB }).find((c) => c.id === id);
  if (found === undefined) {
    throw new Error(`${id} is not registered`);
  }
  return found;
}

/** Contributor #1 (`chat.offer-choices`). */
function offerChoices(): TeachingContribution {
  return contributor("chat.offer-choices");
}

function gatherOf(over: Partial<ChatRpgGatherResult> = {}): ChatRpgGatherResult {
  return { macros: {}, injections: [STATE_BLOCK], tools: [], cardKeepLastX: 0, ...over };
}

describe("createChatTeachingContributions — chat's own contributions", () => {
  test("chat contributes the gather projection FIRST, then choices / attribution / react-attach in order", () => {
    const contributions = createChatTeachingContributions({ db: UNIT_DB });

    expect(contributions.map((c) => [c.id, c.order])).toEqual([
      ["chat.rpg-gather", 0],
      ["chat.offer-choices", 1],
      ["chat.reaction-attribution", 2],
      ["chat.react-tool", 3],
    ]);
  });

  test("a NON-GAME chat contributes nothing — the byte-identical arm every plain chat takes", async () => {
    const out = await createChatTeachingContributions({ db: UNIT_DB })[0]?.collect(tctxOf(null));

    expect(out).toEqual({ injections: [], toolNames: [] });
  });

  test("a game turn's injections ride through VERBATIM, stamped `game-state` (the stamp's one home)", async () => {
    const out = await createChatTeachingContributions({ db: UNIT_DB })[0]?.collect(tctxOf(gatherOf()));

    expect(out?.injections).toEqual([{ ...STATE_BLOCK, origin: "game-state" }]);
  });

  test("multiple gather injections keep their ORDER (the reminder + a reconcile note are one ordered pair)", async () => {
    const second: ChatInjection = { ...STATE_BLOCK, content: "[Reconcile] restate the panel" };
    const out = await createChatTeachingContributions({ db: UNIT_DB })[0]?.collect(tctxOf(gatherOf({ injections: [STATE_BLOCK, second] })));

    expect(out?.injections.map((i) => i.content)).toEqual([STATE_BLOCK.content, second.content]);
  });

  test("the gather's own `tools` become the contribution's toolNames — not a hard-coded empty set", async () => {
    const empty = await createChatTeachingContributions({ db: UNIT_DB })[0]?.collect(tctxOf(gatherOf()));
    const withTools = await createChatTeachingContributions({ db: UNIT_DB })[0]?.collect(tctxOf(gatherOf({ tools: ["skill_check"] })));

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
    const out = await offerChoices().collect(tctxOf(null, { knobs: knobsOf({ offerChoices: true }) }));

    expect(out).toEqual({ injections: [{ position: "in_chat", depth: 0, role: "system", content: framed(CHOICES_TEACH) }], toolNames: [] });
  });

  test("a host PRESET OVERRIDE of the slot is what gets taught — the teach is preset-editable, never the baseline", async () => {
    const text = "CHOICES: offer three, in the voice of the scene.";
    const prose: ProseOverrides = { "rpg.reminder.cyoaTeach": { text, baseVersion: 1 } };

    const out = await offerChoices().collect(tctxOf(null, { knobs: knobsOf({ offerChoices: true }), prose }));

    expect(out.injections.map((i) => i.content)).toEqual([framed(text)]);
  });

  test("an override typing {{user}}/{{char}} renders the NAMES — a teach never ships literal braces", async () => {
    const prose: ProseOverrides = { "rpg.reminder.cyoaTeach": { text: "Offer {{user}} three ways to answer {{char}}.", baseVersion: 1 } };

    const out = await offerChoices().collect(tctxOf(null, { knobs: knobsOf({ offerChoices: true }), prose }));

    expect(out.injections.map((i) => i.content)).toEqual([framed("Offer Alex three ways to answer Aria.")]);
  });

  // The `{{user}}` FLOOR on a personaless turn. Not a style point: rpg's gather floors the same macro to
  // `DEFAULT_PERSONA_NAME`, so a different floor here would render two different strings from one slot and the
  // containment check below would miss its own duplicate. Pinned so the coupling is a test, not a comment.
  test("with no active persona, {{user}} floors to the SAME word rpg's gather floors it to", async () => {
    const prose: ProseOverrides = { "rpg.reminder.cyoaTeach": { text: "Offer {{user}} three ways.", baseVersion: 1 } };

    const out = await offerChoices().collect(tctxOf(null, { knobs: knobsOf({ offerChoices: true }), prose, identity: { user: undefined, char: "Aria" } }));

    expect(out.injections.map((i) => i.content)).toEqual([framed(`Offer ${DEFAULT_PERSONA_NAME} three ways.`)]);
  });

  // THE SUPPRESSION, at the granularity rpg actually emits (`chat-ops/gather.ts:183,206` — ONE injection whose
  // content is the joined reminder). Both arms matter: firing on a real duplicate, and NOT firing otherwise.
  test("the gather ALREADY carrying the teach inside its reminder blob ⇒ chat stands down", async () => {
    const gather = gatherOf({ injections: [{ ...STATE_BLOCK, content: `${STATE_BLOCK.content}\n\n${CHOICES_TEACH}` }] });

    const out = await offerChoices().collect(tctxOf(gather, { knobs: knobsOf({ offerChoices: true }) }));

    expect(out).toEqual({ injections: [], toolNames: [] });
  });

  test("a game gather WITHOUT the teach ⇒ chat still teaches (the suppression is not 'any game chat')", async () => {
    const out = await offerChoices().collect(tctxOf(gatherOf(), { knobs: knobsOf({ offerChoices: true }) }));

    expect(out.injections.map((i) => i.content)).toEqual([framed(CHOICES_TEACH)]);
  });
});

// On a model that takes no system row the depth-0 teach folds into the player's own message, after their labelled
// line. It carries its own delimiter so that line never introduces it (owner ruling). The delimiters are read off
// the frame slot, so the assertion is the structure, never the words.
describe("createChatTeachingContributions — the offer-choices teach is delimited at its source", () => {
  const [open = "", close = ""] = PROSE_SLOTS["chat.teach.choicesFrame"].text.split("{{teach}}");

  test("a folded teach is delimited from the player's label line in a labelled multi-human room", async () => {
    expect(open.trim()).not.toBe("");
    expect(close.trim()).not.toBe("");
    const out = await offerChoices().collect(tctxOf(null, { knobs: knobsOf({ offerChoices: true }) }));

    const shaped = shape({
      canon: [
        { role: "user", content: "I open the door.", authorName: "Alex", messageId: mintTypeId("message") },
        { role: "user", content: "I follow him in.", authorName: "Joe", messageId: mintTypeId("message") },
      ],
      appendUserTurn: null,
      injections: out.injections,
      output: "per-speaker",
      cardScope: "merged",
      scopedTargetId: null,
      namesBehavior: "default",
      speakers: { user: "Alex", assistant: "Aria" },
      multiHuman: true,
      groupNudge: null,
      convertsToEmptyWireRow,
    });
    const players = `Alex: I open the door.${MERGE_SEPARATOR}Joe: I follow him in.${MERGE_SEPARATOR}`;
    const message = shaped.history.at(-1)?.content ?? "";
    expect(message.startsWith(players)).toBe(true);
    const folded = message.slice(players.length);
    expect(folded.startsWith(open)).toBe(true);
    expect(folded.endsWith(close)).toBe(true);
    // The teach itself rides whole between the delimiters.
    expect(folded.slice(open.length, folded.length - close.length)).toBe(CHOICES_TEACH);
  });

  test("the frame is the preset's slot: a host override replaces the delimiter around the same teach", async () => {
    const prose: ProseOverrides = { "chat.teach.choicesFrame": { text: "<<{{teach}}>>", baseVersion: 1 } };

    const out = await offerChoices().collect(tctxOf(null, { knobs: knobsOf({ offerChoices: true }), prose }));

    expect(out.injections.map((i) => i.content)).toEqual([`<<${CHOICES_TEACH}>>`]);
  });

  test("the game's reminder already carrying the teach still suppresses the framed teach", async () => {
    const reminder = `${open}${STATE_BLOCK.content}\n\n${CHOICES_TEACH}${close}`;
    const gather = gatherOf({ injections: [{ ...STATE_BLOCK, content: reminder }] });

    const out = await offerChoices().collect(tctxOf(gather, { knobs: knobsOf({ offerChoices: true }) }));

    expect(out).toEqual({ injections: [], toolNames: [] });
  });
});

// CONTRIBUTOR #3 — the B7 `react` tool ATTACH: the FIRST non-empty `toolNames` contributor (R2's whole
// point), and the OWNER'S OFF-TOGGLE RECEIPT. The full two-knob matrix, because the gate is a conjunction
// and a conjunction tested one arm at a time is a gate tested not at all: the tool reaches the wire ONLY
// when `charactersCanReact` (the opt-in, OFF at both tiers by default) AND `reactionsEnabled` (the plane's
// master) both resolve on. No injections in ANY arm — the tool's wire `description` is the teach (the
// tool-use contribution's posture).
describe("createChatTeachingContributions — the react-tool attach", () => {
  test("the SHIPPED DEFAULTS attach nothing — a room nobody opted in is byte-identical (the owner receipt)", async () => {
    expect(await contributor("chat.react-tool").collect(tctxOf(null))).toEqual({ injections: [], toolNames: [] });
  });

  test("charactersCanReact ON + reactionsEnabled ON ⇒ exactly the react tool, no injections", async () => {
    const out = await contributor("chat.react-tool").collect(tctxOf(null, { knobs: knobsOf({ charactersCanReact: true }) }));

    expect(out).toEqual({ injections: [], toolNames: [CHAT_REACT_TOOL_NAME] });
  });

  test("charactersCanReact ON but the reaction PLANE off ⇒ nothing — the master switch outranks the opt-in", async () => {
    const out = await contributor("chat.react-tool").collect(tctxOf(null, { knobs: knobsOf({ charactersCanReact: true, reactionsEnabled: false }) }));

    expect(out).toEqual({ injections: [], toolNames: [] });
  });

  test("the plane on but charactersCanReact OFF ⇒ nothing — reactions for humans never imply the tool", async () => {
    const out = await contributor("chat.react-tool").collect(tctxOf(null, { knobs: knobsOf({ reactionsEnabled: true }) }));

    expect(out).toEqual({ injections: [], toolNames: [] });
  });
});
