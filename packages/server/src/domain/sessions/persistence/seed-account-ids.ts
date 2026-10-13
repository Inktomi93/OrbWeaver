// Trusted boot convenience seeding covers every existing account, not just enabled or human accounts.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";

export function createListSeedAccountIds(db: Db): () => Promise<readonly UserId[]> {
  return async () => (await db.select({ id: users.id }).from(users)).map((row) => row.id);
}
