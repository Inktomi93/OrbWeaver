// Shared databank CT fixtures — the document rows every databank CT stubs `databank.list` with, and the
// one `routeTrpc` wiring they all need. ONE home so the three panes are asserted against the SAME bank (a
// per-file copy is how the list's "12 chunks" and the detail's "12 / 12 embedded" drift into disagreeing
// about one document), and so a contract change to `DocumentView` lands in one place.
//
// The four rows are the four phases the surface must tell apart: READY (the steady state), INDEXING (a
// partial embed), EMPTY (a scanned file that extracted to nothing) and STALLED (an in-flight row whose
// `updatedAt` froze — the one the DBFIX lane added, because that is what a document whose ingest was
// refused or whose worker died looks like, and it used to read `Queued` on this list forever).
//
// THE BROWSER CLOCK IS FROZEN at the suite-wide `FROZEN_AT_MS`, and the timestamps below are offsets from
// it. The stall verdict is `now - updatedAt >= 5 min` where `now` is the query's own `dataUpdatedAt` — i.e.
// the PAGE's clock. Against a live wall clock these fixtures would drift out from under the states they are
// named for (every in-flight row reading `Stalled` once real time passed the literals), and reading the
// ambient clock here to compensate is exactly the nondeterminism `test-determinism` forbids. So
// `stubDatabank` pins the page clock with `page.clock.setFixedTime` — the date reader ONLY, no timer faking,
// so the surface's own 4s ingest poll and playwright's auto-waiting still run for real.

import { DATABANK_LIST_DEFAULT_LIMIT } from "@orb/contracts/databank";
import type { Page } from "@playwright/test";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import type { TrpcRecorder, TrpcRoutes } from "../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../support/ct/route-trpc.ts";

/** Comfortably past the model's 5-minute stall threshold — a frozen row, not a slow one. */
const WEDGED_AGO_MS = 3_600_000;

/** The instant every databank CT's page believes it is — the SAME instant the server suites freeze at. */
const NOW = FROZEN_AT_MS;

export const READY_DOC = {
  id: "document_00000000000000000001",
  name: "The Crimson Court",
  mime: "application/pdf",
  origin: "upload",
  sourceUrl: null,
  byteSize: 25_088,
  charCount: 4200,
  chunkCount: 12,
  embeddedCount: 12,
  createdAt: NOW,
  updatedAt: NOW,
};

export const INDEXING_DOC = {
  ...READY_DOC,
  id: "document_00000000000000000002",
  name: "Duskwater Barony",
  origin: "wiki",
  byteSize: 93_901,
  chunkCount: 39,
  embeddedCount: 22,
};

const EMPTY_DOC = {
  ...READY_DOC,
  id: "document_00000000000000000003",
  name: "Heraldry plates",
  byteSize: 12_373_197,
  charCount: 0,
  chunkCount: 0,
  embeddedCount: 0,
};

// The parked-forever row: real text, ZERO chunks, and an `updatedAt` that stopped moving an hour ago. Not
// exported — like EMPTY_DOC, no CT needs its id, only the state it puts on the list.
const STALLED_DOC = {
  ...READY_DOC,
  id: "document_00000000000000000004",
  name: "Treaty of Ashfen",
  origin: "text",
  byteSize: 8192,
  chunkCount: 0,
  embeddedCount: 0,
  createdAt: NOW - WEDGED_AGO_MS,
  updatedAt: NOW - WEDGED_AGO_MS,
};

export const SOURCE_TEXT = "HOUSE VALEROTH — the elder line, seated at Duskwater since the Compact.";

/** One row as the stub serves it — the fixture shape, structural (a CT never mints a branded id). */
type StubDocument = typeof READY_DOC;

/**
 * A `databank.list` responder that PAGES the way the verb pages — keyset on `(updatedAt, id)`, `limit` rows,
 * `nextCursor` only on a FULL page. A stub that returned the whole array regardless of `cursor` would make
 * every pagination assertion pass against a surface that never paged at all: the rows would already be
 * there. So the fake carries the verb's contract, and "document 101 is reachable" is a claim about the
 * SURFACE's paging, not about a generous stub.
 */
export function pagedBank(documents: readonly StubDocument[]): (input: unknown) => { items: readonly StubDocument[]; nextCursor: unknown } {
  return (input: unknown) => {
    const { limit, cursor } = (input ?? {}) as { limit?: number; cursor?: { readonly id: string } | null };
    const size = limit ?? DATABANK_LIST_DEFAULT_LIMIT;
    const start = cursor === undefined || cursor === null ? 0 : documents.findIndex((doc) => doc.id === cursor.id) + 1;
    const items = documents.slice(start, start + size);
    const last = items.at(-1);
    const nextCursor = items.length === size && last !== undefined ? { updatedAt: last.updatedAt, id: last.id } : null;
    return { items, nextCursor };
  };
}

/** The bank as the surfaces read it: four documents, with the READY one globally attached. `over` replaces
 *  any route (an empty bank, a failing write) without re-spelling the rest. */
export async function stubDatabank(page: Page, over: TrpcRoutes = {}): Promise<TrpcRecorder> {
  // Pin the page's `Date.now` so `dataUpdatedAt` — the clock the stall verdict reads — is the same instant
  // the rows below are dated against, on every run and every machine.
  await page.clock.setFixedTime(NOW);
  return routeTrpc(page, {
    "databank.list": pagedBank([READY_DOC, INDEXING_DOC, EMPTY_DOC, STALLED_DOC]),
    "databank.listGlobal": () => [READY_DOC.id],
    // Resolve the REQUESTED document, so "the row you clicked is the document you got" is a real assertion
    // rather than a stub that would answer the same either way.
    "databank.get": (input: unknown) => {
      const { id, includeText } = input as { id: string; includeText?: boolean };
      const row = [READY_DOC, INDEXING_DOC, EMPTY_DOC, STALLED_DOC].find((d) => d.id === id) ?? READY_DOC;
      return { ...row, ...(includeText === true ? { extractedText: SOURCE_TEXT } : {}) };
    },
    "databank.listAttachments": () => ({ global: true, chatIds: ["chat_00000000000000000001"], characterIds: [] }),
    "databank.reindex": () => ({ workloadId: "workload_0000000000000000001" }),
    "databank.attachGlobal": () => null,
    "databank.detachGlobal": () => null,
    "databank.remove": () => null,
    "databank.rename": () => READY_DOC,
    ...over,
  });
}
