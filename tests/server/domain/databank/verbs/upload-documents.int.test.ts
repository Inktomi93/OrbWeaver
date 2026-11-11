// A user uploads a pdf, a docx or an epub to the databank and reads their text back: the composed root runs the real
// extraction adapter (pdfjs-dist, fflate) behind `databank.upload`, and `databank.get` reads the stored canon.
// The docx and epub fixtures are built here from their XML parts with fflate, the library the loaders read them with,
// so the loaders' parsing of the XML inside is the subject and a zip-library bug is not. The pdf is written by hand,
// whole, with real xref offsets.
// @subject packages/server/src/domain/databank/verbs/upload.ts
// @subject packages/server/src/infra/extraction/index.ts
// @subject packages/server/src/infra/extraction/loaders/pdf.ts
// @subject packages/server/src/infra/extraction/loaders/docx.ts
// @subject packages/server/src/infra/extraction/loaders/epub.ts

import { docUploadMime, ExtractionFailedError, UnsupportedDocTypeError } from "@orb/contracts/extraction";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { strToU8, zipSync } from "fflate";

// fflate derives the DOS date from local time; a fixed mid-year UTC stamp keeps the archives deterministic.
const ZIP_MTIME = new Date("2025-07-01T12:00:00Z");
const XML_PROLOGUE = '<?xml version="1.0" encoding="UTF-8"?>';

/** One page per entry: the page's content stream, drawn on a Letter page with Helvetica as `/F1` and Times as `/F2`. */
function buildPdf(contentStreams: readonly string[]): Uint8Array {
  const firstPageId = 5;
  const pageId = (index: number): number => firstPageId + index * 2;
  const bodies = new Map<number, string>([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, `<< /Type /Pages /Kids [${contentStreams.map((_, index) => `${pageId(index)} 0 R`).join(" ")}] /Count ${contentStreams.length} >>`],
    [3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
    [4, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>"],
  ]);
  contentStreams.forEach((stream, index) => {
    bodies.set(
      pageId(index),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId(index) + 1} 0 R >>`,
    );
    bodies.set(pageId(index) + 1, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let file = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [id, body] of [...bodies].sort(([a], [b]) => a - b)) {
    offsets.push(file.length);
    file += `${id} 0 obj\n${body}\nendobj\n`;
  }
  const xrefAt = file.length;
  file += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  file += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return strToU8(file);
}

// Page one: line two is drawn in two fonts, so it holds two text items the loader joins with a space.
const PDF_PAGE_ONE = "BT /F1 12 Tf 72 720 Td (Lantern oil) Tj 0 -24 Td (burns) Tj /F2 12 Tf (slow.) Tj ET";
const PDF_PAGE_TWO = "BT /F1 12 Tf 72 720 Td (The second page.) Tj ET";
const PDF_TEXT = "Lantern oil\nburns slow.\n\nThe second page.";

// Written as a code point: a pasted combining mark is invisible in review.
const COMBINING_ACUTE = String.fromCodePoint(0x3_01);
const docxParagraph = (inner: string): string => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${inner}</w:p>`;
const docxRun = (text: string): string => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;

// Paragraph one splits its text over two runs and carries an entity; an empty paragraph follows it; paragraph two
// has a tab between runs and a decomposed e + combining acute; paragraph three breaks a line inside one run.
const DOCX_BODY = [
  docxParagraph(`${docxRun("Lantern oil")}${docxRun(" &amp; wick")}`),
  docxParagraph(""),
  docxParagraph(`${docxRun(`Cafe${COMBINING_ACUTE}`)}<w:r><w:tab/></w:r>${docxRun("open")}`),
  docxParagraph("<w:r><w:t>First line</w:t><w:br/><w:t>second line</w:t></w:r>"),
].join("");
const DOCX_TEXT = "Lantern oil & wick\n\nCafé\topen\n\nFirst line\nsecond line";

function buildDocx(documentParts: Readonly<Record<string, string>>): Uint8Array {
  const zipped = Object.fromEntries(Object.entries(documentParts).map(([path, xml]) => [path, strToU8(xml)]));
  return zipSync(zipped, { mtime: ZIP_MTIME });
}

const DOCX_PARTS = {
  "[Content_Types].xml": `${XML_PROLOGUE}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
  "_rels/.rels": `${XML_PROLOGUE}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  "word/document.xml": `${XML_PROLOGUE}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${DOCX_BODY}</w:body></w:document>`,
};

// The archive lists chapter two before chapter one and the manifest lists it first too, so only the spine puts them
// in reading order. The nav document is in the manifest but not the spine; one spine entry names a file the
// archive lacks; chapter one's href is percent-encoded and chapter two's carries an `&amp;`.
const EPUB_PARTS = {
  "META-INF/container.xml": `${XML_PROLOGUE}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  "OEBPS/content.opf": `${XML_PROLOGUE}<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Keeper's Road</dc:title></metadata><manifest><item id="two" href="text/Road&amp;Rain.xhtml" media-type="application/xhtml+xml"/><item id="one" href="text/Chapter%201.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="lost" href="text/Lost.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="lost"/><itemref idref="two"/></spine></package>`,
  "OEBPS/text/Road&Rain.xhtml": "<html><head><title>The Road</title></head><body><h1>The Road</h1><p>Lanterns line the road.</p></body></html>",
  "OEBPS/text/Chapter 1.xhtml": "<html><head><title>The Lamp</title></head><body><h1>The Lamp</h1><p>Oil &amp; wick burn slow.</p></body></html>",
  "OEBPS/nav.xhtml": "<html><body><p>Table of contents, never read.</p></body></html>",
};
const EPUB_TEXT = "The Lamp\n\nOil & wick burn slow.\n\nThe Road\n\nLanterns line the road.";

function buildEpub(): Uint8Array {
  // An epub's mimetype entry comes first and is stored, not deflated.
  const mimetype: [Uint8Array, { level: 0 }] = [strToU8("application/epub+zip"), { level: 0 }];
  const zipped = { mimetype, ...Object.fromEntries(Object.entries(EPUB_PARTS).map(([path, xml]) => [path, strToU8(xml)])) };
  return zipSync(zipped, { mtime: ZIP_MTIME });
}

interface DocumentCase {
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly text: string;
}

const PDF_BYTES = buildPdf([PDF_PAGE_ONE, PDF_PAGE_TWO]);
const DOCX_BYTES = buildDocx(DOCX_PARTS);
const EPUB_BYTES = buildEpub();

const DOCUMENTS: readonly DocumentCase[] = [
  { filename: "ledger.pdf", bytes: PDF_BYTES, text: PDF_TEXT },
  { filename: "ledger.docx", bytes: DOCX_BYTES, text: DOCX_TEXT },
  { filename: "road.epub", bytes: EPUB_BYTES, text: EPUB_TEXT },
];

// The upload door resolves a browser's empty type from the filename; the same function names the mime here.
function mimeOf(filename: string): string {
  const mime = docUploadMime("", filename);
  if (mime === undefined) {
    throw new Error(`the product accepts no document type for ${filename}`);
  }
  return mime;
}

test.for(DOCUMENTS)("an uploaded $filename reads back as its normalized text", async ({ filename, bytes, text }) => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const uploaded = await root.services.databank.upload({ principal, bytes, mime: mimeOf(filename), name: filename });
  expect(uploaded).toMatchObject({ outcome: "created", document: { name: filename } });
  expect(uploaded).not.toHaveProperty("warning");
  const read = await root.services.databank.get({ principal, id: uploaded.document.id, includeText: true });
  expect(read.extractedText).toBe(text);
  // The bank counts characters in SQL; every fixture text is in the BMP, so its UTF-16 length is that count.
  expect(read.charCount).toBe(text.length);
  expect(uploaded.document.charCount).toBe(read.charCount);
});

test("a document type extraction does not do is refused before any parse and stores no document", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const unsupported = { principal, bytes: strToU8("id,name\n1,lantern\n"), mime: "text/csv", name: "ledger.csv" };
  const refusal = root.services.databank.upload(unsupported);
  await expect(refusal).rejects.toBeInstanceOf(UnsupportedDocTypeError);
  await expect(refusal).rejects.toMatchObject({ mime: unsupported.mime });
  expect((await root.services.databank.list({ principal })).items).toEqual([]);

  // The same root takes a supported document, so the refusal above is the extraction's answer, not a dead upload path.
  const supported = await root.services.databank.upload({ principal, bytes: strToU8("The keeper's ledger."), mime: "text/plain", name: "ledger.txt" });
  expect(supported).toMatchObject({ outcome: "created" });
  expect((await root.services.databank.list({ principal })).items.map((item) => item.id)).toEqual([supported.document.id]);
});

// Bytes that pass the store's signature check (`%PDF`, `PK\x03\x04`) and still are not a document: a pdf with no
// objects, and each archive cut off before its central directory.
const TRUNCATED_BYTES = 120;
const CORRUPT: readonly Pick<DocumentCase, "filename" | "bytes">[] = [
  { filename: "broken.pdf", bytes: strToU8("%PDF-1.4\nthis is not a pdf body\n") },
  { filename: "broken.docx", bytes: DOCX_BYTES.slice(0, TRUNCATED_BYTES) },
  { filename: "broken.epub", bytes: EPUB_BYTES.slice(0, TRUNCATED_BYTES) },
];

test.for(CORRUPT)("a corrupt $filename fails extraction and stores no document", async ({ filename, bytes }) => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  await expect(root.services.databank.upload({ principal, bytes, mime: mimeOf(filename), name: filename })).rejects.toBeInstanceOf(ExtractionFailedError);
  expect((await root.services.databank.list({ principal })).items).toEqual([]);
});
