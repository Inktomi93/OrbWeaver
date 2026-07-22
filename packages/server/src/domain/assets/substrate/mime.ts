// domain/assets/substrate/mime — the `enforceMagic` dispatch (databank-design/02 §6). Given a CLAIMED mime and
// the raw bytes, verify the bytes match the claim BEFORE they enter the CAS (the upload boundary's byte-level
// defense; a mislabeled binary must fail here, never confusingly-late at extraction). Four families:
//   • `image/*` → the shared magic-signature sniff (`@orb/kit/image-sniff`); the sniffed mime must equal the claim.
//   • `video/*` → the container magic for the two we accept (BG-V video backgrounds): `video/mp4` = the ISO-BMFF
//     `ftyp` box tag at byte 4; `video/webm` = the Matroska/WebM EBML header magic at byte 0. Kit's sniff is
//     image-only, so these dispatch here (the DBK-A belt pattern — a signature check, never a conversion).
//   • `application/pdf` / the zip-container document mimes (docx/epub) → their own leading signatures (`%PDF`,
//     the ZIP local-file header `PK\x03\x04`) — kit's sniff is image-only, so these dispatch here.
//   • `text/*` → NO magic exists; the strongest cheap check a text format admits is a strict-UTF-8 decode
//     (binary garbage fails it). The upload size cap is the route/`maxBytes` belt, not re-checked here.
// Throws a plain Error on any mismatch — the ONE verification point `storeBlob` calls when `enforceMagic` is set.

import { sniffMime } from "@orb/kit/image-sniff";

const OCTET_STREAM = "application/octet-stream";
const IMAGE_PREFIX = "image/";
// Animated PNG shares the PNG byte signature — the acTL animation chunk sits past the signature, and the
// magic sniff is container-blind to it — so a browser-supplied `image/apng` claim always sniffs as
// `image/png`. This is the ONE legitimate claim≠sniff pair for images (animated backgrounds; BG-A).
const APNG_MIME = "image/apng";
const PNG_MIME = "image/png";
const TEXT_PREFIX = "text/";
const VIDEO_PREFIX = "video/";
const MP4_MIME = "video/mp4";
const WEBM_MIME = "video/webm";
const PDF_MIME = "application/pdf";
// The OOXML/OPF zip containers we recognize (docx/epub are DB8 fast-follows; the belt ships with the design).
const ZIP_CONTAINER_MIMES = new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/epub+zip"]);

// Leading byte signatures, spelled as their literal ASCII/control chars (escape sequences for the unprintable bytes; no numeric literals — the kit
// image-sniff avoids `noMagicNumbers` the same way). Each `charCodeAt` IS the signature byte.
const PDF_SIGNATURE = "%PDF"; // 0x25 0x50 0x44 0x46
const ZIP_SIGNATURE = "PK\x03\x04"; // 0x50 0x4b 0x03 0x04 — the ZIP local-file header
// ISO-BMFF: the `ftyp` box TAG (0x66 0x74 0x79 0x70) sits at byte 4, AFTER the 4-byte box size (mp4/m4v/mov share it).
const FTYP_SIGNATURE = "ftyp";
const FTYP_OFFSET = 4;
// Matroska/WebM: the EBML header magic at byte 0 — 0x1A 0x45 0xDF 0xA3 (the high bytes spelled as their code points).
const EBML_SIGNATURE = "\x1a\x45\xdf\xa3";

/** The base mime with any `; charset=…` parameter stripped and lowercased (browsers send `text/markdown; charset=utf-8`). */
function baseMime(mime: string): string {
  return (mime.split(";")[0] ?? "").trim().toLowerCase();
}

/** True iff `bytes[offset..]` equals the given ASCII/byte signature (a short buffer simply fails to match). */
function matchesAt(bytes: Uint8Array, offset: number, signature: string): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

/** True iff `bytes` starts with the given ASCII/byte signature (a short buffer simply fails to match). */
function startsWith(bytes: Uint8Array, signature: string): boolean {
  return matchesAt(bytes, 0, signature);
}

/** The `video/*` arm — the two container formats BG-V accepts, by their leading magic (never a decode/convert). */
function assertVideoMagic(bytes: Uint8Array, base: string, claimedMime: string): void {
  if (base === MP4_MIME) {
    if (!matchesAt(bytes, FTYP_OFFSET, FTYP_SIGNATURE)) {
      throw new Error(`assets.store: magic-byte mismatch — claimed ${claimedMime}, missing the ISO-BMFF ftyp box`);
    }
    return;
  }
  if (base === WEBM_MIME) {
    if (!startsWith(bytes, EBML_SIGNATURE)) {
      throw new Error(`assets.store: magic-byte mismatch — claimed ${claimedMime}, missing the WebM/EBML header`);
    }
    return;
  }
  throw new Error(`assets.store: cannot enforce magic for unsupported video mime ${claimedMime}`);
}

/** True iff `bytes` decodes as strict UTF-8 (the text-family fallback — no signature exists for text). */
function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** The `image/*` arm — sniff the bytes and require they equal the claim, with the one animated-PNG edge. */
function assertImageMagic(bytes: Uint8Array, base: string, claimedMime: string): void {
  const sniffed = sniffMime(bytes);
  if (sniffed === OCTET_STREAM) {
    throw new Error(`assets.store: unrecognized magic bytes — claimed ${claimedMime}, no known image signature`);
  }
  // The animated-PNG edge: `image/apng` bytes carry the PNG signature, so accept the png sniff as a match.
  if (base === APNG_MIME && sniffed === PNG_MIME) {
    return;
  }
  if (sniffed !== base) {
    throw new Error(`assets.store: magic-byte mismatch — claimed ${claimedMime}, sniffed ${sniffed}`);
  }
}

/**
 * Verify the CLAIMED mime against the byte signature; throws on any mismatch. Dispatches on the claim's family so
 * documents (pdf/zip/text) are covered alongside images — kit's `sniffMime` recognizes images only.
 */
export function assertMagicMatches(bytes: Uint8Array, claimedMime: string): void {
  const base = baseMime(claimedMime);

  if (base.startsWith(IMAGE_PREFIX)) {
    assertImageMagic(bytes, base, claimedMime);
    return;
  }

  if (base.startsWith(VIDEO_PREFIX)) {
    assertVideoMagic(bytes, base, claimedMime);
    return;
  }

  if (base === PDF_MIME) {
    if (!startsWith(bytes, PDF_SIGNATURE)) {
      throw new Error(`assets.store: magic-byte mismatch — claimed ${claimedMime}, missing the %PDF signature`);
    }
    return;
  }

  if (ZIP_CONTAINER_MIMES.has(base)) {
    if (!startsWith(bytes, ZIP_SIGNATURE)) {
      throw new Error(`assets.store: magic-byte mismatch — claimed ${claimedMime}, missing the zip-container signature`);
    }
    return;
  }

  if (base.startsWith(TEXT_PREFIX)) {
    if (!isValidUtf8(bytes)) {
      throw new Error(`assets.store: magic-byte mismatch — claimed ${claimedMime} but the bytes are not valid UTF-8`);
    }
    return;
  }

  throw new Error(`assets.store: cannot enforce magic for unverifiable mime ${claimedMime}`);
}
