// The chat router's DB-backed cases — the verbs whose correctness is only visible against a REAL libSQL db
// (the roster read-model's leftSeq stamping), driven through the real middleware ladder via `createCaller`.
//
// THE ROOM STREAM'S DB CASES MOVED WITH ITS GENERATOR (SSE-1 S2): the durable head-delta replay pin and the
// D16 live clamp over real `chat_participants` rows now live at
// `tests/server/transport/trpc/stream/sources/chat.int.test.ts`.

import type { CharacterCard } from "@orb/contracts/character";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { characters, chatParticipants } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";
import { parseIanaTimeZone } from "@orb/kit/time";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { DEFAULT_CHAT_BEHAVIOR } from "../../../../../packages/server/src/domain/chat/contract/foreign.ts";
import type { TurnRequest } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { loadParticipants } from "../../../../../packages/server/src/domain/chat/persistence/participants-read.ts";
import { createParticipants } from "../../../../../packages/server/src/domain/chat/verbs/participants.ts";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read.ts";
import type { ChatScenario, ChatScenarioOptions } from "../../../../support/chat/scenario.ts";
import { scenario } from "../../../../support/chat/scenario.ts";
import type { Tape } from "../../../../support/chat/tape.ts";
import { tape } from "../../../../support/chat/tape.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  makeChatContext,
  makeLoadParticipantViews,
  seedCharacter,
  seedChat,
  seedParticipant,
  seedPendingTurn,
  seedUser,
} from "../../../domain/chat/_support.ts";
import { caller, principal as callerPrincipal, makeContext } from "../_support.ts";

/** Owner-scoped `getCard` fake mirroring the real one (D28) — `addCharacterToChat` resolves the card only
 *  for its OWNER (a foreign character reads as missing, leak-free). */
function ownedCard(rosterDb: Db): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await rosterDb.select().from(characters).where(eq(characters.id, characterId));
    // `greetings` is carried because it is ALWAYS present on a real card (`greetingsColumnSchema` catches to
    // `[]`) and `addCharacterToChat` reads `greetings[0]` for the F6 in-window join greeting; `[]` here means
    // "this card has no greeting to seed", which is what these two removal tests want.
    // @orb-waive no-test-fabrication(unknown): minimal CharacterCard double — the roster read needs name + avatarAssetId + greetings. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    return row !== undefined && row.ownerId === ownerId ? ({ name: row.name, avatarAssetId: null, greetings: [] } as unknown as CharacterCard) : null;
  };
}

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("chat.getChatLineage — the fork ancestry through the real router, gated per ancestor (D27)", () => {
  /** The read slice behind the procedure. Lineage summaries read only the roster; every other dep refuses,
   *  so a lineage read that reached for a connection or an assemble input would red here. */
  function lineageRead(): ReturnType<typeof createRead>["getChatLineage"] {
    const unused = (): Promise<never> => Promise.reject(new Error("unused: lineage summaries read only the roster"));
    return createRead(makeChatContext(db), {
      loadParticipantViews: makeLoadParticipantViews(db),
      resolveConnection: unused,
      checkSendAvailability: unused,
      getNextTurnConnection: unused,
      resolveForeignInputs: unused,
    }).getChatLineage;
  }

  test("a member of both chats sees the parent; a fork-only member's chain omits it; a stranger is NOT_FOUND", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const forkGuest = await seedUser(db, castId<Handle>("fork-guest"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const parent: ChatId = await seedChat(db, "parent", { id: mintTypeId(ID_PREFIX.chat) });
    const fork: ChatId = await seedChat(db, "fork", { id: mintTypeId(ID_PREFIX.chat), parentChatId: parent });
    await seedParticipant(db, { chatId: parent, key: "parent_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: fork, key: "fork_h", userId: host, role: "host" });
    // Invited into the fork only: a fork grants no membership of its parent.
    await seedParticipant(db, { chatId: fork, key: "fork_g", userId: forkGuest, role: "member" });

    const getChatLineage = lineageRead();
    const as = (userId: UserId): ReturnType<typeof caller> =>
      caller(makeContext({ auth: callerPrincipal("user", { userId }), services: { chat: { getChatLineage } } }));

    expect((await as(host).chat.getChatLineage({ chatId: fork })).chain.map((c) => c.id)).toEqual([parent, fork]);
    expect((await as(forkGuest).chat.getChatLineage({ chatId: fork })).chain.map((c) => c.id)).toEqual([fork]);
    await expect(as(stranger).chat.getChatLineage({ chatId: fork })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.removeCharacterFromChat — the symmetric drop, driven through the real router + roster service", () => {
  test("the host removes a present character seat — leftSeq-stamped out of the roster read-model", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria", { id: mintTypeId(ID_PREFIX.character) });
    const chatId: ChatId = await seedChat(db, "room", { id: mintTypeId(ID_PREFIX.chat) });
    await seedParticipant(db, { chatId, key: "room_h", userId: host, role: "host" });

    const participantId = mintTypeId(ID_PREFIX.chatParticipant);
    const roster = createParticipants(makeChatContext(db, { getCard: ownedCard(db), newParticipantId: () => participantId }), {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit: () => Promise.resolve(),
    });
    const hostCtx = makeContext({
      auth: callerPrincipal("user", { userId: host }),
      services: { chat: { addCharacterToChat: roster.addCharacterToChat, removeCharacterFromChat: roster.removeCharacterFromChat } },
    });

    await caller(hostCtx).chat.addCharacterToChat({ chatId, characterId });
    // Present roster (leftSeq IS NULL) carries the seat.
    expect((await loadParticipants(db, chatId)).some((p) => p.characterId === characterId)).toBe(true);

    await caller(hostCtx).chat.removeCharacterFromChat({ chatId, characterId });

    // Gone from the present read-model; the row survives leftSeq-stamped (reversible via a re-add).
    expect((await loadParticipants(db, chatId)).some((p) => p.characterId === characterId)).toBe(false);
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(row?.leftSeq).not.toBeNull();
  });

  test("a plain member caller is rejected — the seat stays present, unstamped", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const characterId = await seedCharacter(db, host, "aria", { id: mintTypeId(ID_PREFIX.character) });
    const chatId: ChatId = await seedChat(db, "room", { id: mintTypeId(ID_PREFIX.chat) });
    await seedParticipant(db, { chatId, key: "room_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "room_m", userId: member, role: "member" });

    const participantId = mintTypeId(ID_PREFIX.chatParticipant);
    const roster = createParticipants(makeChatContext(db, { getCard: ownedCard(db), newParticipantId: () => participantId }), {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit: () => Promise.resolve(),
    });
    const hostCtx = makeContext({
      auth: callerPrincipal("user", { userId: host }),
      services: { chat: { addCharacterToChat: roster.addCharacterToChat, removeCharacterFromChat: roster.removeCharacterFromChat } },
    });
    const memberCtx = makeContext({
      auth: callerPrincipal("user", { userId: member }),
      services: { chat: { removeCharacterFromChat: roster.removeCharacterFromChat } },
    });

    await caller(hostCtx).chat.addCharacterToChat({ chatId, characterId });

    await expect(caller(memberCtx).chat.removeCharacterFromChat({ chatId, characterId })).rejects.toThrow();

    // The refusal was total: the seat is still present and unstamped.
    expect((await loadParticipants(db, chatId)).some((p) => p.characterId === characterId)).toBe(true);
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(row?.leftSeq).toBeNull();
  });
});

// The owner rule (UI-Gates §11.5): the server keeps UTC, and every time a user reads is in their browser's zone.
// A prompt's `{{date}}`/`{{time}}`/`{{weekday}}` is such a read, so each turn kind carries the viewer's zone from
// the wire to the macro context. These drive the REAL verbs and engine behind the real router and read the
// clock back off the request the model receives.
// 20:00 UTC on a Thursday is 01:45 on Friday the 16th in Kathmandu (+5:45): date, time and weekday all differ.
const NOW = Date.UTC(2026, 0, 15, 20, 0);
const KATHMANDU = "Asia/Kathmandu";
const KATHMANDU_CLOCK = "2026-01-16 01:45:00 Friday";
const UTC_CLOCK = "2026-01-15 20:00:00 Thursday";
const CLOCK = /CLOCK (\S+ \S+ \S+)/;

describe("chat turns render the time macros in the viewer's zone — wire → verb → the model's prompt", () => {
  const clockConfig: PromptConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    sections: [
      { type: "literal", id: "clock", name: "clock", role: "system", content: "CLOCK {{date}} {{time}} {{weekday}}", enabled: true },
      ...DEFAULT_PROMPT_CONFIG.sections,
    ],
  };

  function zone(name: string): IanaTimeZone {
    const parsed = parseIanaTimeZone(name);
    if (parsed === null) {
      throw new Error(`the platform must know ${name}`);
    }
    return parsed;
  }

  /** The clock the model was told on each captured request, in turn order. */
  function clocksOf(requests: readonly TurnRequest[]): string[] {
    return requests.map((req) => CLOCK.exec(`${req.prompt.static}\n${req.prompt.dynamic}`)?.[1] ?? "no clock in the prompt");
  }

  async function room(script: Tape, options: ChatScenarioOptions = {}): Promise<ChatScenario> {
    return await scenario.chat(script, { typeIds: true, promptConfig: clockConfig, ...options, ctx: { now: () => NOW, ...options.ctx } });
  }

  function hostCaller(chat: ChatScenario): ReturnType<typeof caller> {
    return caller(makeContext({ auth: callerPrincipal("user", { userId: chat.host }), services: { chat: chat.turn } }));
  }

  test("send renders the viewer's zone; an unknown zone renders UTC, never the server's own zone", async () => {
    const chat = await room(tape().reply("one").reply("two"));
    await hostCaller(chat).chat.send({ chatId: chat.chatId, content: "hi", timeZone: KATHMANDU });
    await hostCaller(chat).chat.send({ chatId: chat.chatId, content: "again", timeZone: "Etc/Unknown" });
    expect(clocksOf(chat.requests)).toEqual([KATHMANDU_CLOCK, UTC_CLOCK]);
  });

  test("the wire refuses a send whose zone is not a string, or that carries none; no turn runs", async () => {
    const chat = await room(tape());
    const send = hostCaller(chat).chat.send;
    // @ts-expect-error -- the refusal under test: a number is not a zone name.
    await expect(send({ chatId: chat.chatId, content: "hi", timeZone: 545 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // @ts-expect-error -- the refusal under test: every client turn states its viewer's zone.
    await expect(send({ chatId: chat.chatId, content: "hi" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(chat.requests).toEqual([]);
  });

  test("swipe, continue, generate, force and impersonate each render the zone their own request carries", async () => {
    const chat = await room(tape().reply("opening").reply("swiped").reply("continued").reply("generated").reply("forced").reply("drafted"));
    const host = hostCaller(chat).chat;
    const { chatId } = chat;
    const sent = await host.send({ chatId, content: "hi", timeZone: "UTC" });
    const reply = sent.messages.find((m) => m.role === "assistant");
    if (reply === undefined) {
      throw new Error("the send committed no assistant reply");
    }
    await host.swipe({ chatId, messageId: reply.id, timeZone: KATHMANDU });
    await host.continueTurn({ chatId, messageId: reply.id, timeZone: KATHMANDU });
    await host.generate({ chatId, timeZone: KATHMANDU });
    await host.forceCharacterTurn({ chatId, characterId: chat.chars[0] as CharacterId, timeZone: KATHMANDU });
    for await (const _delta of await host.impersonateStream({ chatId, timeZone: KATHMANDU })) {
      // Drained so the generation runs to its end.
    }
    expect(clocksOf(chat.requests)).toEqual([UTC_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK]);
  });

  test("a send's auto-continue follow-up and its auto-mode chain keep the sender's zone", async () => {
    const autoContinue = await room(
      tape()
        .reply("cut off", { economics: { finishReason: "length" } })
        .reply("finished"),
      {
        chatBehavior: { ...DEFAULT_CHAT_BEHAVIOR, autoContinue: true, autoContinueRounds: 1 },
      },
    );
    await hostCaller(autoContinue).chat.send({ chatId: autoContinue.chatId, content: "hi", timeZone: KATHMANDU });
    expect(clocksOf(autoContinue.requests)).toEqual([KATHMANDU_CLOCK, KATHMANDU_CLOCK]);

    const chain = await room(tape().reply("from aria").reply("from bryn").reply("chained"), {
      characters: ["aria", "bryn"],
      policy: "list",
      autoMode: true,
      autoModeMaxTurns: 1,
    });
    await hostCaller(chain).chat.send({ chatId: chain.chatId, content: "hi all", timeZone: KATHMANDU });
    expect(clocksOf(chain.requests)).toEqual([KATHMANDU_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK]);
  });

  test("a turn with no viewer reads its ruled zone: a requested turn the zone it is given, a deferred drain UTC", async () => {
    const requested = await room(tape().reply("automated"));
    await requested.requestTurn({
      chatId: requested.chatId,
      initiator: "automation",
      triggeredBy: requested.host,
      automationDepth: 1,
      timeZone: zone(KATHMANDU),
    });
    expect(clocksOf(requested.requests)).toEqual([KATHMANDU_CLOCK]);

    const drained = await room(tape().reply("drained"));
    await seedPendingTurn(drained.db, { chatId: drained.chatId, key: "tz", triggeredBy: drained.host, runAsUserId: drained.host });
    await drained.turn.drainDeferredTurns({ all: true });
    expect(clocksOf(drained.requests)).toEqual([UTC_CLOCK]);
  });
});
