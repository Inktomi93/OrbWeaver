// Command dispatch — one arm per DocCommand kind, each returning an exit code. A write verb's refusals
// print to stderr and exit 1 with nothing written; its writes print to stdout, one path per line.
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { DocCommand } from "../contract/types.ts";
import { USAGE } from "../lib/parse.ts";
import { archive } from "./archive.ts";
import { drift, overview } from "./board.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { landItems, landMerged, newItem, setItems } from "./items.ts";
import { migrateLedger } from "./migrate-ledger.ts";
import { newAdr, newPlan } from "./new.ts";
import { due, review } from "./review.ts";
import { setStatus } from "./status.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <verb>");

function report(verb: string, outcome: WriteOutcome): ExitCode {
  if (outcome.refusals.length > 0) {
    warn(`doc ${verb} — NOTHING WRITTEN; ${String(outcome.refusals.length)} refusal(s):\n${outcome.refusals.map((line) => `  ${line}`).join("\n")}`);
    return EXIT.violations;
  }
  for (const path of outcome.written) {
    print(path);
  }
  print(`doc ${verb} — wrote ${String(outcome.written.length)} file(s)`);
  return EXIT.clean;
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

function runMigrate(command: Extract<DocCommand, { kind: "migrate-ledger" }>): ExitCode {
  const outcome = migrateLedger(command.range, command.apply);
  for (const line of outcome.planned) {
    print(line);
  }
  if (!command.apply && outcome.refusals.length === 0) {
    print(`doc migrate-ledger — dry run; ${String(outcome.planned.length)} ruling(s) would move (add --apply)`);
    return EXIT.clean;
  }
  return report("migrate-ledger", outcome);
}

export function runDocCommand(command: DocCommand): ExitCode {
  switch (command.kind) {
    case "help":
      print(USAGE);
      return EXIT.clean;
    case "new-adr":
      return report("new adr", newAdr(command.slug, command.title));
    case "new-plan":
      return report("new plan", newPlan(command.slug, command.title));
    case "item":
      return report(
        "item",
        newItem({ title: command.title, kind: command.itemKind, priority: command.priority, area: command.area, plan: command.plan, lane: command.lane }),
      );
    case "status":
      return report("status", setStatus({ status: command.status, paths: command.paths, by: command.by }));
    case "set":
      return report("set", setItems(command.ids, command.patch));
    case "land":
      return report("land", landItems(command.ids, command.evidence));
    case "land-merged":
      return report("land --merged", landMerged());
    case "archive":
      return report("archive", archive(command.targets));
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
    case "migrate-ledger":
      return runMigrate(command);
    default:
      return assertNever(command);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled command ${JSON.stringify(value)}`);
}
