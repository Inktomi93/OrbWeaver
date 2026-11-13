// A send refused because the room's host is unavailable tells a present member why, on the real wire, and tells
// anyone else exactly what a missing room tells them: the reason is no probe for a room or a disabled account. Only
// the host's state earns the reason: a member's own not found stays one, and a member who left before the room
// resolved reads it as a stranger does.
// @subject packages/server/src/domain/chat/verbs/admission.ts
// @subject packages/server/src/transport/trpc/error-mapping.ts

import { TURN_HOST_UNAVAILABLE_OP_CODE } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, AuthModeRootOptions, AuthSubject, SignedIn } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import { freshHeldDb, seedChat, seedChatInvite, seedInvitedChatParticipant } from "@orb/testkit/node/composed";
import { z } from "zod";
import { ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";

const SEND_ROUTE = "/api/trpc/chat.send";
const SWIPE_ROUTE = "/api/trpc/chat.swipe";
// `generate`'s tail read: it runs after the verb's seat gate and before the room, and so its host, resolves.
const GENERATE_TAIL_READ = /^select max\(.*\) from "messages" where/u;
const refusalSchema = z.looseObject({
  error: z.looseObject({ message: z.string(), data: z.looseObject({ code: z.string(), reason: z.string().optional() }) }),
});

type WireRefusal = z.infer<typeof refusalSchema>["error"];

async function postOverWire(root: AuthModeRoot, who: SignedIn, route: string, input: Record<string, unknown>): Promise<WireRefusal> {
  const response = await root.http.request(route, {
    method: "POST",
    headers: { ...who.headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return refusalSchema.parse(await response.json()).error;
}

function sendOverWire(root: AuthModeRoot, who: SignedIn, chatId: ChatId): Promise<WireRefusal> {
  return postOverWire(root, who, SEND_ROUTE, { chatId, content: "Is anyone hosting?", timeZone: UTC_TIME_ZONE });
}

interface DisabledHostRoom extends AsyncDisposable {
  readonly root: AuthModeRoot;
  readonly room: ChatId;
  readonly player: AuthSubject;
  readonly playerPrincipal: Principal;
}

/** A local-mode room hosted by a second account with a third seated, then the host disabled by the owner. */
async function disabledHostRoom(options: AuthModeRootOptions = {}): Promise<DisabledHostRoom> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createAuthModeRoot("local", options));
  const admin = await root.principalFor(root.ownerId);
  const host = await mintMember(root);
  const player = await mintMember(root);
  const hostPrincipal = await root.principalFor(host.userId);
  const playerPrincipal = await root.principalFor(player.userId);
  const room = (await seedChat(root, { principal: hostPrincipal, characterIds: [] })).view.chat.id;
  const invite = await seedChatInvite(root, { principal: hostPrincipal, chatId: room, input: { invitedHandle: player.handle } });
  await seedInvitedChatParticipant(root, { principal: playerPrincipal, inviteId: invite.invite.id });
  await root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled: false });
  const lifetime = construction.move();
  return { root, room, player, playerPrincipal, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("a member's send in a room whose host is disabled names the host-unavailable reason, while a stranger and an unknown room read plain not found", async () => {
  await using box = await disabledHostRoom();
  const { root, room } = box;
  const asPlayer = await signIn(root, box.player);
  const asStranger = await signIn(root, await mintMember(root));

  expect(await sendOverWire(root, asPlayer, room)).toMatchObject({ data: { code: "BAD_REQUEST", reason: TURN_HOST_UNAVAILABLE_OP_CODE } });

  // The same room for a stranger and a room that never existed answer alike: same code, no reason, same wording.
  const unknown = root.idSource.typeId(ID_PREFIX.chat);
  const strangerRefusal = await sendOverWire(root, asStranger, room);
  const unknownRefusal = await sendOverWire(root, asStranger, unknown);
  expect(strangerRefusal.data).toEqual({ ...unknownRefusal.data });
  expect(strangerRefusal.data.code).toBe("NOT_FOUND");
  expect(strangerRefusal.data.reason).toBeUndefined();
  expect(strangerRefusal.message.replace(room, unknown)).toBe(unknownRefusal.message);
});

test("a member's swipe of an unknown message in a room whose host is disabled reads plain not found, not the host's state", async () => {
  await using box = await disabledHostRoom();
  const { root, room } = box;
  const asPlayer = await signIn(root, box.player);

  const refusal = await postOverWire(root, asPlayer, SWIPE_ROUTE, {
    chatId: room,
    messageId: root.idSource.typeId(ID_PREFIX.message),
    timeZone: UTC_TIME_ZONE,
  });
  expect(refusal.data.code).toBe("NOT_FOUND");
  expect(refusal.data.reason).toBeUndefined();
  // Positive control: the same member in the same room reads the host's state on a send.
  expect(await sendOverWire(root, asPlayer, room)).toMatchObject({ data: { code: "BAD_REQUEST", reason: TURN_HOST_UNAVAILABLE_OP_CODE } });
});

test("a member who leaves after the verb's own seat gate and before the room resolves reads plain not found", async () => {
  using held = await freshHeldDb();
  await using box = await disabledHostRoom({ db: held.db });
  const { chat } = box.root.services;
  const generate = (): ReturnType<typeof chat.generate> => chat.generate({ principal: box.playerPrincipal, chatId: box.room, timeZone: UTC_TIME_ZONE });
  // Positive control: while seated, the same generate reads the host's state.
  await expect(generate()).rejects.toMatchObject({ code: TURN_HOST_UNAVAILABLE_OP_CODE });

  const tailRead = held.hold(GENERATE_TAIL_READ);
  const generating = generate();
  const generated = Promise.allSettled([generating]);
  try {
    // Parked here, the generate has passed its own seat gate and has not resolved the room yet.
    await tailRead.reached;
    // The leave reads the same tail, so it must pass the hold.
    tailRead.disarm();
    await chat.selfLeave({ principal: box.playerPrincipal, chatId: box.room });
  } finally {
    tailRead.release();
    await generated;
  }
  await expect(generating).rejects.toMatchObject({ name: ChatNotFoundError.name });
});
