// Every schema change ships as a numbered migration (.claude/rules/db.md). drizzle-kit writes a snapshot beside each
// migration and diffs the next one from it, so the newest snapshot must already hold the live schema: a schema edit
// with no generated migration leaves statements here, and a hand-written SQL file with no snapshot leaves them too.
// @subject packages/db/src/migrations/meta/_journal.json
// @subject packages/db/src/schema/index.ts

import { users as usersTable } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { SchemaSnapshot } from "@orb/testkit/node/composed";
import { latestSchemaSnapshot, schemaStatementsSince } from "@orb/testkit/node/composed";
import { getTableName } from "drizzle-orm";

const USERS_TABLE = getTableName(usersTable);

/** The newest snapshot with one `users` column taken out: the live schema then carries a column no migration made. */
function withoutOneUsersColumn(snapshot: SchemaSnapshot): { readonly snapshot: SchemaSnapshot; readonly column: string } {
  const planted = structuredClone(snapshot);
  const users = planted.tables[USERS_TABLE];
  const column = Object.keys(users?.columns ?? {}).at(-1);
  if (users === undefined || column === undefined) {
    throw new Error("the newest snapshot has no users column to take out");
  }
  users.columns = Object.fromEntries(Object.entries(users.columns).filter(([name]) => name !== column));
  return { snapshot: planted, column };
}

test("the newest migration snapshot holds the live schema", async () => {
  expect(await schemaStatementsSince(await latestSchemaSnapshot())).toEqual([]);
});

test("a schema column the snapshot lacks is a statement the next migration must carry", async () => {
  const { snapshot, column } = withoutOneUsersColumn(await latestSchemaSnapshot());

  expect(await schemaStatementsSince(snapshot)).toEqual([expect.stringMatching(new RegExp(`ALTER TABLE \`${USERS_TABLE}\` ADD \`${column}\``, "u"))]);
});
