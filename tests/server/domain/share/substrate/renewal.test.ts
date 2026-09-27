// domain/share/substrate/renewal — the IP certificate's renewal schedule (D269): inside the renewal window, backing off
// on failure, and never at or after the guard window before expiry.

import { describe } from "vitest";
import {
  EXPIRY_GUARD_MS,
  nextRenewalAt,
  RENEW_AT_LIFETIME_FRACTION,
  RENEWAL_RETRY_FIRST_MS,
  RENEWAL_RETRY_MAX_MS,
} from "../../../../../packages/server/src/domain/share/substrate/renewal.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const HOUR_MS = 3_600_000;
const LIFETIME_MS = 160 * HOUR_MS;
const CERTIFICATE = { notBefore: FROZEN_AT_MS, notAfter: FROZEN_AT_MS + LIFETIME_MS } as const;
const HALF_LIFE = FROZEN_AT_MS + LIFETIME_MS * RENEW_AT_LIFETIME_FRACTION;
const LATEST = CERTIFICATE.notAfter - EXPIRY_GUARD_MS;

describe("nextRenewalAt", () => {
  test("a fresh certificate renews at half its life, 80 hours in for the 160-hour shortlived profile", () => {
    expect(nextRenewalAt(CERTIFICATE, 0, FROZEN_AT_MS)).toBe(FROZEN_AT_MS + 80 * HOUR_MS);
    expect(HALF_LIFE).toBe(FROZEN_AT_MS + 80 * HOUR_MS);
  });

  test("a certificate already past half its life renews now", () => {
    const now = HALF_LIFE + 5 * HOUR_MS;
    expect(nextRenewalAt(CERTIFICATE, 0, now)).toBe(now);
  });

  test("each failure waits twice as long as the last, up to the cap", () => {
    const now = HALF_LIFE;
    const waits = [1, 2, 3, 4, 5, 6, 7].map((failures) => (nextRenewalAt(CERTIFICATE, failures, now) ?? 0) - now);
    expect(waits).toEqual([
      RENEWAL_RETRY_FIRST_MS,
      RENEWAL_RETRY_FIRST_MS * 2,
      RENEWAL_RETRY_FIRST_MS * 4,
      RENEWAL_RETRY_FIRST_MS * 8,
      RENEWAL_RETRY_FIRST_MS * 16,
      RENEWAL_RETRY_MAX_MS,
      RENEWAL_RETRY_MAX_MS,
    ]);
    expect(RENEWAL_RETRY_FIRST_MS).toBe(15 * 60_000);
    expect(RENEWAL_RETRY_MAX_MS).toBe(6 * HOUR_MS);
  });

  test("a backoff that would run into the guard window is pulled back to its start: one last try before expiry", () => {
    const now = LATEST - HOUR_MS;
    expect(nextRenewalAt(CERTIFICATE, 5, now)).toBe(LATEST);
  });

  test("nothing is scheduled at or after the guard window, and so never after expiry", () => {
    for (const now of [LATEST, LATEST + 1, CERTIFICATE.notAfter, CERTIFICATE.notAfter + HOUR_MS]) {
      for (const failures of [0, 1, 9]) {
        expect({ now, failures, at: nextRenewalAt(CERTIFICATE, failures, now) }).toEqual({ now, failures, at: null });
      }
    }
  });

  test("every scheduled attempt, over a run of failures from half-life, lands before expiry", () => {
    let now = HALF_LIFE;
    const attempts: number[] = [];
    for (let failures = 0; failures < 40; failures++) {
      const at = nextRenewalAt(CERTIFICATE, failures, now);
      if (at === null) {
        break;
      }
      attempts.push(at);
      now = at + 1;
    }
    expect(attempts.length).toBeGreaterThan(5);
    expect(attempts.every((at) => at <= LATEST && at < CERTIFICATE.notAfter)).toBe(true);
    expect(attempts.at(-1)).toBe(LATEST);
  });
});
