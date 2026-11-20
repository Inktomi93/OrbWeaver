// A host regex script a server pass did not apply is named to the host once per script and cause per turn or edit,
// live and on replay, and to no member by any delivery path (D53). The event carries the script id, a cause and the
// pass, never a name or pattern. A turn names at most `REGEX_NOT_APPLIED_NAMED_MAX` and folds the rest into one
// host-only count. A Stop names the reply's scripts only when it keeps the reply. A seated member's own scripts never
// run on a server leg, so they can raise nothing; a preview read raises nothing.
// @subject packages/server/src/domain/chat/substrate/regex-notice-episode.ts
// @subject packages/server/src/domain/chat/engine/pipeline.ts
// @subject packages/server/src/domain/chat/substrate/member-visibility.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts

import type { ChatBusEvent } from "@orb/contracts/chat";
import { REGEX_NOT_APPLIED_NAMED_MAX, REGEX_NOT_APPLIED_OVERFLOW_CODE, REGEX_SCRIPT_NOT_APPLIED_CODE } from "@orb/contracts/chat";
import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { createRegexScriptSchema, MAX_REPLACE_LENGTH } from "@orb/contracts/regex";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import type { RegexScriptId } from "@orb/kit/ids";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import type { Device, Guest, Room } from "./_held-room.ts";
import { ended, memberWatching, openDevice, openRoom, tokenCount } from "./_held-room.ts";

// Exponential on this near miss, so the row deadline stops it.
const RUNAWAY = "/(a+)+$/";
const NEAR_MISS = `${"a".repeat(28)}!`;
// Long enough that the amplifier's splices pass the output floor, and still ending on the near miss.
const LONG_NEAR_MISS = `${"The rain had not stopped. ".repeat(10)}${NEAR_MISS}`;
const UNCLOSED = "/(unclosed/";
const LAMP_KEY = "lamp";
const LAMP_LINE = "Light the lamp.";
// World-info entries share one pass budget. Each runs the runaway to its row deadline in wall time while the budget
// counts thread CPU, so this many entries spend it on a loaded host and leave entries for the skipped scripts.
const BUDGET_SPENDING_ENTRIES = 20;
// History runaways, each evicted after its first failure: fewer than the named cap, so every one is named.
const HISTORY_RUNAWAYS = 7;
// Past the named cap by this many, so the overflow count is told apart from a count of one.
const PAST_THE_CAP = 3;

type Script = Pick<CreateRegexScriptInput, "name" | "findRegex"> & Partial<Pick<CreateRegexScriptInput, "replaceString" | "substituteRegex" | "runOnEdit">>;

type Axes = Pick<CreateRegexScriptInput, "targets" | "passes">;

// The server legs these cases drive: the saved send, the saved reply, world info and the prompt's history walk.
const SAVED_SEND: Axes = { targets: ["USER_INPUT"], passes: ["save"] };
const SAVED_REPLY: Axes = { targets: ["AI_OUTPUT"], passes: ["save"] };
const SAVED_REASONING: Axes = { targets: ["REASONING"], passes: ["save"] };
const WORLD_INFO: Axes = { targets: ["WORLD_INFO"], passes: ["prompt"] };
const PROMPT_HISTORY: Axes = { targets: ["AI_OUTPUT"], passes: ["prompt"] };
// Every prompt leg at once: the history walk over both message kinds, and each fired world-info entry.
const EVERY_PROMPT_LEG: Axes = { targets: ["USER_INPUT", "AI_OUTPUT", "WORLD_INFO"], passes: ["prompt"] };

/** Store and attach `scripts` globally for `principal`, on `axes`; answers their ids in order. */
async function globalScripts(room: Room, principal: Guest, axes: Axes, scripts: readonly Script[]): Promise<RegexScriptId[]> {
  const caller = await room.root.internalCallerFor(principal.userId);
  const ids: RegexScriptId[] = [];
  for (const script of scripts) {
    const row = await caller.regex.createScript({
      input: createRegexScriptSchema.parse({
        replaceString: "",
        ...script,
        ...axes,
      }),
    });
    await caller.regex.attachGlobal({ scriptId: row.id });
    ids.push(row.id);
  }
  return ids;
}

/** Attach to the room a book of `count` entries holding `content`, all firing on {@link LAMP_KEY}. */
async function lampEntries(room: Room, count: number, content: string): Promise<void> {
  const caller = await room.root.internalCallerFor(room.host.userId);
  const book = await caller.worldInfo.createBook({ input: createBookSchema.parse({ name: "Lamps" }) });
  for (let k = 0; k < count; k += 1) {
    await caller.worldInfo.createEntry({ bookId: book.id, input: createEntrySchema.parse({ title: `Lamp ${String(k)}`, content, keys: [LAMP_KEY] }) });
  }
  await caller.worldInfo.attachToChat({ chatId: room.chatId, bookId: book.id });
}

type RegexWarningEvent = Extract<ChatBusEvent, { type: "warning"; code: typeof REGEX_SCRIPT_NOT_APPLIED_CODE | typeof REGEX_NOT_APPLIED_OVERFLOW_CODE }>;

function regexWarnings(events: readonly ChatBusEvent[]): RegexWarningEvent[] {
  return events.flatMap((event) =>
    event.type === "warning" && (event.code === REGEX_SCRIPT_NOT_APPLIED_CODE || event.code === REGEX_NOT_APPLIED_OVERFLOW_CODE) ? [event] : [],
  );
}

function named(warnings: readonly RegexWarningEvent[]): Extract<RegexWarningEvent, { code: typeof REGEX_SCRIPT_NOT_APPLIED_CODE }>[] {
  return warnings.flatMap((warning) => (warning.code === REGEX_SCRIPT_NOT_APPLIED_CODE ? [warning] : []));
}

const liveWarnings = (device: Device): RegexWarningEvent[] => regexWarnings(device.frames.map(({ event }) => event));

async function replayedWarnings(room: Room, principal: Guest): Promise<RegexWarningEvent[]> {
  return regexWarnings((await room.root.services.chat.replayChatEvents({ principal, chatId: room.chatId })).map(({ event }) => event));
}

async function hostDevice(room: Room): Promise<Device> {
  const device = await openDevice(room, room.hostSeat);
  await device.attach();
  await device.waitFor((frames) => frames.length > 0);
  return device;
}

const notApplied = (scriptId: RegexScriptId | undefined, cause: string, pass: string): string => `${String(scriptId)} ${cause} ${pass}`;

test("each cause tells the host once per script, live and on replay, and no member by any path", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  const hostCaller = await room.root.internalCallerFor(room.host.userId);
  const [card] = (await hostCaller.character.list({})).items;
  if (card === undefined) {
    throw new Error("the room's card is missing");
  }
  // A card prose field of compile-heavy pattern text: a raw find that pulls it in is refused before it compiles.
  await hostCaller.character.update({ characterId: card.id, input: { description: "(a|b)".repeat(600) } });
  const [broken, prose, amplifier] = await globalScripts(room, room.host, SAVED_REPLY, [
    { name: "does not compile", findRegex: UNCLOSED },
    { name: "prose field", findRegex: "/{{description}}/", substituteRegex: SubstituteFindRegex.raw },
    // One whole-reply splice, repeated to the stored replacement cap: past the output bound.
    { name: "amplifier", findRegex: "/([\\s\\S]+)/", replaceString: "$1".repeat(MAX_REPLACE_LENGTH / 2) },
  ]);
  // One runaway and one follower over every entry: stopped at the deadline until the shared budget is spent, then
  // both skipped, each named once per cause however many entries report it.
  const [runaway, follower] = await globalScripts(room, room.host, WORLD_INFO, [
    { name: "entry runaway", findRegex: RUNAWAY, replaceString: "X" },
    { name: "entry follower", findRegex: "/!/", replaceString: "?" },
  ]);
  await lampEntries(room, BUDGET_SPENDING_ENTRIES, NEAR_MISS);
  const host = await hostDevice(room);
  const { device: member, guest } = await memberWatching(room, "regex-warned-member");
  try {
    room.answerWith(LONG_NEAR_MISS);
    await room.root.services.chat.send({ principal: guest, chatId: room.chatId, content: LAMP_LINE });
    await host.waitFor(ended);
    await member.waitFor(ended);

    const live = liveWarnings(host);
    expect(await replayedWarnings(room, room.host)).toEqual(live);
    expect(
      named(live)
        .map((warning) => notApplied(warning.scriptId, warning.cause, warning.pass))
        .toSorted(),
    ).toEqual(
      [
        notApplied(broken, "did_not_compile", "ai_output"),
        notApplied(prose, "substitution_too_long", "ai_output"),
        notApplied(amplifier, "output_too_long", "ai_output"),
        notApplied(runaway, "row_deadline", "world_info"),
        notApplied(runaway, "pass_budget", "world_info"),
        notApplied(follower, "pass_budget", "world_info"),
      ].toSorted(),
    );
    expect(live).toHaveLength(named(live).length);

    expect(liveWarnings(member)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await host.close();
    await member.close();
  }
});

test("one script broken on every prompt leg and several fired entries is named once", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  const [broken] = await globalScripts(room, room.host, EVERY_PROMPT_LEG, [{ name: "broken everywhere", findRegex: UNCLOSED }]);
  await lampEntries(room, 3, "The lamp is lit.");
  const { device: member, guest } = await memberWatching(room, "dedupe-member");
  try {
    room.answerWith("Noted.");
    await room.root.services.chat.send({ principal: guest, chatId: room.chatId, content: LAMP_LINE });
    await member.waitFor(ended);

    // One warning, named at the leg that saw it first: the prompt reads world info before it walks the history.
    expect(await replayedWarnings(room, room.host)).toEqual([
      { type: "warning", chatId: room.chatId, code: REGEX_SCRIPT_NOT_APPLIED_CODE, scriptId: broken, cause: "did_not_compile", pass: "world_info" },
    ]);
  } finally {
    await member.close();
  }
});

test("past the named cap the host gets the first scripts and one count, and no member gets either", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  const ids = await globalScripts(
    room,
    room.host,
    SAVED_REPLY,
    Array.from({ length: REGEX_NOT_APPLIED_NAMED_MAX + PAST_THE_CAP }, (_, k) => ({ name: `broken ${String(k)}`, findRegex: UNCLOSED })),
  );
  const host = await hostDevice(room);
  const { device: member, guest } = await memberWatching(room, "capped-member");
  try {
    room.answerWith("Noted.");
    await room.root.services.chat.send({ principal: guest, chatId: room.chatId, content: "A line of mine." });
    await host.waitFor(ended);
    await member.waitFor(ended);

    const expected = [
      ...ids.slice(0, REGEX_NOT_APPLIED_NAMED_MAX).map((scriptId) => ({
        type: "warning",
        chatId: room.chatId,
        code: REGEX_SCRIPT_NOT_APPLIED_CODE,
        scriptId,
        cause: "did_not_compile",
        pass: "ai_output",
      })),
      { type: "warning", chatId: room.chatId, code: REGEX_NOT_APPLIED_OVERFLOW_CODE, count: PAST_THE_CAP },
    ];
    expect(liveWarnings(host)).toEqual(expected);
    expect(await replayedWarnings(room, room.host)).toEqual(expected);
    expect(liveWarnings(member)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await host.close();
    await member.close();
  }
});

test("a history pass that stops every script tells the host once per script, and a preview read adds none", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  room.answerWith(NEAR_MISS);
  // Prior canon for the history leg to walk: each reply is the near miss the runaways backtrack on.
  for (let turn = 0; turn < 3; turn += 1) {
    await room.send();
  }
  const ids = await globalScripts(
    room,
    room.host,
    PROMPT_HISTORY,
    Array.from({ length: HISTORY_RUNAWAYS }, (_, k) => ({ name: `history runaway ${String(k)}`, findRegex: RUNAWAY, replaceString: "X" })),
  );
  const { device: member, guest } = await memberWatching(room, "history-member");
  try {
    await room.send();
    await member.waitFor((frames) => frames.some(({ event }) => event.type === "turnCompleted"));

    const replay = await replayedWarnings(room, room.host);
    expect(named(replay).map((warning) => warning.scriptId)).toEqual(ids);
    expect(replay).toHaveLength(ids.length);
    expect(new Set(named(replay).map((warning) => warning.pass))).toEqual(new Set(["prompt_history"]));

    await (await room.root.internalCallerFor(guest.userId)).chat.previewContextFit({ chatId: room.chatId });
    await (await room.root.internalCallerFor(room.host.userId)).chat.previewContextFit({ chatId: room.chatId });
    expect(await replayedWarnings(room, room.host)).toHaveLength(replay.length);
    expect(liveWarnings(member)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await member.close();
  }
});

test("a member's edit whose re-apply skips a host script tells the host alone", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  const [broken] = await globalScripts(room, room.host, SAVED_SEND, [{ name: "edit broken", findRegex: UNCLOSED, runOnEdit: true }]);
  const { device: member, guest } = await memberWatching(room, "editing-member");
  try {
    room.answerWith("Noted.");
    const sent = await room.root.services.chat.send({ principal: guest, chatId: room.chatId, content: "A line of mine." });
    const own = sent.messages.find((message) => message.role === "user");
    if (own === undefined) {
      throw new Error("the member's send committed no user row");
    }
    await room.root.services.chat.editMessage({ principal: guest, chatId: room.chatId, messageId: own.id, content: "A line of mine, edited." });

    // The send's own user_input warning may land after the send returns, so read the edit's pass alone.
    const edits = named(await replayedWarnings(room, room.host)).filter((warning) => warning.pass === "edit_reapply");
    expect(edits).toEqual([
      { type: "warning", chatId: room.chatId, code: REGEX_SCRIPT_NOT_APPLIED_CODE, scriptId: broken, cause: "did_not_compile", pass: "edit_reapply" },
    ]);
    expect(liveWarnings(member)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await member.close();
  }
});

/** A member's send whose reply the member stops once `streamed` delta frames stand in the log; answers once both
 *  devices saw the turn end. */
async function stoppedSend(room: Room, guest: Guest, devices: readonly Device[], streamed: number): Promise<void> {
  const running = room.root.services.chat.send({ principal: guest, chatId: room.chatId, content: "A line of mine." });
  const settled = Promise.allSettled([running]);
  try {
    await room.tokensLogged(streamed);
    await room.root.services.chat.abort({ principal: guest, chatId: room.chatId });
    await running;
    for (const device of devices) {
      await device.waitFor(ended);
    }
  } finally {
    room.reply().release();
    await settled;
  }
}

/** One host script per saved leg a stopped turn can reach: the send, the reply text and its reasoning. */
async function brokenOnEverySavedLeg(room: Room): Promise<Readonly<Record<"send" | "reply" | "reasoning", RegexScriptId | undefined>>> {
  const [send] = await globalScripts(room, room.host, SAVED_SEND, [{ name: "send broken", findRegex: UNCLOSED }]);
  const [reply] = await globalScripts(room, room.host, SAVED_REPLY, [{ name: "reply broken", findRegex: UNCLOSED }]);
  const [reasoning] = await globalScripts(room, room.host, SAVED_REASONING, [{ name: "reasoning broken", findRegex: UNCLOSED }]);
  return { send, reply, reasoning };
}

const notAppliedOf = (warnings: readonly RegexWarningEvent[]): string[] =>
  named(warnings)
    .map((warning) => notApplied(warning.scriptId, warning.cause, warning.pass))
    .toSorted();

test("a Stop that keeps the streamed reply tells the host each saved leg's script once, and no member", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  const ids = await brokenOnEverySavedLeg(room);
  const host = await hostDevice(room);
  const { device: member, guest } = await memberWatching(room, "kept-stop-member");
  try {
    await stoppedSend(room, guest, [host, member], tokenCount);

    expect((await readRoomCanon(room.root, room.host, room.chatId)).map(({ role }) => role)).toEqual(["user", "assistant"]);
    // A kept reply takes the reply and reasoning passes: the positive control for the prose-less Stop below.
    const expected = [
      notApplied(ids.send, "did_not_compile", "user_input"),
      notApplied(ids.reply, "did_not_compile", "ai_output"),
      notApplied(ids.reasoning, "did_not_compile", "reasoning"),
    ].toSorted();
    const live = liveWarnings(host);
    expect(notAppliedOf(live)).toEqual(expected);
    expect(live).toHaveLength(expected.length);
    expect(await replayedWarnings(room, room.host)).toEqual(live);
    expect(liveWarnings(member)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await host.close();
    await member.close();
  }
});

test("a Stop before any reply text keeps no reply and tells the host only the send's script, and no member", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  const ids = await brokenOnEverySavedLeg(room);
  // Only the reasoning streams before the reply waits, so the Stop finds no text to keep.
  room.rearm([]);
  const host = await hostDevice(room);
  const { device: member, guest } = await memberWatching(room, "proseless-stop-member");
  try {
    await stoppedSend(room, guest, [host, member], 1);

    expect((await readRoomCanon(room.root, room.host, room.chatId)).map(({ role }) => role)).toEqual(["user"]);
    const live = liveWarnings(host);
    expect(notAppliedOf(live)).toEqual([notApplied(ids.send, "did_not_compile", "user_input")]);
    expect(live).toHaveLength(1);
    expect(await replayedWarnings(room, room.host)).toEqual(live);
    expect(liveWarnings(member)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await host.close();
    await member.close();
  }
});

test("a seated member's own scripts run on no server leg and raise nothing, and the member cannot attach one to the room", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  const { device: member, guest } = await memberWatching(room, "scripted-member");
  try {
    const [rewrite] = await globalScripts(room, guest, SAVED_SEND, [
      { name: "member rewrite", findRegex: "/Begin/", replaceString: "MEMBER" },
      { name: "member broken", findRegex: UNCLOSED },
    ]);
    await globalScripts(room, guest, SAVED_REPLY, [{ name: "member reply runaway", findRegex: RUNAWAY, replaceString: "X" }]);
    const memberCaller = await room.root.internalCallerFor(guest.userId);
    if (rewrite === undefined) {
      throw new Error("the member's script was not stored");
    }
    await expect(memberCaller.regex.attachToChat({ chatId: room.chatId, scriptId: rewrite })).rejects.toThrow(/host/i);

    const turnsCompleted = (count: number): Promise<void> =>
      member.waitFor((frames) => frames.filter(({ event }) => event.type === "turnCompleted").length >= count);
    room.answerWith(NEAR_MISS);
    const sent = await room.root.services.chat.send({ principal: guest, chatId: room.chatId, content: "Begin a line." });
    await turnsCompleted(1);

    expect(sent.messages.map((message) => message.content)).toEqual(["Begin a line.", NEAR_MISS]);
    expect(await replayedWarnings(room, room.host)).toEqual([]);

    // Positive control: the same scripts stored by the host do run on the member's line and do raise the event.
    const [, hostBroken] = await globalScripts(room, room.host, SAVED_SEND, [
      { name: "host rewrite", findRegex: "/Begin/", replaceString: "HOST" },
      { name: "host broken", findRegex: UNCLOSED },
    ]);
    const again = await room.root.services.chat.send({ principal: guest, chatId: room.chatId, content: "Begin again." });
    await turnsCompleted(2);

    expect(again.messages.find((message) => message.role === "user")?.content).toBe("HOST again.");
    expect(await replayedWarnings(room, room.host)).toEqual([
      { type: "warning", chatId: room.chatId, code: REGEX_SCRIPT_NOT_APPLIED_CODE, scriptId: hostBroken, cause: "did_not_compile", pass: "user_input" },
    ]);
    expect(liveWarnings(member)).toEqual([]);
  } finally {
    await member.close();
  }
});
