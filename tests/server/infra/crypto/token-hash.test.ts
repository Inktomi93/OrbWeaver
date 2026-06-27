import { createTokenHasher } from "@orb/server/infra/crypto";
import { describe, expect, test } from "vitest";

// A descriptive (low-entropy) fixture pepper — not a real secret (noSecrets).
const PEPPER = "test-session-secret-at-least-32-chars";
const HEX64_RE = /^[0-9a-f]{64}$/;

describe("createTokenHasher", () => {
  test("is deterministic — same token + pepper → same hex digest", () => {
    const h = createTokenHasher(PEPPER);
    expect(h.hash("tok-abc")).toBe(h.hash("tok-abc"));
  });

  test("distinct tokens produce distinct digests", () => {
    const h = createTokenHasher(PEPPER);
    expect(h.hash("tok-a")).not.toBe(h.hash("tok-b"));
  });

  test("the digest is a 64-char (sha256) lowercase-hex string", () => {
    expect(createTokenHasher(PEPPER).hash("tok")).toMatch(HEX64_RE);
  });

  test("a different pepper changes the digest (peppered, not a bare sha256 of the token)", () => {
    const a = createTokenHasher(PEPPER);
    const b = createTokenHasher("a-completely-different-fixture-pepper");
    expect(a.hash("tok")).not.toBe(b.hash("tok"));
  });

  test("an unset pepper yields a DISABLED hasher that throws at call time", () => {
    const h = createTokenHasher(null);
    expect(h.enabled).toBe(false);
    expect(() => h.hash("tok")).toThrow("SESSION_SECRET");
  });

  test("an empty-string pepper is treated as unset", () => {
    expect(createTokenHasher("").enabled).toBe(false);
  });
});
