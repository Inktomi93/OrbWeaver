// The two drivers the cli dispatches to, each returning an EXIT code (never exiting itself — the
// exit-honesty runner owns process termination).
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { CatalogMode, CatalogWriteRequest, Doc, FormatMode, Lane, LaneConfig, Receipt, State } from "../contract/types.ts";
import { debtPathFindings, migrationDebt, migrationMetrics } from "../lib/debt.ts";
import { CATALOG_DIR, LANES_PATH, OUTPUT_PATH, STATE_PATH } from "../lib/vocab.ts";
import {
  bootstrap,
  candidateTouchesCatalog,
  catalogIndexIsStale,
  catalogInputDirt,
  catalogIsStale,
  catalogSourcesMatchIndex,
  expectedCatalog,
  normalizeAuthoredArtifacts,
  ratchet,
  readCatalog,
  scopedCatalog,
  sync,
  unformattedArtifacts,
  writeCatalog,
} from "./catalog.ts";
import { formatDocs, formatTargets } from "./format.ts";
import { documents, indexChangedPaths, json, laneAssignments, loadReceipts, withCanonicalHashes, worktreeIndexChangedPaths } from "./tree.ts";
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

/** The violations only `--check` can raise: the generated artifact is what a write would land, and the
 *  hand-authored ones are in the form the repo's own formatter would keep. */
function checkOnlyErrors(config: LaneConfig, expected: string, changedIndexPaths: ReadonlySet<string> | null): readonly string[] {
  return [
    ...(catalogIsStale(expected) ? [`${OUTPUT_PATH}: generated catalog is stale; run pnpm doc-catalog:write`] : []),
    ...candidateCatalogErrors(config, expected, changedIndexPaths),
    ...unformattedArtifacts(config).map((path) => `${path}: not in the canonical (biome-formatted) form — run pnpm doc-catalog:write`),
  ];
}

/** The whole-tree write's guard (#2165): TRUE when it must not run, having said why. Uncommitted movement
 *  in the catalog's own inputs means this run would bake a sibling lane's in-flight work into a committed
 *  artifact under the caller's name — which is what happened, at 184 insertions, after a one-file re-attest. */
function wholeWriteIsRefused(changedIndexPaths: ReadonlySet<string> | null, worktreePaths: ReadonlySet<string> | null): boolean {
  const dirt = catalogInputDirt(changedIndexPaths, worktreePaths);
  if (dirt.length === 0) {
    return false;
  }
  warn(
    `doc-catalog:write — NOTHING WRITTEN. The whole-tree form regenerates EVERY row from the working tree, and ${String(dirt.length)} of the catalog's own inputs are uncommitted, so this run would bake them into a committed artifact under your name:\n${dirt.map((path) => `  ${path}`).join("\n")}\n  Name the documents instead: pnpm doc-catalog:write --paths <docs…>\n  Or, if you ARE the barrier and the whole tree is yours: pnpm doc-catalog:write --barrier`,
  );
  return true;
}

/** THE SCOPED WRITE DOOR (#2165) — `catalog --write --paths <docs…>`. All-or-nothing, and the refusal
 *  is the product: a named row that would land a violation is refused with NOTHING WRITTEN, which is the
 *  half the whole form gets wrong (it exits 1 on pre-existing debt and writes anyway, so `$?` cannot tell
 *  an operator what happened and they have to read `git diff` instead). Errors about documents the caller
 *  did NOT name are reported as context and never block — they are somebody else's row. */
function runScopedWrite(input: {
  readonly config: LaneConfig;
  readonly docs: readonly Doc[];
  readonly receipts: readonly Receipt[];
  readonly paths: readonly string[];
  readonly errors: readonly string[];
  readonly assignments: ReadonlyMap<string, Lane>;
  readonly state: State;
}): ExitCode {
  const named = new Set(input.paths);
  const selectedDebt = new Set(
    debtPathFindings(migrationDebt(input.docs, input.receipts), input.state.allowed)
      .filter((finding) => finding.path === null || named.has(finding.path))
      .map((finding) => finding.message),
  );
  const blocking = input.errors.filter((error) => selectedDebt.has(error) || named.has(error.slice(0, error.indexOf(":"))));
  const scoped = scopedCatalog({
    base: readCatalog(),
    named: input.paths,
    docs: input.docs,
    receipts: input.receipts,
    config: input.config,
    assignments: input.assignments,
  });
  const refusals = [...scoped.refusals, ...blocking];
  if (refusals.length > 0 || scoped.contents === undefined) {
    warn(`doc-catalog:write --paths — NOTHING WRITTEN; ${refusals.length} refusal(s):\n${refusals.map((error) => `  ${error}`).join("\n")}`);
    return EXIT.violations;
  }
  writeCatalog(scoped.contents);
  const elsewhere = input.errors.length - blocking.length;
  print(
    `doc-catalog:write — regenerated ${String(named.size)} row(s): ${input.paths.join(", ")}` +
      (elsewhere > 0 ? ` (${String(elsewhere)} pre-existing violation(s) on documents you did not name were left alone)` : ""),
  );
  return EXIT.clean;
}

/** `pnpm doc-catalog:* / check:doc-catalog`. Exit 1 = the corpus violates the receipt contract or the
 *  generated catalog is stale.
 *
 *  THE WHOLE-TREE WRITE IS A BARRIER OPERATION (#2165). It regenerates every row from the working tree,
 *  so on a busy day it sweeps every document any lane has touched into one commit under whoever ran it —
 *  measured: a ONE-FILE re-attest followed by this verb produced 184 insertions across every document
 *  that had changed that day, exit 1 on unrelated debt, and a written file. It now REFUSES while the
 *  catalog's input closure is dirty unless the caller says `--barrier`, and `--paths` is the everyday
 *  door. The `--sync`/`--ratchet` writes are unchanged: their subject IS the whole corpus by definition. */
export function runCatalog(mode: CatalogMode, request: CatalogWriteRequest = { paths: [], barrier: false }): ExitCode {
  const config = json<LaneConfig>(LANES_PATH);
  const docs = withCanonicalHashes(documents());
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
  const worktreePaths = worktreeIndexChangedPaths();
  const errors = [...validate({ config, docs, assignments, receipts, state, changedIndexPaths, worktreeIndexChangedPaths: worktreePaths })];
  if (mode === "--write" && request.paths.length > 0) {
    return runScopedWrite({ config, docs, receipts, paths: request.paths, errors, assignments, state });
  }
  if (mode === "--write" && !request.barrier && wholeWriteIsRefused(changedIndexPaths, worktreePaths)) {
    return EXIT.violations;
  }
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
    errors.push(...checkOnlyErrors(config, expected, changedIndexPaths));
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
