// Runs the layout migration the way a boot does: in its own process, with no handle on the db before or
// after. A handle this process closes still holds the WAL lock, so a refused claim can only be retried by
// a new process; the report or the refusal lands in the named file and the process ends either way.

import { writeFileSync } from "node:fs";
import process from "node:process";
import { migrateDataLayout } from "@orb/server/entry/boot";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";

const [root, outcomePath] = process.argv.slice(2);
if (root === undefined || outcomePath === undefined) {
  throw new Error("usage: migrate-data-layout.ts <data root> <outcome file>");
}
const outcome = await migrateDataLayout({ layout: resolveDataLayout({ ["DATA_DIR"]: root }) }).then(
  (report) => ({ report }),
  (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }),
);
writeFileSync(outcomePath, JSON.stringify(outcome));
