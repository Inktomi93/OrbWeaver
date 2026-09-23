// infra/extraction/loaders/docx — the docx loader. Asserts the OOXML paragraph pull:
// `<w:t>` runs concatenated per `<w:p>`, paragraphs joined `\n\n`, `<w:tab>`/`<w:br>` → whitespace, XML entities
// decoded, and the failure modes (a non-zip / a zip missing `word/document.xml`). The fixture zips REAL OOXML.

import { zipSync } from "fflate";
import { loadDocx } from "../../../../../packages/server/src/infra/extraction/loaders/docx.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { buildDocx } from "../_fixtures.ts";

const enc = new TextEncoder();
const MISSING_DOCUMENT = /word\/document\.xml/;
const DUPLICATE_DOCUMENT = /more than one word\/document\.xml/;
/** The real part name, and a DECOY of exactly the same byte length — equal length is what lets the decoy be
 *  overwritten in place afterwards without moving a single zip offset. */
const DOCUMENT_PART = "word/document.xml";
const DECOY_PART = "word/documentZ.xm";

/** Zip an arbitrary `word/document.xml` body (for the run/tab/break/entity cases the paragraph builder can't spell). */
function docxWithDocumentXml(documentXml: string): Uint8Array {
  return zipSync({ "word/document.xml": enc.encode(documentXml) });
}

/** A zip carrying `word/document.xml` TWICE — the crafted archive `zipSync` cannot express, because its
 *  input is a Record and a Record has no duplicate keys. Built by zipping the real part beside an
 *  equal-length decoy and then renaming the decoy IN PLACE (local header + central record both, every
 *  occurrence), which leaves every stored offset and every length field correct. */
function duplicatePartDocx(documentXml: string): Uint8Array {
  const zip = zipSync({ [DOCUMENT_PART]: enc.encode(documentXml), [DECOY_PART]: enc.encode(documentXml) });
  const decoy = enc.encode(DECOY_PART);
  const real = enc.encode(DOCUMENT_PART);
  for (let i = 0; i + decoy.length <= zip.length; i += 1) {
    if (decoy.every((byte, k) => zip[i + k] === byte)) {
      zip.set(real, i);
    }
  }
  return zip;
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

// #1635: `documentFilter` matched on NAME alone, so a crafted zip carrying N entries all called
// `word/document.xml` inflated ALL of them — each under the 64 MiB per-part cap, with nothing counting
// them, and only the last surviving in the Record-keyed result. A legitimate OOXML package has exactly one
// document part, so a second is a crafted archive and gets a loud named refusal rather than a silent
// last-one-wins. Same stateful-CLOSURE shape as the epub aggregate budget (`epub.ts`): a per-call filter,
// never module state, or one call's count would leak into the next.
test("refuses a zip carrying a SECOND word/document.xml rather than inflating every copy", () => {
  const xml = "<w:document><w:body><w:p><w:r><w:t>One</w:t></w:r></w:p></w:body></w:document>";
  expect(() => loadDocx(duplicatePartDocx(xml))).toThrow(DUPLICATE_DOCUMENT);
});

test("the duplicate guard is per-call, not module state — two separate single-part loads both succeed", async () => {
  // The closure regression: a module-level "seen" flag would refuse the SECOND document the process ever
  // loads, an outage that only appears after the first upload of a boot.
  const first = await loadDocx(buildDocx(["Alpha."]));
  const second = await loadDocx(buildDocx(["Bravo."]));
  expect([first.text, second.text]).toEqual(["Alpha.", "Bravo."]);
});
