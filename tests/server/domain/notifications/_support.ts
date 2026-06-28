// Shared substrate for the notifications domain tests (NOT a test file — the test-layout gate ignores any
// file that isn't a *.test kind; it is imported, never collected). Seeds the `users` FK targets directly
// (tests are not under domain/, so the no-direct-users-read chokepoint does not apply), builds Principals,
// and mints valid closed `NotificationEvent`s. `mintTypeId` is allowed under tests/ (the determinism gate
// bans only ambient clock / Math.random / randomUUID — not typeid); event id VALUES are never asserted on.

import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";

export const ALICE = castId<UserId>("user_alice");
export const BOB = castId<UserId>("user_bob");

/** Insert a `users` row so a notification's `recipientUserId` FK resolves (CASCADE on delete). */
export async function seedUser(db: Db, id: UserId, handle: string): Promise<void> {
  await db.insert(users).values({ id, handle: castId<Handle>(handle), role: "user" });
}

/** A minimal `user`-role Principal for the given recipient (the caller-scope verbs read `.userId`). */
export function principal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "cookie" };
}

/** A valid `invite` event addressed to `recipientUserId` (chat/invite ids minted to pass the union parse). */
export function inviteEvent(recipientUserId: UserId): NotificationEvent {
  return {
    type: "invite",
    recipientUserId,
    chatId: mintTypeId(ID_PREFIX.chat),
    inviteId: mintTypeId(ID_PREFIX.chatInvite),
    invitedByHandle: castId<Handle>("host"),
  };
}

/** A valid `kicked` event addressed to `recipientUserId`. */
export function kickedEvent(recipientUserId: UserId): NotificationEvent {
  return { type: "kicked", recipientUserId, chatId: mintTypeId(ID_PREFIX.chat) };
}
