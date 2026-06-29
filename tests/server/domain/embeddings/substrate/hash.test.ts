// substrate/hash — the one content-hash. Asserts determinism (the staleness gate relies on it), that string
// and the equivalent UTF-8 bytes hash identically (so a re-index of the same content collapses regardless of
// the caller's content form), and that distinct content hashes distinctly.

import { describe, expect, test } from "vitest";
import { contentHash } from "../../../../../packages/server/src/domain/embeddings/substrate/hash.ts";

const SHA256_HEX = /^[0-9a-f]{64}$/u;

describe("contentHash", () => {
  test("is deterministic — identical content yields the identical hash", () => {
    expect(contentHash("the card text")).toBe(contentHash("the card text"));
  });

  test("a string and its UTF-8 bytes hash identically", () => {
    const text = "joint vision text";
    expect(contentHash(text)).toBe(contentHash(new TextEncoder().encode(text)));
  });

  test("distinct content hashes distinctly", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
    expect(contentHash(new Uint8Array([1, 2, 3]))).not.toBe(contentHash(new Uint8Array([1, 2, 4])));
  });

  test("is SHA-256 hex (64 lowercase hex chars)", () => {
    expect(contentHash("x")).toMatch(SHA256_HEX);
  });
});
