// Shared substrate for the notifications domain tests (NOT a test file — the test-layout gate ignores any
// file that isn't a *.test kind; it is imported, never collected). Seeds the `users` FK targets directly
// (tests are not under domain/, so the no-direct-users-read chokepoint does not apply), builds Principals,
// and mints valid closed `NotificationEvent`s. `mintTypeId` is allowed under tests/ (the determinism gate
// bans only ambient clock / Math.random / randomUUID — not typeid); event id VALUES are never asserted on.

import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createResolveStandingAsks } from "@orb/server/domain/chat";
import type { NotificationsService } from "@orb/server/domain/notifications";
import { createNotificationsService } from "@orb/server/domain/notifications";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";

export const ALICE = castId<UserId>("user_alice");
export const BOB = castId<UserId>("user_bob");

/** Insert a `users` row so a notification's `recipientUserId` FK resolves (CASCADE on delete). Thin
 *  delegate over the canonical factory — notifications' call sites pass `(id, handle)` positionally and
 *  discard the return (a bare-string-second-arg variant, per the punchlist). */
export async function seedUser(db: Db, id: UserId, handle: Handle): Promise<void> {
  await seedUserRow(db, { id, handle: castId<Handle>(handle) });
}

/** The REAL `resolveStandingAsks` (#1799), never a stub: `InboxView.actionable` is derived from
 *  `chat_invites.status` / `chats.pending_host_user_id`, and a hand-written resolver here would let the
 *  domain suite agree with a fiction while the composed server disagreed. These tests run on a real db, so
 *  they get the composed answer — an invite event whose id names no row is correctly NOT standing. */
export function makeNotificationsService(db: Db, now: () => number): NotificationsService {
  return createNotificationsService({ db, now, resolveStandingAsks: createResolveStandingAsks(db) });
}

/** A minimal `user`-role Principal for the given recipient (the caller-scope verbs read `.userId`). */
export function principal(userId: UserId): Principal {
  return makePrincipal(userId);
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

export function kickedEvent(recipientUserId: UserId): NotificationEvent {
  return { type: "kicked", recipientUserId, chatId: mintTypeId(ID_PREFIX.chat) };
}
