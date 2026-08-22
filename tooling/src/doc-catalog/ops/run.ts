// The two drivers the cli dispatches to, each returning an EXIT code (never exiting itself — the
// exit-honesty runner owns process termination).
import { print } from "../../_shared/artifacts.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { CatalogMode, FormatMode, LaneConfig, State } from "../contract/types.ts";
import { migrationMetrics } from "../lib/debt.ts";
import { LANES_PATH, OUTPUT_PATH, STATE_PATH } from "../lib/vocab.ts";
import { bootstrap, catalogIsStale, expectedCatalog, ratchet, sync, writeCatalog } from "./catalog.ts";
import { formatDocs, formatTargets } from "./format.ts";
import { documents, json, laneAssignments, loadReceipts } from "./tree.ts";
import { validate } from "./validate.ts";

const WRITING_MODES = new Set<CatalogMode>(["--write", "--sync", "--ratchet"]);

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
  const errors = [...validate({ config, docs, assignments, receipts, state })];
  if (WRITING_MODES.has(mode)) {
    writeCatalog(expected);
  } else if (catalogIsStale(expected)) {
    errors.push(`${OUTPUT_PATH}: generated catalog is stale; run pnpm doc-catalog:write`);
  }
  if (errors.length > 0) {
    warn(`check:doc-catalog — ${errors.length} violation(s):\n${errors.map((error) => `  ${error}`).join("\n")}`);
    return EXIT.violations;
  }
  print(`check:doc-catalog — ${docs.length} documents; ${migrationMetrics(docs, receipts).pending} pending fact-checks`);
  return EXIT.clean;
}

/** `pnpm format:docs / check:docs`. Exit 1 = unformatted files under `--check` (a real violation the
 *  push gate reads); `--write` is always clean unless the formatter itself throws. */
export function runFormat(mode: FormatMode, explicit: readonly string[]): ExitCode {
  const files = formatTargets(explicit);
  const outcome = formatDocs(files, mode === "--write");
  if (mode === "--write") {
    print(`format:docs — formatted ${outcome.dirty.length}/${outcome.scanned} file(s)`);
    return EXIT.clean;
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
