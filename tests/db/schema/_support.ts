// Shared raw FK-parent seeders for the db/schema .int tests (NOT a test file — no `.test` suffix).
// These insert the minimal parent row (id + the one notNull column the FK needs), so a constraint test shows
// WHICH column fired. A table with a factory in `support/factories/` is seeded there instead: character
// rows come from `seedCharacter`/`makeCharacter`, so they carry the product's invariants (contentHash).

import type { Db } from "@orb/db";
import { chats, users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

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
