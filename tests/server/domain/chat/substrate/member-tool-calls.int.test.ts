// @subject packages/contracts/src/chat/member-projection.ts
// A tool call's arguments and result are model bytes: a member reads them with hidden spans removed, decoded first so
// the JSON stays readable, and arguments that are not JSON are withheld. The host reads both verbatim.
import type { MessageView, ToolCallRecord } from "@orb/contracts/chat";
import { CHAT_REACT_TOOL_NAME } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { stripHiddenSpans } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreFrame, coreProse, coreSse } from "../engine/core-physical.ts";
import { turnToolsRoom } from "../verbs/turn-rpg-physical.ts";

const TRUTH = "vault-key-marker";
// No present character has this name, so the react tool's refusal quotes it back into the result.
const TAGGED_NAME = `Nobody <lie character="Nobody" truth="${TRUTH}"/>`;
const STRIPPED_NAME = stripHiddenSpans(TAGGED_NAME).content;
// The tool ignores the extra keys; they carry every JSON value kind, and a tagged key, past the strip.
const TAGGED_ARGUMENTS = JSON.stringify({ character: TAGGED_NAME, emoji: "👍", extra: [2, true, null, TAGGED_NAME], [TAGGED_NAME]: 1 });
const STRIPPED_ARGUMENTS = { character: STRIPPED_NAME, emoji: "👍", extra: [2, true, null, STRIPPED_NAME], [STRIPPED_NAME]: 1 };
// Cut mid-string, as a garbled emission is: not JSON, so no decoded string exists to strip.
const UNREADABLE_ARGUMENTS = TAGGED_ARGUMENTS.slice(0, TAGGED_ARGUMENTS.indexOf("/>"));
// Spaced as a model may write it; a payload that hides nothing reaches a member in these exact bytes.
const CLEAN_ARGUMENTS = '{ "character": "Aria", "emoji": "👍" }';
const TAGGED_ID = "react-tagged";
const CLEAN_ID = "react-clean";

function reactCalls(calls: readonly (readonly [string, string])[]): Response {
  const toolCalls = calls.map(([id, args], index) => ({ index, id, type: "function", function: { name: CHAT_REACT_TOOL_NAME, arguments: args } }));
  return coreSse([
    coreFrame({ choices: [{ delta: { ["tool_calls"]: toolCalls } }] }),
    terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 4, completionTokens: 2 } }),
  ]);
}

function reactRoom(calls: readonly (readonly [string, string])[]): Promise<ChatRoot> {
  return turnToolsRoom([(): Response => reactCalls(calls), (): Response => coreProse("Reacted.")]);
}

/** The host lets characters react, a member joins, and the host's turn runs the scripted call. */
async function runReactTurn(h: ChatRoot): Promise<Principal> {
  await h.root.services.chat.setReactionsEnabled({ principal: h.owner, chatId: h.chatId, enabled: true });
  await h.root.services.chat.setCharactersCanReact({ principal: h.owner, chatId: h.chatId, enabled: true });
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "A line to react to." });
  const turn = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(turn.aborted).toBe(false);
  return member;
}

function reactRecord(messages: readonly MessageView[], id: string): ToolCallRecord {
  const record = messages.flatMap((view) => view.toolCalls).find((call) => call.toolCallId === id);
  if (record === undefined) {
    throw new Error(`the turn recorded no react call ${id}`);
  }
  return record;
}

async function hostRecord(h: ChatRoot, id: string): Promise<ToolCallRecord> {
  return reactRecord((await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages, id);
}

/** The record as the member reads it on the history page and in the committed view of the durable replay. */
async function memberRecords(h: ChatRoot, member: Principal, id: string): Promise<readonly ToolCallRecord[]> {
  const page = await h.root.services.chat.listMessages({ principal: member, chatId: h.chatId });
  const replay = await h.root.services.chat.replayChatEvents({ principal: member, chatId: h.chatId });
  const committed = replay.flatMap(({ event }) => (event.type === "messageCommitted" && event.view !== undefined ? [event.view] : []));
  return [reactRecord(page.messages, id), reactRecord(committed, id)];
}

test("a member reads a tool call's arguments and result with hidden spans removed and the JSON intact", async () => {
  await using h = await reactRoom([
    [TAGGED_ID, TAGGED_ARGUMENTS],
    [CLEAN_ID, CLEAN_ARGUMENTS],
  ]);
  const member = await runReactTurn(h);
  // Control: the host reads both fields verbatim, and the result really quotes the tagged argument.
  const hosted = await hostRecord(h, TAGGED_ID);
  expect(hosted.arguments).toBe(TAGGED_ARGUMENTS);
  expect(hosted.result).toContain(TRUTH);
  expect(hosted.isError).toBe(true);
  const hostedError: unknown = JSON.parse(hosted.result ?? "null");
  if (typeof hostedError !== "object" || hostedError === null || !("error" in hostedError) || typeof hostedError.error !== "string") {
    throw new Error("the react refusal is not an error document");
  }
  const hostedClean = await hostRecord(h, CLEAN_ID);
  expect(hostedClean).toMatchObject({ arguments: CLEAN_ARGUMENTS, isError: false });

  for (const record of await memberRecords(h, member, TAGGED_ID)) {
    expect(JSON.stringify(record)).not.toContain(TRUTH);
    expect(JSON.parse(record.arguments)).toEqual(STRIPPED_ARGUMENTS);
    expect(JSON.parse(record.result ?? "null")).toEqual({ error: stripHiddenSpans(hostedError.error).content });
  }
  for (const record of await memberRecords(h, member, CLEAN_ID)) {
    expect(record).toMatchObject({ arguments: hostedClean.arguments, result: hostedClean.result });
  }
});

// The forker hosts the copy and reads it verbatim, so the copy itself must hold only the member bytes.
test("a member who forks the room once alone copies the tool call without its hidden spans", async () => {
  await using h = await reactRoom([[TAGGED_ID, TAGGED_ARGUMENTS]]);
  const member = await runReactTurn(h);
  // Control: the source record holds the truth the copy must drop.
  expect((await hostRecord(h, TAGGED_ID)).arguments).toBe(TAGGED_ARGUMENTS);
  await h.root.services.chat.selfLeave({ principal: h.owner, chatId: h.chatId });
  const fork = await h.root.services.chat.forkChat({ principal: member, chatId: h.chatId });
  const copied = reactRecord((await h.root.services.chat.listMessages({ principal: member, chatId: fork.chat.id })).messages, TAGGED_ID);
  expect(JSON.stringify(copied)).not.toContain(TRUTH);
  expect(JSON.parse(copied.arguments)).toEqual(STRIPPED_ARGUMENTS);
});

test("a member reads tool arguments that are not JSON as withheld, and the host reads them as sent", async () => {
  await using h = await reactRoom([[TAGGED_ID, UNREADABLE_ARGUMENTS]]);
  const member = await runReactTurn(h);
  const hosted = await hostRecord(h, TAGGED_ID);
  expect(hosted.arguments).toBe(UNREADABLE_ARGUMENTS);
  expect(hosted.isError).toBe(true);

  for (const record of await memberRecords(h, member, TAGGED_ID)) {
    expect(record.arguments).toBe("");
    // The rest of the record still reaches the member: the call, its refusal and its error state.
    expect(record).toMatchObject({ name: CHAT_REACT_TOOL_NAME, isError: true, result: hosted.result });
  }
});
