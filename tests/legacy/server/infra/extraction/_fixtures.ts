// Deterministic in-test fixture bytes for the extraction loaders (NOT a test file — no `.test` suffix). A
// hand-rolled minimal PDF builder (a valid xref table with real byte offsets) so the pdf loader runs against
// genuine pdfjs parsing with KNOWN text — no committed binary blobs, no generator dependency. The docx/epub
// builders zip REAL OOXML/OPF XML with fflate (the same `zipSync` the loaders unzip) — genuine bytes, no blob.

import { zipSync } from "fflate";

const enc = new TextEncoder();

/** Escape the PDF literal-string metacharacters (`\ ( )`). */
function escapePdf(s: string): string {
  return s.replace(/([\\()])/g, "\\$1");
}

/** Build a minimal, valid single-font PDF whose pages carry `pageTexts` (one string per page) and an optional
 *  info-dict `/Title`. An empty page string produces a page with no text stream (the image-only/empty case). */
export function buildPdf(pageTexts: readonly string[], opts: { readonly title?: string } = {}): Uint8Array {
  const fontObj = 3;
  const objs: string[] = [];
  const pageNums = pageTexts.map((_, i) => 4 + i * 2);

  objs[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[1] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`;
  objs[fontObj - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  for (const [i, text] of pageTexts.entries()) {
    const pageNum = pageNums[i] as number;
    const contentNum = pageNum + 1;
    const stream = text.length > 0 ? `BT /F1 24 Tf 72 700 Td (${escapePdf(text)}) Tj ET` : "";
    objs[pageNum - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${fontObj} 0 R >> >> >>`;
    objs[contentNum - 1] = `<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`;
  }

  let infoNum: number | undefined;
  if (opts.title !== undefined) {
    infoNum = objs.length + 1;
    objs[infoNum - 1] = `<< /Title (${escapePdf(opts.title)}) >>`;
  }

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, obj] of objs.entries()) {
    offsets.push(enc.encode(body).length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }

  const xrefStart = enc.encode(body).length;
  const size = objs.length + 1;
  body += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    body += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  const infoRef = infoNum === undefined ? "" : ` /Info ${infoNum} 0 R`;
  body += `trailer\n<< /Size ${size} /Root 1 0 R${infoRef} >>\nstartxref\n${xrefStart}\n%%EOF`;
  return enc.encode(body);
}

/** Escape the five predefined XML entities in text content. */
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build a minimal, valid .docx (a ZIP with `word/document.xml`) whose body carries `paragraphs` (one `<w:p>`
 *  per string, each a single `<w:t>` run). A real OOXML zip the docx loader unzips + parses. */
export function buildDocx(paragraphs: readonly string[]): Uint8Array {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  return zipSync({ "[Content_Types].xml": enc.encode("<Types/>"), "word/document.xml": enc.encode(documentXml) });
}

/** Build a minimal, valid .epub (a ZIP: container.xml → OPF → spine of XHTML chapters) with a `<dc:title>` and
 *  one XHTML file per chapter (each a `<p>` body). A real OPF/spine the epub loader walks in reading order. */
export function buildEpub(opts: { readonly title: string; readonly chapters: readonly string[] }): Uint8Array {
  const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const manifest = opts.chapters.map((_, i) => `<item id="c${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join("");
  const spine = opts.chapters.map((_, i) => `<itemref idref="c${i}"/>`).join("");
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(opts.title)}</dc:title></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`;
  const files: Record<string, Uint8Array> = {
    "META-INF/container.xml": enc.encode(container),
    "OEBPS/content.opf": enc.encode(opf),
  };
  for (const [i, text] of opts.chapters.entries()) {
    files[`OEBPS/ch${i}.xhtml`] = enc.encode(`<html><body><p>${escapeXml(text)}</p></body></html>`);
  }
  return zipSync(files);
}
