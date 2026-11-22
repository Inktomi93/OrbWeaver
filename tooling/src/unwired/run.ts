// The `pnpm unwired` verbs. `graph`, `graph-verify` and `graph-css` run the reference graph over the one merged
// program (./graph/scan.ts) and write its buckets, a member bucket's find-references verdicts, or the custom properties
// nothing reads; `graph-trial` deletes each finding of the named buckets in a throwaway snapshot (./graph/trial.ts). `ports` writes the restated-port targets the derive codemod reads; the bare verb runs engine
// one over every world, the dead-inside-live verbs run both engines except `codes`, `procedures` and `columns`, which run
// engine one and refuse `--cross-check`, and each writes one report under reports/unwired/ with its judged rows apart;
// `removed-keys` resolves every receiver site of a removed contract key and exits 1 while one still sends it; `coverage`
// runs the test suites with V8 coverage and writes what no run executed (./coverage.ts).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { TEST_WORLDS } from "../floor/testing/test-worlds.ts";
import { scanCodes } from "./codes.ts";
import { scanColumns } from "./columns.ts";
import { runCoverage } from "./coverage.ts";
import { DELIBERATE } from "./deliberate.ts";
import { scanFields } from "./fields.ts";
import type { MemberBucket } from "./graph/analyse.ts";
import { BUCKETS, MEMBER_BUCKETS } from "./graph/analyse.ts";
import { CSS_BUCKETS } from "./graph/css.ts";
import type { LostBreakdown } from "./graph/lost.ts";
import type { GraphOptions, ProfileKind } from "./graph/options.ts";
import { ABLATIONS, PROFILES, traceOf, whyTarget } from "./graph/options.ts";
import type { GraphProfileReport } from "./graph/profile.ts";
import { PROFILE_PHASES } from "./graph/profile.ts";
import type { Query, QueryAnswer } from "./graph/query.ts";
import type { GraphSessionReport } from "./graph/scan.ts";
import { cssGraph, queryGraph, scanGraph, trialGraph, verifyGraph } from "./graph/scan.ts";
import type { TrialBucket } from "./graph/trial.ts";
import { CONTROL_SIDES, TRIAL_BUCKETS, TRIAL_VERDICTS } from "./graph/trial.ts";
import { VERDICTS } from "./graph/verify.ts";
import type { JudgedEntry, StaleJudged } from "./judged.ts";
import { JUDGED_FIELDS } from "./judged-fields.ts";
import type { LiteralStage } from "./literal-hits.ts";
import { scanParams } from "./params.ts";
import { portCensus } from "./port-census.ts";
import type { ClusterGroup, Leg, PortTarget, TargetKind } from "./port-targets.ts";
import { CLUSTER_GROUPS, INFORMATIONAL_KINDS, LEGS } from "./port-targets.ts";
import { outsideTable, scanProcedures } from "./procedures.ts";
import { checkRemovedKeys } from "./removed-keys.ts";
import type { ScanOptions } from "./scan.ts";
import { scanUnwired } from "./scan.ts";
import { scanShapes } from "./shapes.ts";
import { scanUnions } from "./unions.ts";

/** `scan` is the member scan, and the bare invocation runs it. */
const SCAN_VERBS = ["scan", "fields", "params", "unions", "shapes", "codes", "procedures", "columns"] as const;
type ScanVerb = (typeof SCAN_VERBS)[number];
const VERBS = [...SCAN_VERBS, "ports", "removed-keys"] as const;
type Verb = (typeof VERBS)[number];

const CROSS_CHECK_FLAG = "--cross-check";
const COVERAGE_VERB = "coverage";
const TRIAL_VERB = "graph-trial";
const TRIAL_SYNOPSIS = `pnpm unwired ${TRIAL_VERB} --bucket=<${TRIAL_BUCKETS.join("|")}> [--bucket=<name>]... [--root=<dir>] [--out=<file>]`;
/** The reference-graph verbs: the buckets, a member bucket's find-references check, the custom-property pass, and the
 *  queries each name is asked (./graph/query.ts). */
const GRAPH_VERBS = ["graph", "graph-verify", "graph-css", "graph-why", "graph-users", "graph-impact", "graph-reach"] as const;
type GraphVerb = (typeof GRAPH_VERBS)[number];
const GRAPH_OUT: Readonly<Record<GraphVerb, string>> = {
  graph: "reports/unwired/graph.json",
  "graph-verify": "reports/unwired/graph-verify.json",
  "graph-css": "reports/unwired/graph-css.json",
  "graph-why": "reports/unwired/graph-why.json",
  "graph-users": "reports/unwired/graph-users.json",
  "graph-impact": "reports/unwired/graph-impact.json",
  "graph-reach": "reports/unwired/graph-reach.json",
};
// The query each query verb asks; the other graph verbs ask none.
const QUERY_OF: Readonly<Partial<Record<GraphVerb, Query>>> = { "graph-why": "why", "graph-users": "users", "graph-impact": "impact", "graph-reach": "reach" };
const GRAPH_SESSION_USAGE = `[--explain-lost] [--profile[=${PROFILES.join("|")}]] [--why=<member|Owner.member|file:line>]... [--files=<prefix>] [--trace=<axis:prop|tv|param-key[:prefix]|verify-chain>]... [--ablate=<${ABLATIONS.join("|")}>]... [--dump=<file>] [--from=<file>]`;
const USAGE = `usage: pnpm unwired [${SCAN_VERBS.join("|")}] [--root=<dir>] [--out=<file>] [${CROSS_CHECK_FLAG}] | pnpm unwired ports [--root=<dir>] [--out=<file>] [--leg=<B|C|D|E|F>] [--cluster=<group>] | pnpm unwired removed-keys [--root=<dir>] [--base=<rev>] [--head=<rev>] | pnpm unwired graph|graph-css [--root=<dir>] [--out=<file>] ${GRAPH_SESSION_USAGE} | pnpm unwired graph-why|graph-users|graph-impact|graph-reach <name|Owner.member|file:line|file>... [--root=<dir>] [--out=<file>] ${GRAPH_SESSION_USAGE} | pnpm unwired graph-verify --bucket=<${MEMBER_BUCKETS.join("|")}> [--sample=<n>] [--root=<dir>] [--out=<file>] ${GRAPH_SESSION_USAGE} | ${TRIAL_SYNOPSIS} | pnpm unwired ${COVERAGE_VERB} [--suites=node,ct,e2e] [--node=<file>]... [--ct=<file>]... [--e2e=<arg>]...`;
const DEFAULT_PORTS_OUT = "reports/unwired/port-targets.json";
const DEFAULT_BASE = "main";
const DEFAULT_HEAD = "HEAD";

/** What the ports census cannot see, written into its report and printed with every run. */
const PORT_LIMITS: readonly string[] = [
  "A value is followed only through a member, a forwarding lambda, a spread and a destructured member; a port member fed through a let hop is invisible, as the orb/derived-port-member rule's limit test holds.",
  "Two shapes are one concept only through a flow, a type reference or an alias; a look-alike with no flow is a review target until the distinct-lookalikes list judges it.",
  "A whole restated type with no port member is the shapes scan's row, not a ports target.",
  "A port reached only through a string-addressed registry, a JSON or scenario file, or from outside the tree is not a flow.",
];

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
  readonly staleJudged: readonly StaleJudged[];
  readonly disagreements: readonly (string | object)[];
  /** What the scan cannot see, printed after its summary. */
  readonly limits?: readonly string[];
}

/** A scan verb's report path, and its run with what its summary line adds to the bucket counts. */
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

function literalLine(stage: LiteralStage | null): string {
  if (stage === null) {
    return "literal stage: no git index at the root, so no row was searched";
  }
  const moved = Object.entries(stage.movedBy)
    .map(([kind, count]) => `${kind}:${String(count)}`)
    .join(",");
  return `literal stage: files=${String(stage.files)} ignored=${String(stage.ignored)} control=${stage.control.key}:${String(stage.control.hits)} dead ${String(stage.deadBefore)} -> ${String(stage.deadAfter)} moved=${moved} staleOnly=${String(stage.staleOnly)} ownHits=${String(stage.ownHits)} neverWritten ask=${String(stage.neverWritten.ask)} dead=${String(stage.neverWritten.dead)}`;
}

/** The scan verbs with no engine two, which refuse `--cross-check`. */
const ENGINE_ONE_VERBS: ReadonlySet<Verb> = new Set<Verb>(["codes", "procedures", "columns"]);

/** Each scan's judged list: the rows a board item owns. */
const JUDGED: Readonly<Record<ScanVerb, readonly JudgedEntry[]>> = {
  scan: [],
  fields: JUDGED_FIELDS,
  params: [],
  unions: [],
  shapes: [],
  codes: [],
  procedures: [],
  columns: [],
};

// Every list a report writes, by its name, so a new bucket reaches the summary line without a hand-kept count.
const NOT_A_BUCKET: ReadonlySet<string> = new Set(["limits"]);
const bucketCounts = (report: Report): string =>
  Object.entries(report)
    .flatMap(([name, value]: [string, unknown]) => (Array.isArray(value) && !NOT_A_BUCKET.has(name) ? [`${name}=${String(value.length)}`] : []))
    .join(" ");

const SCANS: Readonly<Record<ScanVerb, Scan>> = {
  scan: scan("reports/unwired/unwired.json", scanUnwired),
  fields: scan(
    "reports/unwired/fields.json",
    scanFields,
    (report) =>
      ` unplaced=${Object.entries(report.unresolvedByReason)
        .map(([reason, count]) => `${reason}:${count}`)
        .join(",")} sent=${Object.entries(report.sentBy)
        .map(([destination, count]) => `${destination}:${count}`)
        .join(",")}\n${literalLine(report.literalStage)}`,
  ),
  params: scan("reports/unwired/params.json", scanParams),
  unions: scan("reports/unwired/unions.json", scanUnions),
  shapes: scan("reports/unwired/shapes.json", scanShapes),
  codes: scan("reports/unwired/codes.json", scanCodes),
  procedures: scan("reports/unwired/procedures.json", scanProcedures, outsideTable),
  columns: scan("reports/unwired/columns.json", scanColumns),
};

interface Args {
  readonly verb: Verb;
  readonly root: string;
  readonly out: string | null;
  readonly leg: Leg | null;
  readonly cluster: ClusterGroup | null;
  /** Engine two asks the TypeScript 6 language service instead of TypeScript 7.1. */
  readonly crossCheck: boolean;
  /** The revisions `removed-keys` compares: the branch's head against its merge base with `base`. */
  readonly base: string;
  readonly head: string;
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
  const named = VERBS.find((candidate) => candidate === first);
  const verb = named ?? "scan";
  const flags = new Map<string, string>();
  const crossCheck = argv.includes(CROSS_CHECK_FLAG);
  if (crossCheck && ENGINE_ONE_VERBS.has(verb)) {
    throw new UsageError(`${CROSS_CHECK_FLAG}: ${verb} runs engine one only, so there is no engine two to cross-check\n${USAGE}`);
  }
  const rest = (named === undefined ? argv : argv.slice(1)).filter((arg) => arg !== CROSS_CHECK_FLAG);
  for (const arg of rest) {
    const match = /^--(root|out|leg|cluster|base|head)=(.+)$/u.exec(arg);
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
    crossCheck,
    base: flags.get("base") ?? DEFAULT_BASE,
    head: flags.get("head") ?? DEFAULT_HEAD,
  };
}

function runRemovedKeys(args: Args): number {
  const report = checkRemovedKeys({ root: args.root, base: args.base, head: args.head });
  for (const { key, senders, loose, unresolved, other } of report.removed) {
    for (const hit of senders) {
      process.stdout.write(`sender\t${key}\t${hit.receiver}\t${hit.at}\t${hit.text}\n`);
    }
    for (const hit of loose) {
      process.stdout.write(`loose\t${key}\t${hit.receiver}\t${hit.at}\t${hit.destination}\t${hit.text}\n`);
    }
    for (const hit of unresolved) {
      process.stdout.write(`unresolved\t${key}\t${hit.receiver}\t${hit.at}\t${hit.reason}\t${hit.text}\n`);
    }
    process.stdout.write(`other\t${key}\t${String(other)} sites on another member\n`);
  }
  const scanned = Object.entries(report.scanned)
    .map(([receiver, files]) => `${receiver}:${files}`)
    .join(",");
  log(
    `${report.base}...${report.head}: removed=${report.removed.length} scanned=${scanned} ${report.failed ? "FAILED: a removed key still has a sender" : "no sender"}`,
  );
  return report.failed ? EXIT.violations : EXIT.clean;
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

// The checkout that holds `root`: a scan rooted in a package still files its report under the repository's `reports/`,
// the one place `.gitignore` covers. A root outside any checkout keeps its own.
function checkoutOf(root: string): string {
  for (let dir = root; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    if (dirname(dir) === dir) {
      return root;
    }
  }
}

function write(root: string, out: string, body: unknown): string {
  const path = resolve(checkoutOf(root), out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 1)}\n`);
  return path;
}

const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

const logLimits = (limits: readonly string[]): void => {
  log(["limits: what this scan cannot see", ...limits.map((limit) => `- ${limit}`)].join("\n"));
};

interface GraphArgs {
  readonly verb: GraphVerb;
  readonly root: string;
  readonly out: string;
  readonly bucket: MemberBucket | null;
  readonly sample: number | null;
  /** The names a query verb asks about. */
  readonly names: readonly string[];
  readonly options: GraphOptions;
}

const GRAPH_FLAG = /^--(root|out|bucket|sample|profile|why|files|trace|ablate|dump|from|explain-lost)(?:=(.+))?$/u;
const VERIFY_FLAGS: ReadonlySet<string> = new Set(["bucket", "sample"]);
// The flags a run may repeat; every other flag takes one value.
const REPEATED_FLAGS: ReadonlySet<string> = new Set(["why", "trace", "ablate"]);
const PROFILE_FLAG = "profile";
const EXPLAIN_LOST_FLAG = "explain-lost";
const FLAG_PREFIX = "--";
// What only a build can do: a run whose graph comes from a dump refuses them.
const BUILD_FLAGS = ["why", "files", "ablate", "dump"] as const;
const PROFILE_DIR_SUFFIX = ".profile";
// The profiles the compiler writes while it builds the graph: a run from a dump builds none.
const COMPILER_PROFILES: ReadonlySet<ProfileKind> = new Set<ProfileKind>(["cpu", "heap"]);

// A flag's value when it is given bare: `--profile` profiles wall time, `--explain-lost` takes none.
const BARE_VALUES: ReadonlyMap<string, string> = new Map([
  [PROFILE_FLAG, PROFILES[0]],
  [EXPLAIN_LOST_FLAG, ""],
]);

// One flag's name and value, refused when the verb takes no such flag, it repeats a single flag, or its value is wrong.
function graphFlag(verb: GraphVerb, arg: string, flags: ReadonlyMap<string, readonly string[]>): { readonly name: string; readonly given: string } {
  const [, name = "", value] = GRAPH_FLAG.exec(arg) ?? [];
  const known = name !== "" && (verb === "graph-verify" || !VERIFY_FLAGS.has(name));
  const given = value ?? BARE_VALUES.get(name);
  if (!known || given === undefined || (flags.has(name) && !REPEATED_FLAGS.has(name)) || (name === EXPLAIN_LOST_FLAG && value !== undefined)) {
    throw new UsageError(`${arg}: unknown or repeated argument\n${USAGE}`);
  }
  return { name, given };
}

function graphFlags(verb: GraphVerb, argv: readonly string[]): { readonly flags: ReadonlyMap<string, readonly string[]>; readonly names: readonly string[] } {
  const flags = new Map<string, string[]>();
  const names: string[] = [];
  for (const arg of argv) {
    if (!arg.startsWith(FLAG_PREFIX) && QUERY_OF[verb] !== undefined) {
      names.push(arg);
      continue;
    }
    const { name, given } = graphFlag(verb, arg, flags);
    flags.set(name, [...(flags.get(name) ?? []), given]);
  }
  if (QUERY_OF[verb] !== undefined && names.length === 0) {
    throw new UsageError(`${verb} needs a name to ask about\n${USAGE}`);
  }
  return { flags, names };
}

const single = (flags: ReadonlyMap<string, readonly string[]>, name: string): string | null => flags.get(name)?.[0] ?? null;

function parsed<T>(flag: string, values: readonly string[], read: (value: string) => T | null): readonly T[] {
  return values.map((value) => {
    const found = read(value);
    if (found === null) {
      throw new UsageError(`--${flag}=${value}: not a ${flag} this verb reads\n${USAGE}`);
    }
    return found;
  });
}

function graphOptions(flags: ReadonlyMap<string, readonly string[]>, profileDir: string): GraphOptions {
  const from = single(flags, "from");
  const traces = parsed("trace", flags.get("trace") ?? [], traceOf);
  const built = [...BUILD_FLAGS.filter((name) => flags.has(name)), ...traces.filter(({ kind }) => kind !== "verify-chain").map(() => "trace")];
  if (from !== null && built.length > 0) {
    throw new UsageError(`--from reads a built graph; --${built.join(", --")} act on a build\n${USAGE}`);
  }
  const profile = oneOf(PROFILE_FLAG, single(flags, PROFILE_FLAG), PROFILES);
  if (from !== null && profile !== null && COMPILER_PROFILES.has(profile)) {
    throw new UsageError(`--from reads a built graph; --profile=${profile} profiles the compiler's build\n${USAGE}`);
  }
  return {
    profile: profile === null ? null : { kind: profile, dir: profileDir },
    why: parsed("why", flags.get("why") ?? [], whyTarget),
    files: single(flags, "files"),
    traces,
    ablate: new Set(parsed("ablate", flags.get("ablate") ?? [], (value) => oneOf("ablate", value, ABLATIONS))),
    dump: single(flags, "dump"),
    from,
    explainLost: flags.has(EXPLAIN_LOST_FLAG),
  };
}

function parseGraphArgs(verb: GraphVerb, argv: readonly string[]): GraphArgs {
  const { flags, names } = graphFlags(verb, argv);
  const bucket = oneOf("bucket", single(flags, "bucket"), MEMBER_BUCKETS);
  if (verb === "graph-verify" && bucket === null) {
    throw new UsageError(`graph-verify needs --bucket\n${USAGE}`);
  }
  const sample = single(flags, "sample");
  if (sample !== null && !/^[1-9]\d*$/u.test(sample)) {
    throw new UsageError(`--sample=${sample}: expected a positive count`);
  }
  const root = resolve(single(flags, "root") ?? process.cwd());
  const out = single(flags, "out") ?? GRAPH_OUT[verb];
  const at = resolve(checkoutOf(root), out);
  return {
    verb,
    root,
    out,
    bucket,
    sample: sample === null ? null : Number(sample),
    names,
    options: graphOptions(flags, `${at.slice(0, at.length - extname(at).length)}${PROFILE_DIR_SUFFIX}`),
  };
}

// A compiler profile's functions shown on stderr; the report keeps every one.
const SHOWN_PROFILE_ENTRIES = 20;

const ms = (value: number): string => `${String(Math.round(value))}ms`;

function logProfile(profile: GraphProfileReport): void {
  log(`profile phases ${PROFILE_PHASES.map((phase) => `${phase}=${ms(profile.phases[phase])}`).join(" ")} (resolve, origin and fixpoint overlap walk)`);
  if (profile.world !== null) {
    const { batches, rounds, sent, memoHits } = profile.world;
    log(
      `profile requests batches=${String(batches)} rounds=${String(rounds)} sent=${String(sent)} memo-hits=${String(memoHits)} rss-peak=${String(profile.rssPeakMb)}MB`,
    );
  }
  if (profile.timing !== null) {
    const { requestCount, roundTripMs, serverTimeMs, transportOverheadMs } = profile.timing;
    log(`profile checker requests=${String(requestCount)} round-trip=${ms(roundTripMs)} server=${ms(serverTimeMs)} transport=${ms(transportOverheadMs)}`);
  }
  const { p50, p95, p99, max } = profile.fileQuantiles;
  log(`profile files=${String(profile.files.length)} p50=${ms(p50)} p95=${ms(p95)} p99=${ms(p99)} max=${ms(max)}; above p99:`);
  for (const { file, ms: took } of profile.files.filter((entry) => entry.ms > p99)) {
    log(`  ${ms(took)}\t${file}`);
  }
  log(
    `profile counts ${Object.entries({
      ...profile.counts,
      ...Object.fromEntries(Object.entries(profile.peaks).map(([name, value]) => [`peak ${name}`, value])),
    })
      .map(([name, value]) => `${name}=${String(value)}`)
      .join("; ")}`,
  );
  for (const { axis, file, causes } of profile.dynamicAxes) {
    log(`profile dynamic axis ${file}:${axis} <- ${causes.join(", ")}`);
  }
  if (profile.compiler !== null) {
    const { kind, path, summary } = profile.compiler;
    log(
      `profile ${kind} ${path}: ${summary.sampleType} total=${String(summary.total)}; top ${String(SHOWN_PROFILE_ENTRIES)} of ${String(summary.entries.length)} by cumulative (a display cut; the report keeps every function)`,
    );
    for (const { name, flat, cumulative } of summary.entries.slice(0, SHOWN_PROFILE_ENTRIES)) {
      log(`  cum=${String(cumulative)}\tflat=${String(flat)}\t${name}`);
    }
  }
}

// What the run ran under, before its tallies: a narrowed, ablated or dumped run says so.
function logSession(session: GraphSessionReport): void {
  if (session.ablated.length > 0) {
    log(`ablated ${session.ablated.join(", ")}: these buckets are not the tree's`);
  }
  if (session.files !== null) {
    log(`walk narrowed to ${session.files}: these buckets are not the tree's`);
  }
  if (session.dumped !== null) {
    log(`graph dumped (built at ${session.dumped.builtAt} from ${session.dumped.head ?? "no git checkout"})`);
  }
  for (const entry of session.why) {
    log(`why ${entry.target}\t${entry.member} (${entry.declared})\t${entry.role}\t${entry.site}\tvia ${entry.via}`);
  }
  if (session.lost !== null) {
    logLost(session.lost);
  }
  if (session.profile !== null) {
    logProfile(session.profile);
  }
}

// How many receivers or members each group shows on stderr: a display cut only, the JSON keeps every one.
const LOST_SHOWN = 3;

function logLost(lost: LostBreakdown): void {
  log(
    `lost reads ${String(lost.total)}: ${Object.entries(lost.bySource)
      .map(([source, count]) => `${source}=${String(count)}`)
      .join(" ")}`,
  );
  for (const { alias, members, reads, homes } of lost.unions) {
    log(`  ${String(reads)}\t${alias ?? "inline"} [${members.join(", ")}]${homes.length > 0 ? `\thome ${homes.join("; ")}` : ""}`);
  }
  log(`lost reads by slot (top ${String(LOST_SHOWN)} receivers each; the JSON holds all):`);
  for (const { slot, detail, reads, sample, receivers } of lost.bySlot) {
    log(`  ${String(reads)}\t${slot}${detail === null ? "" : ` (${detail})`}\t${sample}`);
    for (const { receiver, reads: held, sample: at } of receivers.slice(0, LOST_SHOWN)) {
      log(`    ${String(held)}\t${receiver}\t${at}`);
    }
  }
  log(`reads ended at a library's own declaration ${String(lost.library.total)} (top ${String(LOST_SHOWN)} members each; the JSON holds all):`);
  for (const { library, reads, members } of lost.library.byLibrary) {
    log(`  ${String(reads)}\t${library}`);
    for (const { member, reads: held, sample } of members.slice(0, LOST_SHOWN)) {
      log(`    ${String(held)}\t.${member}\t${sample}`);
    }
  }
}

const QUERY_EDGE = { run: "", typ: " (type)" } as const;

function answerLines(answer: QueryAnswer): readonly string[] {
  if (answer.query === "why") {
    return answer.chains.flatMap(({ start, path }) => [`  from ${start}`, ...path.map(({ label, via }) => `    -> ${label}${QUERY_EDGE[via]}`)]);
  }
  if (answer.query === "impact") {
    return [...answer.files.map(({ file, product }) => `  ${product ? "product" : "outside"}\t${file}`), ...answer.roots.map((root) => `  root\t${root}`)];
  }
  return answer.nodes.map(({ label, depth, via }) => `  ${String(depth)}\t${label}${QUERY_EDGE[via]}`);
}

function logAnswer(answer: QueryAnswer): void {
  process.stdout.write(`${answer.query} ${answer.asked}: ${answer.starts.length === 0 ? "matches nothing" : answer.starts.join("; ")}\n`);
  for (const line of answerLines(answer)) {
    process.stdout.write(`${line}\n`);
  }
}

async function runGraphQuery(args: GraphArgs, query: Query): Promise<number> {
  const result = await queryGraph(args.root, { query, names: args.names }, log, args.options);
  const path = write(args.root, args.out, result);
  for (const answer of result.answers) {
    logAnswer(answer);
  }
  logSession(result.session);
  log(`${query} names=${String(args.names.length)} written to ${path}`);
  return EXIT.clean;
}

async function runGraphCss(args: GraphArgs): Promise<number> {
  const report = await cssGraph(args.root, log, args.options);
  const path = write(args.root, args.out, report);
  for (const bucket of CSS_BUCKETS) {
    for (const entry of report.buckets[bucket]) {
      process.stdout.write(`${bucket}\t${entry}\n`);
    }
  }
  logSession(report.session);
  const counts = Object.entries(report.counts).map(([name, count]) => `${name}=${String(count)}`);
  log(`${[...CSS_BUCKETS.map((bucket) => `${bucket}=${String(report.buckets[bucket].length)}`), ...counts].join(" ")} written to ${path}`);
  return EXIT.clean;
}

async function runGraphVerify(args: GraphArgs, bucket: MemberBucket): Promise<number> {
  const { verification, session } = await verifyGraph(args.root, { bucket, sample: args.sample }, log, args.options);
  const path = write(args.root, args.out, { ...verification, session });
  for (const entry of verification.entries.filter(({ verdict }) => verdict !== "confirmed")) {
    process.stdout.write(`${entry.verdict}\t${entry.label}\t${entry.reads.join(",")}${entry.chains === undefined ? "" : `\t${entry.chains.join(" | ")}`}\n`);
  }
  logSession(session);
  const tally = VERDICTS.map((verdict) => `${verdict}=${String(verification.entries.filter((entry) => entry.verdict === verdict).length)}`);
  log(`${bucket} sample=${String(verification.entries.length)} of ${String(verification.total)} ${tally.join(" ")} written to ${path}`);
  return EXIT.clean;
}

async function runGraphScan(args: GraphArgs): Promise<number> {
  const graph = await scanGraph(args.root, log, args.options);
  const path = write(args.root, args.out, graph);
  for (const bucket of BUCKETS) {
    for (const finding of graph.analysis[bucket]) {
      process.stdout.write(`${bucket}\t${finding.label}${finding.note === null ? "" : `\t${finding.note}`}\n`);
    }
  }
  logSession(graph.session);
  log(
    `files=${String(graph.files)} ${BUCKETS.map((bucket) => `${bucket}=${String(graph.analysis[bucket].length)}`).join(" ")} lost-reads=${String(graph.lostReads.length)} written to ${path}`,
  );
  return EXIT.clean;
}

async function runGraph(args: GraphArgs): Promise<number> {
  const query = QUERY_OF[args.verb];
  if (query !== undefined) {
    return await runGraphQuery(args, query);
  }
  if (args.verb === "graph-css") {
    return await runGraphCss(args);
  }
  return args.verb === "graph-verify" && args.bucket !== null ? await runGraphVerify(args, args.bucket) : await runGraphScan(args);
}

const TRIAL_OUT = "reports/unwired/graph-trial.json";
const TRIAL_USAGE = `usage: ${TRIAL_SYNOPSIS}`;
const TRIAL_FLAG = /^--(root|out|bucket)=(.+)$/u;

interface TrialArgs {
  readonly root: string;
  readonly out: string;
  readonly buckets: readonly TrialBucket[];
}

function parseTrialArgs(argv: readonly string[]): TrialArgs {
  const buckets: TrialBucket[] = [];
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const [, name = "", value = ""] = TRIAL_FLAG.exec(arg) ?? [];
    if (name === "") {
      throw new UsageError(`${arg}: unknown argument\n${TRIAL_USAGE}`);
    }
    const bucket = name === "bucket" ? oneOf(name, value, TRIAL_BUCKETS) : null;
    if (bucket === null) {
      flags.set(name, value);
    } else {
      buckets.push(bucket);
    }
  }
  if (buckets.length === 0) {
    throw new UsageError(`${TRIAL_VERB} needs --bucket\n${TRIAL_USAGE}`);
  }
  return { root: resolve(flags.get("root") ?? process.cwd()), out: flags.get("out") ?? TRIAL_OUT, buckets };
}

async function runGraphTrial(args: TrialArgs): Promise<number> {
  const report = await trialGraph(args.root, args.buckets, log);
  const path = write(args.root, args.out, report);
  for (const trial of report.trials.filter(({ verdict }) => verdict !== "confirmed")) {
    const errors = trial.errors.map(({ at, code, kind }) => `${at} TS${String(code)} ${kind}`).join(",");
    process.stdout.write(`${trial.verdict}\t${trial.bucket}\t${trial.label}\t${trial.note ?? errors}\n`);
  }
  for (const row of report.control.filter(({ side }) => side !== "agree")) {
    process.stdout.write(`control-${row.side}\t${row.at}\t${row.name}\t${row.code === null ? "" : `TS${String(row.code)}`}\t${row.graph}\n`);
  }
  for (const bucket of new Set(args.buckets)) {
    const mine = report.trials.filter((trial) => trial.bucket === bucket);
    log(
      `${bucket} trials=${String(mine.length)} ${TRIAL_VERDICTS.map((verdict) => `${verdict}=${String(mine.filter((trial) => trial.verdict === verdict).length)}`).join(" ")}`,
    );
  }
  const sides = CONTROL_SIDES.map((side) => `${side}=${String(report.control.filter((row) => row.side === side).length)}`);
  log(`control ${sides.join(" ")} written to ${path}`);
  return EXIT.clean;
}

const graphVerb = (verb: string | undefined): GraphVerb | undefined => GRAPH_VERBS.find((candidate) => candidate === verb);

// The verbs that run asynchronously: `coverage` runs the test suites with its own flags, and the graph verbs load the
// analysed tree's knip config and design system.
function asyncVerb(argv: readonly string[]): Promise<number> | undefined {
  if (argv[0] === COVERAGE_VERB) {
    return runCoverage(argv.slice(1), log);
  }
  if (argv[0] === TRIAL_VERB) {
    return runGraphTrial(parseTrialArgs(argv.slice(1)));
  }
  const graph = graphVerb(argv[0]);
  return graph === undefined ? undefined : runGraph(parseGraphArgs(graph, argv.slice(1)));
}

export function runUnwired(argv: readonly string[]): number | Promise<number> {
  const later = asyncVerb(argv);
  if (later !== undefined) {
    return later;
  }
  const args = parseArgs(argv);
  if (args.verb === "removed-keys") {
    return runRemovedKeys(args);
  }
  if (args.verb === "ports") {
    const census = portCensus(args.root, log);
    const targets = census.targets.filter(
      (target) => (args.leg === null || target.leg === args.leg) && (args.cluster === null || target.clusterGroup === args.cluster),
    );
    const groups = (args.cluster === null ? CLUSTER_GROUPS : [args.cluster]).map((group) => summarizeGroup(group, targets));
    const path = write(args.root, args.out ?? DEFAULT_PORTS_OUT, {
      worlds: census.worlds,
      groups,
      clusters: summarizeClusters(targets),
      targets,
      limits: PORT_LIMITS,
    });
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
    logLimits(PORT_LIMITS);
    return EXIT.clean;
  }
  const chosen = SCANS[args.verb];
  const { report, counts } = chosen.execute({
    root: args.root,
    testWorlds: TEST_WORLDS.filter((config) => existsSync(join(args.root, config))),
    deliberate: DELIBERATE,
    judged: JUDGED[args.verb],
    log,
    crossCheck: args.crossCheck,
  });
  const path = write(args.root, args.out ?? chosen.out, report);
  for (const finding of report.unwired) {
    process.stdout.write(`${finding.kind}\t${finding.file}:${finding.line}\t${finding.home}.${finding.member}\n`);
  }
  for (const entry of report.staleJudged) {
    process.stdout.write(`stale-judged\t${entry.stale}\t${entry.key}\t${String(entry.item)}\n`);
  }
  log(`scanned=${report.scanned} ${bucketCounts(report)}${counts} written to ${path}`);
  if (report.limits !== undefined) {
    logLimits(report.limits);
  }
  return EXIT.clean;
}
