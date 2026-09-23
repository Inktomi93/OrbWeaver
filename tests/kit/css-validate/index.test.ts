// The custom-CSS validator: WARN (not reject) on `@import`, REJECT any
// `position: fixed`/`position: sticky` (a shell-break, not just an exfil nudge). Pure pattern-match —
// no CSS parsing.

import { validateThemeCss } from "@orb/kit/css-validate";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("validateThemeCss", () => {
  test("clean CSS has no errors and no warnings", () => {
    const result = validateThemeCss(".card { color: var(--color-primary); border-radius: 8px; }");
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("@import warns but does not error", () => {
    const result = validateThemeCss("@import url('https://evil.example/x.css'); .card { color: red; }");
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBe(1);
  });

  test("position: fixed errors (case/whitespace-insensitive)", () => {
    expect(validateThemeCss(".x { position: fixed; top: 0; }").errors.length).toBe(1);
    expect(validateThemeCss(".x{POSITION:FIXED}").errors.length).toBe(1);
    expect(validateThemeCss(".x { position:  fixed ; }").errors.length).toBe(1);
  });

  test("position: sticky errors", () => {
    expect(validateThemeCss(".x { position: sticky; top: 0; }").errors.length).toBe(1);
  });

  test("both position: fixed and @import in one blob surface both findings", () => {
    const result = validateThemeCss("@import 'x.css'; .x { position: fixed; }");
    expect(result.errors.length).toBe(1);
    expect(result.warnings.length).toBe(1);
  });

  test("position-adjacent but unrelated text does not false-positive", () => {
    // "position" appears but not as a fixed/sticky declaration.
    const result = validateThemeCss(".x { /* position notes */ position: relative; }");
    expect(result.errors).toEqual([]);
  });

  // ── comments and strings are inert (#1360 item 3) ─────────────────────────────────────────────────
  // These were FALSE POSITIVES: the patterns tested raw text, so an author's note about the rule they
  // were obeying got their theme rejected. The false-NEGATIVE direction never existed (the tests match
  // regardless of context), so the arms below prove stripping loses no real coverage.
  test("a declaration inside a COMMENT is not active CSS", () => {
    expect(validateThemeCss("/* position: fixed is not allowed here */ .x { color: red; }").errors).toEqual([]);
    expect(validateThemeCss("/* avoid @import */ .x { color: red; }").warnings).toEqual([]);
    // An unterminated comment swallows the rest of the file — that is CSS's own rule, not a leak.
    expect(validateThemeCss(".x { color: red; } /* position: sticky").errors).toEqual([]);
  });

  test("a declaration inside a QUOTED STRING is not active CSS", () => {
    expect(validateThemeCss('.x::after { content: "position: fixed"; }').errors).toEqual([]);
    expect(validateThemeCss(".x::after { content: 'position: sticky'; }").errors).toEqual([]);
    expect(validateThemeCss('.x::after { content: "@import"; }').warnings).toEqual([]);
  });

  test("a REAL declaration beside an inert one still fails — stripping loses no coverage", () => {
    const result = validateThemeCss('/* position: fixed */ .x { position: fixed; content: "@import"; } @import "y.css";');
    expect(result.errors.length).toBe(1);
    expect(result.warnings.length).toBe(1);
  });

  test("a comment INSIDE a declaration cannot smuggle one past the pattern", () => {
    // Comments blank to spaces (length-preserving), so `position/**/: fixed` still reads as the
    // declaration it is — stripping tightens this arm rather than opening it.
    expect(validateThemeCss(".x { position/**/: fixed; }").errors.length).toBe(1);
  });
});
