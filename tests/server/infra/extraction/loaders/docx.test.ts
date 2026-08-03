// infra/extraction/loaders/docx — the docx loader (databank-design/04 §2). Asserts the OOXML paragraph pull:
// `<w:t>` runs concatenated per `<w:p>`, paragraphs joined `\n\n`, `<w:tab>`/`<w:br>` → whitespace, XML entities
// decoded, and the failure modes (a non-zip / a zip missing `word/document.xml`). The fixture zips REAL OOXML.

import { zipSync } from "fflate";
import { loadDocx } from "../../../../../packages/server/src/infra/extraction/loaders/docx.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { buildDocx } from "../_fixtures.ts";

const enc = new TextEncoder();
const MISSING_DOCUMENT = /word\/document\.xml/;

/** Zip an arbitrary `word/document.xml` body (for the run/tab/break/entity cases the paragraph builder can't spell). */
function docxWithDocumentXml(documentXml: string): Uint8Array {
  return zipSync({ "word/document.xml": enc.encode(documentXml) });
}

test("joins <w:t> runs per paragraph and paragraphs with a blank line", async () => {
  const out = await loadDocx(buildDocx(["First paragraph.", "Second paragraph."]));
  expect(out.text).toBe("First paragraph.\n\nSecond paragraph.");
});

test("concatenates multiple runs inside one paragraph, and renders tab/break as whitespace", async () => {
  const xml =
    "<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>world</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>line2</w:t></w:r></w:p></w:body></w:document>";
  const out = await loadDocx(docxWithDocumentXml(xml));
  expect(out.text).toBe("Hello\tworld\nline2");
});

test("decodes XML entities in run text", async () => {
  const xml = "<w:document><w:body><w:p><w:r><w:t>Tom &amp; Jerry &lt;3</w:t></w:r></w:p></w:body></w:document>";
  const out = await loadDocx(docxWithDocumentXml(xml));
  expect(out.text).toBe("Tom & Jerry <3");
});

test("a doc with no runs extracts to empty text (truthful, not a throw)", async () => {
  const out = await loadDocx(buildDocx([]));
  expect(out.text).toBe("");
});

test("non-zip bytes throw (the dispatch wraps as ExtractionFailedError)", () => {
  expect(() => loadDocx(enc.encode("PK not a real zip"))).toThrow();
});

test("a zip missing word/document.xml throws", () => {
  expect(() => loadDocx(zipSync({ "other.xml": enc.encode("<x/>") }))).toThrow(MISSING_DOCUMENT);
});
