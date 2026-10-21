// @subject packages/server/src/transport/trpc/routers/chat.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
import "@orb/testkit/node/composed-real.ts";
import { messages, pendingTurns } from "@orb/db";
import { parseIanaTimeZone, UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { invitePerson } from "../../../domain/chat/persona-cache-physical.ts";
import { textRoom } from "../../../domain/chat/scenario-physical.ts";
import { followupRoom } from "../../../domain/chat/verbs/followup-physical.ts";
import { TAIL_ROSTER } from "../../../domain/chat/verbs/turn-lifetimes-roster.ts";
import { clockOptions, KATHMANDU, KATHMANDU_CLOCK, nativeClocks, UTC_CLOCK } from "./turn-lifetimes-clock-physical.ts";

test("the actual caller renders Kathmandu on SEND and maps an unknown viewer zone to UTC", async () => {
  await using h = await textRoom(["The first clock.", "The second clock."], clockOptions());
  expect((await h.caller.chat.send({ chatId: h.chatId, content: "Read the first clock.", timeZone: KATHMANDU })).aborted).toBe(false);
  expect((await h.caller.chat.send({ chatId: h.chatId, content: "Read the fallback clock.", timeZone: "Etc/Unknown" })).aborted).toBe(false);
  expect(await nativeClocks(h)).toEqual([KATHMANDU_CLOCK, UTC_CLOCK]);
});

test("each actual swipe continue generate force and draft caller forwards its own zone rather than the original SEND zone", async () => {
  await using h = await textRoom(["Opening.", "Swiped.", " Continued.", "Generated.", "Forced.", "Drafted."], clockOptions());
  const sent = await h.caller.chat.send({ chatId: h.chatId, content: "Begin in UTC.", timeZone: UTC_TIME_ZONE });
  expect(sent.aborted).toBe(false);
  const reply = sent.messages.find(({ role }) => role === "assistant");
  const character = h.characters[0];
  if (reply === undefined || character === undefined) {
    throw new Error("the actual clock room has no generated slot or character");
  }
  const scoped = { chatId: h.chatId, messageId: reply.id, timeZone: KATHMANDU };
  expect((await h.caller.chat.swipe(scoped)).aborted).toBe(false);
  expect((await h.caller.chat.continueTurn(scoped)).aborted).toBe(false);
  expect((await h.caller.chat.generate({ chatId: h.chatId, timeZone: KATHMANDU })).aborted).toBe(false);
  expect((await h.caller.chat.forceCharacterTurn({ chatId: h.chatId, characterId: character.id, timeZone: KATHMANDU })).aborted).toBe(false);
  const before = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  let draftCount = 0;
  for await (const _delta of await h.caller.chat.impersonateStream({ chatId: h.chatId, timeZone: KATHMANDU })) {
    draftCount += 1;
  }
  expect(draftCount).toBeGreaterThan(0);
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(before);
  expect(await nativeClocks(h)).toEqual([UTC_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK]);
});

test("actual auto-continuation and bounded auto-mode retain the initiating sender's zone", async () => {
  await using continuation = await followupRoom(
    [
      { text: "The clock is", finishReason: "length" },
      { text: " still the sender's.", finishReason: "stop" },
    ],
    clockOptions(),
  );
  await continuation.caller.settings.updateUserSettingsSection({ section: "chat", patch: { autoContinue: true, autoContinueRounds: 1 } });
  expect((await continuation.caller.chat.send({ chatId: continuation.chatId, content: "Read this clock.", timeZone: KATHMANDU })).aborted).toBe(false);
  expect(await nativeClocks(continuation)).toEqual([KATHMANDU_CLOCK, KATHMANDU_CLOCK]);
  await using chain = await textRoom(["First complete beat.", "Second complete beat.", "Last complete beat."], {
    ...clockOptions(),
    characters: TAIL_ROSTER.slice(0, 2),
    group: { output: "per-speaker", policy: "list", autoMode: true, autoModeMaxTurns: 1, autoModeDelayMs: 0 },
  });
  expect((await chain.caller.chat.send({ chatId: chain.chatId, content: "Carry this clock through the exchange.", timeZone: KATHMANDU })).aborted).toBe(false);
  await chain.root.settleBackground();
  expect(await nativeClocks(chain)).toEqual([KATHMANDU_CLOCK, KATHMANDU_CLOCK, KATHMANDU_CLOCK]);
  expect((await chain.root.db.select().from(messages).where(eq(messages.chatId, chain.chatId))).filter(({ role }) => role === "assistant")).toHaveLength(3);
});

test("a real autonomous rule uses its saved zone and actual deferred SEND rows retain each sender zone through boot reclaim", async () => {
  await using h = await textRoom(["The autonomous clock.", "The queued UTC clock.", "The queued Kathmandu clock."], clockOptions());
  const zone = parseIanaTimeZone(KATHMANDU);
  if (zone === null) {
    throw new Error("the platform does not know the actual Kathmandu fixture zone");
  }
  const rule = await h.root.services.automation.createRule({
    principal: h.owner,
    chatId: h.chatId,
    name: "Autonomous clock",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [{ type: "trigger_turn", confirmFirst: false }],
    timeZone: zone,
  });
  await h.root.services.automation.setRuleEnabled({ principal: h.owner, ruleId: rule.id, enabled: true });
  expect(await h.root.services.automation.runRuleNow({ principal: h.owner, ruleId: rule.id })).toEqual({ outcome: "fired" });
  await h.root.settleBackground();
  expect(await nativeClocks(h)).toEqual([KATHMANDU_CLOCK]);
  const member = await invitePerson(h);
  const caller = await h.root.internalCallerFor(member.userId);
  const utc = await caller.chat.send({ chatId: h.chatId, content: "Queue my UTC turn.", timeZone: UTC_TIME_ZONE });
  const ktm = await caller.chat.send({ chatId: h.chatId, content: "Queue my Kathmandu turn.", timeZone: KATHMANDU });
  expect(utc.aborted).toBe(false);
  expect(ktm.aborted).toBe(false);
  expect(utc.messages.map(({ role }) => role)).toEqual(["user"]);
  expect(ktm.messages.map(({ role }) => role)).toEqual(["user"]);
  expect(await nativeClocks(h)).toEqual([KATHMANDU_CLOCK]);
  expect(
    (await h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, h.chatId)).orderBy(pendingTurns.id)).map(
      ({ timeZone, triggeredBy, runAsUserId }) => ({ timeZone, triggeredBy, runAsUserId }),
    ),
  ).toEqual([
    { timeZone: UTC_TIME_ZONE, triggeredBy: member.userId, runAsUserId: h.owner.userId },
    { timeZone: KATHMANDU, triggeredBy: member.userId, runAsUserId: h.owner.userId },
  ]);
  expect(await h.root.services.chat.drainDeferredTurns({ all: true })).toEqual({ ran: 2, dropped: 0 });
  expect(await nativeClocks(h)).toEqual([KATHMANDU_CLOCK, UTC_CLOCK, KATHMANDU_CLOCK]);
  expect(await h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, h.chatId))).toEqual([]);
});
