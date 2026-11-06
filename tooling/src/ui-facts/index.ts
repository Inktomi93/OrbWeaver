// ui-facts: a read-only census of hand-rolled UI over the client and ui sources. A report: no gate, no baseline.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { analyse } from "./analysis.ts";
import { loadExceptions } from "./exceptions.ts";
import { HAND_ROLLING_PART } from "./hand-model.ts";
import { renderReport } from "./report.ts";

const OUT_DIR = "reports/ui-facts";
const FLAGS = ["--only", "--out", "--root"] as const;
const REPORT_PARTS: readonly string[] = [HAND_ROLLING_PART];

interface Args {
  /** The sections to select, or null for the whole client. */
  readonly only: readonly string[] | null;
  /** Report parts to print alone, named in `--only` beside sections. */
  readonly parts: readonly string[];
  readonly out: string;
  readonly root: string;
}

function flag(argv: readonly string[], name: (typeof FLAGS)[number]): string | null {
  const hit = argv.find((arg) => arg.startsWith(`${name}=`));
  return hit === undefined ? null : hit.slice(name.length + 1);
}

export function parseArgs(argv: readonly string[]): Args {
  const unknown = argv.filter((arg) => !FLAGS.some((name) => arg.startsWith(`${name}=`)));
  if (unknown.length > 0) {
    throw new UsageError(`unknown argument ${unknown.join(" ")}; flags: ${FLAGS.map((name) => `${name}=<value>`).join(" ")}`);
  }
  const names =
    flag(argv, "--only")
      ?.split(",")
      .filter((name) => name !== "") ?? [];
  const sections = names.filter((name) => !REPORT_PARTS.includes(name));
  return {
    only: sections.length === 0 ? null : sections,
    parts: names.filter((name) => REPORT_PARTS.includes(name)),
    out: flag(argv, "--out") ?? OUT_DIR,
    root: flag(argv, "--root") ?? process.cwd(),
  };
}

export function runUiFacts(argv: readonly string[]): number {
  const args = parseArgs(argv);
  const facts = analyse(args.root, loadExceptions(args.root), args.only);
  const dir = join(args.root, args.out);
  mkdirSync(dir, { recursive: true });
  const command = `pnpm ui-facts${argv.length === 0 ? "" : ` ${argv.join(" ")}`}`;
  writeFileSync(join(dir, "ui-facts.json"), `${JSON.stringify(facts, null, 2)}\n`);
  writeFileSync(join(dir, "ui-facts.md"), `${renderReport(facts, command, args.parts)}\n`);
  const scanned = facts.scanned;
  process.stdout.write(
    `ui-facts: scanned ${scanned.total} files (${scanned.ts} ts, ${scanned.tsx} tsx, ${scanned.css} css), ${facts.sites.length} sites, wrote ${args.out}/ui-facts.{json,md}\n`,
  );
  return EXIT.clean;
}
