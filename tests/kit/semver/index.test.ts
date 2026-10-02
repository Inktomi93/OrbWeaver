// @orb/kit/semver: the one version ordering plugin upgrades and the stable update check share. Pins numeric
// (not lexical) segment order and the validation regex both callers apply at their boundary.

import { compareSemver, SEMVER_RE } from "@orb/kit/semver";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("compareSemver", () => {
  test("orders segments numerically, so 0.10.0 is newer than 0.9.9", () => {
    expect(compareSemver("0.10.0", "0.9.9")).toBe(1);
    expect(compareSemver("0.9.9", "0.10.0")).toBe(-1);
  });

  test("the most significant differing segment decides", () => {
    expect(compareSemver("1.0.0", "0.99.99")).toBe(1);
    expect(compareSemver("0.2.0", "0.1.9")).toBe(1);
    expect(compareSemver("0.1.2", "0.1.10")).toBe(-1);
  });

  test("equal versions compare equal", () => {
    expect(compareSemver("0.1.0", "0.1.0")).toBe(0);
  });
});

describe("SEMVER_RE", () => {
  test("admits a plain three-part version only", () => {
    expect(SEMVER_RE.test("0.1.0")).toBe(true);
    expect(SEMVER_RE.test("v0.1.0")).toBe(false);
    expect(SEMVER_RE.test("0.1")).toBe(false);
    expect(SEMVER_RE.test("0.1.0-dev")).toBe(false);
  });
});
