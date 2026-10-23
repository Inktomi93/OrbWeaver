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

import type { DocFormat, ExtractionMeta, ExtractionResult, ExtractTextOp } from "@orb/contracts/extraction";
import { docFormatForMime, ExtractionFailedError, UnsupportedDocTypeError } from "@orb/contracts/extraction";
import type { RawExtraction } from "./contract.ts";
import { LOADERS } from "./formats.ts";
import { normalizeText } from "./normalize.ts";
import { EXTRACTOR_VERSION } from "./version.ts";

export { EXTRACTOR_VERSION } from "./version.ts";

/** Resolve the declared mime to a `DocFormat`. An unregistered mime throws `UnsupportedDocTypeError` before
 *  any loader runs. */
function formatFor(mime: string): DocFormat {
  const format = docFormatForMime(mime);
  if (format === undefined) {
    throw new UnsupportedDocTypeError(mime);
  }
  return format;
}

/** Normalize the loader's raw text (§2) and stamp the meta — the ONE place `EXTRACTOR_VERSION` + `charCount`
 *  are applied, so every format returns an identically-shaped `ExtractionResult`. */
function toResult(
  meta: Pick<Extract<ExtractionMeta, { readonly format: "pdf" }>, "format" | "pageCount"> | Pick<Exclude<ExtractionMeta, { readonly format: "pdf" }>, "format">,
  raw: RawExtraction,
): ExtractionResult {
  const text = normalizeText(raw.text);
  const fields = { extractorVersion: EXTRACTOR_VERSION, charCount: text.length };
  const title = raw.title === undefined ? {} : { title: raw.title };
  return {
    text,
    meta: meta.format === "pdf" ? { format: meta.format, ...fields, pageCount: meta.pageCount, ...title } : { format: meta.format, ...fields, ...title },
  };
}

/** Construct the injected `extractText` op. Stateless (the loaders hold no per-call state); the factory keeps
 *  the injection seam uniform with the other infra handles. */
export function createExtractText(): ExtractTextOp {
  return async (bytes: Uint8Array, mime: string): Promise<ExtractionResult> => {
    const format = formatFor(mime);
    let raw: RawExtraction;
    try {
      if (format === "pdf") {
        const pdf = await LOADERS.pdf(bytes);
        return toResult({ format, pageCount: pdf.pageCount }, pdf);
      }
      raw = await LOADERS[format](bytes);
    } catch (error) {
      throw new ExtractionFailedError(format, { cause: error });
    }
    return toResult({ format }, raw);
  };
}
