import { isAssetHash } from "@orb/kit/assets";
import { expect, test } from "vitest";

// Low-entropy, obviously-non-secret way to build a 64-char hex string (noSecrets-safe).
const HEX64 = "abcd".repeat(16);

test("accepts a well-formed sha-256 hex digest (64 lowercase hex chars)", () => {
  expect(HEX64.length).toBe(64);
  expect(isAssetHash(HEX64)).toBe(true);
  expect(isAssetHash("a".repeat(64))).toBe(true);
});

test("rejects the wrong length", () => {
  expect(isAssetHash("a".repeat(63))).toBe(false);
  expect(isAssetHash("a".repeat(65))).toBe(false);
  expect(isAssetHash("")).toBe(false);
});

test("rejects uppercase hex (digest is canonically lowercase)", () => {
  expect(isAssetHash("A".repeat(64))).toBe(false);
});

test("rejects non-hex characters", () => {
  expect(isAssetHash("g".repeat(64))).toBe(false);
  expect(isAssetHash(`z${"a".repeat(63)}`)).toBe(false);
});

test("rejects path-traversal payloads of the right length (the guard's reason for being)", () => {
  expect(isAssetHash(`${"a".repeat(63)}/`)).toBe(false);
  expect(isAssetHash(`..${"/".repeat(62)}`)).toBe(false);
});
