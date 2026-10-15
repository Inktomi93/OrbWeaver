// User rows are the FK root; their IDs use the production mint's prefixless path.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { Handle, IdSource, UserId } from "@orb/kit/ids";
import { castId, createIdSource } from "@orb/kit/ids";
import type { AdminService } from "@orb/server/domain/admin";
import { adminUserViewSchema } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";

/** The full `users` row (derived from the live schema — the factory `X`). */
export type UserRow = typeof users.$inferSelect;

const ids = createIdSource(createSeededIds().next);

/** Pure builder: a fully-valid human user row. `handle` defaults to the id (both unique per counter). */
export function makeUser(overrides: Partial<UserRow> = {}, source: IdSource = ids): UserRow {
  const id = overrides.id ?? source.unprefixed<UserId>();
  const handle = overrides.handle ?? castId<Handle>(id);
  return {
    id,
    handle,
    handleKey: handleKey(handle),
    externalId: null,
    email: null,
    role: "user",
    enabled: true,
    passwordHash: null,
    kind: "human",
    ownerUserId: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** `makeUser` then insert. Returns the built row (its `.id` is the FK target for owned seeds). */
export async function seedUser(db: Db, overrides: Partial<UserRow> = {}, source: IdSource = ids): Promise<UserRow> {
  const row = makeUser(overrides, source);
  await db.insert(users).values(row);
  return row;
}

export interface SeededAdminUser {
  readonly view: Awaited<ReturnType<AdminService["createUser"]>>;
  readonly row: UserRow;
}

/** Mint through the actual privileged writer; the password-bearing row remains separate from its strict view. */
export async function seedCreatedAdminUser(
  db: Db,
  create: AdminService["createUser"],
  params: Parameters<AdminService["createUser"]>[0],
): Promise<SeededAdminUser> {
  const view = adminUserViewSchema.parse(await create(params));
  const row = await db.select().from(users).where(eq(users.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production admin mint left no canonical user row");
  }
  return { view, row };
}
