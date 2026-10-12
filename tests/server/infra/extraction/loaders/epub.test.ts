// infra/extraction/loaders/epub — the epub loader. Asserts the OPF spine walk: chapters
// extract in READING order (not zip/manifest order), each through the html loader, joined `\n\n`; the `<dc:title>`;
// and the failure modes (missing container.xml / missing OPF). The fixture zips REAL container/OPF/XHTML.

import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { zipSync } from "fflate";
import { loadEpub } from "#server/infra/extraction/loaders/epub.ts";
import { buildEpub } from "../_fixtures.ts";

const enc = new TextEncoder();
const MISSING_CONTAINER = /META-INF\/container\.xml/;
const MISSING_OPF = /OPF package document not found/;
const AGGREGATE_CAP = /aggregate decompressed budget/;
/** One padding entry: comfortably under the 64 MiB per-entry cap, so only the SUM can trip the guard. */
const BIG_ENTRY_BYTES = 60 * 1024 * 1024;
/** Enough padding entries that their sum clears any plausible aggregate budget (4 × 60 MiB = 240 MiB, over
 *  the 200 MiB `DATABANK_EXTRACT_MAX_DECOMPRESSED_BYTES` the loader derives from the 20 MiB upload cap). The
 *  count is spelled here rather than derived from the constant: the point of the pin is that a SUM is
 *  enforced at all, and a test that recomputes the number only couples itself to it. */
const PADDING_ENTRIES = 4;
const MINIMAL_CONTAINER = `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`;

test("extracts chapter text in spine order, joined with a blank line, and the OPF title", async () => {
  const out = await loadEpub(buildEpub({ title: "A Guide", chapters: ["Intro chapter.", "Second chapter."] }));
  expect(out.title).toBe("A Guide");
  expect(out.text).toBe("Intro chapter.\n\nSecond chapter.");
});

test("honors the spine ORDER (not manifest/zip order) — reading order is spine order", async () => {
  // Manifest lists c0 then c1, but the spine references c1 first — the loader must follow the spine.
  const container = `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`;
  const opf = `<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Reordered</dc:title></metadata><manifest><item id="c0" href="a.xhtml"/><item id="c1" href="b.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c0"/></spine></package>`;
  const epub = zipSync({
    "META-INF/container.xml": enc.encode(container),
    "OEBPS/content.opf": enc.encode(opf),
    "OEBPS/a.xhtml": enc.encode("<html><body><p>Alpha body.</p></body></html>"),
    "OEBPS/b.xhtml": enc.encode("<html><body><p>Bravo body.</p></body></html>"),
  });
  const out = await loadEpub(epub);
  expect(out.text).toBe("Bravo body.\n\nAlpha body.");
});

test("a spine reference to a missing chapter file is skipped, not fatal", async () => {
  const container = `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`;
  const opf = `<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Gappy</dc:title></metadata><manifest><item id="c0" href="here.xhtml"/><item id="c1" href="gone.xhtml"/></manifest><spine><itemref idref="c0"/><itemref idref="c1"/></spine></package>`;
  const epub = zipSync({
    "META-INF/container.xml": enc.encode(container),
    "OEBPS/content.opf": enc.encode(opf),
    "OEBPS/here.xhtml": enc.encode("<html><body><p>Only chapter.</p></body></html>"),
  });
  const out = await loadEpub(epub);
  expect(out.text).toBe("Only chapter.");
});

test("decodes numeric references in the OPF title", async () => {
  const container = MINIMAL_CONTAINER;
  const opf = `<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Alice&#39;s &#x2014; Tale</dc:title></metadata><manifest><item id="c0" href="a.xhtml"/></manifest><spine><itemref idref="c0"/></spine></package>`;
  const epub = zipSync({
    "META-INF/container.xml": enc.encode(container),
    "OEBPS/content.opf": enc.encode(opf),
    "OEBPS/a.xhtml": enc.encode("<html><body><p>Body.</p></body></html>"),
  });
  const out = await loadEpub(epub);
  expect(out.title).toBe("Alice's \u2014 Tale");
});

test("resolves a chapter whose manifest href is percent-encoded or carries a character reference", async () => {
  const opf = `<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Encoded</dc:title></metadata><manifest><item id="c0" href="Chapter%201.xhtml"/><item id="c1" href="Tom&amp;Jerry.xhtml"/><item id="c2" href="caf&#233;.xhtml"/></manifest><spine><itemref idref="c0"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`;
  const epub = zipSync({
    "META-INF/container.xml": enc.encode(MINIMAL_CONTAINER),
    "OEBPS/content.opf": enc.encode(opf),
    "OEBPS/Chapter 1.xhtml": enc.encode("<html><body><p>Spaced.</p></body></html>"),
    "OEBPS/Tom&Jerry.xhtml": enc.encode("<html><body><p>Ampersand.</p></body></html>"),
    "OEBPS/caf\u00E9.xhtml": enc.encode("<html><body><p>Accent.</p></body></html>"),
  });
  const out = await loadEpub(epub);
  expect(out.text).toBe("Spaced.\n\nAmpersand.\n\nAccent.");
});

test("throws when META-INF/container.xml is absent", async () => {
  await expect(loadEpub(zipSync({ "OEBPS/content.opf": enc.encode("<package/>") }))).rejects.toThrow(MISSING_CONTAINER);
});

test("throws when the OPF the container points at is absent", async () => {
  const container = `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`;
  await expect(loadEpub(zipSync({ "META-INF/container.xml": enc.encode(container) }))).rejects.toThrow(MISSING_OPF);
});

// ── The AGGREGATE decompression budget (#1474 item 5) ────────────────────────────────────────────────
// The per-entry cap refuses ONE bomb; nothing summed across the archive, so an archive of individually
// legal entries could still expand far past what the 20 MiB compressed upload cap implies. The entries
// below are zero-filled (deflate crushes them to nothing on the wire) and each sits UNDER the 64 MiB
// per-entry cap — only their SUM crosses the budget, so a green here cannot be the per-entry guard.
test("refuses an archive whose entries individually pass the per-entry cap but SUM over the aggregate budget", { timeout: 60_000 }, async () => {
  // The generous timeout is the FIXTURE's cost, not the loader's: deflating a quarter-gigabyte of padding
  // takes seconds, while the refusal itself happens off the zip headers before a byte is inflated.
  const chunk = new Uint8Array(BIG_ENTRY_BYTES);
  const files: Record<string, Uint8Array> = { "META-INF/container.xml": enc.encode(MINIMAL_CONTAINER) };
  for (let i = 0; i < PADDING_ENTRIES; i += 1) {
    files[`OEBPS/pad${i}.bin`] = chunk;
  }
  await expect(loadEpub(zipSync(files, { level: 1 }))).rejects.toThrow(AGGREGATE_CAP);
});

test("admits an archive whose entries sum UNDER the aggregate budget (the guard is not a blanket refusal)", async () => {
  const out = await loadEpub(buildEpub({ title: "Small", chapters: ["Tiny chapter."] }));
  expect(out.text).toBe("Tiny chapter.");
});
