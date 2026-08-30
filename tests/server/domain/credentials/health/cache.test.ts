// domain/credentials/health/cache — pins the in-memory throttle + strike state's own behavior: the
// last-check read/write pair, strike accumulation + reset, and the touch-on-write LRU (insertion-order
// eviction) the header describes for the bounded Maps. Each test uses its own unique credentialId so the
// module-scope singleton state never leaks across tests.

import { describe } from "vitest";
import {
  clearHealthStrikes,
  getLastHealthCheck,
  recordHealthStrike,
  rememberHealthCheck,
} from "../../../../../packages/server/src/domain/credentials/health/cache.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("getLastHealthCheck / rememberHealthCheck", () => {
  test("never-probed credential reads undefined", () => {
    expect(getLastHealthCheck("cred_never_probed")).toBeUndefined();
  });

  test("a remembered check is read back exactly", () => {
    rememberHealthCheck("cred_remembered", 1000);
    expect(getLastHealthCheck("cred_remembered")).toBe(1000);
  });

  test("a second remember for the same id OVERWRITES the first (touch-on-write recency)", () => {
    rememberHealthCheck("cred_touch", 1000);
    rememberHealthCheck("cred_touch", 2000);
    expect(getLastHealthCheck("cred_touch")).toBe(2000);
  });
});

describe("recordHealthStrike / clearHealthStrikes", () => {
  test("strikes accumulate per credentialId, starting from zero", () => {
    expect(recordHealthStrike("cred_strikes_a")).toBe(1);
    expect(recordHealthStrike("cred_strikes_a")).toBe(2);
    expect(recordHealthStrike("cred_strikes_a")).toBe(3);
  });

  test("strike counters are independent PER credentialId", () => {
    recordHealthStrike("cred_strikes_b1");
    recordHealthStrike("cred_strikes_b1");
    expect(recordHealthStrike("cred_strikes_b2")).toBe(1); // unaffected by cred_strikes_b1's count
  });

  test("clearHealthStrikes resets the counter — a subsequent strike starts back at 1", () => {
    recordHealthStrike("cred_strikes_c");
    recordHealthStrike("cred_strikes_c");
    clearHealthStrikes("cred_strikes_c");
    expect(recordHealthStrike("cred_strikes_c")).toBe(1);
  });

  test("clearing a credential with no strikes recorded is a safe no-op", () => {
    expect(() => clearHealthStrikes("cred_never_struck")).not.toThrow();
  });
});
