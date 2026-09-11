// One-shot generator for tooling/src/verify/gates/suppressions.baseline.json — the ratchet floor the
// suppressions gate reads. Runs the SAME detector and governed typed-source predicate as the gate (source
// AND tests since #962) and writes {repo-relative path → its budget} for files with ≥1 site. Re-run this
// ONLY on a sanctioned bulk shift; day-to-day the count can only fall.
//
// IT ALSO WRITES THE CLASS (#569), and it is the ONLY writer that may: a row's RATIFIED partition is
// DERIVED per marker from the gate's `RATIFIED_RULES` table, never hand-declared, and the gate re-derives it
// on every run and REDs a row whose declared partition the tree no longer earns. So a regenerate is the one
// way the classification changes, and it changes for a reason the table already states.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { serializeRow, writeLedgerFile } from "@orb/tooling/_shared/ratchet-rows";
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import { BASELINE_REL, classWhy, governedScope, governedSourceRel, ratifiedSiteCount } from "../../gates/suppressions.ts";
import { suppressionSites } from "../../lib/suppression-directive.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline suppressions");

/** The gate file is every ratified row's cite: each rule's reason is written once (per scope table), not
 *  copied per row. */
const RULE_TABLE_HOME = "tooling/src/verify/gates/suppressions.ts";

/** The `baseline suppressions` verb — the SINGLE writer of its committed baseline (GATE-AUTHORING §4.8). */
export function generateSuppressionsBaseline(root: string): number {
  const project = getWorkspace({ root });
  const rows: Record<string, number | Readonly<Record<string, unknown>>> = {};
  let total = 0;
  let ratifiedTotal = 0;

  for (const sf of project.getSourceFiles().sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()))) {
    const rel = governedSourceRel(root, sf.getFilePath());
    const scope = rel === undefined ? undefined : governedScope(rel);
    if (rel === undefined || scope === undefined) {
      continue;
    }
    const sites = suppressionSites(sf);
    if (sites.length === 0) {
      continue;
    }
    const ratified = ratifiedSiteCount(sites, scope);
    total += sites.length;
    ratifiedTotal += ratified;
    const why = classWhy(sites, scope);
    rows[rel] = serializeRow({
      subject: rel,
      count: sites.length,
      ratified,
      debt: sites.length - ratified,
      why,
      cite: ratified > 0 ? [RULE_TABLE_HOME] : [],
    });
  }

  const sorted = Object.fromEntries(Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)));
  writeLedgerFile(root, BASELINE_REL, sorted);
  process.stdout.write(
    `wrote ${Object.keys(sorted).length} files, ${total} sites (${total - ratifiedTotal} debt · ${ratifiedTotal} ratified) → ${BASELINE_REL}\n`,
  );
  return EXIT.clean;
}
