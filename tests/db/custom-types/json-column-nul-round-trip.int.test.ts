// @subject packages/db/src/custom-types/index.ts
// A `mode: "json"` column stays on drizzle's own `text` because its JSON text spells a NUL as the escape `\u0000`, so
// no raw NUL reaches the driver and the value reads back whole. The same string as raw TEXT reads back cut.
import { auditLogs } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";

const NUL = "\0";
const HEAD = "Night";
const WITH_NUL = `${HEAD}${NUL}Watch`;

const CASES: readonly { readonly name: string; readonly value: JsonValue }[] = [
  { name: "a bare string", value: WITH_NUL },
  { name: "an object, in a key and in a value", value: { [WITH_NUL]: WITH_NUL, nested: [WITH_NUL] } },
];

test.for(CASES)("a NUL inside $name written to a JSON column reads back whole", async ({ value }, { harness, ids }) => {
  const id = ids.typeId(ID_PREFIX.auditLog);
  await harness.db.insert(auditLogs).values({ id, action: "probe.nul", metadata: value, createdAt: 1 });

  const rows = await harness.db
    .select({ metadata: auditLogs.metadata, stored: sql<string>`${auditLogs.metadata}`, rawText: sql<string>`${WITH_NUL}` })
    .from(auditLogs)
    .where(eq(auditLogs.id, id));
  // `stored` is the column's own text: the escape, never the character. `rawText` is the positive control: the driver
  // cuts a raw TEXT value at its first NUL, which is what the escape keeps from the column.
  expect(rows).toEqual([{ metadata: value, stored: JSON.stringify(value), rawText: HEAD }]);
});
