import type { SessionToken } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createTokenHasher, mintSessionToken, SESSION_TTL_MS, SLIDE_THROTTLE_MS } from "../../../../../packages/server/src/domain/sessions/tokens/tokens.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// Invariant #3: the token is never stored — only its PEPPERED hash; the hasher THROWS (loud
// misconfiguration beats silent forgery) when the pepper is unset, never HMACs "".

const PEPPER = "test-session-secret-at-least-32-chars-long";
const OTHER_PEPPER = "another-session-secret-32-chars-minimum!!";
const HEX_64 = /^[0-9a-f]{64}$/u;
const SESSION_SECRET_ERROR = /SESSION_SECRET/u;
const TOKEN = castId<SessionToken>("opaque-token-abc");
// 32 CSPRNG bytes → base64url is exactly 43 unpadded chars. Pinned because the session cookie's ENTROPY is
// the whole anti-guessing story: nothing downstream (the hash lookup, the TTL) notices a shortened token.
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/u;
const MINT_SAMPLES = 64;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const TTL_DAYS = 30;
const SLIDE_MINUTES = 5;

describe("mintSessionToken", () => {
  test("mints 256 bits of entropy as cookie-safe base64url (43 unpadded chars)", () => {
    expect(mintSessionToken()).toMatch(BASE64URL_43);
  });

  test("every mint is unique — no counter, no reuse", () => {
    const minted = new Set(Array.from({ length: MINT_SAMPLES }, () => mintSessionToken()));
    expect(minted.size).toBe(MINT_SAMPLES);
  });
});

describe("createTokenHasher", () => {
  test("produces a stable SHA-256 hex digest (round-trip: same token → same hash)", () => {
    const hash = createTokenHasher(PEPPER);
    const a = hash(TOKEN);
    const b = hash(TOKEN);
    expect(a).toMatch(HEX_64);
    expect(a).toBe(b);
  });

  test("is peppered — a different SESSION_SECRET yields a different hash for the same token", () => {
    expect(createTokenHasher(PEPPER)(TOKEN)).not.toBe(createTokenHasher(OTHER_PEPPER)(TOKEN));
  });

  test("never collides the hash with the raw token (the token is not stored)", () => {
    expect(createTokenHasher(PEPPER)(TOKEN)).not.toBe(TOKEN);
  });

  test("THROWS when the pepper is null (never HMACs the empty string)", () => {
    expect(() => createTokenHasher(null)(TOKEN)).toThrow(SESSION_SECRET_ERROR);
  });

  test("THROWS when the pepper is an empty string", () => {
    expect(() => createTokenHasher("")(TOKEN)).toThrow(SESSION_SECRET_ERROR);
  });

  test("THROWS when the pepper is undefined", () => {
    expect(() => createTokenHasher(undefined)(TOKEN)).toThrow(SESSION_SECRET_ERROR);
  });
});

describe("timing constants", () => {
  test("SESSION_TTL_MS is 30 days", () => {
    expect(SESSION_TTL_MS).toBe(TTL_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND);
  });

  test("SLIDE_THROTTLE_MS is 5 minutes", () => {
    expect(SLIDE_THROTTLE_MS).toBe(SLIDE_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND);
  });
});
