// What `--profile` measures in one graph session: each phase's wall time, the world's request costs, the memory peaks
// of Node and of every compiler process, the compiler's own request totals, every walked file's time, and the compiler's
// CPU or heap profile and Node's heap profile when asked. A nested phase is inclusive: `resolve` is all time inside the
// world's batches, so it overlaps `walk`, `origin` and `fixpoint`, and `apart`, the programs the merge cannot hold, holds
// their own walk and fixpoint.
//
// Memory: Node's peak is its own high-water mark (process.resourceUsage, every platform). A compiler's peak is the
// kernel's high-water mark for its process, read under /proc on Linux at every sample and before the report; other
// platforms leave it unmeasured and never fail. A run's combined peak lies between the largest sampled sum of the live
// processes' resident memory and the sum of every process's own peak, so the report gives both.
//
// `pnpm brand-flow --profile` measures with the same class and prints the same lines (../../brand-flow/profile.ts).
import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { HeapProfiler } from "node:inspector";
import { relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { TimingAccumulators } from "@typescript/native/sync";
import type { CompilerStart, WorldStats } from "../native.ts";
import type { ProfileKind } from "./options.ts";
import type { PprofSummary } from "./pprof.ts";

/** The phases a profile times, each emitted on every run (0 when the run did not enter it). */
export const PROFILE_PHASES = ["open", "walk", "resolve", "origin", "fixpoint", "apart", "analyse", "verify"] as const;
export type ProfilePhase = (typeof PROFILE_PHASES)[number];

export interface FileTime {
  readonly file: string;
  readonly ms: number;
}

/** Where a run's file times fall: the cut stderr shows files above is the run's own p99. */
interface FileQuantiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

/** A compiler profile written through api.debug and read back. */
export interface CompilerProfile {
  readonly kind: Exclude<ProfileKind, "wall">;
  readonly path: string;
  readonly summary: PprofSummary;
}

/** Node's heap profile written beside the compiler's, and its summary. */
export interface NodeHeapProfile {
  readonly path: string;
  readonly summary: PprofSummary;
}

/** A variant axis a wide value made dynamic, and the causes of its wide values. */
interface DynamicAxis {
  readonly axis: string;
  readonly file: string;
  readonly causes: readonly string[];
}

/** What the build counted and the largest value each measure reached. */
export interface BuildMeasures {
  readonly counts: ReadonlyMap<string, number>;
  readonly peaks: ReadonlyMap<string, number>;
  readonly dynamicAxes: readonly DynamicAxis[];
}

/** One compiler process's peak, and the config and phase it started for. */
interface CompilerPeak {
  readonly config: string;
  readonly pid: number | null;
  readonly startedIn: ProfilePhase | null;
  /** Null where the platform reports no other process's memory. */
  readonly peakMb: number | null;
}

/** What one run held at most, by process and together. */
export interface MemoryPeaks {
  readonly nodePeakMb: number;
  readonly compilers: readonly CompilerPeak[];
  /** The largest sum of Node's and every live compiler's resident memory at one sample; null when unmeasured. */
  readonly combinedSampledMb: number | null;
  /** Node's peak plus every compiler's: no moment of the run held more; null when unmeasured. */
  readonly combinedBoundMb: number | null;
}

export interface GraphProfileReport {
  readonly phases: Readonly<Record<ProfilePhase, number>>;
  readonly counts: Readonly<Record<string, number>>;
  readonly peaks: Readonly<Record<string, number>>;
  readonly dynamicAxes: readonly DynamicAxis[];
  /** Null when the run built nothing and opened no world. */
  readonly world: WorldStats | null;
  readonly timing: TimingAccumulators | null;
  readonly memory: MemoryPeaks;
  /** Every walked file, slowest first. */
  readonly files: readonly FileTime[];
  readonly fileQuantiles: FileQuantiles;
  /** The compiler profiles the run wrote, in the order it wrote them. */
  readonly compilers: readonly CompilerProfile[];
  /** Under a heap profile: Node's live heap by the functions that allocated it, when the compiler's heap was saved. */
  readonly nodeHeap: NodeHeapProfile | null;
}

const MB = 1e6;
const KIB = 1024;
// process.resourceUsage reports the high-water mark in kibibytes.
const MAX_RSS_UNIT = KIB;
const QUANTILES = { p50: 0.5, p95: 0.95, p99: 0.99 } as const;

const quantile = (ascending: readonly number[], share: number): number => ascending[Math.max(0, Math.ceil(share * ascending.length) - 1)] ?? 0;

// The quantiles of a run's file times.
function fileQuantiles(files: readonly FileTime[]): FileQuantiles {
  const ascending = files.map(({ ms }) => ms).sort((a, b) => a - b);
  return {
    p50: quantile(ascending, QUANTILES.p50),
    p95: quantile(ascending, QUANTILES.p95),
    p99: quantile(ascending, QUANTILES.p99),
    max: ascending.at(-1) ?? 0,
  };
}

// Linux keeps each process's resident high-water mark and current size in its status file; elsewhere no other
// process's memory is read.
const PROC_STATUS = "/proc/self/status";
const STATUS_FIELDS = { peak: /^VmHWM:\s+(\d+) kB$/mu, resident: /^VmRSS:\s+(\d+) kB$/mu } as const;

function statusBytes(pid: number, field: keyof typeof STATUS_FIELDS): number | null {
  if (!existsSync(PROC_STATUS)) {
    return null;
  }
  try {
    const value = STATUS_FIELDS[field].exec(readFileSync(`/proc/${String(pid)}/status`, "utf8"))?.[1];
    return value === undefined ? null : Number(value) * KIB;
  } catch {
    // The process exited between its last sample and this read; what it held is in that sample.
    return null;
  }
}

const alive = (child: ChildProcess): boolean => child.exitCode === null && child.signalCode === null && !child.killed;
const megabytes = (bytes: number): number => Math.round(bytes / MB);

// A compiler the run started, with the largest peak read from it so far.
interface Watched {
  readonly start: CompilerStart;
  readonly startedIn: ProfilePhase | null;
  peak: number | null;
}

const ANONYMOUS = "(anonymous)";
const NATIVE = "(native)";
const FILE_URL = "file://";

/** Node's live heap by allocating function, from a V8 sampling heap profile: each function's own bytes (flat) and the
 *  bytes of everything it called (cumulative), as {@link PprofSummary} gives the compiler's. */
export function summarizeNodeHeap(profile: HeapProfiler.SamplingHeapProfile, root: string): PprofSummary {
  const flat = new Map<string, number>();
  const cumulative = new Map<string, number>();
  let total = 0;
  const where = (url: string, line: number): string => {
    if (url === "") {
      return NATIVE;
    }
    return `${url.startsWith(FILE_URL) ? relative(root, fileURLToPath(url)) : url}:${String(line + 1)}`;
  };
  const nameOf = ({ callFrame }: HeapProfiler.SamplingHeapProfileNode): string =>
    `${callFrame.functionName === "" ? ANONYMOUS : callFrame.functionName} ${where(callFrame.url, callFrame.lineNumber)}`;
  // A subtree's bytes count once toward each distinct function on its path, as pprof counts a sample.
  const visit = (node: HeapProfiler.SamplingHeapProfileNode, path: ReadonlySet<string>): number => {
    const name = nameOf(node);
    flat.set(name, (flat.get(name) ?? 0) + node.selfSize);
    total += node.selfSize;
    const below = new Set([...path, name]);
    const size = node.children.reduce((sum, child) => sum + visit(child, below), node.selfSize);
    if (!path.has(name)) {
      cumulative.set(name, (cumulative.get(name) ?? 0) + size);
    }
    return size;
  };
  visit(profile.head, new Set());
  const entries = [...cumulative]
    .map(([name, share]) => ({ name, flat: flat.get(name) ?? 0, cumulative: share }))
    .sort((a, b) => b.cumulative - a.cumulative || b.flat - a.flat || a.name.localeCompare(b.name));
  return { sampleType: "space/bytes", total, entries };
}

/** One session's measurements, collected as the session runs. */
export class GraphProfile {
  readonly #ms = new Map<ProfilePhase, number>();
  readonly #files: FileTime[] = [];
  readonly #open: ProfilePhase[] = [];
  readonly #compilers: Watched[] = [];
  // Null once a live process's memory could not be read: the platform reports none.
  #combined: number | null = 0;

  #failedIn: ProfilePhase | null = null;

  /** The innermost phase running now, or null between phases. */
  get phase(): ProfilePhase | null {
    return this.#open.at(-1) ?? null;
  }

  /** The innermost phase a failure first left, or null while none has failed. */
  get failedIn(): ProfilePhase | null {
    return this.#failedIn;
  }

  /** Measure a compiler process the run started, from now on. */
  watch(start: CompilerStart): void {
    this.#compilers.push({ start, startedIn: this.phase, peak: null });
    this.#sample();
  }

  /** Run `work` as part of `phase`. */
  time<T>(phase: ProfilePhase, work: () => T): T {
    const began = performance.now();
    this.#open.push(phase);
    try {
      return work();
    } catch (error) {
      this.#failedIn ??= phase;
      throw error;
    } finally {
      this.#open.pop();
      this.add(phase, performance.now() - began);
    }
  }

  async timeAsync<T>(phase: ProfilePhase, work: () => Promise<T>): Promise<T> {
    const began = performance.now();
    this.#open.push(phase);
    try {
      return await work();
    } catch (error) {
      this.#failedIn ??= phase;
      throw error;
    } finally {
      this.#open.pop();
      this.add(phase, performance.now() - began);
    }
  }

  add(phase: ProfilePhase, ms: number): void {
    this.#ms.set(phase, (this.#ms.get(phase) ?? 0) + ms);
    this.#sample();
  }

  file(file: string, ms: number): void {
    this.#files.push({ file, ms });
    this.#sample();
  }

  // Each live compiler's high-water mark so far, and the sum of what every process holds now.
  #sample(): void {
    let now: number | null = process.memoryUsage.rss();
    for (const watched of this.#compilers) {
      const { pid } = watched.start.process;
      if (!alive(watched.start.process) || pid === undefined) {
        continue;
      }
      const peak = statusBytes(pid, "peak");
      watched.peak = peak === null ? watched.peak : Math.max(watched.peak ?? 0, peak);
      const resident = statusBytes(pid, "resident");
      now = now === null || resident === null ? null : now + resident;
    }
    this.#combined = now === null || this.#combined === null ? null : Math.max(this.#combined, now);
  }

  #memory(): MemoryPeaks {
    this.#sample();
    const nodePeak = process.resourceUsage().maxRSS * MAX_RSS_UNIT;
    const peaks = this.#compilers.map(({ peak }) => peak);
    const known = peaks.filter((peak) => peak !== null);
    const measured = this.#combined !== null && known.length === peaks.length;
    return {
      nodePeakMb: megabytes(nodePeak),
      compilers: this.#compilers.map(({ start, startedIn, peak }) => ({
        config: start.config,
        pid: start.process.pid ?? null,
        startedIn,
        peakMb: peak === null ? null : megabytes(peak),
      })),
      combinedSampledMb: measured && this.#combined !== null ? megabytes(this.#combined) : null,
      combinedBoundMb: measured ? megabytes(known.reduce((sum, peak) => sum + peak, nodePeak)) : null,
    };
  }

  report(
    measures: BuildMeasures,
    world: { readonly stats: WorldStats; readonly timing: TimingAccumulators } | null,
    profiles: { readonly compilers: readonly CompilerProfile[]; readonly nodeHeap: NodeHeapProfile | null },
  ): GraphProfileReport {
    const phase = (name: ProfilePhase): number => (name === "resolve" ? (world?.stats.ms ?? 0) : (this.#ms.get(name) ?? 0));
    const files = this.#files.toSorted((a, b) => b.ms - a.ms || a.file.localeCompare(b.file));
    return {
      phases: {
        open: phase("open"),
        walk: phase("walk"),
        resolve: phase("resolve"),
        origin: phase("origin"),
        fixpoint: phase("fixpoint"),
        apart: phase("apart"),
        analyse: phase("analyse"),
        verify: phase("verify"),
      },
      counts: Object.fromEntries([...measures.counts].sort(([a], [b]) => a.localeCompare(b))),
      peaks: Object.fromEntries(measures.peaks),
      dynamicAxes: measures.dynamicAxes,
      world: world?.stats ?? null,
      timing: world?.timing ?? null,
      memory: this.#memory(),
      files,
      fileQuantiles: fileQuantiles(files),
      ...profiles,
    };
  }
}

// A compiler profile's functions shown on stderr; the report keeps every one.
const SHOWN_PROFILE_ENTRIES = 20;

const inMs = (value: number): string => `${String(Math.round(value))}ms`;
const UNMEASURED = `unmeasured on ${process.platform}`;
const mb = (value: number | null): string => (value === null ? UNMEASURED : `${String(value)}MB`);

/** The stderr lines of a profile report, in the order every profiling verb prints them. */
export function profileLines(profile: GraphProfileReport): readonly string[] {
  const lines = [
    `profile phases ${PROFILE_PHASES.map((phase) => `${phase}=${inMs(profile.phases[phase])}`).join(" ")} (resolve, origin and fixpoint overlap walk)`,
  ];
  if (profile.world !== null) {
    const { batches, rounds, sent, memoHits } = profile.world;
    lines.push(`profile requests batches=${String(batches)} rounds=${String(rounds)} sent=${String(sent)} memo-hits=${String(memoHits)}`);
  }
  lines.push(memoryLine(profile.memory));
  if (profile.timing !== null) {
    const { requestCount, roundTripMs, serverTimeMs, transportOverheadMs } = profile.timing;
    lines.push(
      `profile checker requests=${String(requestCount)} round-trip=${inMs(roundTripMs)} server=${inMs(serverTimeMs)} transport=${inMs(transportOverheadMs)}`,
    );
  }
  const { p50, p95, p99, max } = profile.fileQuantiles;
  lines.push(`profile files=${String(profile.files.length)} p50=${inMs(p50)} p95=${inMs(p95)} p99=${inMs(p99)} max=${inMs(max)}; above p99:`);
  for (const { file, ms: took } of profile.files.filter((entry) => entry.ms > p99)) {
    lines.push(`  ${inMs(took)}\t${file}`);
  }
  lines.push(
    `profile counts ${Object.entries({
      ...profile.counts,
      ...Object.fromEntries(Object.entries(profile.peaks).map(([name, value]) => [`peak ${name}`, value])),
    })
      .map(([name, value]) => `${name}=${String(value)}`)
      .join("; ")}`,
  );
  for (const { axis, file, causes } of profile.dynamicAxes) {
    lines.push(`profile dynamic axis ${file}:${axis} <- ${causes.join(", ")}`);
  }
  return [...lines, ...compilerProfileLines(profile)];
}

// Node's and every compiler's peak, and the run's combined peak between what a sample saw and what no moment exceeded.
function memoryLine(memory: MemoryPeaks): string {
  const compilers = memory.compilers.map(({ config, pid, startedIn, peakMb }) => `${config}(pid ${String(pid)}, ${startedIn ?? "session"})=${mb(peakMb)}`);
  return `profile memory node-peak=${mb(memory.nodePeakMb)} compiler-peaks ${compilers.join(" ") || "none"} combined sampled=${mb(memory.combinedSampledMb)} bound=${mb(memory.combinedBoundMb)}`;
}

// The Go collector's mark worker, and its idle mode: a worker in idle mode marks on a core the compiler had no other work
// for, as it waits on Node between requests, so only the rest of the marking competes with the compiler's own work.
const GC_WORKER = "runtime.gcBgMarkWorker";
const GC_IDLE_WORKER = "runtime.gcDrainMarkWorkerIdle";
const PERCENT = 100;

// One profile's top functions shown; the report keeps every one.
function summaryLines(label: string, summary: PprofSummary): readonly string[] {
  return [
    `profile ${label}: ${summary.sampleType} total=${String(summary.total)}; top ${String(SHOWN_PROFILE_ENTRIES)} of ${String(summary.entries.length)} by cumulative (a display cut; the report keeps every function)`,
    ...summary.entries.slice(0, SHOWN_PROFILE_ENTRIES).map(({ name, flat, cumulative }) => `  cum=${String(cumulative)}\tflat=${String(flat)}\t${name}`),
  ];
}

/** The lines of each compiler profile the run wrote, a CPU profile with its collector share, and Node's heap profile. */
export function compilerProfileLines(profile: Pick<GraphProfileReport, "compilers" | "nodeHeap">): readonly string[] {
  const lines: string[] = [];
  for (const { kind, path, summary } of profile.compilers) {
    lines.push(...summaryLines(`${kind} ${path}`, summary));
    if (kind === "cpu" && summary.total > 0) {
      const share = (name: string): string =>
        `${String(Math.round((PERCENT * (summary.entries.find((entry) => entry.name === name)?.cumulative ?? 0)) / summary.total))}%`;
      lines.push(`profile cpu gc-share=${share(GC_WORKER)} of compiler cpu, idle-core marking=${share(GC_IDLE_WORKER)}`);
    }
  }
  if (profile.nodeHeap !== null) {
    lines.push(...summaryLines(`node heap ${profile.nodeHeap.path}`, profile.nodeHeap.summary));
  }
  return lines;
}
