import type { DocFormat } from "@orb/contracts/extraction";
import { DOC_FORMATS, ExtractionFailedError, UnsupportedDocTypeError } from "@orb/contracts/extraction";
import { expect, test } from "../../support/fixtures.ts";

// ── The extraction FORMAT axis (databank-design/04 §1) — the ONE tuple the MIME→format map + the
// format→loader Record derive from (a new member without a loader is a tsc error in infra/extraction). ──
test("DOC_FORMATS is exactly the pinned format axis [pdf, html, markdown, text, docx, epub]", () => {
  expect(DOC_FORMATS).toEqual(["pdf", "html", "markdown", "text", "docx", "epub"]);
});

// Exhaustiveness: a `Record<DocFormat, …>` is tsc-red if a member is added/removed (no inline re-spelling).
const FORMAT_SEEN: Record<DocFormat, true> = {
  pdf: true,
  html: true,
  markdown: true,
  text: true,
  docx: true,
  epub: true,
};
test("DocFormat has no member beyond the tuple", () => {
  expect(Object.keys(FORMAT_SEEN).sort()).toEqual([...DOC_FORMATS].sort());
});

// ── The error pair (databank-design/04 §1) — the client renders "unsupported type" vs "extraction failed"
// distinctly, so the two identities must stay DISTINCT and carry their load-bearing payloads. ──
test("UnsupportedDocTypeError is an Error, names itself, and carries the offending mime", () => {
  const err = new UnsupportedDocTypeError("application/x-tar");
  expect(err).toBeInstanceOf(Error);
  expect(err).toBeInstanceOf(UnsupportedDocTypeError);
  expect(err.name).toBe("UnsupportedDocTypeError");
  expect(err.mime).toBe("application/x-tar");
  expect(err.message).toContain("application/x-tar");
  // Never conflated with the parse-failure identity (thrown BEFORE any parse; a 415-class, never wrapped).
  expect(err).not.toBeInstanceOf(ExtractionFailedError);
});

test("ExtractionFailedError is an Error, names itself, carries the format, and propagates its cause", () => {
  const cause = new Error("corrupt xref table");
  const err = new ExtractionFailedError("pdf", { cause });
  expect(err).toBeInstanceOf(Error);
  expect(err).toBeInstanceOf(ExtractionFailedError);
  expect(err.name).toBe("ExtractionFailedError");
  expect(err.format).toBe("pdf");
  expect(err.message).toContain("pdf");
  expect(err.cause).toBe(cause);
  expect(err).not.toBeInstanceOf(UnsupportedDocTypeError);
});
