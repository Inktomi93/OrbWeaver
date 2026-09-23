// THE S2 BYTE PINS, at the instrument the spec names: the MERGED `ChatInjection[]` the build hands to
// assembly (`AssembleContext.chatInjections`), driven through the real gather over a real libSQL db.
//
// What these pin, in order: (1) a zero-contribution chat's array is exactly its own host-authored rows — the
// value every chat had before this seam existed; (2) a game chat's state block arrives with the same content,
// order and `game-state` stamp the merge site used to apply, across the cyoa-off/cyoa-on arms; (3) the
// DOUBLE-TEACH GUARD collapses two contributions teaching the same fence to ONE; (4) the guard's SCOPE — two
// identical HOST-AUTHORED rows both survive, because this seam does not edit a human's canon.

import type { ChatInjection } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import { chatInjections } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import type {
  ChatContext,
  ChatRpgGatherResult,
  ChatTeachingRegistry,
  TeachingContribution,
} from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import type { ForeignInputs } from "../../../../../packages/server/src/domain/chat/contract/foreign.ts";
import { gatherAssembleContext } from "../../../../../packages/server/src/domain/chat/substrate/assemble-gather.ts";
import { collectTeaching } from "../../../../../packages/server/src/domain/chat/substrate/teaching.ts";
import { createChatTeachingContributions } from "../../../../../packages/server/src/domain/chat/teaching-contribution.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../_support.ts";

/** The CYOA teach's ONE home — the same bytes the rpg reminder composes and a chat-level offer-choices
 *  contribution would emit. The double-teach case is only real because these are the same string. */
const CYOA_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text;

const STATE_BLOCK = "[Scene] a tavern at dusk";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

function foreignOf(): ForeignInputs {
  return {
    promptConfig: DEFAULT_PROMPT_CONFIG,
    personas: { anchor: null, active: null },
    scanDepth: 6,
    injectionTokenBudget: 0,
  };
}

async function seedRoom(key: string): Promise<{ host: UserId; chatId: ChatId; aria: CharacterId }> {
  const host = await seedUser(db, castId<Handle>(`${key}_host`));
  const chatId = await seedChat(db, key);
  const aria = await seedCharacter(db, host, `${key}_aria`);
  await seedParticipant(db, { chatId, key: `${key}_h`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `${key}_c`, characterId: aria });
  return { host, chatId, aria };
}

/** A host-authored `chat_injections` row (the plane this seam must never touch). */
async function seedInjectionRow(chatId: ChatId, id: string, content: string): Promise<void> {
  await db.insert(chatInjections).values({
    id: castId(id),
    chatId: castId(chatId),
    position: "in_chat",
    depth: 0,
    role: "system",
    content,
    createdAt: FROZEN_AT,
  });
}

/** A game gather, in the shape rpg ACTUALLY emits — CORRECTED 2026-08-24 (B1).
 *
 *  This fake used to push the cyoa teach as a SECOND injection, and that shape does not exist in production:
 *  `domain/rpg/substrate/reminder.ts:459` pushes every teach into the same `blocks` array as the game-state
 *  block, `:571` joins them, and `domain/rpg/chat-ops/gather.ts:183,206` emits exactly ONE injection
 *  (`buildLiteReminder` has no other caller). On a real game turn the teach is therefore a SUBSTRING of a
 *  bigger blob — which is precisely what the collector's exact-tuple guard cannot see, and why the
 *  suppression that keeps a both-knobs-on room from being told the same thing twice lives at chat's own
 *  contribution instead (`domain/chat/teaching-contribution.ts`). Pinning the real shape here is what makes
 *  the arms below claims about production rather than about the fake. */
function gatherOf(cyoa: boolean): ChatRpgGatherResult {
  const content = cyoa ? `${STATE_BLOCK}\n\n${CYOA_TEACH}` : STATE_BLOCK;
  const injections: ChatInjection[] = [{ position: "in_chat", depth: 0, role: "system", content }];
  return { macros: {}, injections, tools: [], cardKeepLastX: 0 };
}

/** Runs the REAL seam end to end: collect over the ctx's registry, then merge through the real gather.
 *
 *  `offerChoices` drives the PRODUCTION contribution (`createChatTeachingContributions`'s second member) —
 *  the arms below exercise the shipped code rather than a stand-in, which is what lets them make claims about
 *  the suppression. `prose` is the turn preset's composed overrides: `{}` resolves every slot to its shipped
 *  default, and the override arm passes a real one. */
async function mergedInjections(args: {
  readonly ctx: ChatContext;
  readonly chatId: ChatId;
  readonly host: UserId;
  readonly aria: CharacterId;
  readonly rpgGather: ChatRpgGatherResult | null;
  readonly offerChoices?: boolean;
  readonly prose?: ProseOverrides;
}): Promise<readonly ChatInjection[]> {
  const teaching = await collectTeaching(args.ctx.teaching, {
    chatId: args.chatId,
    runAsUserId: args.host,
    knobs: { offerChoices: args.offerChoices ?? false, charactersCanReact: false, reactionsEnabled: true },
    prose: args.prose ?? {},
    identity: { user: "Nate", char: "Aria" },
    rpgGather: args.rpgGather,
  });
  const out = await gatherAssembleContext(
    args.ctx,
    {
      chatId: args.chatId,
      runAsUserId: args.host,
      model: "m",
      characterIds: [args.aria],
      personaIds: [],
      teachingInjections: teaching.injections,
    },
    foreignOf(),
  );
  // The new-chat marker rides every turn (G9, pinned in `assembly/context.int.test.ts`); these pins are about
  // the teaching contributions and the host rows.
  return (out.chatInjections ?? []).filter((i) => i.origin !== "new-chat-marker");
}

function ctxOf(extra: ChatTeachingRegistry = []): ChatContext {
  return makeChatContext(db, { teaching: [...createChatTeachingContributions({ db }), ...extra] });
}

/** A foreign contribution that teaches the choices fence as its OWN injection — the shape the collector's
 *  exact-tuple guard actually covers (a second standalone teacher), which is a narrower case than A1 claimed
 *  and NOT the game's shape (see `gatherOf`). Distinct ids so the registry stays well-formed. */
function choicesTeacher(order: number): TeachingContribution {
  return {
    id: `test.offer-choices-${order}`,
    order,
    collect: () => Promise.resolve({ injections: [{ position: "in_chat", depth: 0, role: "system", content: CYOA_TEACH }], toolNames: [] }),
  };
}

describe("the merged injection array — the S2 byte pins", () => {
  test("a ZERO-CONTRIBUTION chat: the merged array is exactly its own host rows, `user`-stamped", async () => {
    const { host, chatId, aria } = await seedRoom("plain");
    await seedInjectionRow(chatId, "chat_injection_p1", "OPERATOR ONE");
    await seedInjectionRow(chatId, "chat_injection_p2", "OPERATOR TWO");

    const merged = await mergedInjections({ ctx: ctxOf(), chatId, host, aria, rpgGather: null });

    expect(merged).toEqual([
      { position: "in_chat", depth: 0, role: "system", content: "OPERATOR ONE", origin: "user" },
      { position: "in_chat", depth: 0, role: "system", content: "OPERATOR TWO", origin: "user" },
    ]);
  });

  test("a GAME chat, cyoa OFF: host rows first, then the state block stamped `game-state`", async () => {
    const { host, chatId, aria } = await seedRoom("game_off");
    await seedInjectionRow(chatId, "chat_injection_g1", "OPERATOR");

    const merged = await mergedInjections({ ctx: ctxOf(), chatId, host, aria, rpgGather: gatherOf(false) });

    expect(merged).toEqual([
      { position: "in_chat", depth: 0, role: "system", content: "OPERATOR", origin: "user" },
      { position: "in_chat", depth: 0, role: "system", content: STATE_BLOCK, origin: "game-state" },
    ]);
  });

  test("a GAME chat, cyoa ON: the reminder is ONE injection carrying the teach, on the same stamp", async () => {
    const { host, chatId, aria } = await seedRoom("game_on");

    const merged = await mergedInjections({ ctx: ctxOf(), chatId, host, aria, rpgGather: gatherOf(true) });

    expect(merged).toEqual([{ position: "in_chat", depth: 0, role: "system", content: `${STATE_BLOCK}\n\n${CYOA_TEACH}`, origin: "game-state" }]);
  });

  // ── THE B1 SUPPRESSION (2026-08-24) ─────────────────────────────────────────────────────────────────
  // A1 claimed the collector's exact-tuple guard covered this case. It does not, and could not: rpg's teach
  // arrives INSIDE the reminder blob (see `gatherOf`), so there is no byte-identical injection to collapse.
  // These arms therefore pin the arm that actually does the work — chat's own contribution declining to
  // teach a fence this turn's gather already taught. THE RED-FIRST RECEIPT for the first one is a run
  // against the pre-B1 source with the corrected fake: the teach appears TWICE.
  test("game cyoa ON + the room knob ON ⇒ EXACTLY ONE teach (chat's contribution stands down)", async () => {
    const { host, chatId, aria } = await seedRoom("double");

    const merged = await mergedInjections({ ctx: ctxOf(), chatId, host, aria, rpgGather: gatherOf(true), offerChoices: true });

    expect(merged.filter((i) => i.content.includes(CYOA_TEACH))).toHaveLength(1);
    expect(merged.map((i) => i.content)).toEqual([`${STATE_BLOCK}\n\n${CYOA_TEACH}`]);
  });

  // THE SUPPRESSION'S OFF-ARM, and the reason it is not optional: an over-eager containment check would mute
  // the room knob in EVERY game chat and look exactly like the arm above passing.
  test("game cyoa OFF + the room knob ON ⇒ chat teaches — the suppression fires only on a real duplicate", async () => {
    const { host, chatId, aria } = await seedRoom("single");

    const merged = await mergedInjections({ ctx: ctxOf(), chatId, host, aria, rpgGather: gatherOf(false), offerChoices: true });

    expect(merged.map((i) => i.content)).toEqual([STATE_BLOCK, CYOA_TEACH]);
  });

  test("a NON-GAME chat with the room knob ON ⇒ chat teaches, and it is the only injection", async () => {
    const { host, chatId, aria } = await seedRoom("plain_on");

    const merged = await mergedInjections({ ctx: ctxOf(), chatId, host, aria, rpgGather: null, offerChoices: true });

    expect(merged.map((i) => i.content)).toEqual([CYOA_TEACH]);
  });

  // THE WIDENING'S OWN PROOF (the `TeachingContext.prose` field): the teach text is PRESET-EDITABLE, so both
  // arms must resolve the HOST'S override or the containment above compares a baseline against an override
  // and the room is told the same thing twice. The gather is handed the override-resolved bytes exactly as
  // rpg's own `resolveTeach` would produce them.
  test("a host OVERRIDE of the teach slot: both arms resolve the override ⇒ still exactly one teach", async () => {
    const { host, chatId, aria } = await seedRoom("override");
    const overridden = "CHOICES: offer three, in the voice of the scene.";
    const prose: ProseOverrides = { "rpg.reminder.cyoaTeach": { text: overridden, baseVersion: 1 } };
    const gather: ChatRpgGatherResult = {
      macros: {},
      injections: [{ position: "in_chat", depth: 0, role: "system", content: `${STATE_BLOCK}\n\n${overridden}` }],
      tools: [],
      cardKeepLastX: 0,
    };

    const merged = await mergedInjections({ ctx: ctxOf(), chatId, host, aria, rpgGather: gather, offerChoices: true, prose });

    expect(merged.map((i) => i.content)).toEqual([`${STATE_BLOCK}\n\n${overridden}`]);
    // …and with the game silent, the room's own teach is the OVERRIDE's bytes, never the shipped default.
    const alone = await mergedInjections({ ctx: ctxOf(), chatId, host, aria, rpgGather: null, offerChoices: true, prose });
    expect(alone.map((i) => i.content)).toEqual([overridden]);
  });

  // The collector's exact-tuple guard is still REAL and still worth keeping — it just covers a different,
  // narrower case than A1 claimed: two CONTRIBUTIONS emitting the byte-identical injection. A second
  // standalone teacher is exactly that case, so this arm keeps the guard proven on its own terms.
  test("the exact-tuple guard: two contributions emitting the IDENTICAL injection contribute it once", async () => {
    const { host, chatId, aria } = await seedRoom("exactdupe");

    const merged = await mergedInjections({ ctx: ctxOf([choicesTeacher(2), choicesTeacher(3)]), chatId, host, aria, rpgGather: null });

    expect(merged.map((i) => i.content)).toEqual([CYOA_TEACH]);
  });

  test("THE GUARD'S SCOPE: two IDENTICAL host-authored rows both survive — this seam never edits a human's canon", async () => {
    const { host, chatId, aria } = await seedRoom("hostdupe");
    await seedInjectionRow(chatId, "chat_injection_d1", "SAY IT TWICE");
    await seedInjectionRow(chatId, "chat_injection_d2", "SAY IT TWICE");

    const merged = await mergedInjections({ ctx: ctxOf(), chatId, host, aria, rpgGather: null });

    expect(merged.filter((i) => i.content === "SAY IT TWICE")).toHaveLength(2);
  });
});
