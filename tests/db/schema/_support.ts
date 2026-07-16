// Shared raw FK-parent seeders for the db/schema .int tests (NOT a test file — no `.test` suffix).
// DELIBERATELY below the factory layer: schema tests pin constraint/CASCADE/unique semantics against the
// minimal parent row (id + the one notNull column the FK needs), not a fully-populated entity — a factory
// row would obscure WHICH column's constraint fired. ~24 of 35 schema files hand-rolled these identical
// one-liners; this is their one home. For a fully-valid entity row, use `support/factories/` instead.

import type { Db } from "@orb/db";
import { chats, users } from "@orb/db";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** Insert the minimal `users` FK-parent row; returns its branded id. `handle` defaults to echo the id. */
export async function seedUser(db: Db, raw: { id?: string; handle?: string } = {}): Promise<UserId> {
  const id = castId<UserId>(raw.id ?? "user_x");
  await db.insert(users).values({ id, handle: castId<Handle>(raw.handle ?? id) });
  return id;
}

/** Insert the minimal `chats` FK-parent row (D18 — bare, membership-scoped, no ownerId); returns its id. */
export async function seedChat(db: Db, raw: { id?: string } = {}): Promise<ChatId> {
  const id = castId<ChatId>(raw.id ?? "chat_x");
  await db.insert(chats).values({ id });
  return id;
}
