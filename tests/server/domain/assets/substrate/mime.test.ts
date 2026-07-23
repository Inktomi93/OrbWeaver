// The `enforceMagic` dispatch (domain/assets/substrate/mime) — the upload boundary's byte-level defense.
// Pins the image/pdf/zip/text families, the octet-stream reject, the claim≠sniff throw, and the ONE
// legitimate claim≠sniff pair: an `image/apng` claim over PNG-signature bytes (BG-A — animated PNG
// backgrounds share the PNG magic; the sniff is container-blind to the acTL animation chunk).

import { describe } from "vitest";
import { assertMagicMatches } from "../../../../../packages/server/src/domain/assets/substrate/mime.ts";
import { expect, test } from "../../../../support/fixtures";

// PNG 8-byte signature (an animated PNG carries the SAME leading bytes — the acTL chunk sits past it).
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF89 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // PK\x03\x04
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// ISO-BMFF: 4-byte box size then the `ftyp` box tag ("ftyp") at byte 4, then a major brand ("isom").
const MP4 = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
// Matroska/WebM EBML header magic at byte 0.
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);

describe("assertMagicMatches — image family", () => {
  test("a matching claim passes", () => {
    expect(() => assertMagicMatches(PNG, "image/png")).not.toThrow();
    expect(() => assertMagicMatches(GIF89, "image/gif")).not.toThrow();
  });

  test("image/apng over PNG-signature bytes is accepted (the animated-background edge)", () => {
    expect(() => assertMagicMatches(PNG, "image/apng")).not.toThrow();
    // the charset-parametered browser form too
    expect(() => assertMagicMatches(PNG, "image/apng; charset=binary")).not.toThrow();
  });

  test("a genuine mismatch still throws (apng normalization does not weaken the check)", () => {
    expect(() => assertMagicMatches(GIF89, "image/png")).toThrow("magic-byte mismatch");
    // apng only excuses the png sniff — a gif claiming apng is still a mismatch
    expect(() => assertMagicMatches(GIF89, "image/apng")).toThrow("magic-byte mismatch");
  });

  test("unrecognized bytes for an image claim throw", () => {
    expect(() => assertMagicMatches(new Uint8Array([0x00, 0x01, 0x02, 0x03]), "image/png")).toThrow("unrecognized magic bytes");
  });
});

describe("assertMagicMatches — document families", () => {
  test("pdf / zip-container signatures pass; a missing signature throws", () => {
    expect(() => assertMagicMatches(PDF, "application/pdf")).not.toThrow();
    expect(() => assertMagicMatches(ZIP, DOCX_MIME)).not.toThrow();
    expect(() => assertMagicMatches(PNG, "application/pdf")).toThrow("missing the %PDF signature");
  });

  test("text passes on valid UTF-8, throws on binary garbage", () => {
    expect(() => assertMagicMatches(new TextEncoder().encode("# hello"), "text/markdown")).not.toThrow();
    expect(() => assertMagicMatches(new Uint8Array([0xff, 0xfe, 0xff]), "text/plain")).toThrow("not valid UTF-8");
  });

  test("an unverifiable mime family throws", () => {
    expect(() => assertMagicMatches(PNG, "application/octet-stream")).toThrow("cannot enforce magic");
  });
});

describe("assertMagicMatches — video family (BG-V background layer)", () => {
  test("mp4 (ftyp box at byte 4) and webm (EBML header) signatures pass", () => {
    expect(() => assertMagicMatches(MP4, "video/mp4")).not.toThrow();
    expect(() => assertMagicMatches(WEBM, "video/webm")).not.toThrow();
    // the charset/codecs-parametered browser form is stripped to the base mime
    expect(() => assertMagicMatches(MP4, "video/mp4; codecs=avc1")).not.toThrow();
  });

  test("a video claim over the wrong container throws", () => {
    // webm bytes claiming mp4 lack the ftyp box; png bytes claiming webm lack the EBML magic
    expect(() => assertMagicMatches(WEBM, "video/mp4")).toThrow("missing the ISO-BMFF ftyp box");
    expect(() => assertMagicMatches(PNG, "video/webm")).toThrow("missing the WebM/EBML header");
  });

  test("an unaccepted video mime (e.g. quicktime) throws rather than passing unchecked", () => {
    expect(() => assertMagicMatches(MP4, "video/quicktime")).toThrow("cannot enforce magic for unsupported video mime");
  });
});
