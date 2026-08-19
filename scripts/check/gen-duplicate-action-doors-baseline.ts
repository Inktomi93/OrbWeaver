// Generator for scripts/check/gates/duplicate-action-doors.baseline.json — the #252 IA ratchet's SINGLE
// WRITER (GATE-AUTHORING.md §4.8). It re-runs the GATE'S OWN census (imported, never re-spelled) and writes
// {`<plane>::<procedure>` → the number of distinct components that invoke it}. Every row is DECLARED DEBT:
// a verb that already wears two doors on one plane. Re-run only to commit a SHRINK — a baseline that GROWS
// in a diff is the defect the gate exists to catch. Terminal state is `{}`, then delete both files.
import process from "node:process";
import { writeBaseline } from "./gates/duplicate-action-doors.ts";
import { getProject } from "./harness.ts";

const root = process.cwd();
const rows = writeBaseline(getProject(root), root);
process.stdout.write(`wrote ${rows} baseline rows\n`);
