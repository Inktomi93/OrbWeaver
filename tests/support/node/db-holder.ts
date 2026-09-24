// A process that holds an idle, already-used connection on a db file until it is killed: the running server
// between requests that a layout migration on the same volume must refuse to move the file under. A closed
// in-process handle is no substitute: it still holds the WAL lock after the close.

import { writeFileSync } from "node:fs";
import process from "node:process";
import { createDb } from "@orb/db";
import { sql } from "drizzle-orm";

const HOLD_TICK_MS = 60_000;

const [dbPath, readyPath] = process.argv.slice(2);
if (dbPath === undefined || readyPath === undefined) {
  throw new Error("usage: db-holder.ts <db path> <ready file>");
}
const db = await createDb(`file:${dbPath}`);
await db.all(sql`SELECT name FROM sqlite_master`);
writeFileSync(readyPath, "held");
setInterval(() => undefined, HOLD_TICK_MS);
