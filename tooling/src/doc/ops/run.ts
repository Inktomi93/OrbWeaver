// Command dispatch — one arm per DocCommand kind, each returning an exit code. A write verb's refusals
// print to stderr and exit 1 with nothing written; its writes print to stdout, one path per line.
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { DocCommand } from "../contract/types.ts";
import { USAGE } from "../lib/parse.ts";
import { drift, overview } from "./board.ts";
import { formatDocs, formatTargets } from "./format.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { newItem, newItemsFrom, setItems } from "./items.ts";
import { landItems, landMerged } from "./land.ts";
import { newAdr, newLaw, newPlan } from "./new.ts";
import { removeDocs } from "./remove.ts";
import { due, review } from "./review.ts";
import { setStatus } from "./status.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <verb>");

/** ONE truthful outcome: the written paths first, then the skips, then the refusals. "NOTHING WRITTEN" is
 *  said only when nothing was; a refusal that arrives beside writes (a failed landing commit) is reported
 *  as exactly that. */
function report(verb: string, outcome: WriteOutcome): ExitCode {
  for (const path of outcome.written) {
    print(path);
  }
  for (const line of outcome.skipped ?? []) {
    print(`skipped ${line}`);
  }
  if (outcome.refusals.length > 0) {
    const banner = outcome.written.length === 0 ? "NOTHING WRITTEN" : `wrote ${String(outcome.written.length)} file(s), then refused`;
    warn(`doc ${verb} — ${banner}; ${String(outcome.refusals.length)} refusal(s):\n${outcome.refusals.map((line) => `  ${line}`).join("\n")}`);
    return EXIT.violations;
  }
  print(`doc ${verb} — wrote ${String(outcome.written.length)} file(s)`);
  return EXIT.clean;
}

/** `pnpm doc format --write / --check`. Exit 1 = unformatted files under `--check` (a real violation the
 *  push gate reads), or — in EITHER mode — a file the formatter refused because formatting it would
 *  change what it renders or lose a code span the source carried.
 *
 *  THE EXIT CODE OF A REFUSAL IS 1, NEVER 2: a refusal is a VERDICT ABOUT THE DOCUMENT, not a checker
 *  that broke. The two censuses are machine-distinguishable by line prefix, never by prose: a refused
 *  file's line begins `REFUSED `; an unformatted file's line carries the bare path. */
function runFormat(write: boolean, explicit: readonly string[]): ExitCode {
  const files = formatTargets(explicit);
  const outcome = formatDocs(files, write);
  const verb = write ? "format:docs" : "check:docs";
  if (outcome.refused.length > 0) {
    warn(`${verb} — ${outcome.refused.length} file(s) REFUSED: formatting them would LOSE CONTENT (repair the markdown, not the formatter):`);
    for (const refusal of outcome.refused) {
      warn(`  REFUSED ${refusal.file}\n    ${refusal.reason.split("\n").join("\n    ")}`);
    }
  }
  if (write) {
    print(`format:docs — formatted ${outcome.dirty.length}/${outcome.scanned} file(s)`);
    return outcome.refused.length > 0 ? EXIT.violations : EXIT.clean;
  }
  // BOTH CENSUSES, ALWAYS — a refusal must never SWALLOW the dirty list.
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

function runDue(patterns: readonly string[]): ExitCode {
  const docs = due(patterns);
  for (const doc of docs) {
    print(
      `${doc.path}: reviewed ${doc.updated}; changed since: ${doc.changed.map((change) => `${change.path} (${change.date})`).join(", ")} — pnpm doc review ${doc.path}`,
    );
  }
  print(`doc due — ${String(docs.length)} document(s) due for review`);
  return EXIT.clean;
}

export function runDocCommand(command: DocCommand): ExitCode {
  switch (command.kind) {
    case "help":
      print(USAGE);
      return EXIT.clean;
    case "new-adr":
      return report("new adr", newAdr(command));
    case "new-plan":
      return report("new plan", newPlan(command));
    case "new-law":
      return report("new law", newLaw(command));
    case "item":
      return report("item", newItem(command.input));
    case "item-batch":
      return report("item", newItemsFrom(command.from));
    case "status":
      return report("status", setStatus({ status: command.status, paths: command.paths, by: command.by, docKind: command.docKind, blocked: command.blocked }));
    case "set":
      return report("set", setItems(command.ids, command.patch));
    case "remove":
      return report("remove", removeDocs(command.targets));
    case "land":
      return report("land", landItems(command.ids, command.evidence));
    case "land-merged":
      return report("land --merged", landMerged(undefined, undefined, command.headMerge));
    case "index":
      return report("index", { written: regenerateIndexes(), refusals: [] });
    case "review":
      return report("review", review(command.patterns));
    case "due":
      return runDue(command.patterns);
    case "overview":
      for (const line of overview()) {
        print(line);
      }
      return EXIT.clean;
    case "drift":
      for (const line of drift()) {
        print(line);
      }
      return EXIT.clean;
    case "format":
      return runFormat(command.write, command.files);
    default:
      return assertNever(command);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled command ${JSON.stringify(value)}`);
}
