// Shared raw FK-parent seeders for the db/schema .int tests (NOT a test file — no `.test` suffix), and the
// legacy suites' one row-resolved Principal (`principal`): a role or handle a case needs is written onto the
// user row first, then the production host resolver reads it, so no legacy Principal disagrees with its row.
// A table with a factory in `support/factories/` is seeded there instead (characters carry contentHash).

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chats, users } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { handleKey } from "@orb/kit/handle-key";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsRolePolicy, createSessionsService } from "@orb/server/domain/sessions";
import { createHostPrincipalResolver } from "@orb/server/entry/auth";
import { createLocalLightUserSeed } from "@orb/server/entry/boot";
import { env } from "@orb/server/foundation/env";
import { createFrozenClock } from "@orb/testkit/iso/clock.ts";
import { seedUser as seedUserRow } from "@orb/testkit/node/factories/user.ts";
import { eq } from "drizzle-orm";

type UserRow = typeof users.$inferSelect;

/** Insert the minimal `users` FK-parent row; returns its branded id. `handle` defaults to echo the id. */
export async function seedUser(db: Db, raw: { id?: string; handle?: Handle } = {}): Promise<UserId> {
  const id = castId<UserId>(raw.id ?? "user_x");
  await db.insert(users).values({ id, handle: castId<Handle>(raw.handle ?? id), handleKey: handleKey(castId<Handle>(raw.handle ?? id)) });
  return id;
}

/** Insert the minimal `chats` FK-parent row (D18 — bare, membership-scoped, no ownerId); returns its id. */
export async function seedChat(db: Db, raw: { id?: string } = {}): Promise<ChatId> {
  const id = castId<ChatId>(raw.id ?? "chat_x");
  await db.insert(chats).values({ id });
  return id;
}

/** The identity fields a case can require of a stored row; an absent or `undefined` field keeps its stored value. */
export interface UserIdentity {
  readonly role?: UserRow["role"] | undefined;
  readonly handle?: UserRow["handle"] | undefined;
}

/** Make `userId`'s row carry `identity`: insert it through the testkit factory when absent, then rewrite only the named fields. */
export async function seedUserIdentity(db: Db, userId: UserId, identity: UserIdentity): Promise<void> {
  const stored =
    (await db.select({ role: users.role, handle: users.handle }).from(users).where(eq(users.id, userId)).get()) ?? (await seedUserRow(db, { id: userId }));
  const role = identity.role ?? stored.role;
  const handle = identity.handle ?? stored.handle;
  if (role !== stored.role || handle !== stored.handle) {
    await db
      .update(users)
      .set({ role, handle, handleKey: handleKey(handle) })
      .where(eq(users.id, userId));
  }
}

/** The legacy caller for `userId`, resolved from its row by the production host resolver (via `fallback`). This does
 *  not prove request authentication or enabled admission. A field named in `identity` is written onto the row first. */
export async function principal(root: { readonly db: Db }, userId: UserId, identity: UserIdentity = {}): Promise<Principal> {
  if (identity.role !== undefined || identity.handle !== undefined) {
    await seedUserIdentity(root.db, userId, identity);
  }
  return await createHostPrincipalResolver(rowReads(root.db))(userId);
}

// The resolver reads rows only; it mints no session, so the service carries no session secret.
function rowReads(db: Db): SessionsService {
  const handle = databaseHandle(db);
  const { now } = createFrozenClock();
  return createSessionsService({
    rolePolicy: createSessionsRolePolicy(env),
    db: handle,
    now,
    sessionSecret: null,
    seedUserConnections: createLocalLightUserSeed({ db: handle, now, onEmbedSpaceBound: (): void => undefined }),
  });
}
