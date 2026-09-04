---
kind: design
status: active
updated: 2026-09-04
---

# Browser evidence retention

## Ruling

One `_shared/browser-evidence-ring.ts` owner provides bounded retention, monotonic cursors, range reads,
and JSON-safe receipts for every array-like browser channel. Browser launch/attach ownership, listeners,
and the `ProbeSession` path stay unchanged. `docs/design/1208-instrument-substrate.md` remains the browser
substrate authority.

## Cursor contract

`cursor()` is the next never-decreasing sequence number. A range is `[start,end)` in sequence space, not
an array index. `read(start,end)` returns retained records in original order plus the exact omitted count;
wraparound cannot shift either boundary. A ring keeps newest records, reports every eviction against the
record's `{contextIndex,pageIndex,evidenceWindow}`, and exposes a below-cap `complete:true` twin.

```ts
interface BrowserEvidenceRetentionReceipt {
  readonly source: string;
  readonly capacity: number;
  readonly observed: number;
  readonly retained: number;
  readonly dropped: number;
  readonly complete: boolean;
  readonly cursor: { readonly start: number; readonly end: number; readonly retainedStart: number };
  readonly scope: InstrumentCurrentScope;
}
```

Exact rows use `_shared/artifact-scope.ts`'s branded context/page/window dimensions. The aggregate row uses
that module's explicit aggregate/all dimensions, never null or raw indices. The browser owner also
projects evictions once into `InstrumentArtifactLimitReceipt[]`. Snap run facts, session export, HAR, and
diagnostics consume this receipt; they never normalize a parallel counter.

## Measured capacities

The prior live-stage request census reached about 2,445 records. Network and request-summary capacity is
8,192 (over 3× that run); console is 8,192; page errors 2,048; diagnostics 16,384. Tests inject practical
small capacities through the same constructors. Caps are policy constants, not byte-disk redaction caps.

## Network lifecycle

CDP Network tracks active request ids separately from completed records. Redirect generations remain
protected until the final generation settles. Active and body-read-pending records may temporarily exceed
the completed cap, which emits an explicit incomplete `protected-overflow` receipt rather than pretending
zero loss means completeness. Settlement makes the whole chain evictable; oldest completed records trim
first, and eviction removes chain and pending-extra state. Request/response body reads live in a
`Set<Promise<void>>`, have a bounded timeout, persist `unavailableReason:"timeout"`, and release their
retention pin on every terminal path. The URL summary is an explicit latest-per-URL LRU whose values and
scope/drop receipts share one ordering owner; replacement moves the key newest without minting a second
observation.

## Migration

`ProbeContext` and `ProbeSession` retain ordinary read-only record views for report code and carry the
ring owners for cursor/receipt reads. Page errors are discriminated `runtime|instrument` records in the
ring and disk artifacts; only human output renders the `INSTRUMENT ERROR:` prefix. Console/page-error
checkpoint and scenario windows store cursors, never retained-array lengths. Session export and core
capture serialize retained values with the shared receipts. A requested range with omissions is
incomplete even when its retained suffix is non-empty.

## Proof

`tests/tooling/_shared/browser-retention.suite.int.test.ts` plants every channel above a small injected
cap, redirect and active-request overflow, selected-body completion, clean below-cap twins, and a
checkpoint cursor spanning wraparound. The unit proofs compose same-key replacement with distinct-key
eviction and another replacement, and hang both CDP body reads to prove timeout omissions release the
pin. Existing browser/network/HAR/session suites remain the ownership and serialization regression
boundary.
