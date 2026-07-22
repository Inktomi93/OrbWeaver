// @orb/kit/chunk — the pure recursive splitter. Verifies the five NORMATIVE properties (databank-design/03
// §2): (1) lossless partition, (2) size bound, (3) contiguity, (4) determinism, (5) totality — plus the
// whole-file short-circuit, the overlap-prefix semantics, and the surrogate-pair guard at hard cuts.

import type { ChunkParams, TextChunk } from "@orb/kit/chunk";
import { chunkText } from "@orb/kit/chunk";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const P = (over: Partial<ChunkParams> = {}): ChunkParams => ({ chunkSize: 100, overlapPercent: 0, wholeFileThreshold: 50, ...over });

/** Reconstruct the input from the chunk spans (the lossless-partition witness). */
const reconstruct = (text: string, chunks: readonly TextChunk[]): string => chunks.map((c) => text.slice(c.start, c.end)).join("");

/** Every span's gap between abutting chunks; `[]` means perfectly contiguous. */
const contiguityGaps = (chunks: readonly TextChunk[]): number[] =>
  chunks
    .slice(1)
    .map((c, i) => c.start - (chunks[i]?.end ?? c.start))
    .filter((g) => g !== 0);

const maxSpan = (chunks: readonly TextChunk[]): number => Math.max(0, ...chunks.map((c) => c.end - c.start));
const maxContent = (chunks: readonly TextChunk[]): number => Math.max(0, ...chunks.map((c) => c.content.length));

describe("chunkText — edge inputs (totality)", () => {
  test("empty string → no chunks", () => {
    expect(chunkText("", P())).toEqual([]);
  });

  test("text <= wholeFileThreshold → one whole-file chunk", () => {
    const text = "a short document under the threshold";
    expect(chunkText(text, P({ wholeFileThreshold: 5120 }))).toEqual([{ idx: 0, content: text, start: 0, end: text.length }]);
  });

  test("whitespace-only and a single unbroken line never throw and stay lossless + bounded", () => {
    const params = P({ chunkSize: 40 });
    for (const text of ["            ", "x".repeat(500)]) {
      const chunks = chunkText(text, params);
      expect(reconstruct(text, chunks)).toBe(text);
      expect(contiguityGaps(chunks)).toEqual([]);
      expect(maxSpan(chunks)).toBeLessThanOrEqual(params.chunkSize);
    }
  });
});

describe("chunkText — the normative properties over structured text", () => {
  const prose = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}: ${"lorem ipsum dolor ".repeat(3)}`).join("\n\n");

  test("paragraph-first split is lossless, contiguous, bounded, and 0..n-1 indexed", () => {
    const params = P({ chunkSize: 120, wholeFileThreshold: 40 });
    const chunks = chunkText(prose, params);
    expect(chunks.length).toBeGreaterThan(1);
    expect(reconstruct(prose, chunks)).toBe(prose);
    expect(contiguityGaps(chunks)).toEqual([]);
    expect(chunks.map((c) => c.idx)).toEqual(chunks.map((_, i) => i));
    expect(maxSpan(chunks)).toBeLessThanOrEqual(params.chunkSize);
  });

  test("a wall with zero separators falls through to the hard split with exact full-stride offsets", () => {
    const wall = "z".repeat(1000);
    const params = P({ chunkSize: 64, wholeFileThreshold: 10 });
    const chunks = chunkText(wall, params);
    expect(reconstruct(wall, chunks)).toBe(wall);
    expect(contiguityGaps(chunks)).toEqual([]);
    // every span but the last is a full stride
    expect(chunks.slice(0, -1).map((c) => c.end - c.start)).toEqual(chunks.slice(0, -1).map(() => 64));
  });

  test("determinism — two invocations are deeply equal", () => {
    const params = P({ chunkSize: 90, wholeFileThreshold: 20 });
    expect(chunkText(prose, params)).toEqual(chunkText(prose, params));
  });
});

describe("chunkText — overlap", () => {
  test("overlap prefixes the previous chunk's tail onto content; spans stay the non-overlap partition", () => {
    const text = "word ".repeat(200); // forces multiple chunks with a space separator
    const params = P({ chunkSize: 80, overlapPercent: 20, wholeFileThreshold: 10 });
    const chunks = chunkText(text, params);
    const overlapChars = Math.floor((params.chunkSize * params.overlapPercent) / 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(reconstruct(text, chunks)).toBe(text); // the [start,end) partition is unaffected by overlap
    expect(maxContent(chunks)).toBeLessThanOrEqual(params.chunkSize + overlapChars);
    // every idx>=1 content ends with its own span and borrows the predecessor's tail (longer than the span)
    const tails = chunks.slice(1);
    expect(tails.every((c) => c.content.endsWith(text.slice(c.start, c.end)))).toBe(true);
    expect(tails.every((c) => c.content.length > c.end - c.start)).toBe(true);
  });
});

describe("chunkText — surrogate-pair guard", () => {
  test("hard cuts never end on a lone high surrogate", () => {
    const text = "😀".repeat(200); // one astral codepoint = a surrogate pair (2 UTF-16 units)
    const params = P({ chunkSize: 9, overlapPercent: 0, wholeFileThreshold: 4 }); // odd size lands mid-pair
    const chunks = chunkText(text, params);
    expect(reconstruct(text, chunks)).toBe(text);
    expect(contiguityGaps(chunks)).toEqual([]);
    const trailingHighSurrogates = chunks.map((c) => c.content.charCodeAt(c.content.length - 1)).filter((code) => code >= 0xd8_00 && code <= 0xdb_ff);
    expect(trailingHighSurrogates).toEqual([]);
  });
});
