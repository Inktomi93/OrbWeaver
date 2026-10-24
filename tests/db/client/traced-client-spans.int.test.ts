// The real database wrapper records each query's success and failure as spans and still closes natively.

import { closeDb, createDb } from "@orb/db";
import { getTraceByRequestId, withRequestSpan, wrapLibSqlClient } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import { sql } from "drizzle-orm";

const DB_ROOT = "traced-client.request";

test("the real DB wrapper records query results and failures without breaking native close", async ({ ids }) => {
  const db = await createDb(":memory:", wrapLibSqlClient);
  using lifetime = new DisposableStack();
  lifetime.defer(() => closeDb(db));
  const successId = `db-success:${ids.uuid()}`;
  await withRequestSpan(successId, DB_ROOT, {}, async () => {
    expect(await db.get<{ answer: number }>(sql`SELECT 7 AS answer`)).toEqual({ answer: 7 });
  });
  const succeeded = getTraceByRequestId(successId);
  expect(succeeded).toMatchObject({ status: "ok", totals: { spanCount: 2, dbSpanCount: 1 } });
  const root = succeeded?.spans.find((entry) => entry.name === DB_ROOT);
  expect(succeeded?.spans.find((entry) => entry.name === "db.execute")).toMatchObject({
    parentSpanId: root?.spanId,
    status: "ok",
    attributes: { "db.method": "execute", "db.rows": 1, "db.sql": "SELECT 7 AS answer" },
  });
  const failureId = `db-failure:${ids.uuid()}`;
  await expect(withRequestSpan(failureId, DB_ROOT, {}, () => db.get(sql`SELECT * FROM missing_migration_table`))).rejects.toThrow();
  const failed = getTraceByRequestId(failureId);
  expect(failed).toMatchObject({ status: "error", totals: { spanCount: 2, dbSpanCount: 1 } });
  expect(failed?.spans.find((entry) => entry.name === "db.execute")).toMatchObject({
    status: "error",
    events: [expect.objectContaining({ name: "exception" })],
  });
  lifetime.dispose();
  await expect(db.get(sql`SELECT 7 AS answer`)).rejects.toThrow();
});
