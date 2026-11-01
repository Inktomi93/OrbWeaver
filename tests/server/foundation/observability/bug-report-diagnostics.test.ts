// The owner's error census drops a log record that carries the box's database URL, as it does any other secret value.
// @subject packages/server/src/foundation/observability/bug-report-diagnostics.ts
// @subject packages/server/src/foundation/observability/debug/bug-report.ts
import { createBoundedRing } from "@orb/kit/bounded-ring";
import { DATABASE_URL_KEY } from "@orb/server/foundation/data-layout";
import { createBugReportDiagnosticsRead } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import { createTestEnv } from "@orb/testkit/node/composed";

// Passes the census's source grammar, so only the literal scrub can drop it.
const DATABASE_URL = "db.internal.example/primary";
const LOGGED_AT = "2026-10-31T00:00:00.000Z";
const RING_CAPACITY = 8;

function errorLine(msg: string): string {
  return JSON.stringify({ level: "error", time: LOGGED_AT, msg });
}

test("a record whose source is the database URL leaves the census, and an unrelated record stays", () => {
  const ring = createBoundedRing<string>(RING_CAPACITY);
  ring.push(errorLine(`${DATABASE_URL}: connection refused`));
  ring.push(errorLine("boot: refused"));
  const read = createBugReportDiagnosticsRead(createTestEnv({ [DATABASE_URL_KEY]: DATABASE_URL }), ring);
  expect(read({ includeServerErrors: true }).serverErrors).toMatchObject({ kind: "included", held: 2, records: [{ source: "boot" }] });
});
