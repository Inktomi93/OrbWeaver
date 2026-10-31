// The provider_rows namespace check: a plugin: id belongs to a plugin row and a bare id to an admin row, so the table itself
// keeps an admin write from reaching a user's claimed id. The inserts are the raw database input the check judges.
// @subject packages/db/src/schema/connection-bindings.ts

import { PLUGIN_PROVIDER_ID_PREFIX } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { freshDb } from "@orb/testkit/node/composed";
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

const PLUGIN_ROW = `${PLUGIN_PROVIDER_ID_PREFIX}acme/text`;
const insert = (id: string, origin: "admin" | "plugin"): SQL =>
  sql`insert into provider_rows (id, label, wire, auth, apis, catalog, metered, definition_hash, origin_kind)
    values (${id}, 'x', 'openai-compat', 'endpoint', '["chat-completions"]', 'url', 0, ${`hash-${id}`}, ${origin})`;

test("the table refuses an admin row on a plugin id and a plugin row on a bare id, and accepts each on its own namespace", async () => {
  const db = await freshDb();
  await db.run(insert("acme-endpoint", "admin"));
  await db.run(insert(PLUGIN_ROW, "plugin"));

  await expect(db.run(insert(`${PLUGIN_PROVIDER_ID_PREFIX}acme/squat`, "admin"))).rejects.toMatchObject({
    cause: { message: expect.stringContaining("provider_rows_namespace_check") },
  });
  await expect(db.run(insert("bare-id", "plugin"))).rejects.toMatchObject({ cause: { message: expect.stringContaining("provider_rows_namespace_check") } });
  const stored = await db.all<{ id: string }>(sql`select id from provider_rows order by id`);
  expect(stored.map((row) => row.id)).toEqual(["acme-endpoint", PLUGIN_ROW]);
});
