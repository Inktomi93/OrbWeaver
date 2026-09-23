// infra/extraction/loaders/epub.ts — the epub loader. An .epub is a ZIP of
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
// bytes (an upload boundary): TWO decompression guards, both read off the zip headers BEFORE fflate allocates
// any output buffer (the plugin-host `unzipHardened` precedent) — a PER-ENTRY cap, and the AGGREGATE budget
// that the per-entry cap alone could not express. The per-entry cap refuses one bomb; it sums nothing, so an
// archive of individually legal entries expanded without bound, and the upload route caps only the COMPRESSED
// body (`@orb/contracts/uploads` DATABANK_UPLOAD_MAX_BYTES) — the amplification between the two is exactly the
// gap the aggregate budget closes. The running total is a CLOSURE per `unzipSync` call, never module state: a
// module-level counter would carry one document's bytes into the next and refuse an innocent upload.
// Empty text is truthful (a spine of empty chapters).

import { DATABANK_EXTRACT_MAX_DECOMPRESSED_BYTES } from "@orb/contracts/uploads";
import { strFromU8, unzipSync } from "fflate";
import type { RawExtraction } from "../loader.ts";
import { loadHtml } from "./html.ts";

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

/** Build the per-call bomb guard: refuse an over-cap ENTRY, and refuse the whole archive once the accepted
 *  entries' declared sizes SUM past the aggregate budget — both from the zip headers, before fflate allocates
 *  the output buffer, which is the allocation the guard exists to prevent. The declared size is what bounds
 *  that allocation (fflate inflates into a buffer sized from the header and errors if the data overruns), so
 *  a header that lies small cannot buy more memory than it declared.
 *
 *  A FRESH closure per `unzipSync` call — the running total is this document's, never the process's. */
function createEntryCapFilter(): (file: { readonly originalSize: number; readonly name: string }) => boolean {
  let totalBytes = 0;
  return (file): boolean => {
    if (file.originalSize > MAX_ENTRY_BYTES) {
      throw new Error(`epub entry ${file.name} exceeds the ${MAX_ENTRY_BYTES}-byte cap`);
    }
    totalBytes += file.originalSize;
    if (totalBytes > DATABANK_EXTRACT_MAX_DECOMPRESSED_BYTES) {
      throw new Error(`epub exceeds the ${DATABANK_EXTRACT_MAX_DECOMPRESSED_BYTES}-byte aggregate decompressed budget at entry ${file.name}`);
    }
    return true;
  };
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
  const files = unzipSync(bytes, { filter: createEntryCapFilter() });

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
    const extracted = await loadHtml(chapterBytes);
    chapters.push(extracted.text);
  }

  const text = chapters.join(CHAPTER_SEPARATOR);
  const title = titleOf(opf);
  return title === undefined ? { text } : { text, title };
}
