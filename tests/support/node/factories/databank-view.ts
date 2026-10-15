// Browser-safe document snapshots retain source absence, queue outcomes and page census independently.

import { documentDetailViewSchema, documentViewSchema, listDocumentsResultSchema, uploadResultSchema } from "@orb/contracts/databank";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

type DocumentListWire = TrpcWireOutput<"databank.list">;
const ids = createSeededIds();

/** Empty extracted canon has neither passages nor source URL; private storage metadata never enters the view. */
export function makeDocumentView(overrides: Partial<DocumentListWire["items"][number]> = {}): DocumentListWire["items"][number] {
  return {
    ...documentViewSchema.parse({
      id: ids.next(ID_PREFIX.document),
      name: "Document",
      mime: "text/plain",
      origin: "text",
      sourceUrl: null,
      byteSize: 0,
      charCount: 0,
      chunkCount: 0,
      embeddedCount: 0,
      createdAt: FROZEN_AT_MS,
      updatedAt: FROZEN_AT_MS,
    }),
    ...overrides,
  };
}

/** The source is absent by default, not an empty string pretending the caller requested it. */
export function makeDocumentDetailView(overrides: Partial<TrpcWireOutput<"databank.get">> = {}): TrpcWireOutput<"databank.get"> {
  return { ...documentDetailViewSchema.parse(makeDocumentView()), ...overrides };
}

/** Canonical creation snapshots keep the admission outcome separate from whether canon was newly created. */
export function makeDocumentCreation(overrides: Partial<TrpcWireOutput<"databank.createFromText">> = {}): TrpcWireOutput<"databank.createFromText"> {
  return { ...uploadResultSchema.parse({ document: makeDocumentView(), outcome: "created", ingest: "queued" }), ...overrides };
}

/** A `databank.list` page over `items`; `totalCount` is the item count unless the override says otherwise. */
export function makeDocumentListPage(items: DocumentListWire["items"] = [], overrides: Partial<DocumentListWire> = {}): DocumentListWire {
  return { ...listDocumentsResultSchema.parse({ items: [], nextCursor: null, totalCount: 0 }), items, totalCount: items.length, ...overrides };
}
