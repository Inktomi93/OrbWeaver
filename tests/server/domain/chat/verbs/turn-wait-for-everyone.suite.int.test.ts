// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/verbs/participants.ts
// A wait-for-everyone room: each person's send posts without a reply until every present person has written since
// the last reply. An early release, a leave and a kick each settle the count through the real verbs. A press of the
// line's reply action starts at most one round per unanswered line, in any shared room, and a member's press while the
// host is dark queues behind the drain. Only the provider's reply bytes and one refusal are scripted.

import type { Principal } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/composed";
import { connectDevice, createChatRoot, freshHeldDb, readRoomCanon } from "@orb/testkit/node/composed";
import { CHAT_COMPLETIONS_PATH, quietOf, textProvider, wireOf } from "../scenario-physical.ts";

const DRAIN_TIMEOUT_MS = 10_000;
// A release's queued-reply read: it comes after the release took the room's claim and read the tail.
const PENDING_READ = /^select .* from "pending_turns"/u;

interface SharedRoom {
  readonly h: ChatRoot;
  readonly member: Principal;
  readonly [Symbol.asyncDispose]: () => Promise<void>;
}

interface SharedRoomOptions {
  /** Off: a shared room in the default mode, where every send replies. */
  readonly wait?: boolean;
  /** Off: the host has no device connected, so a member's send defers. */
  readonly hostOnline?: boolean;
  /** The provider refuses the first chat request before it answers any. */
  readonly refuseFirst?: boolean;
  readonly db?: NonNullable<ChatRootOptions["server"]>["db"];
}

/** A one-character room the owner hosts and a second account has joined, in wait mode with the host online unless the
 *  case says otherwise. `replies` is every reply the case expects the provider to write. */
async function sharedRoom(
  replies: readonly string[],
  { wait = true, hostOnline = true, refuseFirst = false, db }: SharedRoomOptions = {},
): Promise<SharedRoom> {
  await using construction = new AsyncDisposableStack();
  const execute = construction.use(textProvider(replies)).execute;
  let refusing = refuseFirst;
  const providerFetch: typeof fetch = async (input, init) => {
    if (refusing && new URL(new Request(input, init).url).pathname.endsWith(CHAT_COMPLETIONS_PATH)) {
      refusing = false;
      return Response.json({ error: { message: "Controlled refusal", type: "invalid_request_error" } }, { status: 400 });
    }
    return await execute(input, init);
  };
  const h = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      providerFetch,
      server: { env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" }, ...(db === undefined ? {} : { db }) },
      group: { output: "per-speaker", waitForEveryone: wait },
    }),
  );
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  if (hostOnline) {
    const online = new AbortController();
    construction.defer(() => online.abort());
    await connectDevice(h.root, h.owner.userId, online.signal);
  }
  await h.root.settleBackground();
  const lifetime = construction.move();
  return { h, member, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

function send(h: ChatRoot, principal: Principal, content: string): ReturnType<ChatRoot["root"]["services"]["chat"]["send"]> {
  return h.root.services.chat.send({ principal, chatId: h.chatId, content, timeZone: UTC_TIME_ZONE });
}

function replyToTail(h: ChatRoot, principal: Principal): ReturnType<ChatRoot["root"]["services"]["chat"]["replyToTail"]> {
  return h.root.services.chat.replyToTail({ principal, chatId: h.chatId, timeZone: UTC_TIME_ZONE });
}

function chatRequests(h: ChatRoot): number {
  return h.requests.filter((request) => new URL(request.url).pathname.endsWith(CHAT_COMPLETIONS_PATH)).length;
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

  const { outcome } = await wireOf(h, () => replyToTail(h, member));
  expect(outcome.messages.map(({ role, content }) => [role, content])).toEqual([["assistant", "Aria answers the one who spoke."]]);
  expect(await roles(room)).toEqual(["user", "assistant"]);

  // The line is answered, so a later press starts nothing.
  const late = await quietOf(h, () => replyToTail(h, h.owner));
  expect(late.messages).toEqual([]);
  expect(await roles(room)).toEqual(["user", "assistant"]);
});

test("two people pressing the release together start exactly one reply", async () => {
  await using room = await sharedRoom(["Aria answers the first press."]);
  const { h, member } = room;
  await quietOf(h, () => send(h, member, "I knock twice."));

  const { bodies, outcome } = await wireOf(h, () => Promise.all([replyToTail(h, member), replyToTail(h, h.owner)]));
  expect(bodies).toHaveLength(1);
  expect(outcome.flatMap(({ messages }) => messages).map(({ role }) => role)).toEqual(["assistant"]);
  expect(await roles(room)).toEqual(["user", "assistant"]);
});

test("the last writer's send stands down while a press is starting the reply, and that one reply answers both lines", async () => {
  using held = await freshHeldDb();
  await using room = await sharedRoom(["Aria answers you both."], { db: held.db });
  const { h, member } = room;
  await quietOf(h, () => send(h, member, "I knock twice."));

  const pendingRead = held.hold(PENDING_READ);
  const { bodies, outcome } = await wireOf(h, async () => {
    const press = replyToTail(h, member);
    await pendingRead.reached;
    // The press read the tail before this line landed, so only the room's claim keeps the send from a second round.
    const last = await send(h, h.owner, "I open the door.");
    pendingRead.release();
    return { press: await press, last };
  });
  expect(bodies).toHaveLength(1);
  expect(outcome.last.messages.map(({ role }) => role)).toEqual(["user"]);
  expect(outcome.press.messages.map(({ role }) => role)).toEqual(["assistant"]);
  expect(await roles(room)).toEqual(["user", "user", "assistant"]);
});

test("a press racing the last writer's send starts exactly one reply", async () => {
  await using room = await sharedRoom(["Aria answers the room once."]);
  const { h, member } = room;
  await quietOf(h, () => send(h, member, "I knock twice."));

  const { bodies } = await wireOf(h, () => Promise.all([replyToTail(h, member), send(h, h.owner, "I open the door.")]));
  expect(bodies).toHaveLength(1);
  expect((await roles(room)).filter((role) => role === "assistant")).toEqual(["assistant"]);
});

test("a reply that fails frees the room, so the next press starts it", async () => {
  await using room = await sharedRoom(["Aria answers on the second try."], { refuseFirst: true });
  const { h, member } = room;
  await quietOf(h, () => send(h, member, "I knock twice."));

  const failed = await wireOf(h, async () => {
    await replyToTail(h, member).catch((error: unknown) => error);
    await h.root.settleBackground();
  });
  expect(failed.bodies).toHaveLength(1);
  expect(await roles(room)).toEqual(["user"]);

  const { outcome } = await wireOf(h, () => replyToTail(h, member));
  expect(outcome.messages.map(({ role, content }) => [role, content])).toEqual([["assistant", "Aria answers on the second try."]]);
});

test("a member's press while the host is dark spends nothing, and the host's return answers the line once", async () => {
  await using room = await sharedRoom(["Aria answers when the host returns."], { wait: false, hostOnline: false });
  const { h, member } = room;

  // The member's send defers, and the line under the composer still offers the reply on that line.
  const deferred = await quietOf(h, () => send(h, member, "Anyone here?"));
  expect(deferred.messages.map(({ role }) => role)).toEqual(["user"]);
  const pressed = await quietOf(h, async () => [await replyToTail(h, member), await replyToTail(h, member)]);
  expect(pressed.flatMap(({ messages }) => messages)).toEqual([]);

  const online = new AbortController();
  try {
    await connectDevice(h.root, h.owner.userId, online.signal);
    await expect.poll(() => roles(room), { timeout: DRAIN_TIMEOUT_MS }).toEqual(["user", "assistant"]);
    await h.root.settleBackground();
    expect(chatRequests(h)).toBe(1);
    expect(await roles(room)).toEqual(["user", "assistant"]);
  } finally {
    online.abort();
  }
});

test("a person outside the room and a member who left are refused the press", async () => {
  await using room = await sharedRoom(["Aria answers the member still seated."], { wait: false });
  const { h, member } = room;
  await quietOf(h, () => h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "A line nobody answered." }));
  const stranger = await h.root.internalCallerFor((await h.root.actor()).id);
  const leaver = await h.root.internalCallerFor(member.userId);
  await h.root.services.chat.selfLeave({ principal: member, chatId: h.chatId });
  await h.root.settleBackground();

  await expect(stranger.chat.replyToTail({ chatId: h.chatId, timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(leaver.chat.replyToTail({ chatId: h.chatId, timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(chatRequests(h)).toBe(0);

  // Positive control: the host's own press through the same door starts the reply.
  const host = await h.root.internalCallerFor(h.owner.userId);
  const { outcome } = await wireOf(h, () => host.chat.replyToTail({ chatId: h.chatId, timeZone: UTC_TIME_ZONE }));
  expect(outcome.messages.map(({ role }) => role)).toEqual(["assistant"]);
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
