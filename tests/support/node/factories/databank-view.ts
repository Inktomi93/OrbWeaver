// Wire-output builder for the databank document list (`databank.list`). The page parses through the contract
// schema; the items are spread after the parse.

import { listDocumentsResultSchema } from "@orb/contracts/databank";
import type { TrpcWireOutput } from "../route-trpc.ts";

type DocumentListWire = TrpcWireOutput<"databank.list">;

/** A `databank.list` page over `items`; `totalCount` is the item count unless the override says otherwise. */
export function makeDocumentListPage(items: DocumentListWire["items"] = [], overrides: Partial<DocumentListWire> = {}): DocumentListWire {
  return { ...listDocumentsResultSchema.parse({ items: [], nextCursor: null, totalCount: 0 }), items, totalCount: items.length, ...overrides };
}
