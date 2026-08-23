// Generator for tooling/src/verify/gates/duplicate-action-doors.baseline.json — the #252 IA ratchet's SINGLE
// WRITER (GATE-AUTHORING.md §4.8). It re-runs the GATE'S OWN census (imported, never re-spelled) and writes
// {`<plane>::<procedure>` → the number of distinct components that invoke it}. Every row is DECLARED DEBT:
// a verb that already wears two doors on one plane. Re-run only to commit a SHRINK — a baseline that GROWS
// in a diff is the defect the gate exists to catch. Terminal state is `{}`, then delete both files.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { writeBaseline } from "../../gates/duplicate-action-doors.ts";
import { getProject } from "../../lib/harness.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline duplicate-action-doors");

/** The `baseline duplicate-action-doors` verb — the SINGLE writer of its committed baseline (GATE-AUTHORING §4.8). */
export function generateDuplicateActionDoorsBaseline(root: string): number {
  const rows = writeBaseline(getProject(root), root);
  process.stdout.write(`wrote ${rows} baseline rows\n`);
  return EXIT.clean;
}
