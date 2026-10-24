// The Admin-minted user row and result shapes; the reads that return them live in the rows tier (`rows/admin-user.ts`).

import type { users } from "@orb/db";
import type { createCaller } from "@orb/server/transport/trpc";

export type UserRow = typeof users.$inferSelect;

export interface SeededAdminUser {
  readonly view: Awaited<ReturnType<ReturnType<typeof createCaller>["admin"]["createUser"]>>;
  readonly row: UserRow;
}
