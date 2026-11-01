// The streaming ghost holds a torn `{{macro}}` by the parser's own verdict, and releases what the parser reads as literal.
// @subject packages/kit/src/macro/parser.ts

import { holdTornMacro, MAX_HELD_MACRO_LENGTH } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node";

// Every cut of one streamed reply, the way token chunks land: a prefix of the final text.
const FULL = "Hi {{char}}, welcome back.";

test("a macro split at any point inside its braces or name is held back, and releases once it closes", () => {
  const open = FULL.indexOf("{{");
  const close = FULL.indexOf("}}") + 2;
  for (let cut = open + 1; cut < close; cut += 1) {
    expect(holdTornMacro(FULL.slice(0, cut)), `cut at ${cut}: ${JSON.stringify(FULL.slice(0, cut))}`).toBe("Hi ");
  }
  expect(holdTornMacro(FULL.slice(0, close))).toBe("Hi {{char}}");
  expect(holdTornMacro(FULL)).toBe(FULL);
});

test("a flagged, argument-bearing or nested macro stays held until its outer braces close", () => {
  expect(holdTornMacro("a {{#roll::1d6")).toBe("a ");
  expect(holdTornMacro("a {{setvar::x::{{char}}")).toBe("a ");
  expect(holdTornMacro("a {{setvar::x::{{char}}}}")).toBe("a {{setvar::x::{{char}}}}");
  expect(holdTornMacro("a {{// note")).toBe("a ");
});

test("only the trailing torn macro is held; earlier closed macros and literal text survive", () => {
  expect(holdTornMacro("{{user}} and {{ch")).toBe("{{user}} and ");
});

test("an opener the parser reads as literal text is never held", () => {
  expect(holdTornMacro("a {{ b")).toBe("a {{ b");
  expect(holdTornMacro("code: \\{{char")).toBe("code: \\{{char");
  expect(holdTornMacro("one { brace")).toBe("one { brace");
});

test("a macro that never closes releases once it outgrows the hold bound", () => {
  const run = `{{note ${"x".repeat(MAX_HELD_MACRO_LENGTH)}`;
  expect(holdTornMacro(run)).toBe(run);
  expect(holdTornMacro(`before ${run.slice(0, MAX_HELD_MACRO_LENGTH)}`)).toBe("before ");
});
