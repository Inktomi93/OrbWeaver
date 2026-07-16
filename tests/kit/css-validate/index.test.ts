// The themes-design.md §4 custom-CSS validator: WARN (not reject) on `@import`, REJECT any
// `position: fixed`/`position: sticky` (a shell-break, not just an exfil nudge). Pure pattern-match —
// no CSS parsing.

import { validateThemeCss } from "@orb/kit/css-validate";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

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
});
