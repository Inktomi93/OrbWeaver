// Bounded browser evidence with monotonic cursors. Retained arrays are views; this owner alone evicts.
import { z } from "zod";
import type { InstrumentArtifactLimitReceipt } from "./artifact-out.ts";
import { artifactLimitReceiptSchema } from "./artifact-out.ts";
import type { InstrumentCurrentScope } from "./artifact-scope.ts";
import { aggregateScope, instrumentCurrentScopeSchema } from "./artifact-scope.ts";

export interface BrowserEvidenceCursorRange {
  readonly start: number;
  readonly end: number;
  readonly retainedStart: number;
}

export interface BrowserEvidenceRetentionReceipt {
  readonly source: string;
  readonly capacity: number;
  readonly observed: number;
  readonly retained: number;
  readonly dropped: number;
  readonly complete: boolean;
  readonly cursor: BrowserEvidenceCursorRange;
  readonly scope: InstrumentCurrentScope;
}

export interface BrowserEvidenceRetentionBatch {
  readonly v: 1;
  readonly rows: readonly BrowserEvidenceRetentionReceipt[];
  readonly limits: readonly InstrumentArtifactLimitReceipt[];
}

export const BROWSER_EVIDENCE_SOURCES = {
  console: "browser-console",
  pageErrors: "browser-page-errors",
  diagnostics: "browser-diagnostics",
  diagnosticCompleteness: "browser-diagnostic-completeness",
  requestSummary: "browser-request-summary-latest-url",
  network: "browser-network-completed",
  networkExtras: "browser-network-orphan-extra",
} as const;

export interface DiagnosticRetentionSummary {
  readonly complete: boolean;
  readonly dropped: number;
  readonly sources: readonly string[];
}

const cursorRangeSchema: z.ZodType<BrowserEvidenceCursorRange> = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  retainedStart: z.number().int().nonnegative(),
});

export const browserEvidenceRetentionReceiptSchema: z.ZodType<BrowserEvidenceRetentionReceipt> = z.object({
  source: z.string().min(1),
  capacity: z.number().int().positive(),
  observed: z.number().int().nonnegative(),
  retained: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
  complete: z.boolean(),
  cursor: cursorRangeSchema,
  scope: instrumentCurrentScopeSchema,
});

export const browserEvidenceRetentionBatchSchema: z.ZodType<BrowserEvidenceRetentionBatch> = z.object({
  v: z.literal(1),
  rows: z.array(browserEvidenceRetentionReceiptSchema),
  limits: z.array(artifactLimitReceiptSchema),
});

interface RingEntry<T> {
  readonly cursor: number;
  readonly value: T;
  readonly scope: InstrumentCurrentScope;
  readonly scopeKey: string;
}

interface ScopeStats {
  readonly scope: InstrumentCurrentScope;
  observed: number;
  dropped: number;
  start: number;
  end: number;
}

export interface EvidenceRangeRead<T> {
  readonly records: readonly T[];
  readonly receipt: BrowserEvidenceRetentionReceipt;
}

export interface BoundedEvidenceRingOptions<T> {
  readonly canEvict?: (value: T) => boolean;
}

function scopeKey(scope: InstrumentCurrentScope): string {
  return JSON.stringify(scope);
}

function scopePath(scope: InstrumentCurrentScope): string {
  return `scope=${encodeURIComponent(scopeKey(scope))}`;
}

export class BoundedEvidenceRing<T> {
  readonly #capacity: number;
  readonly #canEvict: (value: T) => boolean;
  readonly #entries: RingEntry<T>[] = [];
  readonly #values: T[] = [];
  readonly #scopes = new Map<string, ScopeStats>();
  #nextCursor = 0;

  constructor(capacity: number, options: BoundedEvidenceRingOptions<T> = {}) {
    if (!(Number.isInteger(capacity) && capacity > 0)) {
      throw new Error(`evidence ring capacity must be a positive integer, got ${String(capacity)}`);
    }
    this.#capacity = capacity;
    this.#canEvict = options.canEvict ?? ((): boolean => true);
  }

  get capacity(): number {
    return this.#capacity;
  }

  get length(): number {
    return this.#entries.length;
  }

  cursor(): number {
    return this.#nextCursor;
  }

  values(): readonly T[] {
    return this.#values;
  }

  reset(): void {
    this.#entries.length = 0;
    this.#values.length = 0;
    this.#scopes.clear();
    this.#nextCursor = 0;
  }

  push(value: T, scope: InstrumentCurrentScope): number {
    const cursor = this.#nextCursor;
    this.#nextCursor += 1;
    const key = scopeKey(scope);
    const stats = this.#scopes.get(key) ?? { scope, observed: 0, dropped: 0, start: cursor, end: cursor + 1 };
    stats.observed += 1;
    stats.end = cursor + 1;
    this.#scopes.set(key, stats);
    this.#entries.push({ cursor, value, scope, scopeKey: key });
    this.#values.push(value);
    this.trim();
    return this.#nextCursor;
  }

  /** Oldest-first trim. A protected oldest record makes overflow explicit until its owner unpins it. */
  trim(): void {
    while (this.#entries.length > this.#capacity) {
      const oldest = this.#entries[0];
      if (oldest === undefined || !this.#canEvict(oldest.value)) {
        return;
      }
      this.#entries.shift();
      this.#values.shift();
      const stats = this.#scopes.get(oldest.scopeKey);
      if (stats !== undefined) {
        stats.dropped += 1;
      }
    }
  }

  read(start = 0, end = this.#nextCursor, source = "browser-evidence-range"): EvidenceRangeRead<T> {
    const boundedStart = Math.max(0, Math.min(start, this.#nextCursor));
    const boundedEnd = Math.max(boundedStart, Math.min(end, this.#nextCursor));
    const selected = this.#entries.filter((entry) => entry.cursor >= boundedStart && entry.cursor < boundedEnd);
    const observed = boundedEnd - boundedStart;
    const retained = selected.length;
    const retainedStart = this.#entries.length === 0 ? this.#nextCursor : (this.#entries[0] as RingEntry<T>).cursor;
    return {
      records: selected.map((entry) => entry.value),
      receipt: {
        source,
        capacity: this.#capacity,
        observed,
        retained,
        dropped: observed - retained,
        complete: observed === retained && retained <= this.#capacity,
        cursor: { start: boundedStart, end: boundedEnd, retainedStart },
        scope: aggregateScope(),
      },
    };
  }

  receipts(source: string): readonly BrowserEvidenceRetentionReceipt[] {
    const retainedStart = this.#entries.length === 0 ? this.#nextCursor : (this.#entries[0] as RingEntry<T>).cursor;
    const aggregate: BrowserEvidenceRetentionReceipt = {
      source,
      capacity: this.#capacity,
      observed: this.#nextCursor,
      retained: this.#entries.length,
      dropped: this.#nextCursor - this.#entries.length,
      complete: this.#nextCursor === this.#entries.length && this.#entries.length <= this.#capacity,
      cursor: { start: 0, end: this.#nextCursor, retainedStart },
      scope: aggregateScope(),
    };
    const exact = [...this.#scopes.entries()].map(([key, stats]): BrowserEvidenceRetentionReceipt => {
      const retainedEntries = this.#entries.filter((entry) => entry.scopeKey === key);
      return {
        source,
        capacity: this.#capacity,
        observed: stats.observed,
        retained: retainedEntries.length,
        dropped: stats.dropped,
        complete: stats.dropped === 0 && retainedEntries.length <= this.#capacity,
        cursor: { start: stats.start, end: stats.end, retainedStart: retainedEntries[0]?.cursor ?? stats.end },
        scope: stats.scope,
      };
    });
    return [aggregate, ...exact];
  }
}

/** Latest-per-key LRU. Updating a key moves it newest; only distinct-key eviction counts as dropped. */
export class BoundedLatestMap<K, V> {
  readonly #capacity: number;
  readonly #entries = new Map<K, V>();
  readonly #entryScopes = new Map<K, InstrumentCurrentScope>();
  readonly #entryCursors = new Map<K, number>();
  readonly #scopeStats = new Map<string, ScopeStats>();
  #observed = 0;

  constructor(capacity: number) {
    if (!(Number.isInteger(capacity) && capacity > 0)) {
      throw new Error(`latest-map capacity must be a positive integer, got ${String(capacity)}`);
    }
    this.#capacity = capacity;
  }

  get size(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
    this.#entryScopes.clear();
    this.#entryCursors.clear();
    this.#scopeStats.clear();
    this.#observed = 0;
  }

  #recordNew(key: K, scope: InstrumentCurrentScope): void {
    const cursor = this.#observed;
    this.#observed += 1;
    const identity = scopeKey(scope);
    const stats = this.#scopeStats.get(identity) ?? { scope, observed: 0, dropped: 0, start: cursor, end: cursor + 1 };
    stats.observed += 1;
    stats.end = cursor + 1;
    this.#scopeStats.set(identity, stats);
    this.#entryScopes.set(key, scope);
    this.#entryCursors.set(key, cursor);
  }

  #moveScope(key: K, scope: InstrumentCurrentScope): void {
    const previous = this.#entryScopes.get(key);
    const cursor = this.#entryCursors.get(key);
    if (previous === undefined || cursor === undefined) {
      throw new Error("INSTRUMENT ERROR: latest-map key has no retained scope receipt");
    }
    const previousKey = scopeKey(previous);
    const nextKey = scopeKey(scope);
    if (previousKey !== nextKey) {
      const priorStats = this.#scopeStats.get(previousKey);
      if (priorStats !== undefined) {
        priorStats.observed -= 1;
        if (priorStats.observed === 0 && priorStats.dropped === 0) {
          this.#scopeStats.delete(previousKey);
        }
      }
      const nextStats = this.#scopeStats.get(nextKey) ?? { scope, observed: 0, dropped: 0, start: cursor, end: cursor + 1 };
      nextStats.observed += 1;
      nextStats.start = Math.min(nextStats.start, cursor);
      nextStats.end = Math.max(nextStats.end, cursor + 1);
      this.#scopeStats.set(nextKey, nextStats);
      this.#entryScopes.set(key, scope);
    }
  }

  #recordDrop(key: K): void {
    const scope = this.#entryScopes.get(key);
    if (scope !== undefined) {
      const stats = this.#scopeStats.get(scopeKey(scope));
      if (stats !== undefined) {
        stats.dropped += 1;
      }
    }
    this.#entryScopes.delete(key);
    this.#entryCursors.delete(key);
  }

  set(key: K, value: V, scope: InstrumentCurrentScope): this {
    const replacement = this.#entries.has(key);
    if (replacement) {
      this.#entries.delete(key);
    }
    this.#entries.set(key, value);
    if (replacement) {
      this.#moveScope(key, scope);
    } else {
      this.#recordNew(key, scope);
    }
    while (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.keys().next().value as K | undefined;
      if (oldest === undefined) {
        break;
      }
      this.#entries.delete(oldest);
      this.#recordDrop(oldest);
    }
    return this;
  }

  get(key: K): V | undefined {
    return this.#entries.get(key);
  }

  has(key: K): boolean {
    return this.#entries.has(key);
  }

  view(): ReadonlyMap<K, V> {
    return this.#entries;
  }

  receipts(source: string): readonly BrowserEvidenceRetentionReceipt[] {
    const retainedStart = this.#entryCursors.size === 0 ? this.#observed : Math.min(...this.#entryCursors.values());
    return [
      {
        source,
        capacity: this.#capacity,
        observed: this.#observed,
        retained: this.#entries.size,
        dropped: this.#observed - this.#entries.size,
        complete: this.#observed === this.#entries.size,
        cursor: { start: 0, end: this.#observed, retainedStart },
        scope: aggregateScope(),
      },
      ...[...this.#scopeStats.entries()].map(([identity, stats]) => {
        const retained = [...this.#entryScopes.values()].filter((scope) => scopeKey(scope) === identity).length;
        const retainedCursors = [...this.#entryScopes.entries()].flatMap(([key, scope]) => (scopeKey(scope) === identity ? [this.#entryCursors.get(key)] : []));
        return {
          source,
          capacity: this.#capacity,
          observed: stats.observed,
          retained,
          dropped: stats.dropped,
          complete: stats.dropped === 0,
          cursor: {
            start: stats.start,
            end: stats.end,
            retainedStart: retainedCursors.length === 0 ? stats.end : Math.min(...retainedCursors.filter((value): value is number => value !== undefined)),
          },
          scope: stats.scope,
        };
      }),
    ];
  }
}

export function retentionLimits(rows: readonly BrowserEvidenceRetentionReceipt[]): readonly InstrumentArtifactLimitReceipt[] {
  const bySource = new Map<string, InstrumentArtifactLimitReceipt["events"][number][]>();
  const capacities = new Map<string, number>();
  for (const row of rows) {
    if (row.dropped > 0 && row.scope.context.kind === "exact") {
      const group = bySource.get(row.source) ?? [];
      group.push({
        kind: "eviction",
        path: scopePath(row.scope),
        original: row.observed,
        retained: row.retained,
        omitted: row.dropped,
      });
      bySource.set(row.source, group);
    }
    const aggregate = row.scope.context.kind === "aggregate" && row.scope.page.kind === "aggregate" && row.scope.window.kind === "aggregate";
    if (row.retained > row.capacity && aggregate) {
      const group = bySource.get(row.source) ?? [];
      group.push({
        kind: "protected-overflow",
        path: scopePath(row.scope),
        original: row.observed,
        retained: row.retained,
        omitted: row.dropped,
      });
      bySource.set(row.source, group);
    }
    capacities.set(row.source, row.capacity);
  }
  return [...bySource.entries()].map(
    ([source, events]): InstrumentArtifactLimitReceipt => ({
      source,
      complete: false,
      policy: { capacity: capacities.get(source) ?? 0 },
      events,
    }),
  );
}

export function retentionBatch(rows: readonly BrowserEvidenceRetentionReceipt[]): BrowserEvidenceRetentionBatch {
  return browserEvidenceRetentionBatchSchema.parse({ v: 1, rows, limits: retentionLimits(rows) });
}

function isAggregateScope(scope: InstrumentCurrentScope): boolean {
  return scope.context.kind === "aggregate" && scope.page.kind === "aggregate" && scope.window.kind === "aggregate";
}

/** One non-duplicating diagnostic verdict over aggregate rows; exact-scope rows remain attribution only. */
export function diagnosticRetentionSummary(batch: BrowserEvidenceRetentionBatch): DiagnosticRetentionSummary {
  const expected = new Set<string>([BROWSER_EVIDENCE_SOURCES.diagnostics, BROWSER_EVIDENCE_SOURCES.diagnosticCompleteness]);
  const rows = batch.rows.filter((row) => expected.has(row.source) && isAggregateScope(row.scope));
  const sources = [...new Set(rows.map((row) => row.source))];
  return {
    complete: sources.length === expected.size && rows.every((row) => row.complete),
    dropped: rows.reduce((total, row) => total + row.dropped, 0),
    sources,
  };
}
