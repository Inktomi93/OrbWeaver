// A `re-extract` sweep after an extractor upgrade: a document stamped by an older extractor of its format has its canon
// re-derived from its stored bytes and is stamped current, and a document that carries the current stamp, of any
// format, is left alone. The stale stamp is planted directly, because the only product path to one is shipping a new
// extractor version. The second case ships one: a second root over the same database raises the pdf version, and only
// pdf documents turn stale in the banner and are rewritten by the sweep.
// @subject packages/server/src/domain/databank/ingest/index.ts
// @subject packages/server/src/domain/databank/persistence/queries.ts
// @subject packages/server/src/infra/extraction/index.ts

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documents } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshDb,
  seedCorpusActors,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { strToU8 } from "fflate";

const STALE_VERSION = "an-older-extractor";
const STALE_CANON = "canon an older extractor derived";
const STALE_BYTES = "The keeper's ledger.";
const CURRENT_BYTES = "The harbor log.";
const OTHER_FORMAT_BYTES = "# The lighthouse\n\nIts lamp never failed.";
const MARKDOWN_MIME = "text/markdown";

test("a re-extract sweep re-derives a document an older extractor stamped and leaves a current one alone", async () => {
  await using root = await createServerHarness({
    providerFetch: createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "A completed corpus response.",
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
    }).execute,
  });
  const { owner } = await seedCorpusActors(root);
  const upload = (name: string, text: string, mime = "text/plain"): ReturnType<typeof root.services.databank.upload> =>
    root.services.databank.upload({ signal: new AbortController().signal, principal: owner, bytes: strToU8(text), mime, name });
  const stale = (await upload("stale.txt", STALE_BYTES)).document;
  const current = (await upload("current.txt", CURRENT_BYTES)).document;
  const otherFormat = (await upload("other.md", OTHER_FORMAT_BYTES, MARKDOWN_MIME)).document;
  const canonOf = async (id: typeof stale.id): Promise<string | undefined> =>
    (await root.services.databank.get({ signal: new AbortController().signal, principal: owner, id, includeText: true })).extractedText;

  // A fresh upload is stamped with the version the sweep compares against, so nothing is stale yet.
  expect((await root.services.databank.bankHealth({ signal: new AbortController().signal, principal: owner })).staleExtraction).toBe(0);

  await root.db.update(documents).set({ extractorVersion: STALE_VERSION, extractedText: STALE_CANON }).where(eq(documents.id, stale.id));
  expect((await root.services.databank.bankHealth({ signal: new AbortController().signal, principal: owner })).staleExtraction).toBe(1);
  expect(await canonOf(stale.id)).toBe(STALE_CANON);

  const swept = await root.app.databankIngest.reindex({
    ownerId: owner.userId,
    scope: { kind: "owner" },
    mode: "re-extract",
    signal: new AbortController().signal,
  });

  expect(swept).toMatchObject({ documents: 3, reExtracted: 1, failed: [] });
  expect(await canonOf(stale.id)).toBe(STALE_BYTES);
  expect(await canonOf(current.id)).toBe(CURRENT_BYTES);
  expect(await canonOf(otherFormat.id)).toBe(OTHER_FORMAT_BYTES);
  expect((await root.services.databank.bankHealth({ signal: new AbortController().signal, principal: owner })).staleExtraction).toBe(0);
});

const BUMPED_PDF_VERSION = "an-upgraded-pdf-loader";
const PDF_MIME = "application/pdf";
const PDF_TEXT = "Lantern oil burns slow.";
const PLANTED_CANON = "canon planted over the extracted text";

/** A one-page pdf with `text` drawn once, written whole with real xref offsets (the loader reads it for real). */
function buildPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let file = "%PDF-1.4\n";
  const offsets = bodies.map((body, index) => {
    const offset = file.length;
    file += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xrefAt = file.length;
  file += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  file += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return strToU8(file);
}

test("raising the pdf extractor version marks only pdf documents stale, and the sweep rewrites only them", async () => {
  using held = await freshDb();
  await using box = new AsyncDisposableStack();
  const directory = await mkdtemp(join(tmpdir(), "orb-extractor-version-"));
  box.defer(() => rm(directory, { recursive: true, force: true }));
  // The source bytes live in the CAS, which every boot of the same box reads.
  const casDir = join(directory, "cas");
  const providerFetch = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A completed corpus response.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  }).execute;
  const stored = async (): Promise<Map<string, { mime: string; stamp: string; canon: string }>> =>
    new Map((await held.db.select().from(documents)).map((row) => [row.id, { mime: row.mime, stamp: row.extractorVersion, canon: row.extractedText }]));

  let lineage: Pick<Awaited<ReturnType<typeof createServerHarness>>, "ownerId" | "clock" | "ids">;
  let before: Awaited<ReturnType<typeof stored>>;
  {
    await using first = await createServerHarness({ db: held.db, casDir, providerFetch });
    const { owner } = await seedCorpusActors(first);
    const upload = (name: string, bytes: Uint8Array, mime: string): ReturnType<typeof first.services.databank.upload> =>
      first.services.databank.upload({ signal: new AbortController().signal, principal: owner, bytes, mime, name });
    await upload("ledger.pdf", buildPdf(PDF_TEXT), PDF_MIME);
    await upload("log.md", strToU8("# The harbor log"), MARKDOWN_MIME);
    await upload("notes.txt", strToU8("The keeper's ledger."), "text/plain");
    // Plant a canon on every row, so a rewrite shows as the planted text being replaced by the extracted one.
    await first.db.update(documents).set({ extractedText: PLANTED_CANON });
    expect((await first.services.databank.bankHealth({ signal: new AbortController().signal, principal: owner })).staleExtraction).toBe(0);
    lineage = { ownerId: first.ownerId, clock: first.clock, ids: first.ids };
    before = await stored();
  }

  await using second = await createServerHarness({ db: held.db, casDir, providerFetch, ...lineage, extractorVersions: { pdf: BUMPED_PDF_VERSION } });
  const owner = await second.principalFor(lineage.ownerId);
  expect((await second.services.databank.bankHealth({ signal: new AbortController().signal, principal: owner })).staleExtraction).toBe(1);

  const swept = await second.app.databankIngest.reindex({
    ownerId: owner.userId,
    scope: { kind: "owner" },
    mode: "re-extract",
    signal: new AbortController().signal,
  });

  expect(swept).toMatchObject({ documents: 3, reExtracted: 1, failed: [] });
  const after = await stored();
  for (const [id, row] of before) {
    expect(after.get(id)).toEqual(row.mime === PDF_MIME ? { mime: PDF_MIME, stamp: BUMPED_PDF_VERSION, canon: PDF_TEXT } : row);
  }
  expect((await second.services.databank.bankHealth({ signal: new AbortController().signal, principal: owner })).staleExtraction).toBe(0);
});
