import { CSRF_HEADER, hasCsrfHeader } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// The CSRF mutation-header SIGNAL infra/auth produces (the 403 GATE itself lives at the seam). The header
// NAME is a cross-tier constant: the read side here and the write side (entry/http/auth-routes) MUST agree
// on the exact literal. `hasCsrfHeader` is pure presence-detection (any value, incl. empty, counts).

const headers = (init: Record<string, string> = {}): Headers => new Headers(init);

describe("CSRF_HEADER", () => {
  test("is the orbweaver-namespaced literal the read+write sides agree on", () => {
    expect(CSRF_HEADER).toBe("x-orb-csrf");
  });
});

describe("hasCsrfHeader", () => {
  test("present with a value → true", () => {
    expect(hasCsrfHeader(headers({ [CSRF_HEADER]: "1" }))).toBe(true);
  });

  test("absent → false", () => {
    expect(hasCsrfHeader(headers())).toBe(false);
  });

  test("present but EMPTY-string value still counts as present (presence, not truthiness)", () => {
    expect(hasCsrfHeader(headers({ [CSRF_HEADER]: "" }))).toBe(true);
  });

  test("header name is case-insensitive (Headers normalizes)", () => {
    expect(hasCsrfHeader(headers({ "X-ORB-CSRF": "x" }))).toBe(true);
  });

  test("an unrelated header does not trip the signal", () => {
    expect(hasCsrfHeader(headers({ "x-other": "x" }))).toBe(false);
  });
});
