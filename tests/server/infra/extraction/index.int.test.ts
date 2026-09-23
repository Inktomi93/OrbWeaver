// infra/extraction — the dispatcher `createExtractText`, end-to-end over the real
// loaders (integration lane — pdf runs real pdfjs). Pins: mime→format dispatch (with parameter stripping),
// the EXTRACTOR_VERSION + charCount stamp, normalization applied through the dispatch, the UnsupportedDocType
// arm (before any parse), the docx/epub zip-container dispatch, and the ExtractionFailedError wrapping per format.

import { ExtractionFailedError, UnsupportedDocTypeError } from "@orb/contracts/extraction";
import { createExtractText, EXTRACTOR_VERSION } from "@orb/server/infra/extraction";
import { expect, test } from "../../../support/fixtures.ts";
import { buildDocx, buildEpub, buildPdf } from "./_fixtures.ts";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const EPUB_MIME = "application/epub+zip";

const enc = new TextEncoder();
const extract = createExtractText();

test("EXTRACTOR_VERSION is the canonical '1' (supersedes the passthrough's textlike-1)", () => {
  expect(EXTRACTOR_VERSION).toBe("1");
});

test("dispatches text/plain and stamps version + charCount, normalizing newlines", async () => {
  const result = await extract(enc.encode("first\r\nsecond"), "text/plain");
  expect(result.text).toBe("first\nsecond");
  expect(result.meta).toEqual({ format: "text", extractorVersion: "1", charCount: 12 });
});

test("dispatches both markdown mimes (canonical + x- alias)", async () => {
  const md = "# Title\n\n- a";
  expect((await extract(enc.encode(md), "text/markdown")).meta.format).toBe("markdown");
  expect((await extract(enc.encode(md), "text/x-markdown")).meta.format).toBe("markdown");
});

test("strips mime parameters before the lookup (text/html; charset=utf-8 → html)", async () => {
  const result = await extract(enc.encode("<html><head><title>T</title></head><body><p>hi</p></body></html>"), "text/html; charset=utf-8");
  expect(result.meta.format).toBe("html");
  expect(result.meta.title).toBe("T");
  expect(result.text).toContain("hi");
});

test("dispatches application/pdf with pageCount + normalized text", async () => {
  const result = await extract(buildPdf(["Doc Body"]), "application/pdf");
  expect(result.meta.format).toBe("pdf");
  expect(result.meta.pageCount).toBe(1);
  expect(result.text).toContain("Doc Body");
});

test("empty-text extraction is truthful (charCount 0, no throw)", async () => {
  const result = await extract(buildPdf([""]), "application/pdf");
  expect(result.text).toBe("");
  expect(result.meta.charCount).toBe(0);
});

test("an unregistered mime throws UnsupportedDocTypeError before any parse", async () => {
  await expect(extract(enc.encode("PK\x03\x04"), "application/zip")).rejects.toBeInstanceOf(UnsupportedDocTypeError);
});

test("dispatches the docx zip-container mime → format 'docx' with the body text", async () => {
  const result = await extract(buildDocx(["First para.", "Second para."]), DOCX_MIME);
  expect(result.meta.format).toBe("docx");
  expect(result.text).toBe("First para.\n\nSecond para.");
});

test("dispatches the epub zip-container mime → format 'epub' with the chapter text + OPF title", async () => {
  const result = await extract(buildEpub({ title: "The Book", chapters: ["Chapter one.", "Chapter two."] }), EPUB_MIME);
  expect(result.meta.format).toBe("epub");
  expect(result.meta.title).toBe("The Book");
  expect(result.text).toContain("Chapter one.");
  expect(result.text).toContain("Chapter two.");
});

test("a corrupt docx (not a zip) wraps as ExtractionFailedError(format:'docx')", async () => {
  const error = await extract(enc.encode("PK not really a zip"), DOCX_MIME).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ExtractionFailedError);
  expect((error as ExtractionFailedError).format).toBe("docx");
});

test("invalid UTF-8 text/plain is wrapped as ExtractionFailedError(format:'text') with a cause", async () => {
  const error = await extract(new Uint8Array([0x68, 0xff]), "text/plain").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ExtractionFailedError);
  expect((error as ExtractionFailedError).format).toBe("text");
  expect((error as ExtractionFailedError).cause).toBeDefined();
});

test("corrupt pdf bytes are wrapped as ExtractionFailedError(format:'pdf')", async () => {
  const error = await extract(enc.encode("%PDF-1.4 broken"), "application/pdf").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ExtractionFailedError);
  expect((error as ExtractionFailedError).format).toBe("pdf");
});
