import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { adminUserViewSchema } from "@orb/server/domain/admin";
import type { createCaller } from "@orb/server/transport/trpc";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";
import type { UserRow } from "./user.ts";

export interface SeededAdminUser {
  readonly view: Awaited<ReturnType<ReturnType<typeof createCaller>["admin"]["createUser"]>>;
  readonly row: UserRow;
}

/** Mint through the actual privileged writer; the password-bearing row remains separate from its strict view. */
export async function seedCreatedAdminUser(
  root: ServerProducerRoot,
  userId: UserId,
  params: Parameters<ReturnType<typeof createCaller>["admin"]["createUser"]>[0],
): Promise<SeededAdminUser> {
  const db = root.db;
  const create = (await root.internalCallerFor(userId)).admin.createUser;
  const view = adminUserViewSchema.parse(await create(params));
  const row = await db.select().from(users).where(eq(users.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production admin mint left no canonical user row");
  }
  return { view, row };
}
