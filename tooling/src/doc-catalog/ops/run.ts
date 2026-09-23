// The two drivers the cli dispatches to, each returning an EXIT code (never exiting itself — the
// exit-honesty runner owns process termination).
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { CatalogMode, FormatMode, LaneConfig, State } from "../contract/types.ts";
import { migrationMetrics } from "../lib/debt.ts";
import { LANES_PATH, OUTPUT_PATH, STATE_PATH } from "../lib/vocab.ts";
import { catalogIsStale, expectedCatalog, normalizeAuthoredArtifacts, ratchet, sync, unformattedArtifacts, writeCatalog } from "./catalog.ts";
import { formatDocs, formatTargets } from "./format.ts";
import { documents, json, laneAssignments, loadReceipts } from "./tree.ts";
import { validate } from "./validate.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

const WRITING_MODES = new Set<CatalogMode>(["--write", "--sync", "--ratchet"]);

/** The violations only `--check` can raise: the generated artifact is what a write would land, and the
 *  hand-authored ones are in the form the repo's own formatter would keep. */
function checkOnlyErrors(config: LaneConfig, expected: string): readonly string[] {
  return [
    ...(catalogIsStale(expected) ? [`${OUTPUT_PATH}: generated catalog is stale; run pnpm doc-catalog:write`] : []),
    ...unformattedArtifacts(config).map((path) => `${path}: not in the canonical (biome-formatted) form — run pnpm doc-catalog:write`),
  ];
}

/** `pnpm doc-catalog:* / check:doc-catalog`. Exit 1 = the corpus violates the inventory contract (a
 *  document with no row, a row with no document, a bad authority, frontmatter debt outside the ratchet)
 *  or the generated inventory is stale. The inventory carries no content hash, so a prose edit reds
 *  nothing here; a document added, removed or re-kinded regenerates the whole file with `--write`. */
export function runCatalog(mode: CatalogMode): ExitCode {
  const config = json<LaneConfig>(LANES_PATH);
  const docs = documents();
  const assignments = laneAssignments(config, docs);
  if (mode === "--sync") {
    sync(config, docs, assignments);
  }
  if (mode === "--ratchet") {
    ratchet(docs);
  }
  const receipts = loadReceipts(config);
  const state = json<State>(STATE_PATH);
  const expected = expectedCatalog(docs, assignments, receipts);
  const errors = [...validate({ config, docs, assignments, receipts, state })];
  if (WRITING_MODES.has(mode)) {
    writeCatalog(expected);
    for (const path of normalizeAuthoredArtifacts(config)) {
      print(`doc-catalog — reformatted ${path}`);
    }
  } else {
    errors.push(...checkOnlyErrors(config, expected));
  }
  if (errors.length > 0) {
    warn(`check:doc-catalog — ${errors.length} violation(s):\n${errors.map((error) => `  ${error}`).join("\n")}`);
    return EXIT.violations;
  }
  const debt = migrationMetrics(docs);
  print(
    `check:doc-catalog — ${docs.length} documents; frontmatter debt ${debt.missingFrontmatter} missing, ${debt.invalidFrontmatter} invalid, ${debt.malformedFrontmatter} malformed`,
  );
  return EXIT.clean;
}

/** `pnpm format:docs / check:docs`. Exit 1 = unformatted files under `--check` (a real violation the
 *  push gate reads), or — in EITHER mode — a file the formatter refused because formatting it would
 *  change what it renders (#2067) or lose a code span the source carried (#2235).
 *
 *  THE EXIT CODE OF A REFUSAL IS 1, NEVER 2, and the distinction is the whole contract: a refusal is a
 *  VERDICT ABOUT THE DOCUMENT (this file has a defect an author must repair), not a checker that broke.
 *  Exit 2 would tell every reader the run produced no verdict at all and that the other N files were
 *  never judged, which is false — they were judged and they passed.
 *
 *  THE TWO CENSUSES ARE MACHINE-DISTINGUISHABLE, by line prefix and not by prose. A refused file's line
 *  begins `REFUSED `; an unformatted file's line carries the bare path, the shape the barrier already
 *  reads. A caller asking "did the formatter refuse, or is this ordinary dirt?" keys on that token
 *  rather than on the banner sentence above it. */
export function runFormat(mode: FormatMode, explicit: readonly string[]): ExitCode {
  const files = formatTargets(explicit);
  const outcome = formatDocs(files, mode === "--write");
  // #2067: a refusal means the formatted bytes would RENDER differently — the file was left alone on
  // purpose and the fix is an authoring one (a table whose body rows out-width its header, an unbalanced
  // backtick run). It reds BOTH doors: a silent skip under `--write` is how a lossy edit would hide.
  if (outcome.refused.length > 0) {
    warn(
      `${mode === "--write" ? "format:docs" : "check:docs"} — ${outcome.refused.length} file(s) REFUSED: formatting them would LOSE CONTENT (repair the markdown, not the formatter):`,
    );
    for (const refusal of outcome.refused) {
      warn(`  REFUSED ${refusal.file}\n    ${refusal.reason.split("\n").join("\n    ")}`);
    }
  }
  if (mode === "--write") {
    print(`format:docs — formatted ${outcome.dirty.length}/${outcome.scanned} file(s)`);
    return outcome.refused.length > 0 ? EXIT.violations : EXIT.clean;
  }
  // BOTH CENSUSES, ALWAYS — a refusal must never SWALLOW the dirty list. Returning here on the first
  // refusal (the shape before #2235) made `check:docs` print "2 file(s)" on a corpus carrying 163
  // unformatted ones: the refusal arm going from 0 to 2 would have read as the debt evaporating, and the
  // barrier's reformat plans off this number.
  if (outcome.dirty.length === 0) {
    if (outcome.refused.length > 0) {
      return EXIT.violations;
    }
    print(`check:docs — ${outcome.scanned} file(s) formatted`);
    return EXIT.clean;
  }
  warn(`check:docs — ${outcome.dirty.length} file(s) not formatted (run \`pnpm format:docs\`):`);
  for (const file of outcome.dirty) {
    warn(`  ${file}`);
  }
  return EXIT.violations;
}
