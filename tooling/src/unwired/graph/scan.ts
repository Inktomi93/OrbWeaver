// One graph session: the roots, the merged program and the build (or a dump's graph), then the analysis, the
// find-references check of a member bucket, the delete trial of named buckets, the custom-property pass, the DOM-hook
// pass, the unions scan, the codes scan, the removed-keys check, the shapes scan or the columns scan over it. Every result carries what
// the session ran under, so a narrowed, ablated or dumped run is never read as a fresh build of the whole tree.
import { mkdirSync } from "node:fs";
import type { NativeWorld } from "../native.ts";
import type { Analysis, MemberBucket } from "./analyse.ts";
import { analyse } from "./analyse.ts";
import type { Graph } from "./build.ts";
import { buildGraph, openGraphWorld } from "./build.ts";
import type { CodesJudging, CodesReport } from "./codes.ts";
import { codesPass } from "./codes.ts";
import type { ColumnsOptions, ColumnsReport } from "./columns.ts";
import { COLUMN_HOMES, columnsPass } from "./columns.ts";
import type { CssReport } from "./css.ts";
import { cssPass } from "./css.ts";
import type { DomReport } from "./dom.ts";
import { domPass } from "./dom.ts";
import type { DumpStamp } from "./dump.ts";
import { readDump, writeDump } from "./dump.ts";
import type { JudgedMembers, MemberRulings } from "./judge.ts";
import { judgeMembers, NO_RULINGS } from "./judge.ts";
import type { LostBreakdown } from "./lost.ts";
import { explainLost } from "./lost.ts";
import type { Ablation, GraphLog, GraphOptions } from "./options.ts";
import { FRESH_BUILD, tracing } from "./options.ts";
import type { ParamsLists, ParamsReport } from "./params.ts";
import { PARAMS_HOMES, paramsPass } from "./params.ts";
import { readPprof } from "./pprof.ts";
import type { ProceduresOptions, ProceduresReport } from "./procedures.ts";
import { PROCEDURE_HOMES, proceduresOf } from "./procedures.ts";
import type { CompilerProfile, GraphProfileReport, ProfilePhase } from "./profile.ts";
import { GraphProfile } from "./profile.ts";
import type { Query, QueryAnswer } from "./query.ts";
import { GraphQueries } from "./query.ts";
import type { RemovedKeysOptions, RemovedKeysReport } from "./removed-keys.ts";
import { nothingRemoved, removedKeysPass, removedKeysPlan } from "./removed-keys.ts";
import type { CarrySink, CarryStep } from "./roles.ts";
import { loadRoots } from "./roots.ts";
import type { ShapesOptions, ShapesReport } from "./shapes.ts";
import { shapesPass } from "./shapes.ts";
import type { BuildSession } from "./state.ts";
import { productReader } from "./state.ts";
import type { TrialBucket, TrialReach, TrialReport } from "./trial.ts";
import { runTrials } from "./trial.ts";
import type { UnionsOptions, UnionsReport } from "./unions.ts";
import { scanUnionsOnGraph } from "./unions.ts";
import type { Verified } from "./verify.ts";
import { evenSample, verifyFindings } from "./verify.ts";
import type { WhyEntry } from "./why.ts";
import { carriedEntries } from "./why.ts";

/** A graph scan's buckets and what the build counted on the way. */
export interface GraphScan {
  readonly files: number;
  readonly analysis: Analysis;
  /** The member buckets split by the deliberate and judged lists. */
  readonly members: JudgedMembers;
  readonly counts: readonly { readonly name: string; readonly count: number }[];
  /** Property reads no origin walk, declaration or by-design reason placed, as `file:pos .name`. */
  readonly lostReads: readonly string[];
}

/** A member bucket's sampled findings, each with its find-references verdict. */
export interface GraphVerification {
  readonly bucket: MemberBucket;
  readonly total: number;
  readonly entries: readonly Verified[];
}

/** What a session ran under and what it measured. */
export interface GraphSessionReport {
  readonly ablated: readonly Ablation[];
  /** The prefix the walk was narrowed to. */
  readonly files: string | null;
  /** The dump the graph came from instead of a build. */
  readonly from: DumpStamp | null;
  /** The dump this session's build was written to. */
  readonly dumped: DumpStamp | null;
  readonly why: readonly WhyEntry[];
  readonly profile: GraphProfileReport | null;
  /** Under `--explain-lost`: the lost reads by where their key came from. */
  readonly lost: LostBreakdown | null;
}

/** A session's result and what it ran under. */
export type WithSession<T> = T & { readonly session: GraphSessionReport };

// What a session's work is handed: the graph, the world (opened on first ask when the graph came from a dump), and a
// timer for the work's own phases.
interface SessionWork {
  readonly graph: Graph;
  /** Where an analysis names each role its carry gives, for the `--why` record. */
  readonly carried: CarrySink;
  readonly world: () => NativeWorld;
  readonly time: <R>(phase: ProfilePhase, work: () => R) => R;
}

// Where a session's graph came from: a build (with its why roles and the dump it wrote) or a dump.
interface GraphSource {
  readonly graph: Graph;
  readonly why: readonly WhyEntry[];
  readonly dumped: DumpStamp | null;
  readonly from: DumpStamp | null;
}

const HEAP_SAMPLES = "inuse_space";
const CPU_SAMPLES = "cpu";

class Session implements Disposable {
  readonly #root: string;
  readonly #options: GraphOptions;
  readonly #log: GraphLog;
  readonly #profile: GraphProfile | null;
  readonly #sites: SitePlan;
  #world: NativeWorld | null = null;
  #compiler: CompilerProfile | null = null;

  constructor(root: string, log: GraphLog, { options, ...sites }: SessionPlan) {
    this.#root = root;
    this.#options = options;
    this.#log = log;
    this.#sites = sites;
    this.#profile = options.profile === null ? null : new GraphProfile();
  }

  time<R>(phase: ProfilePhase, work: () => R): R {
    return this.#profile === null ? work() : this.#profile.time(phase, work);
  }

  world(): NativeWorld {
    if (this.#world !== null) {
      return this.#world;
    }
    const world = this.time("open", () => openGraphWorld(this.#root, this.#profile !== null));
    // the profile starts once, when the world opens; every later ask for the world reuses it
    if (this.#options.profile?.kind === "cpu") {
      mkdirSync(this.#options.profile.dir, { recursive: true });
      world.debug.startCPUProfile(this.#options.profile.dir);
    }
    this.#world = world;
    return world;
  }

  async run<T>(use: (work: SessionWork) => T | Promise<T>): Promise<WithSession<T>> {
    const options = this.#options;
    const source = options.from === null ? await this.#build() : this.#read(options.from);
    const { graph } = source;
    const steps: CarryStep[] = [];
    // only a session that asks why keeps the carry's steps
    const carried: CarrySink =
      options.why.length === 0
        ? (): undefined => undefined
        : (step): void => {
            steps.push(step);
          };
    const value = await use({ graph, carried, world: () => this.world(), time: (phase, work) => this.time(phase, work) });
    this.#stopCpu();
    const measures = {
      counts: graph.facts.counts,
      peaks: graph.facts.peaks,
      dynamicAxes: graph.variants.filter(({ dynamic }) => dynamic).map(({ name, file, causes }) => ({ axis: name, file, causes })),
    };
    const world = this.#world;
    const report: GraphSessionReport = {
      ablated: [...options.ablate],
      files: options.files,
      from: source.from,
      dumped: source.dumped,
      why: [
        ...source.why,
        ...carriedEntries(options.why, graph.facts.decls, steps, { sites: graph.facts.roleSites, product: productReader, world: this.#world }),
      ],
      lost: options.explainLost ? explainLost(graph.facts) : null,
      profile: this.#profile?.report(measures, world === null ? null : { stats: world.stats, timing: world.timing() }, this.#compiler) ?? null,
    };
    return { ...value, session: report };
  }

  #read(path: string): GraphSource {
    const { graph, stamp } = readDump(path);
    this.#log(`answers come from a dump built at ${stamp.builtAt} from ${stamp.head ?? "no git checkout"}`);
    return { graph, why: [], dumped: null, from: stamp };
  }

  async #build(): Promise<GraphSource> {
    const options = this.#options;
    const roots = this.#profile === null ? await loadRoots(this.#root) : await this.#profile.timeAsync("open", () => loadRoots(this.#root));
    const world = this.world();
    const { graph, why } = buildGraph(this.#root, world, roots, { options, log: this.#log, profile: this.#profile, ...this.#sites });
    if (options.profile?.kind === "heap") {
      mkdirSync(options.profile.dir, { recursive: true });
      const path = String(world.debug.saveHeapProfile(options.profile.dir));
      this.#compiler = { kind: "heap", path, summary: readPprof(path, HEAP_SAMPLES) };
    }
    const dumped = options.dump === null ? null : writeDump(options.dump, this.#root, graph, new Date());
    return { graph, why, dumped, from: null };
  }

  #stopCpu(): void {
    if (this.#options.profile?.kind === "cpu" && this.#world !== null && this.#compiler === null) {
      const path = String(this.#world.debug.stopCPUProfile());
      this.#compiler = { kind: "cpu", path, summary: readPprof(path, CPU_SAMPLES) };
    }
  }

  [Symbol.dispose](): void {
    this.#world?.[Symbol.dispose]();
  }
}

// Which role sites a build keeps: every site of a declaration under a prefix, and every production member's; and the
// homes whose own sites only declare.
type SitePlan = Pick<BuildSession, "siteFiles" | "memberSites" | "declaringHomes">;

// What a session builds under: its options and the role sites it keeps.
interface SessionPlan extends SitePlan {
  readonly options: GraphOptions;
}

// Only a verb that reads role sites keeps any, and only one that judges what a home declares names that home.
const NO_SITES: SitePlan = { siteFiles: [], memberSites: false, declaringHomes: [] };
// The member scan's sort and literal search read each reported member's own sites.
const MEMBER_SITES: SitePlan = { ...NO_SITES, memberSites: true };

async function session<T>(root: string, log: GraphLog, plan: SessionPlan, use: (work: SessionWork) => T | Promise<T>): Promise<WithSession<T>> {
  using running = new Session(root, log, plan);
  return await running.run(use);
}

const scanOf = (root: string, { graph, carried, time, world }: SessionWork, rulings: MemberRulings): GraphScan => {
  const analysis = time("analyse", () => analyse(graph, carried));
  return {
    files: graph.files.length,
    analysis,
    members: time("analyse", () => judgeMembers({ root, graph, analysis, world: world() }, rulings)),
    counts: [...graph.facts.counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count })),
    lostReads: graph.facts.lostReads,
  };
};

/** Build and analyse the graph of the tree at `root`, its member rows split by `rulings`. */
export function scanGraph(
  root: string,
  log: GraphLog,
  options: GraphOptions = FRESH_BUILD,
  rulings: MemberRulings = NO_RULINGS,
): Promise<WithSession<GraphScan>> {
  return session(root, log, { options, ...MEMBER_SITES }, (work) => scanOf(root, work, rulings));
}

/** Build and analyse the graph, then check an even sample of one member bucket against find-references. */
export function verifyGraph(
  root: string,
  check: { readonly bucket: MemberBucket; readonly sample: number | null },
  log: GraphLog,
  options: GraphOptions = FRESH_BUILD,
): Promise<WithSession<{ readonly scan: GraphScan; readonly verification: GraphVerification }>> {
  const { bucket, sample } = check;
  return session(root, log, { options, ...MEMBER_SITES }, (work) => {
    const scan = scanOf(root, work, NO_RULINGS);
    const findings = scan.analysis[bucket];
    const chains = tracing(options, "verify-chain") !== undefined;
    const entries = work.time("verify", () => verifyFindings(work.world(), evenSample(findings, sample), chains));
    return { scan, verification: { bucket, total: findings.length, entries } };
  });
}

/** Answer one query for each name, over a fresh build or a dump. */
export function queryGraph(
  root: string,
  ask: { readonly query: Query; readonly names: readonly string[] },
  log: GraphLog,
  options: GraphOptions = FRESH_BUILD,
): Promise<WithSession<{ readonly answers: readonly QueryAnswer[] }>> {
  return session(root, log, { options, ...NO_SITES }, ({ graph, time }) => ({
    answers: time("analyse", () => new GraphQueries(graph).answer(ask.query, ask.names)),
  }));
}

/** Build the graph, then report the string-union members nothing builds over the session's program (./unions.ts). */
export function unionsGraph(
  root: string,
  lists: Pick<UnionsOptions, "deliberate" | "judged">,
  log: GraphLog,
  options: GraphOptions = FRESH_BUILD,
): Promise<WithSession<UnionsReport>> {
  return session(root, log, { options, ...NO_SITES }, ({ world, time }) => time("analyse", () => scanUnionsOnGraph(world(), { ...lists, root, log })));
}

/** Build the graph, then report the custom properties nothing reads. */
export function cssGraph(root: string, log: GraphLog, options: GraphOptions = FRESH_BUILD): Promise<WithSession<CssReport>> {
  return session(root, log, { options, ...NO_SITES }, ({ graph, time }) => time("analyse", () => cssPass(root, graph)));
}

/** Build the graph, then report the tRPC procedures and HTTP routes no production code calls. */
export function proceduresGraph(options: ProceduresOptions, log: GraphLog): Promise<WithSession<ProceduresReport>> {
  return session(options.root, log, { options: FRESH_BUILD, ...NO_SITES, siteFiles: PROCEDURE_HOMES }, ({ graph, world, time }) =>
    time("analyse", () => proceduresOf(graph, world(), options)),
  );
}

/** Build the graph, then report the error and refusal codes nothing throws or no client branch names. */
export function codesGraph(root: string, judging: CodesJudging, log: GraphLog, options: GraphOptions = FRESH_BUILD): Promise<WithSession<CodesReport>> {
  return session(root, log, { options, ...NO_SITES }, ({ graph, world, time }) => time("analyse", () => codesPass(graph, world(), judging, log)));
}

/** Build the graph, then report the class and data-* hooks with no partner. The pass reads the program's source, which a
 *  dump does not carry, so it takes no `from`. */
export function domGraph(root: string, log: GraphLog, options: Omit<GraphOptions, "from"> = FRESH_BUILD): Promise<WithSession<DomReport>> {
  return session(root, log, { options: { ...options, from: null }, ...NO_SITES }, ({ world, time }) => time("analyse", () => domPass(root, world())));
}

/** Build and analyse the graph, then delete each finding of the named buckets in a throwaway snapshot and run the
 *  unused-diagnostics control (./trial.ts); `limit` takes an even sample of the findings instead of all of them, and
 *  `cpuProfile` names where the compiler CPU profile of one group is written; `reach` picks which files a snapshot checks. */
export function trialGraph(
  root: string,
  ask: { readonly buckets: readonly TrialBucket[]; readonly limit: number | null; readonly cpuProfile?: string | null; readonly reach: TrialReach },
  log: GraphLog,
  options: GraphOptions = FRESH_BUILD,
): Promise<WithSession<TrialReport>> {
  return session(root, log, { options, ...NO_SITES }, (work) => {
    const analysis = work.time("analyse", () => analyse(work.graph));
    return runTrials(
      work.graph,
      work.world(),
      { root, analysis, buckets: ask.buckets, limit: ask.limit, cpuProfile: ask.cpuProfile ?? null, reach: ask.reach },
      log,
    );
  });
}

/** Check a deletion branch, then resolve every receiver site of a key it removes over the session's merged program. A
 *  branch that removes no key builds no session.
 *  @throws When `head` is not the clean checked-out commit. */
export async function removedKeysGraph(
  options: RemovedKeysOptions,
  log: GraphLog,
): Promise<RemovedKeysReport & { readonly session: GraphSessionReport | null }> {
  const plan = removedKeysPlan(options);
  if (plan.removed.size === 0) {
    return { ...nothingRemoved(plan), session: null };
  }
  return await session(options.root, log, { options: FRESH_BUILD, ...NO_SITES }, ({ world, time }) => time("analyse", () => removedKeysPass(world(), plan)));
}

/** Build the graph, then report the second homes, synonyms and re-export chains of the session's program. */
export function shapesGraph(options: ShapesOptions, log: GraphLog): Promise<WithSession<ShapesReport>> {
  return session(options.root, log, { options: FRESH_BUILD, ...NO_SITES }, ({ world, time }) => time("analyse", () => shapesPass(world(), options)));
}

/** Build the graph, then judge every product callable's parameters against its calls. The calls come from the merged
 *  program, which a dump does not carry, so it takes no `from`. */
export function paramsGraph(rows: ParamsLists, log: GraphLog, options: Omit<GraphOptions, "from"> = FRESH_BUILD): Promise<WithSession<ParamsReport>> {
  return session(rows.root, log, { options: { ...options, from: null }, ...NO_SITES, siteFiles: PARAMS_HOMES }, ({ graph, world, time }) =>
    time("analyse", () => paramsPass(graph, world(), rows)),
  );
}

/** Build the graph with the schema files as the declaring home, then report the columns production never reads or
 *  writes. */
export function columnsGraph(options: ColumnsOptions, log: GraphLog): Promise<WithSession<ColumnsReport>> {
  return session(options.root, log, { options: FRESH_BUILD, ...NO_SITES, siteFiles: COLUMN_HOMES, declaringHomes: COLUMN_HOMES }, ({ graph, world, time }) =>
    time("analyse", () => columnsPass(graph, world(), options)),
  );
}
