// The `pnpm brand-flow` verb: scan every world and write the JSON and the readable report under reports/brand-flow/.

import { closeSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import type { OptionalInventory, ProfileKind } from "../unwired/index.ts";
import { PROFILES, profileKinds, profileLines } from "../unwired/index.ts";
import { BrandFlowProfile } from "./profile.ts";
import { rank, renderReport } from "./report.ts";
import type { BrandFlowReport } from "./scan.ts";
import { scanBrandFlow } from "./scan.ts";

const USAGE = `usage: pnpm brand-flow [--root=<dir>] [--out=<dir>] [--world=<tsconfig>]... [--profile[=<${PROFILES.join("|")}>[,...]]]`;
const DEFAULT_OUT = "reports/brand-flow";
// Where the compiler and Node profiles of a profiled run are written, under the run's output directory.
const PROFILE_DIR = "profile";
const FLAG = /^--(root|out|world|profile)(?:=(.+))?$/u;
// `--profile` alone measures wall time, as it does for the unwired graph verbs.
const BARE_PROFILE = PROFILES[0];

/** What the brand-flow scan cannot see, written into both reports and printed with every run. */
const BRAND_FLOW_LIMITS: readonly string[] = [
  "A widen is a brand handed to a slot whose type carries no brand; the receiver is not followed. A widen at a boundary is fine only where the receiver re-brands the string or reads it as that id, and the scan tells neither apart from a receiver that drops the id's meaning, except a re-brand by castId or a compare that the re-narrow pass links back to the widen. Judge a boundary widen by its receiver.",
  "A missing row is an id-named declaration typed string matched to a brand by its name (heuristic); a name no brand claims is listed as a generic id, not a defect.",
  "An optional pair lists two fields seen at separate production constructions with no observed production co-set. A spread, a computed name, a later mutation or input constructed outside the program can supply both. A test co-set is positive evidence to review. Inherited and mapped slots are grouped by the contextual type at their construction; unresolved union arms and program-local type identities remain uncertain.",
  "Each world scans only the files it is home to; a file in no tsconfig world (a codemod fixture, a script outside every world) is not scanned.",
  "A slot a library declares is the library layer; what the library does with the string is not followed.",
];

const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

interface BrandFlowArgs {
  readonly root: string;
  readonly out: string;
  /** The worlds to scan; every world when absent. A narrowed run's report is not the tree's. */
  readonly worlds: readonly string[] | undefined;
  readonly profile: readonly ProfileKind[] | null;
}

// One argument's flag name and value; only `--profile` may go bare.
function flagOf(arg: string): { readonly name: string; readonly given: string } {
  const [, name, value] = FLAG.exec(arg) ?? [];
  const given = value ?? (name === "profile" ? BARE_PROFILE : undefined);
  if (name === undefined || given === undefined) {
    throw new UsageError(`${arg}: unknown argument\n${USAGE}`);
  }
  return { name, given };
}

function parseArgs(argv: readonly string[]): BrandFlowArgs {
  const flags = new Map<string, string>();
  const worlds: string[] = [];
  for (const arg of argv) {
    const { name, given } = flagOf(arg);
    if (name !== "world" && flags.has(name)) {
      throw new UsageError(`${arg}: --${name} given twice\n${USAGE}`);
    }
    if (name === "world") {
      worlds.push(given);
    } else {
      flags.set(name, given);
    }
  }
  const root = resolve(flags.get("root") ?? process.cwd());
  return {
    root,
    out: resolve(root, flags.get("out") ?? DEFAULT_OUT),
    worlds: worlds.length === 0 ? undefined : worlds,
    profile: profileKinds(flags.get("profile") ?? null),
  };
}

const TOP_GROUPS = 12;
const JSON_CHUNK = 256;

interface OptionalSummary {
  readonly scanned: BrandFlowReport["scanned"];
  readonly worlds: BrandFlowReport["worlds"];
  readonly groups: number;
  readonly fields: number;
  readonly pairs: number;
  readonly witnesses: number;
  readonly sets: number;
  readonly setMemberships: number;
  readonly top: readonly { readonly id: string; readonly owner: string; readonly pairs: number; readonly fields: number }[];
}

function summaryOf(report: BrandFlowReport): OptionalSummary {
  const counts = new Map<number, number>();
  for (const row of report.optionalAlternatives) {
    counts.set(row.group, (counts.get(row.group) ?? 0) + 1);
  }
  const top = report.optionalGroups
    .map((group, index) => ({ id: group.id, owner: group.owner, pairs: counts.get(index) ?? 0, fields: group.fields.length }))
    .sort((a, b) => b.pairs - a.pairs)
    .slice(0, TOP_GROUPS);
  return {
    scanned: report.scanned,
    worlds: report.worlds,
    groups: report.optionalGroups.length,
    fields: report.optionalGroups.reduce((total, group) => total + group.fields.length, 0),
    pairs: report.optionalAlternatives.length,
    witnesses: report.optionalWitnesses.length,
    sets: report.optionalWitnessSets.length,
    setMemberships: report.optionalWitnessSets.reduce((total, set) => total + set.length, 0),
    top,
  };
}

// Each constituent remains independently serializable even when their combined UTF-16 text would exceed V8's string ceiling.
function appendArray(fd: number, name: string, rows: OptionalInventory[keyof OptionalInventory]): void {
  writeFileSync(fd, `,\n${JSON.stringify(name)}:[`);
  for (let start = 0; start < rows.length; start += JSON_CHUNK) {
    const chunk = rows
      .slice(start, start + JSON_CHUNK)
      .map((row) => JSON.stringify(row))
      .join(",\n");
    writeFileSync(fd, (start === 0 ? "\n" : ",\n") + chunk);
  }
  writeFileSync(fd, "]");
}

function writeReport(out: string, report: BrandFlowReport, ranked: ReturnType<typeof rank>): number {
  const { optionalGroups, optionalAlternatives, optionalWitnesses, optionalWitnessSets, ...base } = report;
  const pending = join(out, `.brand-flow-${process.pid}.tmp`);
  const target = join(out, "brand-flow.json");
  try {
    const fd = openSync(pending, "w");
    try {
      writeFileSync(fd, JSON.stringify({ ...base, ranked, limits: BRAND_FLOW_LIMITS }, null, 1).slice(0, -1));
      appendArray(fd, "optionalGroups", optionalGroups);
      appendArray(fd, "optionalAlternatives", optionalAlternatives);
      appendArray(fd, "optionalWitnesses", optionalWitnesses);
      appendArray(fd, "optionalWitnessSets", optionalWitnessSets);
      writeFileSync(fd, "}\n");
    } finally {
      closeSync(fd);
    }
    renameSync(pending, target);
  } finally {
    rmSync(pending, { force: true });
  }
  return statSync(target).size;
}

export async function runBrandFlow(argv: readonly string[]): Promise<number> {
  const { root, out, worlds, profile: kinds } = parseArgs(argv);
  using profile = kinds === null ? null : await BrandFlowProfile.start(kinds, join(out, PROFILE_DIR), root);
  if (worlds !== undefined) {
    log(`scan narrowed to ${worlds.join(", ")}: this report is not the tree's`);
  }
  const report = scanBrandFlow({ root, log, profile, ...(worlds === undefined ? {} : { worlds }) });
  if (profile !== null) {
    const counts = new Map([
      ["worlds", report.worlds.length],
      ["files", report.scanned.files],
      ["mints", report.mints.length],
      ["widens", report.widens.length],
    ]);
    for (const line of profileLines(await profile.report(counts))) {
      log(line);
    }
  }
  const ranked = rank(report);
  mkdirSync(out, { recursive: true });
  const summary = summaryOf(report);
  const summaryPath = join(out, "optional-summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 1));
  log(
    `optional groups=${summary.groups} fields=${summary.fields} pairs=${summary.pairs} witnesses=${summary.witnesses} memberships=${summary.setMemberships}; ${summaryPath}`,
  );
  const bytes = writeReport(out, report, ranked);
  log(`brand-flow.json bytes=${bytes}`);
  writeFileSync(join(out, "brand-flow.md"), `${renderReport(report, ranked)}\n## Limits\n\n${BRAND_FLOW_LIMITS.map((limit) => `- ${limit}`).join("\n")}\n`);
  log(
    `scanned=${report.scanned.files} mints=${report.mints.length} widens=${report.widens.length} renarrows=${report.renarrows.length} missing=${report.missing.length} crossBrand=${report.crossBrand.length} doubleCounted=${report.scanned.doubleCounted} written to ${out}`,
  );
  log(["limits: what this scan cannot see", ...BRAND_FLOW_LIMITS.map((limit) => `- ${limit}`)].join("\n"));
  return EXIT.clean;
}
