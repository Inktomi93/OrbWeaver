// The SillyTavern export holds one file body at a time and its dry run reads none, document text included, and an
// owner runs one export or dry run at a time. A second request while one runs is refused with the running code, and the
// hold comes back when the run ends by any path: a finished stream, a cancelled download, a failed read, a failed dry
// run and an entry the zip writer refuses. A row past the zip's entry or size cap is named and the zip completes.
// @subject packages/server/src/domain/export/verbs/export-st-profile.ts
// @subject packages/server/src/entry/http/export.ts

import { Buffer } from "node:buffer";
import { createCipheriv, createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { memoryUsage } from "node:process";
import { setImmediate as nextTurn } from "node:timers/promises";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { crc32 } from "node:zlib";
import {
  ST_EXPORT_PROFILE_DIR,
  ST_EXPORT_REPORT_FILE,
  ST_EXPORT_RUNNING_CODE,
  ST_SETTINGS_FILE,
  stExportRefusalSchema,
  stExportReportSchema,
  stProfileExportPath,
} from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { chatDocuments, documents, worldBooks } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { ZIP_WRITE_LIMITS } from "@orb/server/infra/storage/zip";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makeAssetBytes, withheldTable } from "@orb/testkit/node/composed";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { eq, getTableName, sql } from "drizzle-orm";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardJson, exportDryRun, exportedZip, finishRun, harness, storedBlobs } from "./_st-tree-door.ts";

const OK = 200;
// A stored file turned into a directory fails its read with this, never with a missing file.
const EISDIR = "EISDIR";
const CONFLICT = 409;
// Each slow case's base is about three times its measured runtime on this box at per-core load 0.8 (14 s and 19 s), so
// a busier box stretches it through the load budget and no case shares the slow tag's ceiling.
const HELD_BYTES_CASE_BASE_MS = 45_000;
const ENTRY_COUNT_CASE_BASE_MS = 60_000;
const DOWNLOAD_HEADERS = ["content-type", "content-disposition"] as const;
const MIB = 1024 * 1024;
const PICTURE_BYTES = 8 * MIB;
const LARGE_COUNT = 6;
// Eight bodies: a read body, its deflated copy and the chunks in flight fit well under this however loaded the box, and
// the library (two pictures per count) is one and a half times it.
const HELD_BOUND = 8 * PICTURE_BYTES;
const IEND_CHUNK_BYTES = 12;
const PNG_CHUNK_TYPE = "abCd";
const U32_BYTES = 4;
const AES_KEY_BYTES = 16;

// A forced collection before each reading, so a reading counts bytes still referenced, not garbage awaiting collection.
setFlagsFromString("--expose-gc");
const gc: unknown = runInNewContext("gc");

function heldBytes(): number {
  if (typeof gc !== "function") {
    throw new Error("the runtime did not expose gc");
  }
  Reflect.apply(gc, undefined, []);
  return memoryUsage().arrayBuffers;
}

// Bytes no deflate can shrink, from a fixed seed: an AES-CTR keystream over zeros, so the zip carries each picture at
// its full size.
function noise(seed: number, size: number): Uint8Array {
  const key = createHash("sha256").update(String(seed)).digest().subarray(0, AES_KEY_BYTES);
  return new Uint8Array(createCipheriv("aes-128-ctr", key, Buffer.alloc(AES_KEY_BYTES)).update(new Uint8Array(size)));
}

// The fixture picture with a private ancillary chunk of `size` noise bytes ahead of IEND: a valid PNG of that size.
function largePng(root: ServerTestHarness, seed: number, size: number): Uint8Array {
  const base = new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  const body = Buffer.concat([new TextEncoder().encode(PNG_CHUNK_TYPE), noise(seed, size)]);
  const length = Buffer.alloc(U32_BYTES);
  length.writeUInt32BE(size);
  const sum = Buffer.alloc(U32_BYTES);
  sum.writeUInt32BE(crc32(body));
  return new Uint8Array(Buffer.concat([base.subarray(0, -IEND_CHUNK_BYTES), length, body, sum, base.subarray(-IEND_CHUNK_BYTES)]));
}

/** Cards and gallery pictures of `size` bytes each, every one distinct. */
function largeLibrary(root: ServerTestHarness, count: number, size: number): Files {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const name = `Lantern ${String(index)}`;
      return [
        [`characters/${name}.png`, writeCardChunk(largePng(root, index * 2, size), cardJson(name))],
        [`user/images/${name}/view.png`, largePng(root, index * 2 + 1, size)],
      ] as const;
    }).flat(),
  );
}

/** Read the whole export, the probe reading held bytes after each chunk; `keep` holds every chunk, as a client that
 *  buffers the download does, which is the probe's control. */
async function peakWhileReading(root: ServerTestHarness, keep: boolean): Promise<{ readonly peak: number; readonly read: number }> {
  const baseline = heldBytes();
  const response = await root.http.request(stProfileExportPath(false));
  expect(response.status).toBe(OK);
  const reader: ReadableStreamDefaultReader<Uint8Array> = present(response.body).getReader();
  const kept: Uint8Array[] = [];
  let peak = 0;
  let read = 0;
  let probed = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    read += chunk.value.byteLength;
    if (keep) {
      kept.push(chunk.value);
    }
    // A held body stays held for its whole entry, so one reading per MiB read cannot miss it; one per chunk costs a
    // collection per few KiB.
    if (read - probed >= MIB) {
      probed = read;
      peak = Math.max(peak, heldBytes() - baseline);
    }
  }
  expect(kept.length > 0).toBe(keep);
  return { peak, read };
}

test("the export holds one file body at a time however large the library, and the probe sees a client that holds it all", {
  timeout: budget(HELD_BYTES_CASE_BASE_MS),
}, async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, largeLibrary(root, LARGE_COUNT, PICTURE_BYTES)));
  const library = 2 * LARGE_COUNT * PICTURE_BYTES;

  const streamed = await peakWhileReading(root, false);
  const buffered = await peakWhileReading(root, true);

  expect(streamed.read).toBeGreaterThan(library);
  expect(streamed.peak).toBeLessThan(HELD_BOUND);
  // The control: the same probe over a reader that holds every chunk reads past the bound by the library's size.
  expect(buffered.peak).toBeGreaterThan(library);
});

const SMALL_NAMES = ["Aria", "Lisa", "Mira", "Tess"] as const;

/** A few small cards, so a stream that has written one file still has others to write. */
function smallLibrary(root: ServerTestHarness): Files {
  return Object.fromEntries(
    SMALL_NAMES.flatMap((name, index) => [
      [`characters/${name}.png`, writeCardChunk(new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))), cardJson(name))],
      [`user/images/${name}/view.png`, largePng(root, index, MIB)],
    ]),
  );
}

async function refusal(root: ServerTestHarness, dryRun: boolean): Promise<string> {
  const response = await root.http.request(stProfileExportPath(dryRun));
  expect(response.status).toBe(CONFLICT);
  return stExportRefusalSchema.parse(await response.json()).code;
}

// A cancelled download hands its iterator back on a later turn, so the hold is read again for a bounded number of turns.
const RELEASE_TURNS = 100;

async function statusOnceReleased(root: ServerTestHarness): Promise<number> {
  let status = await dryRunStatus(root);
  for (let turn = 0; status === CONFLICT && turn < RELEASE_TURNS; turn += 1) {
    await nextTurn();
    status = await dryRunStatus(root);
  }
  return status;
}

async function dryRunStatus(root: ServerTestHarness): Promise<number> {
  const response = await root.http.request(stProfileExportPath(true));
  await response.arrayBuffer();
  return response.status;
}

test("a second export or dry run while one runs is refused, and the hold comes back when the download is cancelled", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, smallLibrary(root)));
  const response = await root.http.request(stProfileExportPath(false));
  const reader = present(response.body).getReader();
  expect((await reader.read()).done).toBe(false);

  expect(await refusal(root, false)).toBe(ST_EXPORT_RUNNING_CODE);
  expect(await refusal(root, true)).toBe(ST_EXPORT_RUNNING_CODE);

  await reader.cancel();
  expect(await statusOnceReleased(root)).toBe(OK);
});

test("the hold comes back when an export finishes and when its read of a stored file fails", async () => {
  await using root = await harness();
  const files = smallLibrary(root);
  await finishRun(root, await admit(root, files));
  await (await root.http.request(stProfileExportPath(false))).arrayBuffer();
  expect(await dryRunStatus(root)).toBe(OK);

  // A picture's stored file turned into a directory: the store's read fails with something other than a missing file.
  const hash = createHash("sha256").update(present(files["user/images/Aria/view.png"])).digest("hex");
  const blob = present((await storedBlobs(root)).find((path) => path.endsWith(hash)));
  await rm(blob);
  await mkdir(blob);
  const failed = await root.http.request(stProfileExportPath(false));
  await expect(failed.arrayBuffer()).rejects.toMatchObject({ code: EISDIR });

  expect(await dryRunStatus(root)).toBe(OK);
});

test("the hold comes back when a dry run fails", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, smallLibrary(root)));
  await using fault = await withheldTable(root.db, chatDocuments);
  expect(await dryRunStatus(root)).not.toBe(OK);
  await fault.lift();

  expect(await dryRunStatus(root)).toBe(OK);
});

// Every stored blob turned into a directory: a read of any of them fails with something other than a missing file.
async function breakEveryBlob(root: ServerTestHarness): Promise<void> {
  for (const blob of await storedBlobs(root)) {
    await rm(blob);
    await mkdir(blob);
  }
}

test("the dry run reads no stored file: it answers in full when every stored file fails to read, and the zip does not", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, smallLibrary(root)));
  const planned = await exportDryRun(root);
  await breakEveryBlob(root);

  expect(await exportDryRun(root)).toEqual(planned);
  // The control: the zip reads the first picture body and fails on it.
  const zip = await root.http.request(stProfileExportPath(false));
  await expect(zip.arrayBuffer()).rejects.toMatchObject({ code: EISDIR });
});

test("a stored file gone by the time the zip writes it is named in the zip's report and never written", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, smallLibrary(root)));
  const report = await exportDryRun(root);
  for (const blob of await storedBlobs(root)) {
    await rm(blob);
  }

  const written = await exportedZip(root);

  // The owner's default content seeds galleries of its own; these are the library's.
  const pictures = report.files.filter(({ path }) => SMALL_NAMES.some((name) => path.startsWith(`${ST_EXPORT_PROFILE_DIR}user/images/${name.toLowerCase()}/`)));
  expect(pictures).toHaveLength(SMALL_NAMES.length);
  expect(pictures.filter(({ path }) => written[path] !== undefined)).toEqual([]);
  const zipReport = stExportReportSchema.parse(JSON.parse(strFromU8(present(written[ST_EXPORT_REPORT_FILE]))));
  expect(zipReport.left.filter(({ kind, reason }) => kind === "gallery" && reason === "unreadable").length).toBeGreaterThanOrEqual(SMALL_NAMES.length);
  expect(report.left.filter(({ reason }) => reason === "unreadable")).toEqual([]);
  // Cards whose art is gone still write, on the stand-in picture the card export uses.
  for (const name of SMALL_NAMES) {
    expect(written[`${ST_EXPORT_PROFILE_DIR}characters/${name.toLowerCase()}.png`], name).toBeDefined();
  }
});

const EPUB_MIME = "application/epub+zip";
const EPUB_XML = '<?xml version="1.0" encoding="UTF-8"?>';
const EPUB_CHAPTERS = ["a", "b", "c", "d", "e"] as const;
const ZIP_MTIME = new Date("2025-07-01T12:00:00Z");
const BIG_DOCUMENT = "Lantern road";

// A small epub whose chapters extract to more text than one zip entry may hold: five 17 MiB chapters of one line.
function overflowingEpub(): Uint8Array {
  const paragraph = `<p>${"Lanterns line the long road home. ".repeat(1000)}</p>`;
  const chapter = `<html><body>${paragraph.repeat(Math.ceil((17 * MIB) / paragraph.length))}</body></html>`;
  const manifest = EPUB_CHAPTERS.map((id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join("");
  const spine = EPUB_CHAPTERS.map((id) => `<itemref idref="${id}"/>`).join("");
  return zipSync(
    {
      "META-INF/container.xml": strToU8(
        `${EPUB_XML}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
      ),
      "content.opf": strToU8(
        `${EPUB_XML}<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest>${manifest}</manifest><spine>${spine}</spine></package>`,
      ),
      ...Object.fromEntries(EPUB_CHAPTERS.map((id) => [`${id}.xhtml`, strToU8(chapter)])),
    },
    { mtime: ZIP_MTIME },
  );
}

test("a Data Bank file whose text is past the zip's entry cap is named and left out, the zip completes, and the next export starts", {
  tags: ["slow"],
}, async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const signal = new AbortController().signal;
  await root.services.databank.upload({ principal, signal, bytes: overflowingEpub(), mime: EPUB_MIME, name: BIG_DOCUMENT, destination: { kind: "global" } });
  // The control: the dry run lists the file, so the zip leaving it out is the zip's own refusal.
  const planned = (await exportDryRun(root)).files.filter(({ path }) => path.startsWith(`${ST_EXPORT_PROFILE_DIR}user/files/`));
  expect(planned).toHaveLength(1);

  const download = await root.http.request(stProfileExportPath(false));
  const body = await download.arrayBuffer().then(
    (buffer) => new Uint8Array(buffer),
    (err: unknown) => err,
  );

  // The hold is back however the download ended, so this holds even when the zip fails.
  expect(await dryRunStatus(root)).toBe(OK);
  expect(body).toBeInstanceOf(Uint8Array);
  const zip = unzipSync(body instanceof Uint8Array ? body : new Uint8Array());
  expect(zip[present(planned[0]).path]).toBeUndefined();
  const report = stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE]))));
  expect(report.left).toEqual(expect.arrayContaining([{ kind: "databank", item: BIG_DOCUMENT, reason: "past-zip-limit" }]));
  expect(strFromU8(present(zip[`${ST_EXPORT_PROFILE_DIR}${ST_SETTINGS_FILE}`]))).not.toContain(BIG_DOCUMENT);
});

const INSERT_CHUNK = 500;
const BOOK_PREFIX = "Book ";

test("a library past the zip's entry cap names every row it cannot hold, the zip completes, and the next export starts", {
  timeout: budget(ENTRY_COUNT_CASE_BASE_MS),
}, async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  // One book through the product, then its row copied under new ids: a library holding more books than one zip may.
  const made = await root.services.worldInfo.createBook({ principal, input: { name: `${BOOK_PREFIX}0` } });
  const [row] = await root.db.select().from(worldBooks).where(eq(worldBooks.id, made.id));
  const copies = Array.from({ length: ZIP_WRITE_LIMITS.maxEntries }, (_, index) => ({
    ...present(row),
    id: root.idSource.typeId(ID_PREFIX.worldBook),
    name: `${BOOK_PREFIX}${String(index + 1)}`,
  }));
  for (let start = 0; start < copies.length; start += INSERT_CHUNK) {
    await root.db.insert(worldBooks).values(copies.slice(start, start + INSERT_CHUNK));
  }

  const download = await root.http.request(stProfileExportPath(false));
  const body = await download.arrayBuffer().then(
    (buffer) => new Uint8Array(buffer),
    (err: unknown) => err,
  );

  // A second download starts (its answer comes before any body is read), so the first one gave its hold back.
  const next = await root.http.request(stProfileExportPath(false));
  expect(next.status).toBe(OK);
  await next.body?.cancel();
  expect(body).toBeInstanceOf(Uint8Array);
  const zip = unzipSync(body instanceof Uint8Array ? body : new Uint8Array());
  expect(Object.keys(zip).length).toBeLessThanOrEqual(ZIP_WRITE_LIMITS.maxEntries);
  const report = stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE]))));
  const past = report.left.filter(({ reason }) => reason === "past-zip-limit");
  // Every copied book is either written or named; none vanishes. The owner's default content holds books of its own.
  const written = Object.keys(zip).filter((path) => path.startsWith(`${ST_EXPORT_PROFILE_DIR}worlds/${BOOK_PREFIX}`)).length;
  const named = past.filter(({ kind, item }) => kind === "world-info" && item.startsWith(BOOK_PREFIX)).length;
  expect(named).toBeGreaterThan(0);
  expect(written + named).toBe(copies.length + 1);
  expect(zip[`${ST_EXPORT_PROFILE_DIR}${ST_SETTINGS_FILE}`]).toBeDefined();
});

// A document's text column renamed away, so any read of a document's text fails and every other read of the table runs.
async function withheldDocumentText(root: ServerTestHarness): Promise<AsyncDisposable> {
  const table = getTableName(documents);
  const column = documents.extractedText.name;
  const withheld = `withheld_${column}`;
  await root.db.run(sql`ALTER TABLE ${sql.identifier(table)} RENAME COLUMN ${sql.identifier(column)} TO ${sql.identifier(withheld)}`);
  return {
    async [Symbol.asyncDispose](): Promise<void> {
      await root.db.run(sql`ALTER TABLE ${sql.identifier(table)} RENAME COLUMN ${sql.identifier(withheld)} TO ${sql.identifier(column)}`);
    },
  };
}

test("the dry run reads no document's text: it answers in full when no text can be read, and the zip does not", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const signal = new AbortController().signal;
  await root.services.databank.upload({
    principal,
    signal,
    bytes: new TextEncoder().encode("The ford floods at dusk."),
    mime: "text/plain",
    name: "Field notes",
    destination: { kind: "global" },
  });
  const planned = await exportDryRun(root);
  expect(planned.files.filter(({ path }) => path.startsWith(`${ST_EXPORT_PROFILE_DIR}user/files/`))).toHaveLength(1);
  await using _withheld = await withheldDocumentText(root);

  expect(await exportDryRun(root)).toEqual(planned);
  // The control: the zip reads the document's text and fails on it.
  const zip = await root.http.request(stProfileExportPath(false));
  await expect(zip.arrayBuffer()).rejects.toThrow(documents.extractedText.name);
});

test("a HEAD request answers the download's headers with no body and takes no hold, for every library format", async () => {
  await using root = await harness();
  for (const path of [stProfileExportPath(false), stProfileExportPath(true), PORTABILITY_ROUTES.exportLibrary]) {
    const head = await root.http.request(path, { method: "HEAD" });
    expect(head.status).toBe(OK);
    expect(await head.text()).toBe("");
    // A hold left by the HEAD would refuse this with the running code.
    expect(await dryRunStatus(root)).toBe(OK);
    const download = await root.http.request(path);
    await present(download.body).cancel();
    for (const header of DOWNLOAD_HEADERS) {
      expect(head.headers.get(header)).toBe(download.headers.get(header));
    }
    expect(await statusOnceReleased(root)).toBe(OK);
  }
});
