// What `--profile` measures in one graph session: each phase's wall time, the world's request costs, the rss peak, the
// compiler's own request totals, every walked file's time, and the compiler's CPU or heap profile when asked. A nested
// phase is inclusive: `resolve` is all time inside the world's batches, so it overlaps `walk`, `origin` and `fixpoint`, and
// `apart`, the programs the merge cannot hold, holds their own walk and fixpoint; each one's rss is a peak.
import process from "node:process";
import type { TimingAccumulators } from "@typescript/native/sync";
import type { WorldStats } from "../native.ts";
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

export interface GraphProfileReport {
  readonly phases: Readonly<Record<ProfilePhase, number>>;
  readonly counts: Readonly<Record<string, number>>;
  readonly peaks: Readonly<Record<string, number>>;
  readonly dynamicAxes: readonly DynamicAxis[];
  /** Null when the run built nothing and opened no world. */
  readonly world: WorldStats | null;
  readonly timing: TimingAccumulators | null;
  readonly rssPeakMb: number;
  /** Every walked file, slowest first. */
  readonly files: readonly FileTime[];
  readonly fileQuantiles: FileQuantiles;
  readonly compiler: CompilerProfile | null;
}

const MB = 1e6;
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

/** One session's measurements, collected as the session runs. */
export class GraphProfile {
  readonly #ms = new Map<ProfilePhase, number>();
  readonly #files: FileTime[] = [];
  #rss = 0;

  /** Run `work` as part of `phase`. */
  time<T>(phase: ProfilePhase, work: () => T): T {
    const began = performance.now();
    try {
      return work();
    } finally {
      this.add(phase, performance.now() - began);
    }
  }

  async timeAsync<T>(phase: ProfilePhase, work: () => Promise<T>): Promise<T> {
    const began = performance.now();
    try {
      return await work();
    } finally {
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

  #sample(): void {
    this.#rss = Math.max(this.#rss, process.memoryUsage.rss());
  }

  report(
    measures: BuildMeasures,
    world: { readonly stats: WorldStats; readonly timing: TimingAccumulators } | null,
    compiler: CompilerProfile | null,
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
      rssPeakMb: Math.round(this.#rss / MB),
      files,
      fileQuantiles: fileQuantiles(files),
      compiler,
    };
  }
}
