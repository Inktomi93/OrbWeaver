// The `pnpm brand-flow` verb: scan every world and write the JSON and the readable report under reports/brand-flow/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { rank, renderReport } from "./report.ts";
import { scanBrandFlow } from "./scan.ts";

const USAGE = "usage: pnpm brand-flow [--root=<dir>] [--out=<dir>]";
const DEFAULT_OUT = "reports/brand-flow";

const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

function parseArgs(argv: readonly string[]): { readonly root: string; readonly out: string } {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--(root|out)=(.+)$/u.exec(arg);
    if (match === null) {
      throw new UsageError(`${arg}: unknown argument\n${USAGE}`);
    }
    flags.set(match[1] ?? "", match[2] ?? "");
  }
  const root = resolve(flags.get("root") ?? process.cwd());
  return { root, out: resolve(root, flags.get("out") ?? DEFAULT_OUT) };
}

export function runBrandFlow(argv: readonly string[]): number {
  const { root, out } = parseArgs(argv);
  const report = scanBrandFlow({ root, log });
  const ranked = rank(report);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "brand-flow.json"), `${JSON.stringify({ ...report, ranked }, null, 1)}\n`);
  writeFileSync(join(out, "brand-flow.md"), renderReport(report, ranked));
  log(
    `scanned=${report.scanned.files} mints=${report.mints.length} widens=${report.widens.length} renarrows=${report.renarrows.length} missing=${report.missing.length} crossBrand=${report.crossBrand.length} doubleCounted=${report.scanned.doubleCounted} written to ${out}`,
  );
  return EXIT.clean;
}
