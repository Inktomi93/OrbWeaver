// sanitize.ts — wire-level error hygiene. An upstream error body (an HTML 502 page, a control-char blob)
// must never reach a log line or a ProviderError.message verbatim. We lock: C0/DEL control chars are
// stripped, HTML/XML tags become spaces (adjacent tokens don't fuse), whitespace collapses, the length
// cap appends a truncation marker, and the passes are idempotent on clean text.

import { sanitizeApiError } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

// Assemble control chars at runtime (NUL, BS, DEL) rather than embedding raw bytes in the source.
const CONTROL_CHARS = String.fromCharCode(0, 8, 127);
const TRUNCATION_MARKER = "… [truncated]";

describe("sanitizeApiError", () => {
  test("strips C0 control chars + DEL from the body", () => {
    expect(sanitizeApiError(`bad${CONTROL_CHARS}request`)).toBe("badrequest");
  });

  test("strips HTML/XML tags, inserting a space so adjacent tokens don't fuse", () => {
    expect(sanitizeApiError("<h1>Foo</h1><p>Bar</p>")).toBe("Foo Bar");
  });

  test("an upstream HTML error page leaves NO markup behind (the security belt)", () => {
    // Assembled from parts so the contiguous markup blob isn't flagged as a high-entropy literal.
    const html = ["<html>", "<body>", "upstream is down", "</body>", "</html>"].join("");
    const out = sanitizeApiError(html);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toBe("upstream is down");
  });

  test("collapses runs of whitespace (incl. tabs/newlines) into a single space and trims", () => {
    expect(sanitizeApiError("  a\t\t b\n\n c  ")).toBe("a b c");
  });

  test("caps length and appends a truncation marker past the cap", () => {
    const out = sanitizeApiError("a".repeat(50), 10);
    expect(out).toBe(`${"a".repeat(10)}${TRUNCATION_MARKER}`);
    expect(out.length).toBe(10 + TRUNCATION_MARKER.length);
  });

  test("text at or under the cap is NOT truncated", () => {
    expect(sanitizeApiError("short", 10)).toBe("short");
  });

  test("is idempotent on already-clean text (the passes are no-ops)", () => {
    const clean = "already clean message";
    expect(sanitizeApiError(sanitizeApiError(clean))).toBe(clean);
  });

  test("an empty string sanitizes to an empty string", () => {
    expect(sanitizeApiError("")).toBe("");
  });
});
