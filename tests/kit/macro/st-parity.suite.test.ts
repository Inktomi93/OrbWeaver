// ST macro-engine PARITY PINS (D50: "macro parity is entirely kit/macro"; D46 ST-parity is the stated
// goal for the substitution language). Each case adapts a SillyTavern MacroEngine e2e scenario —
// translated from its `page.evaluate` chevrotain sandbox to plain vitest against OUR simpler
// string-scanner engine — and asserts the ST-OBSERVED output SEMANTICS. Source refs are ST paths under
// neo-tavern/references/sillytavern/tests/frontend/ (READ-ONLY reference), file:line in each comment.
//
// A `test.skip` here with a `SKIP-DIVERGENCE` comment is a FOUND DIVERGENCE: our engine's output differs
// from ST on a construct the parity goal claims — surfaced for the OWNER (match ST vs ratify ours), never
// silently patched (zero engine source changes this pass). See the report ledger's found-divergence rows.

import type { MacroRegistry, ProcessMacroOptions } from "@orb/kit/macro";
import { createDefaultRegistry, processMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures";

// ST's fixtures use name1Override "User" / name2Override "Character" — mirror them so the ST-observed
// outputs ("Hello User!", "Bot: Character") translate byte-for-byte.
function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "Character", user: "User", persona: "Hero", scenario: "A quest", env: {}, ...extra };
}

// ST registers a `reverse` test macro (a variadic string transform). We register the equivalent on a
// fresh default registry so the arg-shape scenarios (::-split, legacy colon/whitespace, nesting, braces
// in args) exercise a real handler exactly as ST's suite does. It joins args back with "::" so a
// multi-arg call reveals how the parser split the raw arg span (the whole point of ST's arg tests).
function registryWithReverse(): MacroRegistry {
  const registry = createDefaultRegistry();
  registry.register("reverse", (args) => args.join("::").split("").reverse().join(""));
  return registry;
}
const REVERSE_REG = registryWithReverse();

function render(input: string, extra: Partial<ProcessMacroOptions> = {}): string {
  return processMacros(input, opts(extra), REVERSE_REG);
}

// ── Basic evaluation (MacroEngine.e2e.js:8-24) ─────────────────────────────────────────────────────

test("[parity] no macros → input returned unchanged (MacroEngine:8)", () => {
  const input = "Hello world, no macros here.";
  expect(render(input)).toBe(input);
});

test("[parity] a simple no-arg macro resolves ({{newline}}) (MacroEngine:14)", () => {
  expect(render("Start {{newline}} end.")).toBe("Start \n end.");
});

test("[parity] multiple macros resolve left-to-right, mutations visible in order (MacroEngine:20)", () => {
  const input = "A {{setvar::test::4}}{{getvar::test}} B {{setvar::test::2}}{{getvar::test}} C";
  expect(render(input)).toBe("A 4 B 2 C");
});

// ── Unnamed arguments / legacy separators (MacroEngine.e2e.js:28-71) ───────────────────────────────

test("[parity] double-colon unnamed argument (MacroEngine:28)", () => {
  expect(render("Reversed: {{reverse::abc}}!")).toBe("Reversed: cba!");
});

test("[parity] legacy single-colon unnamed argument (MacroEngine:34)", () => {
  expect(render("Reversed: {{reverse:abc}}!")).toBe("Reversed: cba!");
});

test("[parity] single-colon takes the whole tail as ONE arg — inner :: stays literal (MacroEngine:40)", () => {
  // `{{reverse:abc::def}}` → single arg "abc::def" → reversed "fed::cba". Our parseArgs: a leading single
  // `:` splits on "," (not "::"), so "abc::def" is one arg — same result.
  expect(render("Reversed: {{reverse:abc::def}}!")).toBe("Reversed: fed::cba!");
});

test("[parity] single-colon takes the whole tail as ONE arg — inner : stays literal (MacroEngine:46)", () => {
  expect(render("Reversed: {{reverse:abc:def}}!")).toBe("Reversed: fed:cba!");
});

test("[parity] multi-line argument body is preserved verbatim (MacroEngine:64)", () => {
  const original = "first line\nsecond line";
  const expected = Array.from(original).reverse().join("");
  expect(render(`Result: {{reverse::${original}}}`)).toBe(`Result: ${expected}`);
});

// RATIFIED DIVERGENCE (owner 2026-07-24 — ratify ours): ST's legacy whitespace separator treats
// `{{reverse abc def}}` as ONE arg "abc def" → reversed "fed cba" (MacroEngine:58). OUR parser
// (parser.ts parseArgs → splitArgs on " ") splits it into TWO args ["abc","def"], which `reverse` rejoins
// with "::" → "fed::cba". WHY OURS WINS: the `{{macro k=v k=v}}` named-pair syntax DEPENDS on whitespace
// being a multi-arg separator — matching ST (whitespace = one arg) would break pair-splitting, and the
// named-pair use case is orbweaver-specific (ST has no key=value args at all). Regression pin: our
// whitespace-as-separator semantics; a future flip to one-arg would break named pairs and this goes red.
test("[parity/ratified] whitespace splits into multiple args (our pair-splitter, NOT ST's one-arg) (MacroEngine:58)", () => {
  expect(render("Values: {{reverse abc def}}!")).toBe("Values: fed::cba!");
});

// ── Nested macros (MacroEngine.e2e.js:75-86) ───────────────────────────────────────────────────────

test("[parity] nested macros in an argument resolve inside-out before the outer call (MacroEngine:75)", () => {
  // Our engine resolves an arg containing `{{` via ctx.evaluateString before handing it to the handler.
  // reverse("100") == "001". (ST's exact fixture folds addvar's return; we pin the inside-out ORDER with
  // a return-bearing inner macro so the assertion is unambiguous across the addvar-return divergence.)
  expect(render("R: {{reverse::{{incvar::t}}{{incvar::t}}{{incvar::t}}}}")).toBe("R: 321");
});

// RATIFIED DIVERGENCE (owner 2026-07-24 — ratify ours): ST's `{{addvar}}` RETURNS the new value inline;
// ours renders "" (the write happens, nothing prints). WHY OURS WINS: set-style ops
// (setvar/addvar/deletevar) render NOTHING — reads are explicit ({{getvar}}); only inc/dec return their
// result (they're the counter idiom). Regression pin: addvar renders "" AND the var IS set (readable via
// getvar) — a future flip to ST's return-the-value would break the "set-ops are silent" contract here.
test('[parity/ratified] {{addvar}} renders "" but the var IS set (set-ops are silent; reads explicit)', () => {
  expect(render("[{{setvar::k::a}}{{addvar::k::b}}]{{getvar::k}}")).toBe("[]ab");
});

// ── Unknown macros: passthrough (MacroEngine.e2e.js:90-100) ────────────────────────────────────────

// RATIFIED DIVERGENCE (owner 2026-07-24 — ratify ours): ST re-emits an unknown macro's WRAPPER but
// RESOLVES the nested macros inside its args first — `{{unknown::{{newline}}}}` → `{{unknown::\n}}`
// (MacroEngine:90). OUR engine (evaluator.ts evalMacroNode → reconstruct) re-emits the unknown macro's
// original source span BYTE-IDENTICAL, nested macros untouched → `{{unknown::{{newline}}}}`. WHY OURS
// WINS: the R1 invariant (D50 / Chat-Macro-Resolution) — unrecognized macros re-emit their EXACT raw
// source span so stored-history rows stay byte-stable across re-renders; resolving inner args would churn
// those bytes and miss the R1 prefix cache from that row forward. Byte-stability of unrecognized spans is
// load-bearing. Regression pin: our verbatim re-emit; a future flip to resolve-inner-args goes red here.
test("[parity/ratified] unknown macro re-emits its span BYTE-VERBATIM, inner macros untouched (R1) (MacroEngine:90)", () => {
  expect(render("Test: {{unknown::{{newline}}}}")).toBe("Test: {{unknown::{{newline}}}}");
});

test("[parity] unknown macro with plain surrounding text passes through unchanged (adapted MacroEngine:96)", () => {
  // The no-nested-macro half of ST:96 — orbweaver re-emits the raw span verbatim, which for an
  // args-only-plain-text unknown IS byte-identical to ST's output.
  expect(render("Test: {{unknown::my plain example}}")).toBe("Test: {{unknown::my plain example}}");
});

// ── Comment macro {{// … }} (MacroEngine.e2e.js:104-126) ───────────────────────────────────────────

test("[parity] single-line comment is removed whole (MacroEngine:104)", () => {
  expect(render("Hello{{// comment}}World")).toBe("HelloWorld");
});

test("[parity] comment accepts non-word chars immediately after // (MacroEngine:110)", () => {
  expect(render("A{{//!@#$%^&*()_+}}B")).toBe("AB");
});

test("[parity] extra // sequences inside a comment body don't close it early (MacroEngine:116)", () => {
  expect(render("X{{//comment with // extra // slashes}}Y")).toBe("XY");
});

test("[parity] multi-line comment body is removed whole (MacroEngine:122)", () => {
  expect(render("Start{{// line one\nline two\nline three}}End")).toBe("StartEnd");
});

// ── Trim scoped block {{#trim}}…{{/trim}} (MacroEngine.e2e.js:130-172) ──────────────────────────────
// ST writes `{{trim}}…{{/trim}}` (its scoped-macro syntax); orbweaver's block-open marker is `{{#trim}}`
// (parser.ts: `#` opens a block). Same SEMANTICS — the scenario is "trim the evaluated body".

test("[parity] scoped trim strips leading + trailing whitespace of its body (MacroEngine:130)", () => {
  expect(render("{{#trim}}  hello world  {{/trim}}")).toBe("hello world");
});

test("[parity] scoped trim strips leading newlines (MacroEngine:136)", () => {
  expect(render("{{#trim}}\n\n  content{{/trim}}")).toBe("content");
});

test("[parity] scoped trim strips trailing newlines (MacroEngine:142)", () => {
  expect(render("{{#trim}}content  \n\n{{/trim}}")).toBe("content");
});

test("[parity] scoped trim resolves macros inside its body before trimming (MacroEngine:148)", () => {
  expect(render("{{#trim}}  Hello {{user}}  {{/trim}}")).toBe("Hello User");
});

test("[parity] nested scoped trims collapse inner + outer whitespace (adapted MacroEngine:154)", () => {
  // ST: `{{trim}}  outer {{trim}}  inner  {{/trim}} outer  {{/trim}}` → "outer inner outer". Orbweaver's
  // inner {{#trim}} trims only ITS body ("inner"), the outer trims the whole; interior single spaces
  // between "outer", the trimmed "inner", and "outer" are preserved (ST agrees).
  expect(render("{{#trim}}  outer {{#trim}}  inner  {{/trim}} outer  {{/trim}}")).toBe("outer inner outer");
});

// ── Legacy identity markers <USER>/<BOT>/<CHAR> (MacroEngine.e2e.js:194-216) ────────────────────────
// These require ST's substituteParams pre-processing pass that rewrites `<USER>` → `{{user}}` etc.
// Orbweaver has NO angle-bracket marker layer (D46 rejected the legacy STscript pre-processor). See the
// report's REJECTED bucket — the CAPABILITY (legacy card import compat) is import-time, not render-time.

// ── Bracket handling around macros (MacroEngine.e2e.js:220-426) — the richest parity vein ──────────

test("[parity] a single stray { inside a macro arg is preserved through the arg (MacroEngine:220)", () => {
  expect(render("Test {{reverse::my { test}}")).toBe("Test tset { ym");
});

test("[parity] a single stray } inside a macro arg is preserved through the arg (MacroEngine:233)", () => {
  expect(render("Test {{reverse::my } test}}")).toBe("Test tset } ym");
});

test("[parity] an unterminated macro at end-of-input is left as plain text (MacroEngine:244)", () => {
  expect(render("Test {{ hehe")).toBe("Test {{ hehe");
});

test("[parity] a {{ followed by a non-identifier char is left as plain text (MacroEngine:254)", () => {
  expect(render("Test {{§§ hehe")).toBe("Test {{§§ hehe");
});

test("[parity] a dangling {{ is kept as text and a later valid macro still resolves (MacroEngine:274)", () => {
  expect(render("Test {{ hehe {{user}}")).toBe("Test {{ hehe User");
});

test("[parity] an invalid {{&& start is kept as text and a following macro resolves (MacroEngine:285)", () => {
  expect(render("Test {{&& hehe {{user}}")).toBe("Test {{&& hehe User");
});

// RATIFIED DIVERGENCE (owner 2026-07-24 — ratify ours): ST's chevrotain lexer, given `{{{char}}`, matches
// the RIGHTMOST valid `{{char}}` and leaves one literal `{` → "{Character" (MacroEngine:296). OUR scanner
// (parser.ts) does a LEFT-anchored `indexOf("{{")`: it finds `{{` at index 0, `{char` fails MACRO_IDENT,
// re-emits `{{` as text, and the remaining `{char}}` never re-forms a `{{` → whole thing is literal
// "{{{char}}". WHY OURS WINS: the leftmost-greedy scanner is simpler than a rightmost/innermost-opener
// scan, and the sanctioned `\{{` escape is the intended way to author a literal opener adjacent to a
// macro. Regression pin: our left-greedy verbatim; a future switch to rightmost-brace pickup goes red.
test("[parity/ratified] a single { before a macro is left-greedy verbatim (NOT ST's rightmost pickup) (MacroEngine:296)", () => {
  expect(render("{{{char}}")).toBe("{{{char}}");
});

// RATIFIED DIVERGENCE (owner 2026-07-24 — ratify ours; same left-greedy cause): `{{{char}}}` → ST
// "{Character}", ours verbatim "{{{char}}}". Regression pin for the same leftmost-greedy scanner ruling.
test("[parity/ratified] single braces wrapping a macro are left-greedy verbatim (MacroEngine:317)", () => {
  expect(render("{{{char}}}")).toBe("{{{char}}}");
});

test("[parity] a single } immediately after a macro is literal (MacroEngine:307)", () => {
  expect(render("{{char}}}")).toBe("Character}");
});

test("[parity] double {{ before a macro leaves two literal { (MacroEngine:327)", () => {
  expect(render("{{{{char}}")).toBe("{{Character");
});

test("[parity] double }} after a macro leaves two literal } (MacroEngine:337)", () => {
  expect(render("{{char}}}}")).toBe("Character}}");
});

test("[parity] double braces wrapping a macro leave literal {{ and }} (MacroEngine:347)", () => {
  expect(render("{{{{char}}}}")).toBe("{{Character}}");
});

test("[parity] a nested macro inside an arg with surrounding stray braces resolves (MacroEngine:357)", () => {
  expect(render("Result: {{reverse::pre-{ {{user}} }-post}}")).toBe("Result: tsop-} resU {-erp");
});

test("[parity] adjacent macros with no separator both resolve (MacroEngine:368)", () => {
  expect(render("{{char}}{{user}}")).toBe("CharacterUser");
});

test("[parity] macros separated only by literal braces both resolve (MacroEngine:378)", () => {
  expect(render("{{char}}{ {{user}} }")).toBe("Character{ User }");
});

test("[parity] Windows CRLF and stray single braces near a macro are preserved (MacroEngine:388)", () => {
  expect(render("Line1 {{char}}\r\n{Line2}")).toBe("Line1 Character\r\n{Line2}");
});

test("[parity] stray }} outside any macro is plain text (MacroEngine:398)", () => {
  expect(render("Foo }} bar")).toBe("Foo }} bar");
});

test("[parity] stray }} then a macro: braces kept, macro resolves (MacroEngine:408)", () => {
  expect(render("Foo }} {{user}}")).toBe("Foo }} User");
});

test("[parity] a macro then stray }}: macro resolves, braces kept (MacroEngine:418)", () => {
  expect(render("Foo {{user}} }}")).toBe("Foo User }}");
});
