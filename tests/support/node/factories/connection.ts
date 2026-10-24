// The Connection row and result shapes; the reads that return them live in the rows tier (`rows/connection.ts`).

import type { userConnections } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";

export type ConnectionService = ServicesResult["services"]["connection"];

export type UserConnectionRow = typeof userConnections.$inferSelect;
