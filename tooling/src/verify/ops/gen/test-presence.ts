// Generator for tooling/src/verify/gates/test-presence.baseline.json — the #767 widening's SINGLE WRITER
// (GATE-AUTHORING.md §4.8). It re-runs the GATE'S OWN residual census (imported, never re-spelled) and writes
// {`<repo-relative domain file>` → 1} for every file the demand-by-default arm newly demands and the tree does
// not yet test. Every row is DECLARED DEBT — the burn-down is board row 772, one family at a time. Re-run only
// to commit a SHRINK; a baseline that GROWS in a diff is a domain file that shipped without its test.
// Terminal state is `{}`, then delete this file, the baseline, and the gate's ratchet reader.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { writeBaseline } from "../../gates/test-presence.ts";
import { getProject } from "../../lib/harness.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline test-presence");

/** The `baseline test-presence` verb — the SINGLE writer of its committed baseline (GATE-AUTHORING §4.8). */
export function generateTestPresenceBaseline(root: string): number {
  const rows = writeBaseline(getProject(root), root);
  process.stdout.write(`wrote ${rows} baseline rows\n`);
  return EXIT.clean;
}
