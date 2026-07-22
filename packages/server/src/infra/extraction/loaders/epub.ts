// infra/extraction/loaders/epub.ts — the epub loader (databank-design/04 §2, fast-follow). An .epub is a ZIP of
// XHTML chapters + an OPF package manifest. We UNZIP with fflate (the tree's zero-dep isomorphic unzip — the same
// `unzipSync` the plugin bundle uses) and walk the OPF spine so chapters extract in READING order, running each
// through the SAME html loader `loadHtml` (no second html-to-text path), chapters joined `\n\n`. The design's §2
// jszip pick predates fflate landing for plugin-host; a second unzip lib is the dep the global rule bans (epub.js
// was already rejected for the same reason — its rendering half is server-side dead weight). `title` comes from
// the OPF `<dc:title>`.
//
// The OPF is found via `META-INF/container.xml` (`<rootfile full-path=…>`). Spine `<itemref idref>` → manifest
// `<item id href>` → the chapter path (resolved relative to the OPF's own directory). A malformed container/OPF
// or a chapter that fails to decode throws — the dispatch wraps it as `ExtractionFailedError('epub')`. UNTRUSTED
// bytes (an upload boundary): a per-entry bomb guard caps a declared entry size before fflate allocates (the
// plugin-host `unzipHardened` precedent). Empty text is truthful (a spine of empty chapters).

import { strFromU8, unzipSync } from "fflate";
import type { RawExtraction } from "../loader";
import { loadHtml } from "./html";

const CONTAINER_PATH = "META-INF/container.xml";
const CHAPTER_SEPARATOR = "\n\n";
// A single epub entry over 64 MiB is a bomb, not a chapter — refuse per-entry (fflate caps at decode time below).
const MAX_ENTRY_BYTES = 67_108_864;

/** `<rootfile … full-path="OEBPS/content.opf" …>` — the OPF location, from `META-INF/container.xml`. */
const ROOTFILE_PATH = /<rootfile\b[^>]*\bfull-path="([^"]+)"/;
/** OPF `<dc:title>…</dc:title>` (namespaced or bare). */
const DC_TITLE = /<(?:dc:)?title\b[^>]*>([\s\S]*?)<\/(?:dc:)?title>/i;
/** OPF `<spine>…</spine>` — the reading-order block. */
const SPINE_BLOCK = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i;
/** A spine `<itemref idref="chap1"/>` — one entry, in reading order. */
const ITEMREF = /<itemref\b[^>]*\bidref="([^"]+)"/g;
/** A manifest `<item id="chap1" href="text/chap1.xhtml" …>` — id → href (attribute order varies). */
const MANIFEST_ITEM = /<item\b([^>]*)>/g;
const ITEM_ID = /\bid="([^"]+)"/;
const ITEM_HREF = /\bhref="([^"]+)"/;
const WHITESPACE_RUN = /\s+/g;
const XML_ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const XML_ENTITY = /&(?:amp|lt|gt|quot|apos);/g;

function decodeXml(raw: string): string {
  return raw.replace(XML_ENTITY, (m) => XML_ENTITIES[m] ?? m);
}

/** Refuse an over-cap entry from its zip header BEFORE fflate allocates its output buffer (the bomb guard). */
function entryCapFilter(file: { readonly originalSize: number; readonly name: string }): boolean {
  if (file.originalSize > MAX_ENTRY_BYTES) {
    throw new Error(`epub entry ${file.name} exceeds the ${MAX_ENTRY_BYTES}-byte cap`);
  }
  return true;
}

/** The directory prefix of a zip path (`OEBPS/content.opf` → `OEBPS/`), for resolving chapter hrefs relative to
 *  the OPF (epub hrefs are OPF-relative, not archive-root-relative). */
function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash + 1);
}

/** Build the manifest `id → href` map from the OPF `<item>` elements. */
function manifestHrefs(opf: string): Map<string, string> {
  const hrefs = new Map<string, string>();
  for (const item of opf.matchAll(MANIFEST_ITEM)) {
    const attrs = item[1] ?? "";
    const id = ITEM_ID.exec(attrs)?.[1];
    const href = ITEM_HREF.exec(attrs)?.[1];
    if (id !== undefined && href !== undefined) {
      hrefs.set(id, decodeXml(href));
    }
  }
  return hrefs;
}

/** The spine's chapter zip-paths, in reading order (idref → manifest href → OPF-relative resolved path). */
function spinePaths(opf: string, opfDir: string): string[] {
  const hrefs = manifestHrefs(opf);
  const spine = SPINE_BLOCK.exec(opf)?.[1] ?? "";
  const paths: string[] = [];
  for (const ref of spine.matchAll(ITEMREF)) {
    const href = hrefs.get(ref[1] ?? "");
    if (href !== undefined) {
      paths.push(`${opfDir}${href}`);
    }
  }
  return paths;
}

function titleOf(opf: string): string | undefined {
  const captured = DC_TITLE.exec(opf)?.[1];
  if (captured === undefined) {
    return;
  }
  const title = decodeXml(captured).replace(WHITESPACE_RUN, " ").trim();
  return title.length > 0 ? title : undefined;
}

export async function loadEpub(bytes: Uint8Array): Promise<RawExtraction> {
  const files = unzipSync(bytes, { filter: entryCapFilter });

  const container = files[CONTAINER_PATH];
  if (container === undefined) {
    throw new Error(`epub is missing ${CONTAINER_PATH}`);
  }
  const opfPath = ROOTFILE_PATH.exec(strFromU8(container))?.[1];
  if (opfPath === undefined || files[opfPath] === undefined) {
    throw new Error("epub OPF package document not found");
  }
  const opf = strFromU8(files[opfPath]);

  const chapters: string[] = [];
  for (const path of spinePaths(opf, dirOf(opfPath))) {
    const chapterBytes = files[path];
    if (chapterBytes === undefined) {
      continue; // a spine reference to a missing file is skipped, not fatal (the doc is still readable)
    }
    // biome-ignore lint/performance/noAwaitInLoops: chapters run through the html loader sequentially — spine order IS the reading order the join depends on, and each is independent light work.
    const extracted = await loadHtml(chapterBytes);
    chapters.push(extracted.text);
  }

  const text = chapters.join(CHAPTER_SEPARATOR);
  const title = titleOf(opf);
  return title === undefined ? { text } : { text, title };
}
