// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/verbs/participants.ts
// A wait-for-everyone room: each person's send posts without a reply until every present person has written since
// the last reply. An early release, a leave and a kick each settle the count through the real verbs. Only the
// provider's reply bytes are scripted.

import type { Principal } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { connectDevice, readRoomCanon } from "@orb/testkit/node/composed";
import { quietOf, textRoom, wireOf } from "../scenario-physical.ts";

interface SharedRoom {
  readonly h: ChatRoot;
  readonly member: Principal;
  readonly [Symbol.asyncDispose]: () => Promise<void>;
}

/** A one-character room the owner hosts and a second account has joined, in wait mode, with the host online so a
 *  member's send never defers. `replies` is every reply the case expects the provider to write. */
async function sharedRoom(replies: readonly string[]): Promise<SharedRoom> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await textRoom(replies, {
      server: { env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" } },
      group: { output: "per-speaker", waitForEveryone: true },
    }),
  );
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const online = new AbortController();
  construction.defer(() => online.abort());
  await connectDevice(h.root, h.owner.userId, online.signal);
  await h.root.settleBackground();
  const lifetime = construction.move();
  return { h, member, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

function send(h: ChatRoot, principal: Principal, content: string): ReturnType<ChatRoot["root"]["services"]["chat"]["send"]> {
  return h.root.services.chat.send({ principal, chatId: h.chatId, content, timeZone: UTC_TIME_ZONE });
}

async function roles(room: SharedRoom): Promise<readonly string[]> {
  return (await readRoomCanon(room.h.root, room.h.owner, room.h.chatId)).map(({ role }) => role);
}

test("the first person's send posts with no reply, and the second person's send starts exactly one", async () => {
  await using room = await sharedRoom(["Aria answers you both."]);
  const { h, member } = room;

  const held = await quietOf(h, () => send(h, h.owner, "I open the gate."));
  expect(held.messages.map(({ role }) => role)).toEqual(["user"]);
  expect(await roles(room)).toEqual(["user"]);

  const { outcome, bodies } = await wireOf(h, () => send(h, member, "I follow you in."));
  expect(bodies).toHaveLength(1);
  expect(outcome.messages.map(({ role, content }) => [role, content])).toEqual([
    ["user", "I follow you in."],
    ["assistant", "Aria answers you both."],
  ]);
  expect(await roles(room)).toEqual(["user", "user", "assistant"]);

  // The reply resets the count: the next send waits again.
  await quietOf(h, () => send(h, member, "What now?"));
  expect(await roles(room)).toEqual(["user", "user", "assistant", "user"]);
});

test("a member who has written can release the reply before the other person writes", async () => {
  await using room = await sharedRoom(["Aria answers the one who spoke."]);
  const { h, member } = room;
  await quietOf(h, () => send(h, member, "I knock twice."));

  const { outcome } = await wireOf(h, () => h.root.services.chat.generate({ principal: member, chatId: h.chatId }));
  expect(outcome.messages.map(({ role, content }) => [role, content])).toEqual([["assistant", "Aria answers the one who spoke."]]);
  expect(await roles(room)).toEqual(["user", "assistant"]);
});

test("a member leaving recounts: the reply starts when everyone left has written, and not before", async () => {
  await using room = await sharedRoom(["Aria answers the host alone."]);
  const { h, member } = room;

  // The member wrote and the host did not, so the member's leave leaves the room waiting on the host.
  await quietOf(h, () => send(h, member, "I have to go."));
  await quietOf(h, async () => {
    await h.root.services.chat.selfLeave({ principal: member, chatId: h.chatId });
    await h.root.settleBackground();
  });
  expect(await roles(room)).toEqual(["user"]);

  // The host is the only person left, so the host's own send completes the count.
  const { outcome } = await wireOf(h, () => send(h, h.owner, "Safe travels."));
  expect(outcome.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
  expect(await roles(room)).toEqual(["user", "user", "assistant"]);
});

test("a kick of the one person not yet written starts the reply the host's line was waiting for", async () => {
  await using room = await sharedRoom(["Aria answers once the room is settled."]);
  const { h, member } = room;
  await quietOf(h, () => send(h, h.owner, "Let us begin."));

  const { bodies } = await wireOf(h, async () => {
    await h.root.services.chat.kick({ principal: h.owner, chatId: h.chatId, userId: member.userId });
    await h.root.settleBackground();
  });
  expect(bodies).toHaveLength(1);
  const canon = await readRoomCanon(h.root, h.owner, h.chatId);
  expect(canon.map(({ role, content }) => [role, content])).toEqual([
    ["user", "Let us begin."],
    ["assistant", "Aria answers once the room is settled."],
  ]);
});

test("a member who leaves before writing starts the reply the host's line was waiting for", async () => {
  await using room = await sharedRoom(["Aria answers after the door closes."]);
  const { h, member } = room;
  await quietOf(h, () => send(h, h.owner, "Are you staying?"));

  const { bodies } = await wireOf(h, async () => {
    await h.root.services.chat.selfLeave({ principal: member, chatId: h.chatId });
    await h.root.settleBackground();
  });
  expect(bodies).toHaveLength(1);
  const canon = await readRoomCanon(h.root, h.owner, h.chatId);
  expect(canon.map(({ role, content }) => [role, content])).toEqual([
    ["user", "Are you staying?"],
    ["assistant", "Aria answers after the door closes."],
  ]);
});
