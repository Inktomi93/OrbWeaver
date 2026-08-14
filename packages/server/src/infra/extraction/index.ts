// infra/extraction — the server-side text-extraction adapter. A SEALED, db-free,
// domain-free I/O executor (dep-cruiser `infra-no-db` + `infra-below-domain`) behind ONE injected op:
// `(bytes, declaredMime) → ExtractionResult`. `entry/compose` constructs `createExtractText()` once and injects
// it into `DatabankContext.extractText`; the domain's only compile-time dependency is
// `@orb/contracts/extraction` — it NEVER imports infra (the `EmbedRequest`/`@orb/contracts/providers`
// precedent). Superseded the dep-free `entry/compose/databank-extract.ts` textlike passthrough (deleted): its
// `textlike` loader is now `loaders/textlike.ts`, and the pdf/html loaders slotted in behind the same op.
//
// Error taxonomy: an unknown mime throws `UnsupportedDocTypeError` BEFORE any parse (a 415-class,
// never retried, never wrapped); any loader failure is wrapped as `ExtractionFailedError(format, {cause})`
// (corrupt/encrypted/invalid file — a corrupt zip for docx/epub included). Empty text is NOT an error — the op
// returns it truthfully (`charCount` tells the story; the upload verb surfaces an `empty-extraction` warning,
// not a throw).

import type { DocFormat, ExtractionResult, ExtractTextOp } from "@orb/contracts/extraction";
import { ExtractionFailedError, UnsupportedDocTypeError } from "@orb/contracts/extraction";
import { LOADERS, MIME_TO_FORMAT } from "./formats.ts";
import type { RawExtraction } from "./loader.ts";
import { normalizeText } from "./normalize.ts";
import { EXTRACTOR_VERSION } from "./version.ts";

export { EXTRACTOR_VERSION } from "./version.ts";

/** Resolve the declared mime to a `DocFormat`, stripping parameters + lowercasing (`text/html; charset=utf-8`
 *  → `text/html`). An unregistered mime throws `UnsupportedDocTypeError` before any loader runs. */
function formatFor(mime: string): DocFormat {
  const key = mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const format = MIME_TO_FORMAT[key];
  if (format === undefined) {
    throw new UnsupportedDocTypeError(mime);
  }
  return format;
}

/** Normalize the loader's raw text (§2) and stamp the meta — the ONE place `EXTRACTOR_VERSION` + `charCount`
 *  are applied, so every format returns an identically-shaped `ExtractionResult`. */
function toResult(format: DocFormat, raw: RawExtraction): ExtractionResult {
  const text = normalizeText(raw.text);
  return {
    text,
    meta: {
      format,
      extractorVersion: EXTRACTOR_VERSION,
      charCount: text.length,
      ...(raw.pageCount === undefined ? {} : { pageCount: raw.pageCount }),
      ...(raw.title === undefined ? {} : { title: raw.title }),
    },
  };
}

/** Construct the injected `extractText` op. Stateless (the loaders hold no per-call state); the factory keeps
 *  the injection seam uniform with the other infra handles. */
export function createExtractText(): ExtractTextOp {
  return async (bytes: Uint8Array, mime: string): Promise<ExtractionResult> => {
    const format = formatFor(mime);
    let raw: RawExtraction;
    try {
      raw = await LOADERS[format](bytes);
    } catch (error) {
      throw new ExtractionFailedError(format, { cause: error });
    }
    return toResult(format, raw);
  };
}
