// trimContent — the M1 scoped-block body normalizer (§12A.1). Unit pins for the dedent arithmetic the
// grammar corpus exercises only end-to-end: common-indent voting (blank lines abstain), line-0's
// tag-column exemption, char-counted mixed tab/space dedent, and the trimIndent escape.

import { swapIdentityMacros, trimContent } from "@orb/kit/macro";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

test("trimContent trims both ends of a single-line body", () => {
  expect(trimContent("  hello  ")).toBe("hello");
});

test("trimContent dedents by the COMMON indent, preserving relative indentation", () => {
  expect(trimContent("\n    a\n      b\n    c\n")).toBe("a\n  b\nc");
});

test("trimContent: blank lines don't vote on the common indent and dedent at most their own width", () => {
  expect(trimContent("\n    a\n\n    b\n")).toBe("a\n\nb");
});

test("trimContent: line 0 sits on the open tag's line — it never votes, later lines dedent fully", () => {
  // Content beginning right after the tag ("first") has the tag's column, not authored indent.
  expect(trimContent("first\n    second\n    third")).toBe("first\nsecond\nthird");
});

test("trimContent counts indentation CHARACTERS (tab or space) — never eats a non-whitespace char", () => {
  // Line indents: "\t\ta"=2 chars, "  \tb"=3 chars → common 2; b keeps one leading char.
  expect(trimContent("\n\t\ta\n  \tb")).toBe("a\n\tb");
});

test("trimContent with trimIndent:false only trims the ends", () => {
  expect(trimContent("\n    a\n      b\n", { trimIndent: false })).toBe("a\n      b");
});

test("trimContent on an all-whitespace body returns empty", () => {
  expect(trimContent("  \n\t \n ")).toBe("");
});

// swapIdentityMacros — the ONE identity-swap helper the persona role-inversion and the embed name-projection
// both fold onto. It must satisfy BOTH escape hazards at once: the single combined pass never double-swaps
// an inversion, and function-replacement splices names containing $-patterns verbatim.
describe("swapIdentityMacros", () => {
  test("HAZARD double-swap: an inversion mapping never collides even with BOTH macros present", () => {
    const invert = { char: "{{user}}", user: "{{char}}" } as const;
    // The old naive one-pass ({{char}}->{{user}} then {{user}}->{{char}}) would double-hit and corrupt this.
    expect(swapIdentityMacros("{{char}} greets {{user}}", invert)).toBe("{{user}} greets {{char}}");
    // Applying the inversion twice round-trips — proof no macro landed twice.
    const original = "{{char}} and {{user}} and {{char}}";
    expect(swapIdentityMacros(swapIdentityMacros(original, invert), invert)).toBe(original);
  });

  test("HAZARD $-splice: a replacement containing $& / $$ splices VERBATIM (not interpreted)", () => {
    // A persona/user name could contain these — the string-replacement form would mangle them.
    expect(swapIdentityMacros("{{char}}", { char: "$& and $$", user: "u" })).toBe("$& and $$");
  });

  test("case-insensitive on the macro tokens, no whitespace-in-braces tolerance", () => {
    expect(swapIdentityMacros("{{Char}} / {{USER}}", { char: "C", user: "U" })).toBe("C / U");
    // Inner whitespace is NOT a macro (matches both original call sites) — left verbatim.
    expect(swapIdentityMacros("{{ char }}", { char: "C", user: "U" })).toBe("{{ char }}");
  });

  test("leaves text without identity macros untouched", () => {
    expect(swapIdentityMacros("no macros {{time}} here", { char: "C", user: "U" })).toBe("no macros {{time}} here");
  });
});
