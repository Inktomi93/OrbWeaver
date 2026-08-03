// Shared databank CT fixtures — the document rows every databank CT stubs `databank.list` with, and the
// one `routeTrpc` wiring they all need. ONE home so the three panes are asserted against the SAME bank (a
// per-file copy is how the list's "12 chunks" and the detail's "12 / 12 embedded" drift into disagreeing
// about one document), and so a contract change to `DocumentView` lands in one place.
//
// The three rows are the three phases the surface must tell apart: READY (the steady state), INDEXING (a
// partial embed) and EMPTY (a scanned file that extracted to nothing).

import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes } from "../../../support/ct/route-trpc";
import { routeTrpc } from "../../../support/ct/route-trpc";

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
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

export const INDEXING_DOC = {
  ...READY_DOC,
  id: "document_00000000000000000002",
  name: "Duskwater Barony",
  origin: "wiki",
  byteSize: 93_901,
  chunkCount: 39,
  embeddedCount: 22,
  updatedAt: 1_699_999_999_000,
};

const EMPTY_DOC = {
  ...READY_DOC,
  id: "document_00000000000000000003",
  name: "Heraldry plates",
  byteSize: 12_373_197,
  charCount: 0,
  chunkCount: 0,
  embeddedCount: 0,
  updatedAt: 1_699_999_998_000,
};

export const SOURCE_TEXT = "HOUSE VALEROTH — the elder line, seated at Duskwater since the Compact.";

/** The bank as the surfaces read it: three documents, with the READY one globally attached. `over` replaces
 *  any route (an empty bank, a failing write) without re-spelling the rest. */
export function stubDatabank(page: Page, over: TrpcRoutes = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "databank.list": () => [READY_DOC, INDEXING_DOC, EMPTY_DOC],
    "databank.listGlobal": () => [READY_DOC.id],
    // Resolve the REQUESTED document, so "the row you clicked is the document you got" is a real assertion
    // rather than a stub that would answer the same either way.
    "databank.get": (input: unknown) => {
      const { id, includeText } = input as { id: string; includeText?: boolean };
      const row = [READY_DOC, INDEXING_DOC, EMPTY_DOC].find((d) => d.id === id) ?? READY_DOC;
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
