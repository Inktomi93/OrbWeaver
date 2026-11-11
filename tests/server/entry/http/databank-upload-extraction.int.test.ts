// A signed-in person posts a docx or an epub to the databank upload route. A file that is not a document is refused
// as a client error that names the failed extraction and stores nothing; a valid file of the same format lands and
// reads back as its text. The files carry the zip signature the store checks, so the refusal comes from the loader.
// @subject packages/server/src/entry/http/upload.ts
// @subject packages/server/src/infra/extraction/index.ts

import { uploadResultSchema } from "@orb/contracts/databank";
import { ExtractionFailedError } from "@orb/contracts/extraction";
import { DATABANK_UPLOAD_ROUTE } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, ownerSubject, signIn } from "@orb/testkit/node/auth";
import { strToU8, zipSync } from "fflate";
import { CSRF_HEADERS } from "./_body-limit-inputs.ts";

// fflate derives the DOS date from local time; a fixed mid-year UTC stamp keeps the archives deterministic.
const ZIP_MTIME = new Date("2025-07-01T12:00:00Z");
const XML_PROLOGUE = '<?xml version="1.0" encoding="UTF-8"?>';

function zip(parts: Readonly<Record<string, string>>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])), { mtime: ZIP_MTIME });
}

const DOCX_BYTES = zip({
  "word/document.xml": `${XML_PROLOGUE}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Lantern oil burns slow.</w:t></w:r></w:p></w:body></w:document>`,
});

const EPUB_BYTES = zip({
  "META-INF/container.xml": `${XML_PROLOGUE}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  "content.opf": `${XML_PROLOGUE}<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/></spine></package>`,
  "one.xhtml": "<html><body><p>Lanterns line the road.</p></body></html>",
});

interface FormatCase {
  readonly filename: string;
  readonly format: ExtractionFailedError["format"];
  readonly valid: Uint8Array;
  readonly text: string;
}

const FORMATS: readonly FormatCase[] = [
  { filename: "ledger.docx", format: "docx", valid: DOCX_BYTES, text: "Lantern oil burns slow." },
  { filename: "road.epub", format: "epub", valid: EPUB_BYTES, text: "Lanterns line the road." },
];

// Cut before the central directory: the local header still reads `PK\x03\x04`, the archive does not open.
const truncated = (bytes: Uint8Array): Uint8Array => bytes.slice(0, Math.floor(bytes.length / 2));

test.for(FORMATS)(
  "a corrupt $filename is refused as an extraction failure and stores nothing, and a valid one lands",
  async ({ filename, format, valid, text }) => {
    await using root = await createAuthModeRoot("local");
    const { headers, principal } = await signIn(root, await ownerSubject(root));
    const post = (bytes: Uint8Array): Promise<Response> => {
      const form = new FormData();
      form.set("file", new File([new Uint8Array(bytes)], filename));
      return Promise.resolve(root.http.request(DATABANK_UPLOAD_ROUTE, { method: "POST", headers: { ...headers, ...CSRF_HEADERS }, body: form }));
    };

    const refused = await post(truncated(valid));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: new ExtractionFailedError(format).message });
    expect((await root.services.databank.list({ principal })).items).toEqual([]);

    // The same route, session and format take a good file, so the refusal above is the loader's answer and not a dead route.
    const landed = await post(valid);
    expect(landed.status).toBe(200);
    const uploaded = uploadResultSchema.parse(await landed.json());
    expect(uploaded).toMatchObject({ outcome: "created", document: { name: filename } });
    expect((await root.services.databank.get({ principal, id: uploaded.document.id, includeText: true })).extractedText).toBe(text);
    expect((await root.services.databank.list({ principal })).items.map((item) => item.id)).toEqual([uploaded.document.id]);
  },
);
