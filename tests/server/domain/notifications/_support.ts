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
import type { NotificationsService } from "@orb/server/domain/notifications";
import { createNotificationsService } from "@orb/server/domain/notifications";
import { eq } from "drizzle-orm";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";

export const ALICE = castId<UserId>("user_alice");
export const BOB = castId<UserId>("user_bob");
export const AGENT = castId<UserId>("user_agent");

/** Insert a `users` row so a notification's `recipientUserId` FK resolves (CASCADE on delete). Thin
 *  delegate over the canonical factory — notifications' call sites pass `(id, handle)` positionally and
 *  discard the return (a bare-string-second-arg variant, per the punchlist). */
export async function seedUser(db: Db, id: UserId, handle: string): Promise<void> {
  await seedUserRow(db, { id, handle: castId<Handle>(handle) });
}

/** Insert an AGENT-principal `users` row (D60): `kind='agent'`, owned by a human, loginless (the
 *  `users_agent_shape` CHECK requires `role='user'` + no password/externalId + an owner). The recipient the
 *  D60 belt refuses. */
export async function seedAgent(db: Db, id: UserId, ownerUserId: UserId): Promise<void> {
  await db.insert(users).values({
    id,
    handle: castId<Handle>(id),
    role: "user",
    kind: "agent",
    ownerUserId,
  });
}

/** Build the notifications service wired with a REAL `users.kind` read (the entry root's inline op), so the
 *  D60 recipient belt is exercised end-to-end in the domain tests. */
export function makeNotificationsService(db: Db, now: () => number): NotificationsService {
  return createNotificationsService({
    db,
    now,
    isAgentRecipient: async (userId) => {
      const rows = await db.select({ kind: users.kind }).from(users).where(eq(users.id, userId)).limit(1);
      return rows[0]?.kind === "agent";
    },
  });
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
