// What `pnpm brand-flow --profile` measures, on the reference graph's profile (../unwired/graph/profile.ts) and printed
// in its lines: open, walk and analyse wall times, every world's request costs summed, Node's and each compiler's memory
// peaks, and under `cpu` or `heap` each world's compiler profile, saved before the world closes.
//
// Under `heap`, Node's sampling heap profile runs from before the first world opens until the scan has joined every
// world, so what it reports live is what the scan still held after every world closed: the retainer that grows with the
// world count. Every world's Node heap after it closes is a peak of its own, logged as the world ends, so a run the heap
// limit kills still names the world it reached.
//
// The optional-pairs graph session that follows the scan profiles itself under the same kinds (../unwired/graph/scan.ts),
// so this profile ends first and only one Node heap sampler runs at a time.

import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { mkdirSync, writeFileSync } from "node:fs";
import { Session as InspectorSession } from "node:inspector/promises";
import { join } from "node:path";
import process from "node:process";
import type { TimingAccumulators } from "@typescript/native/sync";
import type { CompilerProfile, GraphProfileReport, NativeWorld, ProfileKind } from "../unwired/index.ts";
import { COMPILER_CHANNEL, compilerStartOf, GraphProfile, readPprof, summarizeNodeHeap } from "../unwired/index.ts";

type WorldStats = NativeWorld["stats"];

// The sample type each compiler profile is read by, as the reference graph reads it.
const SAMPLES = { cpu: "cpu", heap: "inuse_space" } as const;
// V8's default sampling interval: one sample per 32 KiB allocated on average.
const NODE_HEAP_INTERVAL = 32_768;
const MB = 1e6;

const NO_STATS: WorldStats = { batches: 0, rounds: 0, sent: 0, memoHits: 0, ms: 0 };
const NO_TIMING: TimingAccumulators = {
  requestCount: 0,
  roundTripMs: 0,
  bytesSent: 0,
  bytesReceived: 0,
  serverTimeMs: 0,
  transportOverheadMs: 0,
  nodesMaterialized: 0,
  sourceFilesFetched: 0,
  nodesFetched: 0,
};

// Every timing field is a sum, so the worlds' totals add field by field.
const addTiming = (a: TimingAccumulators, b: TimingAccumulators): TimingAccumulators => ({
  requestCount: a.requestCount + b.requestCount,
  roundTripMs: a.roundTripMs + b.roundTripMs,
  bytesSent: a.bytesSent + b.bytesSent,
  bytesReceived: a.bytesReceived + b.bytesReceived,
  serverTimeMs: a.serverTimeMs + b.serverTimeMs,
  transportOverheadMs: a.transportOverheadMs + b.transportOverheadMs,
  nodesMaterialized: a.nodesMaterialized + b.nodesMaterialized,
  sourceFilesFetched: a.sourceFilesFetched + b.sourceFilesFetched,
  nodesFetched: a.nodesFetched + b.nodesFetched,
});

/** One brand-flow run's measurements, collected as each world opens and closes. */
export class BrandFlowProfile implements Disposable {
  readonly #kinds: ReadonlySet<ProfileKind>;
  readonly #dir: string;
  readonly #root: string;
  readonly #graph = new GraphProfile();
  readonly #compilers: CompilerProfile[] = [];
  readonly #peaks = new Map<string, number>();
  #stats: WorldStats = NO_STATS;
  #timing: TimingAccumulators = NO_TIMING;
  #inspector: InspectorSession | null = null;
  readonly #onCompiler = (message: unknown): void => {
    const start = compilerStartOf(message);
    if (start !== undefined) {
      this.#graph.watch(start);
    }
  };

  private constructor(kinds: readonly ProfileKind[], dir: string, root: string) {
    this.#kinds = new Set(kinds);
    this.#dir = dir;
    this.#root = root;
    subscribe(COMPILER_CHANNEL, this.#onCompiler);
  }

  /** A profile that measures from now on; under `heap`, Node's heap sampling has started when it resolves. */
  static async start(kinds: readonly ProfileKind[], dir: string, root: string): Promise<BrandFlowProfile> {
    const profile = new BrandFlowProfile(kinds, dir, root);
    if (profile.#kinds.has("heap")) {
      profile.#inspector = new InspectorSession();
      profile.#inspector.connect();
      await profile.#inspector.post("HeapProfiler.startSampling", { samplingInterval: NODE_HEAP_INTERVAL });
    }
    return profile;
  }

  time<T>(phase: "open" | "walk" | "analyse", work: () => T): T {
    return this.#graph.time(phase, work);
  }

  /** A world just opened: its CPU profile starts. */
  opened(world: NativeWorld): void {
    if (this.#kinds.has("cpu")) {
      mkdirSync(this.#dir, { recursive: true });
      world.debug.startCPUProfile(this.#dir);
    }
  }

  /** A world is about to close: its compiler profiles are saved and read, and its request costs join the run's. */
  closing(world: NativeWorld): void {
    if (this.#kinds.has("cpu")) {
      const path = String(world.debug.stopCPUProfile());
      this.#compilers.push({ kind: "cpu", path, summary: readPprof(path, SAMPLES.cpu) });
    }
    if (this.#kinds.has("heap")) {
      mkdirSync(this.#dir, { recursive: true });
      const path = String(world.debug.saveHeapProfile(this.#dir));
      this.#compilers.push({ kind: "heap", path, summary: readPprof(path, SAMPLES.heap) });
    }
    const stats = world.stats;
    this.#stats = {
      batches: this.#stats.batches + stats.batches,
      rounds: this.#stats.rounds + stats.rounds,
      sent: this.#stats.sent + stats.sent,
      memoHits: this.#stats.memoHits + stats.memoHits,
      ms: this.#stats.ms + stats.ms,
    };
    this.#timing = addTiming(this.#timing, world.timing());
  }

  /** A world has closed: Node's heap now is the run's to keep, recorded under the world's name and returned in MB. */
  closed(config: string): number {
    const heap = Math.round(process.memoryUsage().heapUsed / MB);
    this.#peaks.set(`node heap MB after ${config}`, heap);
    return heap;
  }

  /** The scan's report, with Node's heap profile stopped and read when it was sampled. The profile watches no compiler
   *  started after this: the optional-pairs graph session measures its own. */
  async finish(counts: ReadonlyMap<string, number>): Promise<GraphProfileReport> {
    unsubscribe(COMPILER_CHANNEL, this.#onCompiler);
    let nodeHeap: GraphProfileReport["nodeHeap"] = null;
    if (this.#inspector !== null) {
      const { profile } = await this.#inspector.post("HeapProfiler.stopSampling");
      this.#inspector.disconnect();
      this.#inspector = null;
      mkdirSync(this.#dir, { recursive: true });
      const path = join(this.#dir, `node-heap-${String(process.pid)}-${String(Math.round(performance.now()))}.heapprofile`);
      writeFileSync(path, JSON.stringify(profile));
      nodeHeap = { path, summary: summarizeNodeHeap(profile, this.#root) };
    }
    return this.#graph.report(
      { counts, peaks: this.#peaks, dynamicAxes: [] },
      { stats: this.#stats, timing: this.#timing },
      { compilers: this.#compilers, nodeHeap },
    );
  }

  [Symbol.dispose](): void {
    unsubscribe(COMPILER_CHANNEL, this.#onCompiler);
    this.#inspector?.disconnect();
  }
}
