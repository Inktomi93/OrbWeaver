// The `pnpm unwired` verbs. `ports` writes the restated-port targets the derive codemod reads; the bare verb and the
// dead-inside-live verbs run both engines over every world and each write one report under reports/unwired/.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { DELIBERATE } from "./deliberate.ts";
import { scanFields } from "./fields.ts";
import { scanParams } from "./params.ts";
import { portCensus } from "./port-census.ts";
import type { ClusterGroup, Leg, PortTarget, TargetKind } from "./port-targets.ts";
import { CLUSTER_GROUPS, INFORMATIONAL_KINDS, LEGS } from "./port-targets.ts";
import type { ScanOptions } from "./scan.ts";
import { scanUnwired } from "./scan.ts";
import { scanShapes } from "./shapes.ts";
import { scanUnions } from "./unions.ts";
import { TEST_WORLDS } from "./worlds.ts";

const SCAN_VERBS = ["scan", "fields", "params", "unions", "shapes"] as const;
/** `scan`, the bare verb, is the member scan. */
type ScanVerb = (typeof SCAN_VERBS)[number];
const VERBS = [...SCAN_VERBS, "ports"] as const;
type Verb = (typeof VERBS)[number];

const CROSS_CHECK_FLAG = "--cross-check";
const USAGE = `usage: pnpm unwired [${SCAN_VERBS.slice(1).join("|")}] [--root=<dir>] [--out=<file>] [${CROSS_CHECK_FLAG}] | pnpm unwired ports [--root=<dir>] [--out=<file>] [--leg=<B|C|D|E|F>] [--cluster=<group>]`;
const DEFAULT_PORTS_OUT = "reports/unwired/port-targets.json";

interface Finding {
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly home: string;
  readonly member: string;
}

interface Report {
  readonly scanned: number;
  readonly unwired: readonly Finding[];
  readonly deliberate: readonly Finding[];
  readonly disagreements: readonly (string | object)[];
}

/** A scan verb's report path, and its run with the counts its summary line adds to the shared ones. */
interface Scan {
  readonly out: string;
  readonly execute: (options: ScanOptions) => { readonly report: Report; readonly counts: string };
}

function scan<Found extends Report>(out: string, run: (options: ScanOptions) => Found, counts: (report: Found) => string = () => ""): Scan {
  return {
    out,
    execute: (options): { readonly report: Report; readonly counts: string } => {
      const report = run(options);
      return { report, counts: counts(report) };
    },
  };
}

const SCANS: Readonly<Record<ScanVerb, Scan>> = {
  scan: scan("reports/unwired/unwired.json", scanUnwired, (report) => ` reachedByFlow=${report.reachedByFlow.length}`),
  fields: scan("reports/unwired/fields.json", scanFields),
  params: scan("reports/unwired/params.json", scanParams),
  unions: scan("reports/unwired/unions.json", scanUnions, (report) => ` enumerated=${report.enumerated.length}`),
  shapes: scan("reports/unwired/shapes.json", scanShapes),
};

interface Args {
  readonly verb: Verb;
  readonly root: string;
  readonly out: string | null;
  readonly leg: Leg | null;
  readonly cluster: ClusterGroup | null;
  /** Engine two asks the TypeScript 6 language service instead of TypeScript 7.1. */
  readonly crossCheck: boolean;
}

function oneOf<T extends string>(flag: string, value: string | null, allowed: readonly T[]): T | null {
  const found = allowed.find((candidate) => candidate === value);
  if (value !== null && found === undefined) {
    throw new UsageError(`--${flag}=${value}: expected one of ${allowed.join(", ")}`);
  }
  return found ?? null;
}

function parseArgs(argv: readonly string[]): Args {
  const [first] = argv;
  const named = VERBS.find((candidate) => candidate !== "scan" && candidate === first);
  const verb = named ?? "scan";
  const flags = new Map<string, string>();
  const rest = (named === undefined ? argv : argv.slice(1)).filter((arg) => arg !== CROSS_CHECK_FLAG);
  for (const arg of rest) {
    const match = /^--(root|out|leg|cluster)=(.+)$/u.exec(arg);
    if (match === null) {
      throw new UsageError(`${arg}: unknown argument\n${USAGE}`);
    }
    flags.set(match[1] ?? "", match[2] ?? "");
  }
  return {
    verb,
    root: resolve(flags.get("root") ?? process.cwd()),
    out: flags.get("out") ?? null,
    leg: oneOf("leg", flags.get("leg") ?? null, LEGS),
    cluster: oneOf("cluster", flags.get("cluster") ?? null, CLUSTER_GROUPS),
    crossCheck: argv.includes(CROSS_CHECK_FLAG),
  };
}

// The kinds whose data lands in packages/contracts, in the area of the concept's owner.
const CONTRACTS_MOVES: ReadonlySet<TargetKind> = new Set<TargetKind>(["move-to-contracts", "split"]);

const areaOfCluster = (cluster: string): string => cluster.slice(0, cluster.indexOf(":"));

// One concept: its owner, and every site a leg edits to finish it.
interface ClusterSummary {
  readonly cluster: string;
  readonly group: ClusterGroup;
  readonly owners: readonly string[];
  readonly sites: readonly string[];
}

// What a cluster group edits, so two groups can run side by side when their files, doors and contracts areas are disjoint.
interface GroupSummary {
  readonly group: ClusterGroup;
  readonly clusters: number;
  readonly targets: number;
  readonly files: readonly string[];
  readonly doors: readonly string[];
  readonly contracts: readonly string[];
}

const sorted = (values: Iterable<string>): readonly string[] => [...new Set(values)].sort();

function summarizeClusters(targets: readonly PortTarget[]): readonly ClusterSummary[] {
  const byCluster = new Map<string, PortTarget[]>();
  for (const target of targets) {
    byCluster.set(target.cluster, [...(byCluster.get(target.cluster) ?? []), target]);
  }
  return [...byCluster.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cluster, members]) => ({
      cluster,
      group: members[0]?.clusterGroup ?? "other",
      owners: sorted(members.map((target) => target.ownerAt)),
      sites: members.map((target) => `${target.file}:${target.line} ${target.kind} ${target.members.join(",")}`),
    }));
}

function summarizeGroup(group: ClusterGroup, targets: readonly PortTarget[]): GroupSummary {
  const mine = targets.filter((target) => target.clusterGroup === group);
  const files = sorted(mine.flatMap((target) => [target.file, ...target.exports.map((entry) => entry.file)]));
  const moves = mine.filter((target) => CONTRACTS_MOVES.has(target.kind)).map((target) => areaOfCluster(target.cluster));
  return {
    group,
    clusters: new Set(mine.map((target) => target.cluster)).size,
    targets: mine.length,
    files,
    doors: sorted([...files.filter((file) => file.endsWith("/index.ts")), ...moves.map((area) => `packages/server/src/domain/${area}/index.ts`)]),
    contracts: sorted([
      ...files.filter((file) => file.startsWith("packages/contracts/")).map((file) => file.replace(/^(packages\/contracts\/src\/[^/.]+).*$/u, "$1/")),
      ...moves.map((area) => `packages/contracts/src/${area}/`),
    ]),
  };
}

function write(root: string, out: string, body: unknown): string {
  const path = resolve(root, out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 1)}\n`);
  return path;
}

const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

export function runUnwired(argv: readonly string[]): number {
  const args = parseArgs(argv);
  if (args.verb === "ports") {
    const census = portCensus(args.root, log);
    const targets = census.targets.filter(
      (target) => (args.leg === null || target.leg === args.leg) && (args.cluster === null || target.clusterGroup === args.cluster),
    );
    const groups = (args.cluster === null ? CLUSTER_GROUPS : [args.cluster]).map((group) => summarizeGroup(group, targets));
    const path = write(args.root, args.out ?? DEFAULT_PORTS_OUT, { worlds: census.worlds, groups, clusters: summarizeClusters(targets), targets });
    const counts = new Map<string, number>();
    for (const target of targets) {
      const key = `${target.clusterGroup} ${target.kind}`;
      counts.set(key, (counts.get(key) ?? 0) + target.members.length);
    }
    for (const [key, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
      log(`${key}: ${count}`);
    }
    const open = targets.filter((target) => !INFORMATIONAL_KINDS.has(target.kind)).length;
    log(`targets=${open} informational=${targets.length - open} written to ${path}`);
    return EXIT.clean;
  }
  const chosen = SCANS[args.verb];
  const { report, counts } = chosen.execute({
    root: args.root,
    testWorlds: TEST_WORLDS.filter((config) => existsSync(join(args.root, config))),
    deliberate: DELIBERATE,
    log,
    crossCheck: args.crossCheck,
  });
  const path = write(args.root, args.out ?? chosen.out, report);
  for (const finding of report.unwired) {
    process.stdout.write(`${finding.kind}\t${finding.file}:${finding.line}\t${finding.home}.${finding.member}\n`);
  }
  log(
    `scanned=${report.scanned} unwired=${report.unwired.length} deliberate=${report.deliberate.length} disagreements=${report.disagreements.length}${counts} written to ${path}`,
  );
  return EXIT.clean;
}
