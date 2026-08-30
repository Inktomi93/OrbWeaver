// domain/credentials/substrate/health-throttle — pins the throttle-window gate (a probe within the 60s
// window is refused, returning the PRIOR lastChecked; a probe past it proceeds and re-stamps) and the
// strike/trip cycle (HEALTH_STRIKE_LIMIT consecutive strikes trips, resetting the counter). Each test uses
// a unique credentialId — the underlying cache is a module-scope singleton.

import { describe } from "vitest";
import { beginProbe, recordStrike, resetStrikes } from "../../../../../packages/server/src/domain/credentials/substrate/health-throttle.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("beginProbe", () => {
  test("the FIRST probe for a credential proceeds (returns null) and stamps the check time", () => {
    expect(beginProbe("cred_throttle_a", 1000)).toBeNull();
  });

  test("a probe WITHIN the 60s window is throttled — returns the PRIOR lastChecked, not null", () => {
    beginProbe("cred_throttle_b", 1000);
    expect(beginProbe("cred_throttle_b", 1000 + 30_000)).toBe(1000); // 30s later — still inside the window
  });

  test("a probe PAST the 60s window proceeds again and re-stamps to the new time", () => {
    beginProbe("cred_throttle_c", 1000);
    expect(beginProbe("cred_throttle_c", 1000 + 60_001)).toBeNull();
    // The re-stamp took effect — a probe right after THAT is throttled against the NEW time, not the old one.
    expect(beginProbe("cred_throttle_c", 1000 + 60_002)).toBe(1000 + 60_001);
  });
});

describe("recordStrike / resetStrikes", () => {
  test("strikes below the limit do not trip — limitHit stays false", () => {
    expect(recordStrike("cred_strike_a")).toEqual({ strikes: 1, limitHit: false });
    expect(recordStrike("cred_strike_a")).toEqual({ strikes: 2, limitHit: false });
  });

  test("the THIRD consecutive strike trips the breaker and resets the counter", () => {
    recordStrike("cred_strike_b");
    recordStrike("cred_strike_b");
    expect(recordStrike("cred_strike_b")).toEqual({ strikes: 3, limitHit: true });
    // Reset on trip — a fourth strike starts back at 1, not 4.
    expect(recordStrike("cred_strike_b")).toEqual({ strikes: 1, limitHit: false });
  });

  test("resetStrikes clears the counter — a decisive ok/revoked probe doesn't leave a stale streak", () => {
    recordStrike("cred_strike_c");
    recordStrike("cred_strike_c");
    resetStrikes("cred_strike_c");
    expect(recordStrike("cred_strike_c")).toEqual({ strikes: 1, limitHit: false });
  });
});
