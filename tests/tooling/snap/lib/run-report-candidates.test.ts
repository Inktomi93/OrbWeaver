// THE READER CRASHED ON A FILE ITS OWN WRITER PUT THERE. `reports/runs/snap/` holds one DIRECTORY per
// run slot and, beside them, the retention ring's `.pruned.jsonl` ledger (`_shared/run-retention.ts`).
// `localSnapRunIndexPaths` read every `readdir` entry as a slot and statted `<entry>/run.json`, which over
// the ledger raises ENOTDIR rather than ENOENT — so `pnpm snap --reports` exited 2 with TOOL ERROR on
// every checkout whose ring had ever fired. Found 2026-09-04 by the #1315 fold's floor; the repair is
// that a NON-DIRECTORY entry simply has no run index, and this is the pin that keeps it that way.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { localSnapRunIndexPaths } from "../../../../tooling/src/snap/lib/run-report-candidates.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the retention ledger sitting beside the run slots is an absent index, never a thrown reader", async ({ scratch }) => {
  const runs = join(scratch, "reports", "runs", "snap");
  await mkdir(join(runs, "slot-with-index"), { recursive: true });
  await mkdir(join(runs, "slot-without-index"), { recursive: true });
  await writeFile(join(runs, "slot-with-index", "run.json"), "{}\n");
  // The exact file the ring writes, and the exact reason the stat raises ENOTDIR instead of ENOENT.
  await writeFile(join(runs, ".pruned.jsonl"), '{"runId":"x","prunedAt":"2026-09-04T00:00:00.000Z"}\n');

  // THE POSITIVE CONTROL rides the same call: a bare empty list would also "not throw", so the assertion
  // is that the real slot is still FOUND while the ledger and the index-less slot are both skipped.
  await expect(localSnapRunIndexPaths(scratch)).resolves.toEqual([join(runs, "slot-with-index", "run.json")]);
});
