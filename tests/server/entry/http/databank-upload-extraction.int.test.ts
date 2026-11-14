// A signed-in person posts a docx or an epub to the databank upload route. A file that is not a document is refused
// as a client error that names the failed extraction, carries its code and stores nothing; a valid file of the same
// format lands and reads back as its text. The files carry the zip signature the store checks, so the refusal comes
// from the loader, and the root's log ring holds one warn record with the loader's cause for it and none for the valid
// file. An archive that would unpack past a loader's size budget is refused under its own code, not as a damaged file,
// and a type the route does not accept carries its code too.
// @subject packages/server/src/entry/http/upload.ts
// @subject packages/server/src/infra/extraction/index.ts

import { documentUploadRefusalSchema, uploadResultSchema } from "@orb/contracts/databank";
import { EXTRACTION_OP_CODES, ExtractionFailedError, ExtractionTooLargeError } from "@orb/contracts/extraction";
import { DATABANK_EXTRACT_MAX_DECOMPRESSED_BYTES, DATABANK_UPLOAD_ROUTE, UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, ownerSubject, signIn } from "@orb/testkit/node/auth";
import { strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
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

// The text the zip library gives for that archive: the cause the loader's failure carries.
function openingFailure(bytes: Uint8Array): string {
  try {
    unzipSync(bytes);
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    throw error;
  }
  throw new Error("the truncated archive opened");
}

const LOG_SCAN_LIMIT = 500;
const logRecordSchema = z.looseObject({ level: z.string(), format: z.string().optional(), err: z.looseObject({ message: z.string() }).optional() });

test.for(FORMATS)(
  "a corrupt $filename is refused as an extraction failure and stores nothing, and a valid one lands",
  async ({ filename, format, valid, text }) => {
    await using root = await createAuthModeRoot("local", { logLevel: "warn" });
    const { headers, principal } = await signIn(root, await ownerSubject(root));
    const post = (bytes: Uint8Array): Promise<Response> => {
      const form = new FormData();
      form.set(UPLOAD_FILE_FIELD, new File([new Uint8Array(bytes)], filename));
      return Promise.resolve(root.http.request(DATABANK_UPLOAD_ROUTE, { method: "POST", headers: { ...headers, ...CSRF_HEADERS }, body: form }));
    };
    // The warn records that name a document format; the root also warns about its public test peer, which is not this.
    const extractionWarnings = (): z.infer<typeof logRecordSchema>[] =>
      root.observability
        .logLines(LOG_SCAN_LIMIT)
        .map((line) => logRecordSchema.parse(JSON.parse(line)))
        .filter((line) => line.level === "warn" && line.format !== undefined);
    expect(extractionWarnings()).toEqual([]);

    const cut = truncated(valid);
    const refused = await post(cut);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: new ExtractionFailedError(format).message, reason: EXTRACTION_OP_CODES.failed });
    expect((await root.services.databank.list({ principal })).items).toEqual([]);
    // The operator keeps the loader's own text: one warn record names the format and carries the cause.
    expect(extractionWarnings()).toMatchObject([{ format, err: { message: openingFailure(cut) } }]);

    // The same route, session and format take a good file, so the refusal above is the loader's answer and not a dead route.
    const landed = await post(valid);
    expect(landed.status).toBe(200);
    const uploaded = uploadResultSchema.parse(await landed.json());
    expect(uploaded).toMatchObject({ outcome: "created", document: { name: filename } });
    expect((await root.services.databank.get({ principal, id: uploaded.document.id, includeText: true })).extractedText).toBe(text);
    expect((await root.services.databank.list({ principal })).items.map((item) => item.id)).toEqual([uploaded.document.id]);
    expect(extractionWarnings()).toHaveLength(1);
  },
);

// A zip of zeros deflates to almost nothing, so the upload stays far under the route cap while its headers declare more
// output than a loader admits: the case a size budget exists for. The sizes derive from the aggregate budget, which
// exceeds every per-part cap, so either guard refuses them.
const ZEROS = new Uint8Array(DATABANK_EXTRACT_MAX_DECOMPRESSED_BYTES);
const ZEROS_QUARTER = ZEROS.subarray(0, DATABANK_EXTRACT_MAX_DECOMPRESSED_BYTES / 4);
const BOMB_LEVEL = 1;
const EPUB_ENTRIES = 5;

function bomb(parts: Readonly<Record<string, Uint8Array>>): Uint8Array {
  return zipSync(parts, { mtime: ZIP_MTIME, level: BOMB_LEVEL });
}

interface OverBudgetCase {
  readonly filename: string;
  readonly format: ExtractionTooLargeError["format"];
  readonly bytes: Uint8Array;
}

// One docx part past the per-part cap, and an epub whose entries each fit but sum past the aggregate budget.
const OVER_BUDGET: readonly OverBudgetCase[] = [
  { filename: "ledger.docx", format: "docx", bytes: bomb({ "word/document.xml": ZEROS }) },
  {
    filename: "road.epub",
    format: "epub",
    bytes: bomb(Object.fromEntries(Array.from({ length: EPUB_ENTRIES }, (_, index) => [`chapter-${String(index)}.xhtml`, ZEROS_QUARTER]))),
  },
];

test.for(OVER_BUDGET)(
  "$filename that unpacks past the size budget is refused as too large, not damaged, and stores nothing",
  async ({ filename, format, bytes }) => {
    await using root = await createAuthModeRoot("local", { logLevel: "warn" });
    const { headers, principal } = await signIn(root, await ownerSubject(root));
    const form = new FormData();
    form.set(UPLOAD_FILE_FIELD, new File([new Uint8Array(bytes)], filename));
    const refused = await root.http.request(DATABANK_UPLOAD_ROUTE, { method: "POST", headers: { ...headers, ...CSRF_HEADERS }, body: form });

    expect(refused.status).toBe(400);
    expect(documentUploadRefusalSchema.parse(await refused.json())).toEqual({
      error: new ExtractionTooLargeError(format).message,
      reason: EXTRACTION_OP_CODES.tooLarge,
    });
    expect((await root.services.databank.list({ principal })).items).toEqual([]);
  },
);

test("a type the route does not accept is refused with the unsupported-type code and stores nothing", async () => {
  await using root = await createAuthModeRoot("local", { logLevel: "warn" });
  const { headers, principal } = await signIn(root, await ownerSubject(root));
  const form = new FormData();
  form.set(UPLOAD_FILE_FIELD, new File([new Uint8Array([1, 2, 3])], "ledger.csv", { type: "text/csv" }));
  const refused = await root.http.request(DATABANK_UPLOAD_ROUTE, { method: "POST", headers: { ...headers, ...CSRF_HEADERS }, body: form });

  expect(refused.status).toBe(415);
  expect(documentUploadRefusalSchema.parse(await refused.json())).toMatchObject({ reason: EXTRACTION_OP_CODES.unsupportedType });
  expect((await root.services.databank.list({ principal })).items).toEqual([]);
});
