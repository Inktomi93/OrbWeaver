// @subject packages/contracts/src/chat/member-projection.ts
// A tool call's name, arguments and result are model bytes: a member reads them with hidden spans removed, the JSON
// decoded first and re-encoded, and arguments that are not JSON withheld. The host reads every field verbatim.
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
// A repeated key decodes to its last value, so the tagged first value is in the bytes but not in the decode. The second
// form spells the tag's `<` as a JSON escape, so the raw bytes hold no literal tag either.
const DUPLICATE_ARGUMENTS = `{"character":${JSON.stringify(TAGGED_NAME)},"character":"Nobody","emoji":"👍"}`;
// Built from the backslash's code point, so no editor or formatter turns the escape back into `<`.
const JSON_ESCAPED_LESS_THAN = `${String.fromCodePoint(0x5c)}u003c`;
const ESCAPED_DUPLICATE_ARGUMENTS = `{"character":${JSON.stringify(TAGGED_NAME).replace("<", JSON_ESCAPED_LESS_THAN)},"character":"Nobody","emoji":"👍"}`;
const DEDUPLICATED_ARGUMENTS = { character: "Nobody", emoji: "👍" };
// Cut mid-string, as a garbled emission is: not JSON, so no decoded string exists to strip.
const UNREADABLE_ARGUMENTS = TAGGED_ARGUMENTS.slice(0, TAGGED_ARGUMENTS.indexOf("/>"));
// Spaced as a model may write it; a member reads the same value re-encoded.
const CLEAN_ARGUMENTS = '{ "character": "Aria", "emoji": "👍" }';
// A tool the round did not offer: the record keeps the name the model wrote.
const UNOFFERED_TOOL_NAME = `${CHAT_REACT_TOOL_NAME}_${TAGGED_NAME}`;

interface ScriptedCall {
  readonly id: string;
  readonly args: string;
  readonly name?: string;
}

const TAGGED: ScriptedCall = { id: "react-tagged", args: TAGGED_ARGUMENTS };
const CLEAN: ScriptedCall = { id: "react-clean", args: CLEAN_ARGUMENTS };
const DUPLICATE: ScriptedCall = { id: "react-duplicate", args: DUPLICATE_ARGUMENTS };
const ESCAPED_DUPLICATE: ScriptedCall = { id: "react-escaped-duplicate", args: ESCAPED_DUPLICATE_ARGUMENTS };
const UNREADABLE: ScriptedCall = { id: "react-unreadable", args: UNREADABLE_ARGUMENTS };
const UNOFFERED: ScriptedCall = { id: "unoffered-tagged", args: "{}", name: UNOFFERED_TOOL_NAME };

function scriptedCalls(calls: readonly ScriptedCall[]): Response {
  const toolCalls = calls.map(({ id, args, name }, index) => ({
    index,
    id,
    type: "function",
    function: { name: name ?? CHAT_REACT_TOOL_NAME, arguments: args },
  }));
  return coreSse([
    coreFrame({ choices: [{ delta: { ["tool_calls"]: toolCalls } }] }),
    terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 4, completionTokens: 2 } }),
  ]);
}

function toolRoom(calls: readonly ScriptedCall[]): Promise<ChatRoot> {
  return turnToolsRoom([(): Response => scriptedCalls(calls), (): Response => coreProse("Reacted.")]);
}

/** The host lets characters react, a member joins, and the host's turn runs the scripted calls. */
async function runToolTurn(h: ChatRoot): Promise<Principal> {
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

function recordOf(messages: readonly MessageView[], call: ScriptedCall): ToolCallRecord {
  const record = messages.flatMap((view) => view.toolCalls).find(({ toolCallId }) => toolCallId === call.id);
  if (record === undefined) {
    throw new Error(`the turn recorded no tool call ${call.id}`);
  }
  return record;
}

async function hostRecord(h: ChatRoot, call: ScriptedCall): Promise<ToolCallRecord> {
  return recordOf((await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages, call);
}

/** The record as the member reads it on the history page and in the committed view of the durable replay. */
async function memberRecords(h: ChatRoot, member: Principal, call: ScriptedCall): Promise<readonly ToolCallRecord[]> {
  const page = await h.root.services.chat.listMessages({ principal: member, chatId: h.chatId });
  const replay = await h.root.services.chat.replayChatEvents({ principal: member, chatId: h.chatId });
  const committed = replay.flatMap(({ event }) => (event.type === "messageCommitted" && event.view !== undefined ? [event.view] : []));
  return [recordOf(page.messages, call), recordOf(committed, call)];
}

test("a member reads a tool call's arguments and result with hidden spans removed and the JSON intact", async () => {
  await using h = await toolRoom([TAGGED, CLEAN]);
  const member = await runToolTurn(h);
  // Control: the host reads both fields verbatim, and the result really quotes the tagged argument.
  const hosted = await hostRecord(h, TAGGED);
  expect(hosted.arguments).toBe(TAGGED_ARGUMENTS);
  expect(hosted.result).toContain(TRUTH);
  expect(hosted.isError).toBe(true);
  const hostedError: unknown = JSON.parse(hosted.result ?? "null");
  if (typeof hostedError !== "object" || hostedError === null || !("error" in hostedError) || typeof hostedError.error !== "string") {
    throw new Error("the react refusal is not an error document");
  }
  const hostedClean = await hostRecord(h, CLEAN);
  expect(hostedClean).toMatchObject({ arguments: CLEAN_ARGUMENTS, isError: false });

  for (const record of await memberRecords(h, member, TAGGED)) {
    expect(JSON.stringify(record)).not.toContain(TRUTH);
    expect(JSON.parse(record.arguments)).toEqual(STRIPPED_ARGUMENTS);
    expect(JSON.parse(record.result ?? "null")).toEqual({ error: stripHiddenSpans(hostedError.error).content });
  }
  for (const record of await memberRecords(h, member, CLEAN)) {
    expect(JSON.parse(record.arguments)).toEqual(JSON.parse(hostedClean.arguments));
    expect(JSON.parse(record.result ?? "null")).toEqual(JSON.parse(hostedClean.result ?? "null"));
  }
});

test("a member never reads a tagged value a repeated key shadows, literal or escaped", async () => {
  await using h = await toolRoom([DUPLICATE, ESCAPED_DUPLICATE]);
  const member = await runToolTurn(h);
  // Control: the stored bytes hold the shadowed truth, and the escaped form holds no literal tag.
  expect(ESCAPED_DUPLICATE_ARGUMENTS).not.toContain("<");
  expect((await hostRecord(h, DUPLICATE)).arguments).toBe(DUPLICATE_ARGUMENTS);
  expect((await hostRecord(h, ESCAPED_DUPLICATE)).arguments).toBe(ESCAPED_DUPLICATE_ARGUMENTS);

  for (const call of [DUPLICATE, ESCAPED_DUPLICATE]) {
    for (const record of await memberRecords(h, member, call)) {
      // Soft, so each spelling reports its own verdict.
      expect.soft(record.arguments, call.id).not.toContain(TRUTH);
      expect.soft(JSON.parse(record.arguments), call.id).toEqual(DEDUPLICATED_ARGUMENTS);
    }
  }
});

test("a member reads an unoffered tool's name with its hidden span removed", async () => {
  await using h = await toolRoom([UNOFFERED]);
  const member = await runToolTurn(h);
  // Control: the host reads the name the model wrote, and the round refused the call.
  expect(await hostRecord(h, UNOFFERED)).toMatchObject({ name: UNOFFERED_TOOL_NAME, isError: true });

  for (const record of await memberRecords(h, member, UNOFFERED)) {
    expect(JSON.stringify(record)).not.toContain(TRUTH);
    expect(record.name).toBe(stripHiddenSpans(UNOFFERED_TOOL_NAME).content);
  }
});

// The forker hosts the copy and reads it verbatim, so the copy itself must hold only the member bytes.
test("a member who forks the room once alone copies the tool calls without their hidden spans", async () => {
  await using h = await toolRoom([TAGGED, DUPLICATE, ESCAPED_DUPLICATE]);
  const member = await runToolTurn(h);
  // Control: the source records hold the truth the copy must drop.
  for (const call of [TAGGED, DUPLICATE, ESCAPED_DUPLICATE]) {
    expect((await hostRecord(h, call)).arguments).toBe(call.args);
  }
  await h.root.services.chat.selfLeave({ principal: h.owner, chatId: h.chatId });
  const fork = await h.root.services.chat.forkChat({ principal: member, chatId: h.chatId });
  const copied = (await h.root.services.chat.listMessages({ principal: member, chatId: fork.chat.id })).messages;
  expect(JSON.stringify(copied)).not.toContain(TRUTH);
  expect(JSON.parse(recordOf(copied, TAGGED).arguments)).toEqual(STRIPPED_ARGUMENTS);
  expect(JSON.parse(recordOf(copied, DUPLICATE).arguments)).toEqual(DEDUPLICATED_ARGUMENTS);
  expect(JSON.parse(recordOf(copied, ESCAPED_DUPLICATE).arguments)).toEqual(DEDUPLICATED_ARGUMENTS);
});

test("a member reads tool arguments that are not JSON as withheld, and the host reads them as sent", async () => {
  await using h = await toolRoom([UNREADABLE]);
  const member = await runToolTurn(h);
  const hosted = await hostRecord(h, UNREADABLE);
  expect(hosted.arguments).toBe(UNREADABLE_ARGUMENTS);
  expect(hosted.isError).toBe(true);

  for (const record of await memberRecords(h, member, UNREADABLE)) {
    expect(record.arguments).toBe("");
    // The rest of the record still reaches the member: the call, its refusal and its error state.
    expect(record).toMatchObject({ name: CHAT_REACT_TOOL_NAME, isError: true, result: hosted.result });
  }
});
