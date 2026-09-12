// The two drivers the cli dispatches to, each returning an EXIT code (never exiting itself — the
// exit-honesty runner owns process termination).
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { CatalogMode, FormatMode, LaneConfig, State } from "../contract/types.ts";
import { migrationMetrics } from "../lib/debt.ts";
import { CATALOG_DIR, LANES_PATH, OUTPUT_PATH, STATE_PATH } from "../lib/vocab.ts";
import {
  bootstrap,
  candidateTouchesCatalog,
  catalogIndexIsStale,
  catalogIsStale,
  catalogSourcesMatchIndex,
  expectedCatalog,
  normalizeAuthoredArtifacts,
  ratchet,
  sync,
  unformattedArtifacts,
  writeCatalog,
} from "./catalog.ts";
import { formatDocs, formatTargets } from "./format.ts";
import { documents, indexChangedPaths, json, laneAssignments, loadReceipts, worktreeIndexChangedPaths } from "./tree.ts";
import { validate } from "./validate.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

const WRITING_MODES = new Set<CatalogMode>(["--write", "--sync", "--ratchet"]);

function candidateCatalogErrors(config: LaneConfig, expected: string, changedIndexPaths: ReadonlySet<string> | null): readonly string[] {
  if (!candidateTouchesCatalog(changedIndexPaths)) {
    return [];
  }
  const errors: string[] = [];
  if (!catalogSourcesMatchIndex(config)) {
    errors.push(`${CATALOG_DIR}: candidate Git index is missing current lane, receipt, or state source bytes`);
  }
  if (catalogIndexIsStale(expected)) {
    errors.push(`${OUTPUT_PATH}: candidate Git index is stale; stage the regenerated catalog`);
  }
  return errors;
}

/** `pnpm doc-catalog:* / check:doc-catalog`. Exit 1 = the corpus violates the receipt contract or the
 *  generated catalog is stale; the write verbs land the artifact and still report violations. */
export function runCatalog(mode: CatalogMode): ExitCode {
  const config = json<LaneConfig>(LANES_PATH);
  const docs = documents();
  const assignments = laneAssignments(config, docs);
  if (mode === "--bootstrap") {
    bootstrap(config, docs, assignments);
    print(`doc-catalog — bootstrapped ${docs.length} documents`);
    return EXIT.clean;
  }
  if (mode === "--sync") {
    sync(config, docs, assignments);
  }
  let receipts = loadReceipts(config);
  if (mode === "--ratchet") {
    ratchet(docs, receipts);
    receipts = loadReceipts(config);
  }
  const state = json<State>(STATE_PATH);
  const expected = expectedCatalog(docs, assignments, receipts);
  const changedIndexPaths = indexChangedPaths();
  const errors = [...validate({ config, docs, assignments, receipts, state, changedIndexPaths, worktreeIndexChangedPaths: worktreeIndexChangedPaths() })];
  if (WRITING_MODES.has(mode)) {
    writeCatalog(expected);
    // #968: the receipts are HAND-attested, so a lane can leave JSON the repo's own formatter rejects —
    // and nothing in this tool ever looked at their FORM, so the red surfaced later in `lint:biome`
    // attributed to whoever next regenerated. The write verbs now land the canonical form; `--check`
    // (below) reds on drift. This retires the manual `biome check --write docs/catalog/` step.
    for (const path of normalizeAuthoredArtifacts(config)) {
      print(`doc-catalog — reformatted ${path}`);
    }
  } else {
    if (catalogIsStale(expected)) {
      errors.push(`${OUTPUT_PATH}: generated catalog is stale; run pnpm doc-catalog:write`);
    }
    errors.push(...candidateCatalogErrors(config, expected, changedIndexPaths));
    for (const path of unformattedArtifacts(config)) {
      errors.push(`${path}: not in the canonical (biome-formatted) form — run pnpm doc-catalog:write`);
    }
  }
  if (errors.length > 0) {
    warn(`check:doc-catalog — ${errors.length} violation(s):\n${errors.map((error) => `  ${error}`).join("\n")}`);
    return EXIT.violations;
  }
  print(`check:doc-catalog — ${docs.length} documents; ${migrationMetrics(docs, receipts).pending} pending fact-checks`);
  return EXIT.clean;
}

/** `pnpm format:docs / check:docs`. Exit 1 = unformatted files under `--check` (a real violation the
 *  push gate reads), or — in EITHER mode — a file the formatter refused because formatting it would
 *  change what it renders (#2067). */
export function runFormat(mode: FormatMode, explicit: readonly string[]): ExitCode {
  const files = formatTargets(explicit);
  const outcome = formatDocs(files, mode === "--write");
  // #2067: a refusal means the formatted bytes would RENDER differently — the file was left alone on
  // purpose and the fix is an authoring one (a table whose body rows out-width its header, an unbalanced
  // backtick run). It reds BOTH doors: a silent skip under `--write` is how a lossy edit would hide.
  if (outcome.refused.length > 0) {
    warn(
      `${mode === "--write" ? "format:docs" : "check:docs"} — ${outcome.refused.length} file(s) NOT FORMATTED: formatting them would change what they render (repair the markdown, not the formatter):`,
    );
    for (const file of outcome.refused) {
      warn(`  ${file}`);
    }
  }
  if (mode === "--write") {
    print(`format:docs — formatted ${outcome.dirty.length}/${outcome.scanned} file(s)`);
    return outcome.refused.length > 0 ? EXIT.violations : EXIT.clean;
  }
  if (outcome.refused.length > 0) {
    return EXIT.violations;
  }
  if (outcome.dirty.length === 0) {
    print(`check:docs — ${outcome.scanned} file(s) formatted`);
    return EXIT.clean;
  }
  warn(`check:docs — ${outcome.dirty.length} file(s) not formatted (run \`pnpm format:docs\`):`);
  for (const file of outcome.dirty) {
    warn(`  ${file}`);
  }
  return EXIT.violations;
}
