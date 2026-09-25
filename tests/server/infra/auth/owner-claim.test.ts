// infra/auth/owner-claim — the boot owner claim code. Pins: only the live code holds a login, a held login proves the
// claim once and spends the code for every other held login, an unheld login spends nothing, and a re-issued code
// retires the old one with its held logins.

import { createOwnerClaimCode } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/u;

describe("createOwnerClaimCode", () => {
  test("a fresh code is 32 random bytes, base64url, and differs per issue", () => {
    const claim = createOwnerClaimCode();
    const first = claim.issue();
    expect(first).toMatch(BASE64URL_32_BYTES);
    expect(claim.issue()).not.toBe(first);
  });

  test("before any issue, nothing holds", () => {
    const claim = createOwnerClaimCode();
    expect(claim.hold("state-a", "anything")).toBe(false);
    expect(claim.redeem("state-a")).toBe(false);
  });

  test("only the live code holds a login", () => {
    const claim = createOwnerClaimCode();
    const code = claim.issue();
    expect(claim.hold("state-a", `${code}x`)).toBe(false);
    expect(claim.hold("state-a", "")).toBe(false);
    expect(claim.redeem("state-a")).toBe(false);
    expect(claim.hold("state-a", code)).toBe(true);
  });

  test("a held login proves the claim once, and the spend retires every other held login", () => {
    const claim = createOwnerClaimCode();
    const code = claim.issue();
    claim.hold("state-a", code);
    claim.hold("state-b", code);
    expect(claim.redeem("state-a")).toBe(true);
    expect(claim.redeem("state-a")).toBe(false);
    expect(claim.redeem("state-b")).toBe(false);
    expect(claim.hold("state-c", code)).toBe(false);
  });

  test("redeeming a login that never held the code spends nothing", () => {
    const claim = createOwnerClaimCode();
    const code = claim.issue();
    claim.hold("state-a", code);
    expect(claim.redeem("state-other")).toBe(false);
    expect(claim.redeem("state-a")).toBe(true);
  });

  test("a re-issued code retires the old code and the logins it held", () => {
    const claim = createOwnerClaimCode();
    const old = claim.issue();
    claim.hold("state-a", old);
    const fresh = claim.issue();
    expect(claim.redeem("state-a")).toBe(false);
    expect(claim.hold("state-b", old)).toBe(false);
    expect(claim.hold("state-b", fresh)).toBe(true);
    expect(claim.redeem("state-b")).toBe(true);
  });
});
