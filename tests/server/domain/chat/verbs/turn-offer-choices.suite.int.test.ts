// B1 — THE OFFER-CHOICES KNOB, END TO END, at the seam the owner's test names: does the MODEL actually get
// told it may end a turn with the `:::choices` fence? Every assertion below reads the WIRE — the captured
// `TurnRequest`'s assembled prompt plus its shaped history — through the real verbs, the real gather and the
// real S2 collection over a real libSQL db (`scenario.chat`), because "the resolution returned true" is a
// claim about a function while "the teach reached the prompt" is a claim about the feature.
//
// WHAT IS PINNED, and why each arm exists:
//   • the ROOM value ON teaches; absent + a host default of OFF teaches nothing (the byte-identical floor);
//   • the INHERIT arm — no room value, host default ON — teaches, which is the whole cold-start reason the
//     per-user tier exists (RULED F2: a new room is born with its host's posture);
//   • the OVERRIDE arm — room OFF over a host default of ON — does NOT teach, so the room value genuinely
//     wins rather than OR-ing with the default (an `||` would pass every other arm here).
// The room half is written as raw metadata JSON exactly as the verb writes it, so these arms do not depend
// on the `chat.setOfferChoices` verb being correct; that verb has its own authority pins in roster.int.

import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { DEFAULT_CHAT_BEHAVIOR } from "../../../../../packages/server/src/domain/chat/contract/foreign.ts";
import type { TurnRequest } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { scenario, tape } from "../../../../support/chat/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The teach's ONE home — the same slot rpg's reminder resolves (S2: NO second prose home). */
const CHOICES_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text;

/** EVERY byte this request puts in front of the model: the static prefix, the per-turn dynamic suffix, the
 *  after-history injections, and each shaped history turn's text parts. Deliberately the WHOLE surface rather
 *  than one field — an `in_chat` depth-0 injection is spliced into the history, and a pin that only read
 *  `prompt.static` would go permanently green-blind the day the splice moves. */
function modelSees(req: TurnRequest): string {
  const history = req.history.flatMap((m) => m.content.flatMap((part) => (part.type === "text" ? [part.text] : [])));
  const afterHistory = req.prompt.afterHistory.map((i) => i.content);
  return [req.prompt.static, req.prompt.dynamic, ...afterHistory, ...history].join("\n");
}

/** How many times the choices teach appears across everything the model sees. */
function teachCount(req: TurnRequest | undefined): number {
  if (req === undefined) {
    return 0;
  }
  return modelSees(req).split(CHOICES_TEACH).length - 1;
}

/** Write the room half of the knob straight into `chats.metadata`, merging so the seeded blob survives. */
async function setRoomOfferChoices(db: Db, chatId: ChatId, offerChoices: boolean): Promise<void> {
  const rows = await db
    .select({ metadata: chats.metadata })
    .from(chats)
    .where(eq(chats.id, castId(chatId)))
    .limit(1);
  const next = { ...(rows.at(0)?.metadata ?? {}), offerChoices };
  await db
    .update(chats)
    .set({ metadata: next })
    .where(eq(chats.id, castId(chatId)));
}

test("the ROOM knob ON teaches the model the :::choices fence", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });
  await setRoomOfferChoices(scn.db, scn.chatId, true);

  await scn.send("hi");

  expect(teachCount(scn.requests.at(0))).toBe(1);
});

test("no room value + the host default OFF teaches nothing — the byte-identical floor", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });

  await scn.send("hi");

  expect(teachCount(scn.requests.at(0))).toBe(0);
});

test("INHERIT: no room value + the host's per-user default ON teaches — a new room is born with its host's posture", async () => {
  const scn = await scenario.chat(tape().reply("ok"), {
    characters: ["aria"],
    chatBehavior: { ...DEFAULT_CHAT_BEHAVIOR, offerChoices: true },
  });

  await scn.send("hi");

  expect(teachCount(scn.requests.at(0))).toBe(1);
});

test("THE ROOM VALUE WINS: room OFF over a host default of ON teaches nothing (never an OR of the two tiers)", async () => {
  const scn = await scenario.chat(tape().reply("ok"), {
    characters: ["aria"],
    chatBehavior: { ...DEFAULT_CHAT_BEHAVIOR, offerChoices: true },
  });
  await setRoomOfferChoices(scn.db, scn.chatId, false);

  await scn.send("hi");

  expect(teachCount(scn.requests.at(0))).toBe(0);
});
