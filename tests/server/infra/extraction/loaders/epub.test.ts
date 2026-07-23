// infra/extraction/loaders/epub — the epub loader (databank-design/04 §2). Asserts the OPF spine walk: chapters
// extract in READING order (not zip/manifest order), each through the html loader, joined `\n\n`; the `<dc:title>`;
// and the failure modes (missing container.xml / missing OPF). The fixture zips REAL container/OPF/XHTML.

import { zipSync } from "fflate";
import { loadEpub } from "../../../../../packages/server/src/infra/extraction/loaders/epub.ts";
import { expect, test } from "../../../../support/fixtures";
import { buildEpub } from "../_fixtures.ts";

const enc = new TextEncoder();
const MISSING_CONTAINER = /META-INF\/container\.xml/;
const MISSING_OPF = /OPF package document not found/;

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

test("throws when META-INF/container.xml is absent", async () => {
  await expect(loadEpub(zipSync({ "OEBPS/content.opf": enc.encode("<package/>") }))).rejects.toThrow(MISSING_CONTAINER);
});

test("throws when the OPF the container points at is absent", async () => {
  const container = `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`;
  await expect(loadEpub(zipSync({ "META-INF/container.xml": enc.encode(container) }))).rejects.toThrow(MISSING_OPF);
});
