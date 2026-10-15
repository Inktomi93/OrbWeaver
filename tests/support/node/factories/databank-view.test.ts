// @subject tests/support/node/factories/databank-view.ts
import { expect, test } from "../fixtures.ts";
import { makeDocumentCreation, makeDocumentDetailView, makeDocumentListPage, makeDocumentView } from "./databank-view.ts";

test("document snapshots keep an unrequested source absent, an explicitly empty source present and a page census independent", () => {
  const document = makeDocumentView();
  const metadata = makeDocumentDetailView(document);
  expect(metadata).toEqual(document);
  expect(metadata).not.toHaveProperty("extractedText");
  const source = makeDocumentDetailView({ ...document, extractedText: "" });
  expect(source).toEqual({ ...document, extractedText: "" });
  expect(document).not.toHaveProperty("extractedText");
  const cursor = { updatedAt: document.updatedAt, id: document.id };
  const page = makeDocumentListPage([document], { nextCursor: cursor, totalCount: 7 });
  expect(page).toEqual({ items: [document], nextCursor: cursor, totalCount: 7 });
  expect(makeDocumentListPage()).toEqual({ items: [], nextCursor: null, totalCount: 0 });
  expect(makeDocumentView().id).not.toBe(document.id);
});

test("creation snapshots preserve canonical document identity across distinct dedup, queue refusal and extraction-warning axes", () => {
  const created = makeDocumentCreation();
  const duplicate = makeDocumentCreation({ document: created.document, outcome: "duplicate", ingest: "skipped" });
  const notQueued = makeDocumentCreation({ document: created.document, ingest: "not-queued" });
  const emptyExtraction = makeDocumentCreation({ document: created.document, warning: "empty-extraction" });
  expect(duplicate).toEqual({ document: created.document, outcome: "duplicate", ingest: "skipped" });
  expect(notQueued).toEqual({ document: created.document, outcome: "created", ingest: "not-queued" });
  expect(emptyExtraction).toEqual({ ...created, warning: "empty-extraction" });
  expect(created).not.toHaveProperty("warning");
  expect(duplicate).not.toHaveProperty("warning");
});
