// @subject packages/server/src/transport/trpc/routers/chat.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
import type { ChatBusEvent } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { ChatId, Handle, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, SECRET_BOX_TEST_KEY } from "@orb/testkit/node/composed";

const LOCAL_ENV = { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" };

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

async function bindChatConnection(harness: ServerTestHarness, caller: Caller, userId: UserId): Promise<void> {
  const credential = await caller.credentials.add({ provider: "claude-sub", key: "duplicate-forks-physical-token", metadata: { auth: "oauthToken" } });
  const connection = await caller.connection.create({
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model: "duplicate-forks-model",
    allowBackground: false,
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { output: { modalities: ["text"] } } }),
  });
  await harness.app.runtime.resolve({ task: "chat", connectionId: connection.id, principal: await harness.principalFor(userId), cachedFacts: true });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
}

interface Room {
  readonly chatId: ChatId;
  readonly host: Caller;
  readonly member: Caller;
  readonly stranger: Caller;
  readonly hostLine: MessageId;
  readonly memberLine: MessageId;
}

async function sharedRoom(harness: ServerTestHarness): Promise<Room> {
  await (await harness.internalCallerFor(harness.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  const host = await harness.internalCallerFor(harness.ownerId);
  const account = await harness.actor({ handle: castId<Handle>("room-member") });
  const member = await harness.internalCallerFor(account.id);
  const outsider = await harness.actor({ handle: castId<Handle>("room-stranger") });
  const stranger = await harness.internalCallerFor(outsider.id);
  await bindChatConnection(harness, host, harness.ownerId);
  await bindChatConnection(harness, member, account.id);
  const chatId = (await host.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  const hostLine = (await host.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "host line" })).messages[0];
  const invitation = await host.invites.createInvite({ chatId, input: {} });
  await member.invites.redeemInvite({ token: invitation.token });
  const memberLine = (await member.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "member line" })).messages[0];
  if (hostLine === undefined || memberLine === undefined) {
    throw new Error("the actual commit door returned no slot");
  }
  return { chatId, host, member, stranger, hostLine: hostLine.id, memberLine: memberLine.id };
}

test("chat.duplicateMessage: the author copies their line to a new tail slot, the bus carries it, and a non-author member is refused", async () => {
  await using harness = await createServerHarness({ env: LOCAL_ENV, secretBoxKey: SECRET_BOX_TEST_KEY });
  const { chatId, host, member, hostLine, memberLine } = await sharedRoom(harness);
  const events: ChatBusEvent["type"][] = [];
  const stop = harness.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.chatId === chatId) {
      events.push(event.type);
    }
  });
  try {
    const copy = await member.chat.duplicateMessage({ chatId, messageId: memberLine });
    expect(copy.id).not.toBe(memberLine);
    expect(copy.content).toBe("member line");
    const rows = (await host.chat.listMessages({ chatId })).messages.toSorted((a, b) => a.seq - b.seq);
    expect(rows.map((row) => row.id)).toEqual([hostLine, memberLine, copy.id]);

    await expect(member.chat.duplicateMessage({ chatId, messageId: hostLine })).toThrowTRPCError("BAD_REQUEST");
    expect((await host.chat.listMessages({ chatId })).messages).toHaveLength(3);
    expect(events).toEqual<ChatBusEvent["type"][]>(["messageCommitted"]);
  } finally {
    stop();
  }
});

test("chat.listForks: a member sees the forks of the room they belong to, and a stranger is refused", async () => {
  await using harness = await createServerHarness({ env: LOCAL_ENV, secretBoxKey: SECRET_BOX_TEST_KEY });
  const { chatId, host, member, stranger } = await sharedRoom(harness);
  expect(await host.chat.listForks({ chatId })).toEqual([]);
  const fork = await host.chat.forkChat({ chatId });
  expect((await host.chat.listForks({ chatId })).map((summary) => summary.id)).toEqual([fork.chat.id]);
  // A fork grants no parent membership and the parent grants none on the fork, so the member (not seated in the fork) sees none.
  expect(await member.chat.listForks({ chatId })).toEqual([]);
  await expect(stranger.chat.listForks({ chatId })).toThrowTRPCError("NOT_FOUND");
});
