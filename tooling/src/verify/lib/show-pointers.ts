// `pnpm check:show --pointers` — POINTER LIVENESS (#2502 deliverable 4).
//
// THE WEEK-DARK CASE. `reports/test-report-tooling.json` sat on a 2026-09-13 slot for a week while every
// `tests:tooling` verdict was read as a run that had happened. Nothing was broken: the alias resolved, the
// JSON parsed, the numbers were real — they were just LAST WEEK'S. Only a reader that knows the instrument's
// newest COMPLETE run can say so, which is why this is a view over the shared resolver and not a per-tool
// check each instrument would have to remember to write.
//
// WHY THIS IS A READER AND NOT A GATE OR A VERIFY STAGE — the decision, with its reasons:
//   · `reports/` is GITIGNORED and per-checkout. A gate judges the TREE; this judges local run history, so a
//     gate here would be red or green by accident of which suites this box happened to run, and RED on a
//     fresh clone that has run nothing. A gate whose verdict is not about the tree is noise with authority.
//   · A verify STAGE would be judging artifacts its own run is in the middle of writing.
//   · `ledgers:fresh` owns COMMITTED single-writer ledgers; nothing here is committed.
//   · And staleness is not a DEFECT — it is a PROVENANCE FACT. `test-report-tooling.json` is legitimately
//     older than `test-report.json` after any product-only test run; as a standing red that row would be
//     permanently lit and permanently ignored, which is how the week happened in the first place. The fact
//     has to arrive AT READ TIME, at the moment somebody is about to misread it. That is what
//     `pointerAdvisories` does for every resolver-backed reader, and what this view inventories on demand.

import type { PointerResolution } from "@orb/tooling/_shared/artifact-pointer";
import { pointerAdvisories, publishedPointers } from "@orb/tooling/_shared/artifact-pointer";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { ShowInk } from "./show-policy.ts";

export interface PointerView {
  readonly lines: readonly string[];
  readonly exit: number;
}

/** Fresh is the only state that is not a finding: everything else means a reader of that alias gets bytes
 *  that are not the instrument's current answer. */
function isFinding(res: PointerResolution): boolean {
  return res.state !== "fresh";
}

function row(res: PointerResolution, ink: ShowInk): string {
  const mark = isFinding(res) ? ink.red("✗") : ink.green("✓");
  const when = res.publishedAt === null ? "never published" : `published ${res.publishedAt}`;
  return `${mark} ${ink.bold(res.alias)} [${res.instrument}] ${res.state} · ${when} · ${res.runId ?? "<no run>"}`;
}

/** THE INVENTORY. Every depth-1 published pointer under `reports/`, resolved against its instrument's newest
 *  complete run. Exit 1 when any pointer is not serving that run — a FINDING, in the exit contract's own
 *  vocabulary — and 3 when there is nothing here to measure at all, which is never rendered as a clean zero
 *  (the scanned count rides every verdict for exactly that reason). */
export function pointerView(root: string, ink: ShowInk): PointerView {
  const rows = publishedPointers(root);
  if (rows.length === 0) {
    throw new UsageError(
      "check:show --pointers — no published run pointers under reports/ on this checkout, so there is NOTHING TO MEASURE (not 'nothing is stale').\n" +
        "  Run `pnpm check` / `pnpm test` first; the inventory reads the aliases a completed run publishes.",
    );
  }
  const findings = rows.filter(isFinding);
  const lines = [
    ink.dim(
      `(${rows.length} published pointer(s) under reports/ — depth-1 verdict aliases only; the --out-keyed families under reports/<kind>/ name their own runs by design, #1164)`,
    ),
    "",
    ...rows.map((res) => row(res, ink)),
  ];
  for (const res of findings) {
    lines.push("", ...pointerAdvisories(res).map((a) => ink.red(`  ${a}`)));
  }
  lines.push(
    "",
    findings.length === 0
      ? ink.green(`✓ all ${rows.length} pointer(s) serve their instrument's newest complete run`)
      : ink.red(`✗ ${findings.length}/${rows.length} pointer(s) do NOT serve their instrument's newest complete run`),
  );
  return { lines, exit: findings.length === 0 ? EXIT.clean : EXIT.violations };
}
