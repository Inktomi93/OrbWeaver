// infra/extraction/loaders/pdf — the pdfjs-dist loader against REAL pdfjs parsing (integration lane). Uses
// the hand-rolled minimal-PDF fixture (known text, valid xref) to pin: text extraction, pageCount, the
// per-page `\n\n` join, info-dict title, empty-page truthfulness (no OCR), and the throw on corrupt bytes.

import { loadPdf } from "../../../../../packages/server/src/infra/extraction/loaders/pdf.ts";
import { expect, test } from "../../../../support/fixtures";
import { buildPdf } from "../_fixtures.ts";

test("extracts a single page's text and reports pageCount", async () => {
  const out = await loadPdf(buildPdf(["Hello Databank"]));
  expect(out.text).toContain("Hello Databank");
  expect(out.pageCount).toBe(1);
});

test("joins multiple pages with a blank line, in reading order", async () => {
  const out = await loadPdf(buildPdf(["Page One", "Page Two"]));
  expect(out.pageCount).toBe(2);
  expect(out.text).toBe("Page One\n\nPage Two");
});

test("reads the info-dict title when present", async () => {
  const out = await loadPdf(buildPdf(["body"], { title: "My PDF Title" }));
  expect(out.title).toBe("My PDF Title");
});

test("empty-text is truthful — an image-only/textless page extracts to empty, not a throw", async () => {
  const out = await loadPdf(buildPdf([""]));
  expect(out.text).toBe("");
  expect(out.pageCount).toBe(1);
});

test("throws on corrupt/truncated pdf bytes", async () => {
  await expect(loadPdf(new TextEncoder().encode("%PDF-1.4 not really a pdf"))).rejects.toThrow();
});
