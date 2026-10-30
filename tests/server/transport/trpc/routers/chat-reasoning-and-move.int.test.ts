// @subject packages/server/src/transport/trpc/routers/chat.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts
import type { ChatBusEvent } from "@orb/contracts/chat";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { ChatId, Handle, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

// Per-user credential storage (each principal's chat connection) needs a secret-box key.
const SECRET_BOX_KEY = Buffer.alloc(32, 1);
const LOCAL_ENV = { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" };

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

interface Room {
  readonly chatId: ChatId;
  readonly host: Caller;
  readonly member: Caller;
  readonly hostLine: MessageId;
  readonly memberLine: MessageId;
  readonly memberSecond: MessageId;
}

/** `commitMessage` resolves the chat connection even though it never generates, so each principal binds a real one. */
async function bindChatConnection(harness: ServerTestHarness, caller: Caller, userId: UserId): Promise<void> {
  const credential = await caller.credentials.add({ provider: "claude-sub", key: "reasoning-move-physical-token", metadata: { auth: "oauthToken" } });
  const connection = await caller.connection.create({
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model: "reasoning-move-model",
    allowBackground: false,
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { output: { modalities: ["text"] } } }),
  });
  await harness.app.runtime.resolve({ task: "chat", connectionId: connection.id, principal: await harness.principalFor(userId), cachedFacts: true });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
}

/** A host-owned room with one joined member. The host commits the first line, the member the next two, so each
 *  principal authors a slot the other does not. */
async function sharedRoom(harness: ServerTestHarness): Promise<Room> {
  await (await harness.internalCallerFor(harness.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so both callers are made after it is set.
  const host = await harness.internalCallerFor(harness.ownerId);
  const account = await harness.actor({ handle: castId<Handle>("room-member") });
  const member = await harness.internalCallerFor(account.id);
  await bindChatConnection(harness, host, harness.ownerId);
  await bindChatConnection(harness, member, account.id);
  const chatId = (await host.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  const hostLine = (await host.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "host line" })).messages[0];
  const invitation = await host.invites.createInvite({ chatId, input: {} });
  await member.invites.redeemInvite({ token: invitation.token });
  const memberLine = (await member.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "member line" })).messages[0];
  const memberSecond = (await member.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "member second line" })).messages[0];
  if (hostLine === undefined || memberLine === undefined || memberSecond === undefined) {
    throw new Error("the actual commit door returned no slot");
  }
  return { chatId, host, member, hostLine: hostLine.id, memberLine: memberLine.id, memberSecond: memberSecond.id };
}

function observe(harness: ServerTestHarness, chatId: ChatId): { readonly events: ChatBusEvent[]; readonly stop: () => void } {
  const events: ChatBusEvent[] = [];
  const stop = harness.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.chatId === chatId) {
      events.push(event);
    }
  });
  return { events, stop };
}

test("chat.editReasoning and chat.clearReasoning: the author and the host may write, a non-author member is refused, and each emit reaches the bus", async () => {
  await using harness = await createServerHarness({ env: LOCAL_ENV, secretBoxKey: SECRET_BOX_KEY });
  const { chatId, host: ownerCaller, member, hostLine, memberLine } = await sharedRoom(harness);
  const { events, stop } = observe(harness, chatId);
  try {
    const byAuthor = await member.chat.editReasoning({ chatId, messageId: memberLine, reasoning: "author thinking" });
    expect(byAuthor.reasoning).toBe("author thinking");
    const byHost = await ownerCaller.chat.editReasoning({ chatId, messageId: memberLine, reasoning: "host rewrote it" });
    expect(byHost.reasoning).toBe("host rewrote it");
    const cleared = await ownerCaller.chat.clearReasoning({ chatId, messageId: memberLine });
    expect(cleared.reasoning).toBeNull();
    await member.chat.editReasoning({ chatId, messageId: memberLine, reasoning: "author again" });
    const clearedByAuthor = await member.chat.clearReasoning({ chatId, messageId: memberLine });
    expect(clearedByAuthor.reasoning).toBeNull();

    await expect(member.chat.editReasoning({ chatId, messageId: hostLine, reasoning: "not mine" })).toThrowTRPCError("BAD_REQUEST");
    await expect(member.chat.clearReasoning({ chatId, messageId: hostLine })).toThrowTRPCError("BAD_REQUEST");
    // The sibling edit procedures refuse a non-author with the same code, so the new pair is not a different refusal.
    await expect(member.chat.editMessage({ chatId, messageId: hostLine, content: "not mine", timeZone: UTC_TIME_ZONE })).toThrowTRPCError("BAD_REQUEST");
    await expect(member.chat.deleteMessages({ chatId, messageIds: [hostLine] })).toThrowTRPCError("BAD_REQUEST");
    const refused = (await ownerCaller.chat.listMessages({ chatId })).messages.find((message) => message.id === hostLine);
    expect(refused?.reasoning).toBeNull();

    expect(events.map(({ type }) => type)).toEqual(["reasoningEdited", "reasoningEdited", "reasoningCleared", "reasoningEdited", "reasoningCleared"]);
  } finally {
    stop();
  }
});

test("chat.moveMessage: the host reorders and the bus carries messagesReordered; a member is refused and the order is unchanged", async () => {
  await using harness = await createServerHarness({ env: LOCAL_ENV, secretBoxKey: SECRET_BOX_KEY });
  const { chatId, host: ownerCaller, member, hostLine, memberLine, memberSecond } = await sharedRoom(harness);
  const rows = async (): Promise<readonly { readonly id: MessageId; readonly seq: number }[]> =>
    (await ownerCaller.chat.listMessages({ chatId })).messages.toSorted((a, b) => a.seq - b.seq);
  const order = async (): Promise<readonly MessageId[]> => (await rows()).map((row) => row.id);
  const seqOf = async (id: MessageId): Promise<number> => {
    const row = (await rows()).find((candidate) => candidate.id === id);
    if (row === undefined) {
      throw new Error("missing slot");
    }
    return row.seq;
  };
  expect(await order()).toEqual([hostLine, memberLine, memberSecond]);

  await expect(member.chat.moveMessage({ chatId, messageId: memberSecond, toSeq: await seqOf(hostLine) })).toThrowTRPCError("BAD_REQUEST");
  expect(await order()).toEqual([hostLine, memberLine, memberSecond]);

  const { events, stop } = observe(harness, chatId);
  try {
    // A move targets the neighbour's position: up lands before the neighbour, down lands after it.
    await ownerCaller.chat.moveMessage({ chatId, messageId: memberSecond, toSeq: await seqOf(memberLine) });
    expect(await order()).toEqual([hostLine, memberSecond, memberLine]);
    await ownerCaller.chat.moveMessage({ chatId, messageId: memberSecond, toSeq: await seqOf(memberLine) });
    expect(await order()).toEqual([hostLine, memberLine, memberSecond]);
    expect(events.map(({ type }) => type)).toEqual(["messagesReordered", "messagesReordered"]);
  } finally {
    stop();
  }
});
