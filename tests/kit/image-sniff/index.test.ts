// kit/image-sniff — sniffMime / isAnimated / sniffImageBytes: the pure magic-byte + dimension + animation
// sniff shared by the assets domain, the infra/network image-guard, and the vllm backend (D61 B5a
// G2). Pins each recognized signature + the octet-stream sentinel for unknown/short input (the upload
// boundary's "never a valid claimed mime"), the animation-chunk sniff (GIF/APNG/WebP), and the header-parsed
// dimensions per format.

import { isAnimated, PNG_SIGNATURE, sniffImageBytes, sniffMime } from "@orb/kit/image-sniff";
import { isPng } from "@orb/kit/png-card-chunk";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF87 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01]);
const GIF89 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01]);
// RIFF....WEBP — bytes 4..7 (the chunk size) are irrelevant to the sniff.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

describe("sniffMime", () => {
  test("recognizes PNG / JPEG / GIF87a / GIF89a / WebP signatures", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(GIF87)).toBe("image/gif");
    expect(sniffMime(GIF89)).toBe("image/gif");
    expect(sniffMime(WEBP)).toBe("image/webp");
  });

  test("unknown bytes are the octet-stream sentinel", () => {
    expect(sniffMime(new TextEncoder().encode("plain text, not an image"))).toBe("application/octet-stream");
  });

  test("a buffer too short for a signature does not false-match", () => {
    // A bare 4-byte "GIF8" (or "RIFF") is NOT a valid image — strict tables require the full tag.
    expect(sniffMime(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe("application/octet-stream");
    expect(sniffMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe("application/octet-stream");
    expect(sniffMime(new Uint8Array([]))).toBe("application/octet-stream");
  });

  test("the PNG check reads all EIGHT signature bytes — a 4-byte near-miss is not a PNG", () => {
    // `89 50 4e 47` + anything used to sniff as image/png while `kit/png-card-chunk` (all 8 bytes, PNG spec
    // §5.2) called the same buffer not-a-PNG. libpng rejects it too; the two modules now agree by construction
    // — the sniff imports the codec's signature rather than re-spelling a prefix of it.
    const nearMiss = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00, 0, 0, 0, 13]);
    expect(sniffMime(nearMiss)).toBe("application/octet-stream");
    expect(isPng(nearMiss)).toBe(false);
    // Every byte matters: flip the last one only.
    const lastByteWrong = Uint8Array.from(PNG_SIGNATURE);
    lastByteWrong[PNG_SIGNATURE.length - 1] = 0;
    expect(sniffMime(lastByteWrong)).toBe("application/octet-stream");
    // …and the real signature is one shared constant, so both modules answer yes to the same bytes.
    expect(sniffMime(PNG_SIGNATURE)).toBe("image/png");
    expect(isPng(PNG_SIGNATURE)).toBe(true);
  });
});

// ── Fixtures: hand-built minimal headers (dimensions chosen distinct so a swapped W/H fails loudly) ──────

// PNG IHDR: sig(8) + length(4) + "IHDR"(4) + width(4 BE) + height(4 BE). 100×50.
const PNG_STATIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x32,
]);
// The same PNG head with an `acTL` (APNG animation-control) chunk following IHDR → animated.
const APNG_STATIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x32, 0x00, 0x00,
  0x00, 0x08, 0x61, 0x63, 0x54, 0x4c,
]);
// GIF89a: "GIF89a"(6) + width(2 LE) + height(2 LE). 10×20.
const GIF_ANIM = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x0a, 0x00, 0x14, 0x00]);
// WebP VP8X (extended, animated): RIFF..WEBP + "VP8X" + chunkSize(4) + flags(1, anim bit 0x02) +
// reserved(3) + canvasW-1(3 LE) + canvasH-1(3 LE). 300×200. 299=0x00012b, 199=0x0000c7.
const WEBP_VP8X_ANIM = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x2b, 0x01,
  0x00, 0xc7, 0x00, 0x00,
]);
// JPEG with an APP0 segment before SOF0 (exercises the marker skip). 80×40.
const JPEG_APP0 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x28, 0x00, 0x50]);
// ── AVIF fixtures: real ISO-BMFF box trees, because the parser is now structural ────────────────────────
// The old fixture here declared a 24-byte `ftyp` that SWALLOWED the `ispe` box laid out after it, and a
// top-level `ispe` is not where the format puts one. It only ever parsed because the reader scanned raw bytes
// for the four characters `ispe` — the same reason a decoy could name an image's size (#1357).

const U32_BE = (n: number): number[] => [Math.floor(n / 16_777_216) % 256, Math.floor(n / 65_536) % 256, Math.floor(n / 256) % 256, n % 256];
const FOURCC = (tag: string): number[] => [...tag].map((c) => c.charCodeAt(0));
/** One ISO-BMFF box: size(4 BE, header included) + type(4) + body. */
const avifBox = (type: string, body: number[]): number[] => [...U32_BE(body.length + 8), ...FOURCC(type), ...body];
/** An `ispe` body: version/flags(4) + width(4 BE) + height(4 BE). */
const ispeBody = (w: number, h: number): number[] => [0, 0, 0, 0, ...U32_BE(w), ...U32_BE(h)];
/** A minimal structurally-valid AVIF: `ftyp`(avif) + `meta`(FullBox) → `iprp` → `ipco` → the `ispe` boxes. */
const avifFile = (ispeBoxes: number[][], extraTopLevel: number[] = []): Uint8Array =>
  Uint8Array.from([
    ...avifBox("ftyp", [...FOURCC("avif"), 0, 0, 0, 0]),
    ...extraTopLevel,
    ...avifBox("meta", [0, 0, 0, 0, ...avifBox("iprp", avifBox("ipco", ispeBoxes.flat()))]),
  ]);

const AVIF_STILL = avifFile([avifBox("ispe", ispeBody(1024, 768))]);

describe("isAnimated", () => {
  test("every GIF is treated animated; a static PNG/JPEG is not", () => {
    expect(isAnimated(GIF_ANIM)).toBe(true);
    expect(isAnimated(PNG_STATIC)).toBe(false);
    expect(isAnimated(JPEG_APP0)).toBe(false);
  });

  test("APNG (acTL) and animated WebP (VP8X anim flag) are animated", () => {
    expect(isAnimated(APNG_STATIC)).toBe(true);
    expect(isAnimated(WEBP_VP8X_ANIM)).toBe(true);
  });

  test("garbage / truncated buffers are not animated", () => {
    expect(isAnimated(new Uint8Array([]))).toBe(false);
    expect(isAnimated(new TextEncoder().encode("not an image"))).toBe(false);
  });
});

describe("sniffImageBytes", () => {
  test("parses PNG signature + dimensions", () => {
    expect(sniffImageBytes(PNG_STATIC)).toEqual({
      mime: "image/png",
      ext: "png",
      width: 100,
      height: 50,
      animated: false,
    });
  });

  test("parses GIF dimensions (little-endian) and marks it animated", () => {
    expect(sniffImageBytes(GIF_ANIM)).toEqual({
      mime: "image/gif",
      ext: "gif",
      width: 10,
      height: 20,
      animated: true,
    });
  });

  test("parses a WebP VP8X canvas size + animation flag", () => {
    expect(sniffImageBytes(WEBP_VP8X_ANIM)).toEqual({
      mime: "image/webp",
      ext: "webp",
      width: 300,
      height: 200,
      animated: true,
    });
  });

  test("parses a JPEG SOF past an APP0 segment", () => {
    expect(sniffImageBytes(JPEG_APP0)).toEqual({
      mime: "image/jpeg",
      ext: "jpg",
      width: 80,
      height: 40,
      animated: false,
    });
  });

  test("parses an AVIF ispe box", () => {
    expect(sniffImageBytes(AVIF_STILL)).toEqual({
      mime: "image/avif",
      ext: "avif",
      width: 1024,
      height: 768,
      animated: false,
    });
  });

  test("null dimensions when the header is truncated past the signature", () => {
    const truncatedPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageBytes(truncatedPng)).toEqual({
      mime: "image/png",
      ext: "png",
      width: null,
      height: null,
      animated: false,
    });
  });

  test("non-image bytes sniff to null", () => {
    expect(sniffImageBytes(new TextEncoder().encode("plain text"))).toBeNull();
    expect(sniffImageBytes(new Uint8Array([]))).toBeNull();
  });

  // ── A ZERO EXTENT IS NOT A DIMENSION (#1529) ──────────────────────────────────────────────────────
  // The AVIF arm already refused a zero-extent `ispe` (`MIN_DIMENSION`, "a declared extent below this is
  // not an image"); PNG/GIF/WebP/JPEG returned whatever their header said, so a well-formed header
  // DECLARING 0 sniffed to `{width: 0, height: 0}` — a measurement no image can have. It reached
  // `assets.width/height` verbatim through `storeAsset`, where `assets_measurements_check` (`> 0`)
  // rejected the whole upload. The floor is the sniffer's, not the column's: the column is right that a
  // stored dimension is positive, and "the header declared something impossible" is the same fact as
  // "the header is unreadable" — which every consumer already handles as `null`.

  test("a PNG whose IHDR declares 0x0 reads UNKNOWN, not zero", () => {
    // A complete, well-formed IHDR — length 13, type IHDR, width 0, height 0. Nothing is truncated here;
    // the header parses and says the image has no pixels.
    const zeroPng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(sniffImageBytes(zeroPng)).toEqual({ mime: "image/png", ext: "png", width: null, height: null, animated: false });
  });

  test("a GIF87a whose logical-screen descriptor is zeros reads UNKNOWN, not zero", () => {
    const zeroGif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x00, 0x00, 0x00, 0x00]);
    // `animated: true` is NOT collateral from this floor — `isAnimated` returns true for EVERY GIF by
    // design (its own JSDoc: a display hint, never an admission decision). The dimension axis is what
    // moved; the animation axis is untouched and asserted here so the two stay legible as separate facts.
    expect(sniffImageBytes(zeroGif)).toEqual({ mime: "image/gif", ext: "gif", width: null, height: null, animated: true });
  });

  test("ONE zero is enough — a half-zero extent is not half a measurement", () => {
    const halfZeroPng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(sniffImageBytes(halfZeroPng)).toMatchObject({ width: null, height: null });
  });

  test("the floor does not touch a REAL measurement — 1x1 is a legal image", () => {
    const onePng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    ]);
    expect(sniffImageBytes(onePng)).toMatchObject({ width: 1, height: 1 });
    // And the arm that already had the floor is unchanged.
    expect(sniffImageBytes(avifFile([avifBox("ispe", ispeBody(1, 1))]))).toMatchObject({ width: 1, height: 1 });
  });
});

// ── The AVIF dimension read feeds the decompression-bomb cap, so it is STRUCTURAL (#1357) ────────────────

// An ENCODER-PRODUCED AVIF (#1527), not a hand-built box tree: everything above is assembled by this file's
// own helpers, which means they can only ever prove the parser agrees with ITSELF. This 281-byte file came out
// of the toolchain's real encoder — sharp 0.35.3 / libvips+libheif, `sharp(<3×2 raw RGB>).avif({quality:20,
// effort:0}).toBuffer()` — and carries what a real file carries: `ftyp(28) meta(214) mdat(39)`, brands
// `avif,mif1,miaf`, and the `ispe` nested under `meta → iprp → ipco` with its `av1C`/`pixi`/`ipma` siblings.
// Base64 rather than a binary fixture because `tests/` carries no binary files at all today (`git ls-files`
// over `tests/**` matches none), and a 376-character string is cheaper to review than a new precedent.
//
// THERE IS NO `avis` HERE, and that is a measured absence: this toolchain has no encoder that emits an image
// SEQUENCE. Feeding sharp a 2-page animated GIF (`sharp(gif, {animated: true}).avif()`) FLATTENS it to a
// still — brands `avif,mif1,miaf`, one meta tree, no `avis` — so the sequence arm below is a hand-built `ftyp`
// declaring that brand, which is exactly the structure the sniff reads for it.
const AVIF_ENCODED_STILL_B64 =
  "AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAAB8AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAMAAAACAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAnbWRhdBIACgg4BCtICGg0gDIRHYJixO4444FlYACQNY48fsQ=";
const AVIF_ENCODED_STILL = Uint8Array.from(Buffer.from(AVIF_ENCODED_STILL_B64, "base64"));
/** The encoder's own `ftyp` is 28 bytes, so byte 28 is where its `meta` tree starts — the splice point. */
const AVIF_FTYP_END = 28;
/** Splice a box in FRONT of the real file's `meta` tree, leaving the encoder's own bytes otherwise intact. */
const spliceBeforeMeta = (box: number[]): Uint8Array =>
  Uint8Array.from([...AVIF_ENCODED_STILL.subarray(0, AVIF_FTYP_END), ...box, ...AVIF_ENCODED_STILL.subarray(AVIF_FTYP_END)]);

describe("sniffImageBytes — an AVIF from the real encoder, and the structures the walk refuses", () => {
  test("the encoder's own still parses to its real extent", () => {
    expect(sniffImageBytes(AVIF_ENCODED_STILL)).toEqual({ mime: "image/avif", ext: "avif", width: 3, height: 2, animated: false });
  });

  test("an ISO-BMFF extended box SIZE before the meta tree ends the walk — dimensions null, never a guess", () => {
    // size 0 = "this box runs to end of file"; size 1 = a 64-bit largesize follows. This bounded header parse
    // reads neither, and a structure it cannot validate must yield NO dimensions (the cap then rejects) rather
    // than skipping ahead on an assumed length.
    const sizeZero = [0, 0, 0, 0, ...FOURCC("mdat")];
    const sizeOne = [0, 0, 0, 1, ...FOURCC("mdat"), 0, 0, 0, 0, 0, 0, 0, 0x20];
    expect(sniffImageBytes(spliceBeforeMeta(sizeZero))).toMatchObject({ mime: "image/avif", width: null, height: null });
    expect(sniffImageBytes(spliceBeforeMeta(sizeOne))).toMatchObject({ mime: "image/avif", width: null, height: null });
  });

  test("an `avis` sequence with no meta tree is AVIF by brand and dimension-less by structure", () => {
    // Hand-built (see the note above — no encoder in this toolchain emits `avis`). A sequence that keeps its
    // extents only in track headers is exactly the "unknown dimensions" case, and unknown must never read as
    // small enough.
    const avis = Uint8Array.from([...avifBox("ftyp", [...FOURCC("avis"), 0, 0, 0, 0, ...FOURCC("avif")]), ...avifBox("mdat", [])]);
    expect(sniffImageBytes(avis)).toEqual({ mime: "image/avif", ext: "avif", width: null, height: null, animated: false });
  });
});

describe("sniffImageBytes — AVIF dimensions are read from the box tree, never scanned for", () => {
  test("a decoy `ispe` planted in an unrelated box cannot under-report a bomb's size", () => {
    // The attack, verbatim: a real 32000×32000 image whose `free` box payload spells `ispe` + a 1×1 extent
    // BEFORE the meta tree. Against the window scan this measured 1×1 and walked through every cap.
    const decoy = avifBox("free", [...FOURCC("ispe"), ...ispeBody(1, 1)]);
    const forged = avifFile([avifBox("ispe", ispeBody(32_000, 32_000))], decoy);
    expect(sniffImageBytes(forged)).toEqual({ mime: "image/avif", ext: "avif", width: 32_000, height: 32_000, animated: false });
  });

  test("a genuinely tiny AVIF still reports its real extent (the fix is not a blanket refusal)", () => {
    expect(sniffImageBytes(avifFile([avifBox("ispe", ispeBody(1, 1))]))).toEqual({
      mime: "image/avif",
      ext: "avif",
      width: 1,
      height: 1,
      animated: false,
    });
  });

  test("a multi-item `ipco` (thumbnail + primary) reports the LARGEST declared extent", () => {
    // Which `ispe` belongs to the primary item needs `pitm`+`ipma`; the maximum is the fail-closed answer —
    // a planted small extent cannot lower what the cap sees, whichever order the properties are stored in.
    const thumbFirst = avifFile([avifBox("ispe", ispeBody(64, 64)), avifBox("ispe", ispeBody(4000, 3000))]);
    const thumbLast = avifFile([avifBox("ispe", ispeBody(4000, 3000)), avifBox("ispe", ispeBody(64, 64))]);
    expect(sniffImageBytes(thumbFirst)).toMatchObject({ width: 4000, height: 3000 });
    expect(sniffImageBytes(thumbLast)).toMatchObject({ width: 4000, height: 3000 });
  });

  test("an unreachable or absent `ispe` yields NULL dimensions, never a guess", () => {
    // No meta tree at all…
    const noMeta = Uint8Array.from(avifBox("ftyp", [...FOURCC("avif"), 0, 0, 0, 0]));
    expect(sniffImageBytes(noMeta)).toEqual({ mime: "image/avif", ext: "avif", width: null, height: null, animated: false });
    // …a zero-extent `ispe` (0×0 would pass every pixel cap for free)…
    expect(sniffImageBytes(avifFile([avifBox("ispe", ispeBody(0, 0))]))).toMatchObject({ width: null, height: null });
    // …and a truncated meta tree (the declared box size runs past the buffer).
    const whole = avifFile([avifBox("ispe", ispeBody(1024, 768))]);
    expect(sniffImageBytes(whole.subarray(0, whole.length - 4))).toMatchObject({ width: null, height: null });
  });

  test("the AVIF brand comes from the `ftyp` box, not from the four characters appearing later", () => {
    // A non-AVIF ISO-BMFF file (brand `mp42`) whose payload happens to contain "avif" is NOT an AVIF — under
    // the old brand scan it was, and it then got AVIF's dimension treatment.
    const notAvif = Uint8Array.from([
      ...avifBox("ftyp", [...FOURCC("mp42"), 0, 0, 0, 0]),
      ...avifBox("free", [...FOURCC("avif")]),
      ...avifBox("meta", [0, 0, 0, 0, ...avifBox("iprp", avifBox("ipco", avifBox("ispe", ispeBody(8, 8))))]),
    ]);
    expect(sniffImageBytes(notAvif)).toBeNull();
    // The compatible-brands list still counts (major brand `mif1`, `avif` listed after the minor version).
    const compatible = Uint8Array.from([
      ...avifBox("ftyp", [...FOURCC("mif1"), 0, 0, 0, 0, ...FOURCC("avif")]),
      ...avifBox("meta", [0, 0, 0, 0, ...avifBox("iprp", avifBox("ipco", avifBox("ispe", ispeBody(8, 8))))]),
    ]);
    expect(sniffImageBytes(compatible)).toMatchObject({ mime: "image/avif", width: 8, height: 8 });
  });
});
