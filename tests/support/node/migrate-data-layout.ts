// Runs the layout migration the way a boot does: in its own process, with no handle on the db before or
// after. A handle this process closes still holds the WAL lock, so a refused claim can only be retried by
// a new process; the report or the refusal lands in the named file and the process ends either way.
// Optional keeper keys resolve the layout and SESSION_SECRET as a boot's env would; the production logger's
// warnings ride the outcome, oldest first.

import { writeFileSync } from "node:fs";
import process from "node:process";
import { createBoundedRing } from "@orb/kit/bounded-ring";
import { migrateDataLayout } from "@orb/server/entry/boot";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { createLogger } from "@orb/server/foundation/observability";
import { z } from "zod";
import { createTestEnv } from "./env.ts";

const WARNING_CAPACITY = 64;
const [root, outcomePath, keepersJson] = process.argv.slice(2);
if (root === undefined || outcomePath === undefined) {
  throw new Error("usage: migrate-data-layout.ts <data root> <outcome file> [keeper keys as JSON]");
}
const keepers = z.record(z.string(), z.string()).parse(JSON.parse(keepersJson ?? "{}"));
const warnings = createBoundedRing<string>(WARNING_CAPACITY);
const outcome = await migrateDataLayout({
  layout: resolveDataLayout({ ["DATA_DIR"]: root, ...keepers }),
  env: { ["SESSION_SECRET"]: keepers["SESSION_SECRET"], ["NODE_ENV"]: "test" },
  logger: createLogger(createTestEnv({ ["LOG_LEVEL"]: "warn" }).LOG_LEVEL, warnings),
}).then(
  (report) => ({ report }),
  (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }),
);
const logged = warnings
  .recent()
  .reverse()
  .map((line): unknown => JSON.parse(line));
writeFileSync(outcomePath, JSON.stringify({ ...outcome, warnings: logged }));
