// A send refused because the room's host is unavailable tells a present member why, on the real wire, and tells
// anyone else exactly what a missing room tells them: the reason is no probe for a room or a disabled account.
// @subject packages/server/src/domain/chat/verbs/admission.ts
// @subject packages/server/src/transport/trpc/error-mapping.ts

import { TURN_HOST_UNAVAILABLE_OP_CODE } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, SignedIn } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import { seedChat, seedChatInvite, seedInvitedChatParticipant } from "@orb/testkit/node/composed";
import { z } from "zod";

const SEND_ROUTE = "/api/trpc/chat.send";
const refusalSchema = z.looseObject({
  error: z.looseObject({ message: z.string(), data: z.looseObject({ code: z.string(), reason: z.string().optional() }) }),
});

async function sendOverWire(root: AuthModeRoot, who: SignedIn, chatId: ChatId): Promise<z.infer<typeof refusalSchema>["error"]> {
  const response = await root.http.request(SEND_ROUTE, {
    method: "POST",
    headers: { ...who.headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ chatId, content: "Is anyone hosting?", timeZone: UTC_TIME_ZONE }),
  });
  return refusalSchema.parse(await response.json()).error;
}

test("a member's send in a room whose host is disabled names the host-unavailable reason, while a stranger and an unknown room read plain not found", async () => {
  await using root = await createAuthModeRoot("local");
  const admin = await root.principalFor(root.ownerId);
  const host = await mintMember(root);
  const player = await mintMember(root);
  const stranger = await mintMember(root);
  const hostPrincipal = await root.principalFor(host.userId);
  const playerPrincipal = await root.principalFor(player.userId);
  const room = (await seedChat(root, { principal: hostPrincipal, characterIds: [] })).view.chat.id;
  const invite = await seedChatInvite(root, { principal: hostPrincipal, chatId: room, input: { invitedHandle: player.handle } });
  await seedInvitedChatParticipant(root, { principal: playerPrincipal, inviteId: invite.invite.id });
  const asPlayer = await signIn(root, player);
  const asStranger = await signIn(root, stranger);
  await root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled: false });

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
