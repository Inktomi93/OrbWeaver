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

/** What the brand-flow scan cannot see, written into both reports and printed with every run. */
const BRAND_FLOW_LIMITS: readonly string[] = [
  "A widen is a brand handed to a slot whose type carries no brand; the receiver is not followed. A widen at a boundary is fine only where the receiver re-brands the string or reads it as that id, and the scan tells neither apart from a receiver that drops the id's meaning, except a re-brand by castId or a compare that the re-narrow pass links back to the widen. Judge a boundary widen by its receiver.",
  "A missing row is an id-named declaration typed string matched to a brand by its name (heuristic); a name no brand claims is listed as a generic id, not a defect.",
  "Each world scans only the files it is home to; a file in no tsconfig world (a codemod fixture, a script outside every world) is not scanned.",
  "A slot a library declares is the library layer; what the library does with the string is not followed.",
];

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
  writeFileSync(join(out, "brand-flow.json"), `${JSON.stringify({ ...report, ranked, limits: BRAND_FLOW_LIMITS }, null, 1)}\n`);
  writeFileSync(join(out, "brand-flow.md"), `${renderReport(report, ranked)}\n## Limits\n\n${BRAND_FLOW_LIMITS.map((limit) => `- ${limit}`).join("\n")}\n`);
  log(
    `scanned=${report.scanned.files} mints=${report.mints.length} widens=${report.widens.length} renarrows=${report.renarrows.length} missing=${report.missing.length} crossBrand=${report.crossBrand.length} doubleCounted=${report.scanned.doubleCounted} written to ${out}`,
  );
  log(["limits: what this scan cannot see", ...BRAND_FLOW_LIMITS.map((limit) => `- ${limit}`)].join("\n"));
  return EXIT.clean;
}
