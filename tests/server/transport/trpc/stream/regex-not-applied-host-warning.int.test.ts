// A host regex script a server pass did not apply is named to the host once per script and cause per turn or edit,
// live and on replay, and to no member by any delivery path (D53). The event carries the script id, a cause and the
// pass, never a name or pattern. A seated member's own scripts never run on a server leg, so they can raise nothing;
// a preview read raises nothing.
// @subject packages/server/src/domain/chat/substrate/regex-notice-episode.ts
// @subject packages/server/src/domain/chat/substrate/member-visibility.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts

import type { ChatBusEvent, ChatRegexNotAppliedWarning, RegexNotAppliedCause } from "@orb/contracts/chat";
import { REGEX_SCRIPT_NOT_APPLIED_CODE } from "@orb/contracts/chat";
import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { createRegexScriptSchema, MAX_REPLACE_LENGTH } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { RegexPlacement } from "@orb/kit/regex";
import { deriveRegexHistoryDepth, deriveRegexTierFlags, SubstituteFindRegex } from "@orb/kit/regex";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { Device, Guest, Room } from "./_held-room.ts";
import { ended, memberWatching, openDevice, openRoom } from "./_held-room.ts";

// Exponential on this near miss, so the row deadline stops it.
const RUNAWAY = "/(a+)+$/";
const NEAR_MISS = `${"a".repeat(28)}!`;
// Long enough that the amplifier's splices pass the output floor, and still ending on the near miss.
const LONG_NEAR_MISS = `${"The rain had not stopped. ".repeat(10)}${NEAR_MISS}`;
// Enough runaways that, each costing a row deadline, they spend the pass budget before the last one runs.
const RUNAWAY_COUNT = 20;

type Script = Pick<CreateRegexScriptInput, "name" | "findRegex"> & Partial<Pick<CreateRegexScriptInput, "replaceString" | "substituteRegex" | "runOnEdit">>;

/** Store and attach `scripts` globally for `principal`, on `placement`; answers their ids in order. */
async function globalScripts(room: Room, principal: Guest, placement: RegexPlacement, scripts: readonly Script[]): Promise<RegexScriptId[]> {
  const caller = await room.root.internalCallerFor(principal.userId);
  const placements = [placement];
  const historyDepth = deriveRegexHistoryDepth(placements, undefined);
  const ids: RegexScriptId[] = [];
  for (const script of scripts) {
    const row = await caller.regex.createScript({
      input: createRegexScriptSchema.parse({
        replaceString: "",
        ...script,
        placement: placements,
        ...deriveRegexTierFlags(placements),
        ...(historyDepth === undefined ? {} : { historyDepth }),
      }),
    });
    await caller.regex.attachGlobal({ scriptId: row.id });
    ids.push(row.id);
  }
  return ids;
}

function regexWarnings(events: readonly ChatBusEvent[]): ChatRegexNotAppliedWarning[] {
  return events.flatMap((event) => (event.type === "warning" && event.code === REGEX_SCRIPT_NOT_APPLIED_CODE ? [event] : []));
}

const liveWarnings = (device: Device): ChatRegexNotAppliedWarning[] => regexWarnings(device.frames.map(({ event }) => event));

async function replayedWarnings(room: Room, principal: Guest): Promise<ChatRegexNotAppliedWarning[]> {
  return regexWarnings((await room.root.services.chat.replayChatEvents({ principal, chatId: room.chatId })).map(({ event }) => event));
}

async function hostDevice(room: Room): Promise<Device> {
  const device = await openDevice(room, room.hostSeat);
  await device.attach();
  await device.waitFor((frames) => frames.length > 0);
  return device;
}

const runaways = (prefix: string): Script[] =>
  Array.from({ length: RUNAWAY_COUNT }, (_, k) => ({ name: `${prefix} runaway ${String(k)}`, findRegex: RUNAWAY, replaceString: "X" }));

test("each cause tells the host once per script, live and on replay, and no member by any path", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  const hostCaller = await room.root.internalCallerFor(room.host.userId);
  const [card] = (await hostCaller.character.list({})).items;
  if (card === undefined) {
    throw new Error("the room's card is missing");
  }
  // A card prose field of compile-heavy pattern text: a raw find that pulls it in is refused before it compiles.
  await hostCaller.character.update({ characterId: card.id, input: { description: "(a|b)".repeat(600) } });
  const [broken, prose, amplifier, ...rest] = await globalScripts(room, room.host, "AI_OUTPUT", [
    { name: "does not compile", findRegex: "/(unclosed/" },
    { name: "prose field", findRegex: "/{{description}}/", substituteRegex: SubstituteFindRegex.raw },
    // One whole-reply splice, repeated to the stored replacement cap: past the output bound.
    { name: "amplifier", findRegex: "/([\\s\\S]+)/", replaceString: "$1".repeat(MAX_REPLACE_LENGTH / 2) },
    ...runaways("reply"),
    { name: "follower", findRegex: "/!/", replaceString: "?" },
  ]);
  const follower = rest.at(-1);
  const runawayIds = new Set(rest.slice(0, -1));
  const host = await hostDevice(room);
  const { device: member, guest } = await memberWatching(room, "regex-warned-member");
  try {
    room.answerWith(LONG_NEAR_MISS);
    await room.send();
    await host.waitFor(ended);
    await member.waitFor(ended);

    const live = liveWarnings(host);
    expect(await replayedWarnings(room, room.host)).toEqual(live);
    const causeOf = new Map<RegexScriptId | undefined, RegexNotAppliedCause>(live.map((warning) => [warning.scriptId, warning.cause]));
    // One warning per script, every one on the reply pass.
    expect(live).toHaveLength(causeOf.size);
    expect(new Set(live.map((warning) => warning.pass))).toEqual(new Set(["ai_output"]));
    expect([causeOf.get(broken), causeOf.get(prose), causeOf.get(amplifier), causeOf.get(follower)]).toEqual([
      "did_not_compile",
      "substitution_too_long",
      "output_too_long",
      "pass_budget",
    ]);
    const runawayCauses = [...runawayIds].map((id) => causeOf.get(id));
    expect(runawayCauses).toContain("row_deadline");
    expect(runawayCauses).toContain("pass_budget");
    expect(nonEmpty(runawayCauses).every((cause) => cause === "row_deadline" || cause === "pass_budget")).toBe(true);

    expect(liveWarnings(member)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await host.close();
    await member.close();
  }
});

test("a history pass that spends its budget on every row tells the host once per script, and a preview read adds none", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  room.answerWith(NEAR_MISS);
  // Prior canon for the history leg to walk: each reply is the near miss the runaways backtrack on.
  for (let turn = 0; turn < 3; turn += 1) {
    await room.send();
  }
  const ids = await globalScripts(room, room.host, "PROMPT_HISTORY", [
    ...runaways("history"),
    { name: "history follower", findRegex: "/!/", replaceString: "?" },
  ]);
  const { device: member, guest } = await memberWatching(room, "history-member");
  try {
    await room.send();
    await member.waitFor((frames) => frames.some(({ event }) => event.type === "turnCompleted"));

    const replay = await replayedWarnings(room, room.host);
    expect(replay.map((warning) => warning.scriptId).toSorted()).toEqual([...ids].toSorted());
    expect(new Set(replay.map((warning) => warning.pass))).toEqual(new Set(["prompt_history"]));

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
  const [broken] = await globalScripts(room, room.host, "USER_INPUT", [{ name: "edit broken", findRegex: "/(unclosed/", runOnEdit: true }]);
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
    const edits = (await replayedWarnings(room, room.host)).filter((warning) => warning.pass === "edit_reapply");
    expect(edits).toEqual([
      { type: "warning", chatId: room.chatId, code: REGEX_SCRIPT_NOT_APPLIED_CODE, scriptId: broken, cause: "did_not_compile", pass: "edit_reapply" },
    ]);
    expect(liveWarnings(member)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await member.close();
  }
});

test("a seated member's own scripts run on no server leg and raise nothing, and the member cannot attach one to the room", { tags: ["slow"] }, async () => {
  await using room = await openRoom();
  const { device: member, guest } = await memberWatching(room, "scripted-member");
  try {
    const [rewrite] = await globalScripts(room, guest, "USER_INPUT", [
      { name: "member rewrite", findRegex: "/Begin/", replaceString: "MEMBER" },
      { name: "member broken", findRegex: "/(unclosed/" },
    ]);
    await globalScripts(room, guest, "AI_OUTPUT", [{ name: "member reply runaway", findRegex: RUNAWAY, replaceString: "X" }]);
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
    const [, hostBroken] = await globalScripts(room, room.host, "USER_INPUT", [
      { name: "host rewrite", findRegex: "/Begin/", replaceString: "HOST" },
      { name: "host broken", findRegex: "/(unclosed/" },
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
