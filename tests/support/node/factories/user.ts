// User rows are the FK root: the owner row precedes every Principal, so no production verb can create it.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { IdSource } from "@orb/kit/ids";
import type { UserRow } from "./rows.ts";
import { makeUser } from "./rows.ts";

/** `makeUser` then insert. Returns the built row (its `.id` is the FK target for owned seeds). */
export async function seedUser(db: Db, overrides: Partial<UserRow> = {}, source?: IdSource): Promise<UserRow> {
  const row = makeUser(overrides, source);
  await db.insert(users).values(row);
  return row;
}
