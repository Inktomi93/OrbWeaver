// Bounded out-of-order CDP ExtraInfo correlation. Active request ids may overflow; orphans may not.
import type { InstrumentCurrentScope } from "./artifact-scope.ts";
import { aggregateScope } from "./artifact-scope.ts";
import type { BrowserEvidenceRetentionReceipt } from "./browser-evidence-ring.ts";
import { BROWSER_EVIDENCE_SOURCES } from "./browser-evidence-ring.ts";

export const NETWORK_EXTRA_KINDS = ["requestExtra", "responseExtra"] as const;
export type NetworkExtraKind = (typeof NETWORK_EXTRA_KINDS)[number];

interface PendingExtra {
  readonly event: unknown;
  readonly scope: InstrumentCurrentScope;
}

interface ExtraScopeStats {
  readonly scope: InstrumentCurrentScope;
  observed: number;
  dropped: number;
  start: number;
  end: number;
}

interface PendingNetworkExtraInput {
  readonly requestId: string;
  readonly kind: NetworkExtraKind;
  readonly event: unknown;
  readonly scope: InstrumentCurrentScope;
  readonly isActive: (requestId: string) => boolean;
}

interface PendingOrderEntry {
  readonly kind: NetworkExtraKind;
  readonly requestId: string;
}

export class PendingNetworkExtras {
  readonly #request = new Map<string, PendingExtra[]>();
  readonly #response = new Map<string, PendingExtra[]>();
  readonly #evictable = new Map<string, PendingOrderEntry>();
  readonly #scopes = new Map<string, ExtraScopeStats>();
  readonly #capacity: number;
  #observed = 0;
  #dropped = 0;
  #retainedEntries = 0;

  constructor(capacity: number) {
    if (!(Number.isInteger(capacity) && capacity > 0)) {
      throw new Error(`pending ExtraInfo capacity must be a positive integer, got ${String(capacity)}`);
    }
    this.#capacity = capacity;
  }

  #map(kind: NetworkExtraKind): Map<string, PendingExtra[]> {
    return kind === "requestExtra" ? this.#request : this.#response;
  }

  #orderKey(kind: NetworkExtraKind, requestId: string): string {
    return `${kind}\0${requestId}`;
  }

  #observe(scope: InstrumentCurrentScope): void {
    const key = JSON.stringify(scope);
    const cursor = this.#observed;
    this.#observed += 1;
    const stats = this.#scopes.get(key) ?? { scope, observed: 0, dropped: 0, start: cursor, end: cursor + 1 };
    stats.observed += 1;
    stats.end = cursor + 1;
    this.#scopes.set(key, stats);
  }

  #drop(scope: InstrumentCurrentScope): void {
    const stats = this.#scopes.get(JSON.stringify(scope));
    if (stats !== undefined) {
      stats.dropped += 1;
    }
    this.#dropped += 1;
  }

  #trim(isActive: (requestId: string) => boolean): void {
    while (this.#retainedEntries > this.#capacity) {
      const candidate = this.#evictable.values().next().value;
      if (candidate === undefined) {
        return;
      }
      this.#evictable.delete(this.#orderKey(candidate.kind, candidate.requestId));
      if (isActive(candidate.requestId)) {
        continue;
      }
      const pending = this.#map(candidate.kind);
      const removed = pending.get(candidate.requestId) ?? [];
      pending.delete(candidate.requestId);
      this.#retainedEntries -= removed.length;
      for (const item of removed) {
        this.#drop(item.scope);
      }
    }
  }

  assign({ requestId, kind, event, scope, isActive }: PendingNetworkExtraInput): void {
    const pending = this.#map(kind);
    const queue = pending.get(requestId) ?? [];
    if (queue.length === 0 && !isActive(requestId)) {
      this.#evictable.set(this.#orderKey(kind, requestId), { kind, requestId });
    }
    queue.push({ event, scope });
    this.#retainedEntries += 1;
    this.#observe(scope);
    pending.set(requestId, queue);
    this.#trim(isActive);
  }

  take(requestId: string, kind: NetworkExtraKind): unknown | null {
    const pending = this.#map(kind);
    const queue = pending.get(requestId);
    const value = queue?.shift() ?? null;
    if (value !== null) {
      this.#retainedEntries -= 1;
    }
    if (queue?.length === 0) {
      pending.delete(requestId);
      this.#evictable.delete(this.#orderKey(kind, requestId));
    }
    return value?.event ?? null;
  }

  discard(requestId: string): void {
    for (const kind of NETWORK_EXTRA_KINDS) {
      const pending = this.#map(kind);
      const removed = pending.get(requestId) ?? [];
      pending.delete(requestId);
      this.#retainedEntries -= removed.length;
      this.#evictable.delete(this.#orderKey(kind, requestId));
      for (const item of removed) {
        this.#drop(item.scope);
      }
    }
  }

  clear(): void {
    for (const requestId of new Set([...this.#request.keys(), ...this.#response.keys()])) {
      this.discard(requestId);
    }
  }

  state(): { readonly requestIds: number; readonly responseIds: number } {
    return { requestIds: this.#request.size, responseIds: this.#response.size };
  }

  receipts(): readonly BrowserEvidenceRetentionReceipt[] {
    const aggregate: BrowserEvidenceRetentionReceipt = {
      source: BROWSER_EVIDENCE_SOURCES.networkExtras,
      capacity: this.#capacity,
      observed: this.#observed,
      retained: this.#observed - this.#dropped,
      dropped: this.#dropped,
      complete: this.#dropped === 0,
      cursor: { start: 0, end: this.#observed, retainedStart: this.#dropped },
      scope: aggregateScope(),
    };
    return [
      aggregate,
      ...[...this.#scopes.values()].map(
        (stats): BrowserEvidenceRetentionReceipt => ({
          source: BROWSER_EVIDENCE_SOURCES.networkExtras,
          capacity: this.#capacity,
          observed: stats.observed,
          retained: stats.observed - stats.dropped,
          dropped: stats.dropped,
          complete: stats.dropped === 0,
          cursor: { start: stats.start, end: stats.end, retainedStart: stats.dropped === 0 ? stats.start : stats.end - (stats.observed - stats.dropped) },
          scope: stats.scope,
        }),
      ),
    ];
  }
}
