import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { GlobalVarWrite, MacroDiagnostic, ProcessMacroOptions } from "@orb/kit/macro";
import {
  createDefaultRegistry,
  createMacroContext,
  createNamesOnlyRegistry,
  evaluateMacros,
  globalMacroRegistry,
  parseMacros,
  processMacros,
  SimpleMacroRegistry,
  stripComments,
} from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures.ts";

// A fixed epoch so every clock assertion is deterministic — 2021-01-02T03:04:05Z (literal ms so no
// `Date`/`Date.now` enters the test, per the determinism gate).
const FIXED_NOW_MS = 1_609_556_645_000;
const UTC = "UTC";

function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "Alice", user: "Bob", persona: "Hero", scenario: "A quest", env: {}, ...extra };
}

// ── parsing ──────────────────────────────────────────────────────────────────────────────────

test("parseMacros splits literal text from a macro call and keeps args", () => {
  const ast = parseMacros("hi {{char}}!");
  expect(ast).toEqual([
    { type: "text", value: "hi " },
    { type: "macro", name: "char", args: [], raw: "{{char}}", span: { offset: 3, line: 1, col: 4, length: 8 } },
    { type: "text", value: "!" },
  ]);
});

test("parseMacros parses double-colon args", () => {
  const ast = parseMacros("{{setvar::a::b}}");
  expect(ast[0]).toMatchObject({ type: "macro", name: "setvar", args: ["a", "b"] });
});

test("parseMacros nests a macro inside an argument without tearing it", () => {
  const ast = parseMacros("{{setvar::g::Hi {{user}}}}");
  expect(ast[0]).toMatchObject({ type: "macro", name: "setvar", args: ["g", "Hi {{user}}"] });
});

test("parseMacros builds a block node with children (universal form — any name pairs with {{/name}})", () => {
  const ast = parseMacros("{{if::x}}body{{/if}}");
  expect(ast).toEqual([
    {
      type: "block",
      name: "if",
      args: ["x"],
      raw: "{{if::x}}",
      children: [{ type: "text", value: "body" }],
      span: { offset: 0, line: 1, col: 1, length: 9 },
      closeRaw: "{{/if}}",
    },
  ]);
});

test("parseMacros parses the flag-form block open — `#` is the PRESERVE_WHITESPACE flag, not a block marker", () => {
  const ast = parseMacros("{{#if x}}body{{/if}}");
  expect(ast).toEqual([
    {
      type: "block",
      name: "if",
      args: ["x"],
      raw: "{{#if x}}",
      children: [{ type: "text", value: "body" }],
      span: { offset: 0, line: 1, col: 1, length: 9 },
      flags: { preserveWhitespace: true },
      closeRaw: "{{/if}}",
    },
  ]);
});

test("parseMacros strips a comment macro entirely, depth-aware", () => {
  expect(parseMacros("a{{// note {{nested}} }}b")).toEqual([
    { type: "text", value: "a" },
    { type: "text", value: "b" },
  ]);
});

// ── comments never reach the prompt (#302, requirement 1) ──────────────────────────────────────

test("processMacros never emits a comment's text — the owner's multi-line, nested example", () => {
  // The owner's confirmed syntax: `{{// Enable only one out of the list … }}`, here spanning multiple
  // lines AND wrapping a real `{{…}}` inside the comment body (depth-aware close scan) so it can't leak.
  const rendered = processMacros("before {{// Enable only one\n{{char}} out of the list }}after", opts());
  expect(rendered).toBe("before after");
});

// ── stripComments: the pure comment-strip the preset token estimate counts over (#302, requirement 2) ──

test("stripComments removes a mid-text comment, leaving the rest verbatim", () => {
  expect(stripComments("Hello{{// note}}World")).toBe("HelloWorld");
});

test("stripComments removes a whole-line comment token (surrounding newlines survive)", () => {
  expect(stripComments("line1\n{{// a standalone comment}}\nline3")).toBe("line1\n\nline3");
});

test("stripComments leaves an adjacent real macro's bytes untouched", () => {
  expect(stripComments("{{char}}{{// hidden}} says hi")).toBe("{{char}} says hi");
});

test("stripComments is depth-aware — a nested {{…}} inside the comment doesn't end it early", () => {
  expect(stripComments("a{{// note {{char}} more }}b")).toBe("ab");
});

test("stripComments removes a multi-line comment whole", () => {
  expect(stripComments("X{{// multi\nline\ncomment}}Y")).toBe("XY");
});

test("stripComments does NOT strip a backslash-escaped opener (it is literal, never a comment)", () => {
  // Matches the engine: `\{{` drops the backslash and the `{{…}}` is literal text, so the token count
  // it feeds must KEEP these bytes (an escaped comment is visible content the author chose to show).
  expect(stripComments("\\{{// not a comment}}")).toBe("{{// not a comment}}");
});

test("stripComments preserves an unclosed comment verbatim (engine degrade-don't-throw)", () => {
  expect(stripComments("keep {{// unclosed to EOF")).toBe("keep {{// unclosed to EOF");
});

test("stripComments is identity when there is no comment", () => {
  expect(stripComments("plain {{char}} and {{user}} text")).toBe("plain {{char}} and {{user}} text");
});

test("a backslash-escaped opener renders as literal braces (not expanded)", () => {
  // The escape consumes the backslash and emits a literal `{{`; the remainder is plain text, so
  // the rendered output is the un-expanded `{{char}}`.
  expect(processMacros("\\{{char}}", opts())).toBe("{{char}}");
});

test("parseMacros re-emits an unclosed macro verbatim", () => {
  expect(parseMacros("x {{char")).toEqual([
    { type: "text", value: "x " },
    { type: "text", value: "{{char" },
  ]);
});

test("parseMacros treats a close-less tag as the inline call it always was (universal grammar — no block-open marker)", () => {
  // `{{if x}}` with no `{{/if}}` is indistinguishable from an intentional inline call — the candidate
  // reverts to a macro node (flags carried), never a rescued literal.
  const ast = parseMacros("{{#if x}}tail");
  expect(ast).toEqual([
    { type: "macro", name: "if", args: ["x"], raw: "{{#if x}}", span: { offset: 0, line: 1, col: 1, length: 9 }, flags: { preserveWhitespace: true } },
    { type: "text", value: "tail" },
  ]);
});

test("parseMacros emits an unmatched close tag as text", () => {
  expect(parseMacros("{{/if}}")).toEqual([{ type: "text", value: "{{/if}}" }]);
});

// ── evaluation against a context ───────────────────────────────────────────────────────────────

test("processMacros substitutes core character/user macros", () => {
  expect(processMacros("{{char}} & {{user}}", opts())).toBe("Alice & Bob");
});

// {{scenario}} is card-author PROSE — a scenario field that itself embeds {{user}}/{{char}} must RE-PROCESS
// those nested identity macros (the charField family + the {{charscenario}} alias), never ship literal braces
// to the model (the live gap: `{{user}} keeps running into {{char}}…` came through raw). Both the SCENARIO
// name and its charScenario alias resolve the nested names.
test("processMacros re-processes nested identity macros inside {{scenario}} (not literal braces)", () => {
  const scenario = "{{user}} keeps running into {{char}} at the 24-hour konbini.";
  expect(processMacros("{{scenario}}", opts({ scenario }))).toBe("Bob keeps running into Alice at the 24-hour konbini.");
  expect(processMacros("{{charscenario}}", opts({ scenario }))).toBe("Bob keeps running into Alice at the 24-hour konbini.");
});

// {{persona}} is the persona DESCRIPTION, which is prose its author writes about {{user}} (the seeded default
// reads "…you're simply {{user}}…"). The persona marker's template is `{{persona}}`, so a raw substitution put
// literal `{{user}}` braces in every system prompt that carried a persona. Both registries that know the name
// must re-process it: the live one and the stored-history names-only one.
test("processMacros re-processes nested identity macros inside {{persona}}", () => {
  const persona = "Until you edit this, you're simply {{user}}, here to meet {{char}}.";
  expect(processMacros("{{persona}}", opts({ persona }))).toBe("Until you edit this, you're simply Bob, here to meet Alice.");
  expect(processMacros("{{persona}}", opts({ persona }), createNamesOnlyRegistry())).toBe("Until you edit this, you're simply Bob, here to meet Alice.");
});

test("processMacros resolves a nested macro in an argument then reads it back", () => {
  expect(processMacros("{{setvar::g::Hi {{user}}}}{{getvar::g}}", opts())).toBe("Hi Bob");
});

test("evaluateMacros runs against an explicitly built context", () => {
  const ctx = createMacroContext(opts({ env: { mood: "calm" } }));
  expect(evaluateMacros(parseMacros("{{getvar::mood}}"), globalMacroRegistry, ctx)).toBe("calm");
});

test("ctx.resolve (the M2 lazy-contract handle) resolves through the SAME context and env", () => {
  const ctx = createMacroContext(opts({ env: { mood: "calm" } }));
  expect(ctx.resolve("{{getvar::mood}} {{user}}")).toBe("calm Bob");
  // The trim option applies the resolveContent body treatment (trim + indent-dedent).
  expect(ctx.resolve("\n    a\n      b\n", { trim: true })).toBe("a\n  b");
});

test("unknown macro passes through with its original source span", () => {
  expect(processMacros("{{mystery:one,two}}", opts())).toBe("{{mystery:one,two}}");
});

test("an argument-less unknown macro resolves from env case-insensitively", () => {
  expect(processMacros("{{POV}}", opts({ env: { pov: "first" } }))).toBe("first");
});

test("an unknown macro WITH args bypasses the env lookup (name-only)", () => {
  expect(processMacros("{{pov:x}}", opts({ env: { pov: "first" } }))).toBe("{{pov:x}}");
});

test("unknown block preserves its wrapper and recurses into children", () => {
  const out = processMacros("{{box}}{{user}}{{/box}}", opts());
  // Assembled from parts so the expected value isn't one contiguous high-entropy literal (noSecrets).
  expect(out).toBe(`{{box}}${opts().user}{{/box}}`);
});

test("a flagged unknown block re-emits BOTH tags byte-verbatim (flags carried through raw)", () => {
  const out = processMacros("{{#box}}{{user}}{{/box}}", opts());
  expect(out).toBe(`{{#box}}${opts().user}{{/box}}`);
});

// ── default registry: variables ────────────────────────────────────────────────────────────────

test("setvar/addvar render empty and mutate env; getvar reads", () => {
  expect(processMacros("{{setvar::n::a}}{{addvar::n::b}}{{getvar::n}}", opts())).toBe("ab");
});

test("incvar and decvar do parse-or-zero arithmetic and return the result", () => {
  expect(processMacros("{{incvar::c}}{{incvar::c}}{{decvar::c}}", opts())).toBe("121");
});

test("hasvar reports membership (empty value still counts) and deletevar removes the key", () => {
  expect(processMacros("{{setvar::f::}}{{hasvar::f}}", opts())).toBe("true");
  expect(processMacros("{{setvar::f::x}}{{deletevar::f}}{{hasvar::f}}", opts())).toBe("");
});

// ── default registry: conditionals ───────────────────────────────────────────────────────────

test("if truthy-check selects the then branch, else otherwise", () => {
  expect(processMacros("{{if flag}}Y{{else}}N{{/if}}", opts({ env: { flag: "1" } }))).toBe("Y");
  expect(processMacros("{{if flag}}Y{{else}}N{{/if}}", opts({ env: { flag: "" } }))).toBe("N");
});

test("if treats false/off/0 as falsy", () => {
  expect(processMacros("{{if flag}}Y{{/if}}", opts({ env: { flag: "off" } }))).toBe("");
});

test("if comparator compares a bare identifier against a quoted literal", () => {
  expect(processMacros('{{if char == "Alice"}}match{{/if}}', opts())).toBe("match");
  expect(processMacros('{{if char != "Alice"}}no{{/if}}', opts())).toBe("");
});

// ── default registry: cast / group ─────────────────────────────────────────────────────────────

test("group joins the character names; a solo chat collapses group to char (byte-identical)", () => {
  expect(processMacros("{{group}}", opts({ characterNames: ["Alice", "Bram"] }))).toBe("Alice, Bram");
  expect(processMacros("{{group}}", opts())).toBe("Alice");
});

test("notChar drops the current speaker from the cast", () => {
  expect(processMacros("{{notchar}}", opts({ characterNames: ["Alice", "Bram"] }))).toBe("Bram");
});

// ── default registry: clock (deterministic via nowMs + timezone) ───────────────────────────────

test("date/time/isodate honor a pinned nowMs in a fixed zone", () => {
  const fixed = opts({ nowMs: FIXED_NOW_MS, timezone: UTC });
  expect(processMacros("{{date}}", fixed)).toBe("2021-01-02");
  expect(processMacros("{{time}}", fixed)).toBe("03:04:05");
  expect(processMacros("{{isodate}}", fixed)).toBe("2021-01-02");
});

test("datetimeformat applies a Luxon format string against the pinned clock", () => {
  const fixed = opts({ nowMs: FIXED_NOW_MS, timezone: UTC });
  expect(processMacros("{{datetimeformat::yyyy/MM/dd HH:mm}}", fixed)).toBe("2021/01/02 03:04");
});

test("an invalid timezone falls back to the server-local clock and warns", () => {
  const warnings: string[] = [];
  // Invalid zone ⇒ same rendering as supplying no zone at all (both use the server-local default),
  // which keeps the assertion deterministic regardless of the test runner's TZ.
  const withBadZone = processMacros("{{isodate}}", opts({ nowMs: FIXED_NOW_MS, timezone: "Not/AZone", onWarn: (m) => warnings.push(m) }));
  const serverLocal = processMacros("{{isodate}}", opts({ nowMs: FIXED_NOW_MS }));
  expect(withBadZone).toBe(serverLocal);
  expect(warnings.some((w) => w.includes("invalid timezone"))).toBe(true);
});

// ── default registry: bounded randomness (range collapses → deterministic) ─────────────────────

test("random with equal bounds and single-option pick/roll are deterministic", () => {
  expect(processMacros("{{random::5::5}}", opts())).toBe("5");
  expect(processMacros("{{pick::only}}", opts())).toBe("only");
  expect(processMacros("{{roll::1}}", opts())).toBe("1");
  expect(processMacros("{{roll::2d1}}", opts())).toBe("2"); // two 1-sided dice → 1+1
});

// ── default registry: injectable PRNG seam (ctx.random) ────────────────────────────────────────
// The randomized macros route every draw through `ctx.random ?? Math.random`. Injecting a
// fixed/sequenced generator pins the inclusive-bound + index arithmetic exactly, which Math.random
// could only sample probabilistically. A draw of 0 yields the low end; a draw just under 1 yields
// the high end (floor never reaches the exclusive ceiling). NOTE: no ambient Math.random/Date here,
// so the determinism gate stays satisfied.
const ALMOST_ONE = 0.999;

// Returns each supplied draw in turn, then repeats the final one — lets a test pin which branch of
// the index/range arithmetic a sequence of draws lands on.
function seqRandom(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i] ?? values.at(-1) ?? 0;
    if (i < values.length - 1) {
      i += 1;
    }
    return v;
  };
}

test("random::1::6 hits BOTH inclusive bounds via the +1 range arithmetic", () => {
  // floor(draw * (hi-lo+1)) + lo → draw 0 ⇒ 1 (low), draw ~1 ⇒ 6 (high, proving the +1 inclusivity).
  expect(processMacros("{{random::1::6}}", opts({ random: () => 0 }))).toBe("1");
  expect(processMacros("{{random::1::6}}", opts({ random: () => ALMOST_ONE }))).toBe("6");
});

test("bare random spans 0..100 inclusive (RANDOM_DEFAULT_CEIL = 101)", () => {
  // floor(draw * 101): draw 0 ⇒ 0, draw ~1 ⇒ 100 — a ceil of 100 would never reach 100.
  expect(processMacros("{{random}}", opts({ random: () => 0 }))).toBe("0");
  expect(processMacros("{{random}}", opts({ random: () => ALMOST_ONE }))).toBe("100");
});

test("roll dice multiply by `sides` and sum across `count`", () => {
  // Each die = floor(draw * sides) + 1. Max draw ⇒ `sides`; the sum scales with `count`.
  expect(processMacros("{{roll::1d6}}", opts({ random: () => ALMOST_ONE }))).toBe("6");
  expect(processMacros("{{roll::1d20}}", opts({ random: () => ALMOST_ONE }))).toBe("20");
  expect(processMacros("{{roll::3d6}}", opts({ random: () => ALMOST_ONE }))).toBe("18"); // 6+6+6
  // Sequenced draws prove independent per-die rolls (1, 6, 1) sum correctly.
  expect(processMacros("{{roll::3d6}}", opts({ random: seqRandom([0, ALMOST_ONE, 0]) }))).toBe("8");
});

test("roll::N selects 1..N from the draw (floor(draw * N) + 1)", () => {
  expect(processMacros("{{roll::10}}", opts({ random: () => 0 }))).toBe("1");
  expect(processMacros("{{roll::10}}", opts({ random: () => ALMOST_ONE }))).toBe("10");
});

test("pick selects by floor(draw * length) index", () => {
  const o = (draw: number): ProcessMacroOptions => opts({ random: () => draw });
  expect(processMacros("{{pick::a::b::c}}", o(0))).toBe("a"); // index 0
  expect(processMacros("{{pick::a::b::c}}", o(0.5))).toBe("b"); // floor(1.5) = 1
  expect(processMacros("{{pick::a::b::c}}", o(ALMOST_ONE))).toBe("c"); // floor(2.99) = 2
});

test("random option-pick mode (non-integer 2-arg / 3+ args) uses the injected index", () => {
  // Two non-integer args fall through to option-pick; the draw selects the option index.
  expect(processMacros("{{random::x::y}}", opts({ random: () => 0 }))).toBe("x");
  expect(processMacros("{{random::x::y}}", opts({ random: () => ALMOST_ONE }))).toBe("y");
  expect(processMacros("{{random::a::b::c}}", opts({ random: () => ALMOST_ONE }))).toBe("c");
});

// ── the injected PRNG is UNTRUSTED (#1359) ─────────────────────────────────────────────────────
// `ctx.random` is caller-supplied and, once plugins ship one, adversary-supplied. Every handler here
// assumed `[0, 1)` without checking: a generator returning exactly 1 made `{{random}}` yield 101 and
// `{{random::1::10}}` yield 11 — outside the range the macro's own documentation promises — while
// NaN/Infinity rendered as the literal text "NaN"/"Infinity" and the array-index paths degraded to ""
// through `?? ""`. The draw is now normalised ONCE at the seam, so the documented range holds for
// every handler rather than per-handler.
const HOSTILE_DRAWS: readonly number[] = [1, 1.5, -0.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

test.each(HOSTILE_DRAWS)("bare random stays inside 0..100 under an out-of-range draw (%s)", (draw) => {
  const out = Number(processMacros("{{random}}", opts({ random: () => draw })));
  expect(Number.isInteger(out)).toBe(true);
  expect(out).toBeGreaterThanOrEqual(0);
  expect(out).toBeLessThanOrEqual(100);
});

test.each(HOSTILE_DRAWS)("random::1::10 stays inside its declared bounds under draw %s", (draw) => {
  const out = Number(processMacros("{{random::1::10}}", opts({ random: () => draw })));
  expect(Number.isInteger(out)).toBe(true);
  expect(out).toBeGreaterThanOrEqual(1);
  expect(out).toBeLessThanOrEqual(10);
});

test.each(HOSTILE_DRAWS)("roll::2d6 stays inside 2..12 under draw %s", (draw) => {
  const out = Number(processMacros("{{roll::2d6}}", opts({ random: () => draw })));
  expect(Number.isInteger(out)).toBe(true);
  expect(out).toBeGreaterThanOrEqual(2);
  expect(out).toBeLessThanOrEqual(12);
});

test.each(HOSTILE_DRAWS)("pick and option-mode random still return a REAL option under draw %s", (draw) => {
  // The `?? ""` fallbacks made an out-of-range index render as nothing at all — a silently deleted
  // option, indistinguishable from an author writing an empty branch.
  expect(["a", "b", "c"]).toContain(processMacros("{{pick::a::b::c}}", opts({ random: () => draw })));
  expect(["x", "y"]).toContain(processMacros("{{random::x::y}}", opts({ random: () => draw })));
});

// ── default registry: formatting blocks + char-field recursion ─────────────────────────────────

test("trim and case-folding blocks transform their evaluated body", () => {
  expect(processMacros("{{trim}}  {{user}}  {{/trim}}", opts())).toBe("Bob");
  expect(processMacros("{{uppercase}}{{user}}{{/uppercase}}", opts())).toBe("BOB");
});

test("case-folding is locale-independent (Unicode default fold, deterministic)", () => {
  // Built from parts so no one contiguous high-entropy literal trips noSecrets (same as the
  // {{#box}} test). The handlers use locale-INDEPENDENT `.toUpperCase()`/`.toLowerCase()` so server
  // + client fold identically; ASCII round-trips deterministically regardless of host TZ/locale.
  const body = "Hello World";
  expect(processMacros(`{{uppercase}}${body}{{/uppercase}}`, opts())).toBe("HELLO WORLD");
  expect(processMacros(`{{lowercase}}${body}{{/lowercase}}`, opts())).toBe("hello world");
});

test("a char field recursively evaluates macros embedded in its value", () => {
  expect(processMacros("{{appearance}}", opts({ appearance: "I am {{char}}" }))).toBe("I am Alice");
});

// ── post-processing hook ───────────────────────────────────────────────────────────────────────

test("postProcess is applied to each resolved macro value", () => {
  expect(processMacros("[{{user}}]", opts({ postProcess: (v) => v.toUpperCase() }))).toBe("[BOB]");
});

// ── defense-in-depth: depth budget ─────────────────────────────────────────────────────────────

test("a self-referential field trips the depth budget and warns instead of looping forever", () => {
  const warnings: string[] = [];
  const out = processMacros("{{appearance}}", opts({ appearance: "{{appearance}}", onWarn: (m) => warnings.push(m) }));
  expect(out).toBe("");
  expect(warnings.some((w) => w.includes("depth limit"))).toBe(true);
});

// ── handler errors fail open ───────────────────────────────────────────────────────────────────

test("a throwing handler degrades to a literal and reports via onWarn", () => {
  const registry = createDefaultRegistry();
  registry.register("boom", () => {
    throw new Error("kaboom");
  });
  const warnings: string[] = [];
  const out = processMacros("{{boom}}", opts({ onWarn: (m) => warnings.push(m) }), registry);
  expect(out).toBe("{{boom}}");
  expect(warnings.some((w) => w.includes("boom"))).toBe(true);
});

// #1360 item 5: only the INLINE throw path was covered. For an inline macro "fail open" means the reader
// sees the literal macro and loses nothing; for a BLOCK the same code deleted the author's body and
// closing tag — opposite outcomes sharing one name, and the comment asserted the equivalence rather than
// defending it. A block now degrades to exactly what an UNRECOGNIZED block degrades to: both tags with
// the body between them.
test("a throwing BLOCK handler keeps the author's BODY and closing tag, not just the open tag", () => {
  const registry = createDefaultRegistry();
  registry.register(
    "boomblock",
    () => {
      throw new Error("kaboom");
    },
    { blockChildren: true },
  );
  const warnings: string[] = [];
  const out = processMacros("{{boomblock}}the body the author wrote{{/boomblock}}", opts({ onWarn: (m) => warnings.push(m) }), registry);
  expect(out).toBe("{{boomblock}}the body the author wrote{{/boomblock}}");
  expect(warnings.some((w) => w.includes("boomblock"))).toBe(true);
});

test("a throwing NON-block handler's resolved body survives too, and inner macros still resolve", () => {
  const registry = createDefaultRegistry();
  registry.register("boombody", () => {
    throw new Error("kaboom");
  });
  const out = processMacros("{{boombody}}hello {{user}}{{/boombody}}", opts(), registry);
  expect(out).toBe("{{boombody}}hello Bob{{/boombody}}");
});

// ── registry surface ───────────────────────────────────────────────────────────────────────────

test("SimpleMacroRegistry lowercases names and exposes options", () => {
  const registry = new SimpleMacroRegistry();
  registry.register("Echo", (args) => args[0] ?? "", { volatile: true, requires: "chat" });
  expect(registry.get("echo")?.(["hi"], createMacroContext(opts()))).toBe("hi");
  expect(registry.getOptions("ECHO")?.volatile).toBe(true);
  expect(registry.requirementsOf("echo")).toBe("chat");
  expect(registry.volatileNames()).toContain("echo");
});

test("the default registry tags clock/var macros volatile and char macros by requirement", () => {
  const registry = createDefaultRegistry();
  const volatile = registry.volatileNames();
  expect(volatile).toEqual(expect.arrayContaining(["setvar", "random", "time", "roll"]));
  expect(volatile).not.toContain("char");
  expect(registry.requirementsOf("char")).toBe("char");
  expect(registry.requirementsOf("model")).toBe("chat");
  expect(registry.requirementsOf("newline")).toBeUndefined();
});

test("globalMacroRegistry is a shared singleton extensions can register onto", () => {
  globalMacroRegistry.register("kitportgreet", () => "hey");
  expect(processMacros("{{kitportgreet}}", opts())).toBe("hey");
});

// ── default registry: banned / groupnotmuted / hasvar literal / addvar / comparators / else ────

test("banned renders empty (legacy upstreams strip its contents)", () => {
  expect(processMacros('{{banned "some text"}}', opts())).toBe("");
});

test("groupnotmuted excludes muted characters; group still includes them", () => {
  const withMuted = opts({ characterNames: ["Alice", "Bram", "Cleo"], unmutedCharacterNames: ["Alice", "Cleo"] });
  expect(processMacros("{{group}}", withMuted)).toBe("Alice, Bram, Cleo");
  expect(processMacros("{{groupnotmuted}}", withMuted)).toBe("Alice, Cleo");
});

test('hasvar returns the literal string "true", not a boolean', () => {
  expect(processMacros("{{setvar::f::x}}{{hasvar::f}}", opts())).toBe("true");
});

test("addvar concatenates with no separator", () => {
  expect(processMacros("{{setvar::n::a}}{{addvar::n::b}}{{getvar::n}}", opts())).toBe("ab");
});

test("if comparator accepts curly/typographic quotes on the RHS", () => {
  // Built from parts (double-then-single curly-quote pairs) so neither line reads as one
  // contiguous high-entropy literal (noSecrets).
  const dq = ["“", "”"]; // “ ”
  const sq = ["‘", "’"]; // ‘ ’
  expect(processMacros(`{{if char == ${dq[0]}Alice${dq[1]}}}match{{/if}}`, opts())).toBe("match");
  expect(processMacros(`{{if char == ${sq[0]}Alice${sq[1]}}}match{{/if}}`, opts())).toBe("match");
});

test("{{else}} splits case-insensitively (Else / ELSE both work)", () => {
  expect(processMacros("{{if flag}}Y{{Else}}N{{/if}}", opts({ env: { flag: "" } }))).toBe("N");
  expect(processMacros("{{if flag}}Y{{ELSE}}N{{/if}}", opts({ env: { flag: "" } }))).toBe("N");
});

// ── defense-in-depth: output budget + single-warn discipline ───────────────────────────────────

test("the depth budget warns exactly ONCE, not once per recursion level", () => {
  const warnings: string[] = [];
  processMacros("{{appearance}}", opts({ appearance: "{{appearance}}", onWarn: (m) => warnings.push(m) }));
  expect(warnings.filter((w) => w.includes("depth limit"))).toHaveLength(1);
});

test("output over the 1MB cap truncates to exactly the cap and warns once", () => {
  // The budget charges per-append (per text/macro node), not per byte — a chunk that would push
  // the cumulative total OVER the cap is dropped WHOLESALE, not sliced. `{{noop}}` (renders "")
  // forces a node boundary between two 500k chunks without adding output, so the total lands
  // EXACTLY on the 1,000,000-byte cap after the second chunk; the third chunk (pushing to 1.5MB)
  // is entirely rejected.
  const half = 500_000;
  const chunk = "x".repeat(half);
  const oversized = `${chunk}{{noop}}${chunk}{{noop}}${chunk}`; // 1.5MB across 3 chunks
  const warnings: string[] = [];
  const out = processMacros(oversized, opts({ onWarn: (m) => warnings.push(m) }));
  expect(out).toHaveLength(half * 2);
  expect(warnings.filter((w) => w.includes("output limit"))).toHaveLength(1);
});

test("the output cap measures UTF-8 bytes rather than UTF-16 code units", () => {
  const oversized = "😀".repeat(300_000); // 1.2 MB UTF-8, 600k UTF-16 code units
  const warnings: string[] = [];
  const out = processMacros(oversized, opts({ onWarn: (m) => warnings.push(m) }));
  expect(out).toBe("");
  expect(warnings.filter((w) => w.includes("output limit 1000000 bytes"))).toHaveLength(1);
});

test("an unpaired UTF-16 surrogate is refused without throwing", () => {
  const warnings: string[] = [];
  const out = processMacros("\uD800", opts({ onWarn: (m) => warnings.push(m) }));
  expect(out).toBe("");
  expect(warnings.filter((w) => w.includes("unpaired UTF-16 surrogate"))).toHaveLength(1);
});

test("an expansion producing an unpaired UTF-16 surrogate is truncated without throwing", () => {
  const warnings: string[] = [];
  const out = processMacros("before{{broken}}after", opts({ env: { broken: "\uD800" }, onWarn: (m) => warnings.push(m) }));
  expect(out).toBe("before");
  expect(warnings.filter((w) => w.includes("output contains an unpaired UTF-16 surrogate"))).toHaveLength(1);
});

// ── {{expr::<cel>}} macro (02 §3) — CEL surfaced inside templates over ctx.celBindings ─────────────

test("{{expr}} renders a boolean CEL result as true/false", () => {
  expect(processMacros('{{expr::vars.mood == "grim"}}', opts({ celBindings: { vars: { mood: "grim" } } }))).toBe("true");
  expect(processMacros('{{expr::vars.mood == "grim"}}', opts({ celBindings: { vars: { mood: "calm" } } }))).toBe("false");
});

test("{{expr}} renders a number result as its text", () => {
  expect(processMacros("{{expr::chat.messageCount}}", opts({ celBindings: { chat: { messageCount: 4 } } }))).toBe("4");
});

test("{{expr}} renders a string result verbatim", () => {
  expect(processMacros("{{expr::vars.mood}}", opts({ celBindings: { vars: { mood: "grim" } } }))).toBe("grim");
});

// A CEL map literal `{...}` is deliberately NOT template-testable — its braces collide with the macro's
// `}}` delimiter; the map→JSON coercion is proven by the cel golden "map result" + coerceExprResult.
test("{{expr}} renders a list result as JSON", () => {
  expect(processMacros('{{expr::["a", "b"]}}', opts())).toBe('["a","b"]');
});

test("{{expr}} with a parse error renders empty + an expr-error diagnostic at the call span", () => {
  const diagnostics: MacroDiagnostic[] = [];
  const out = processMacros("x {{expr::vars.}} y", opts({ diagnostics }));
  expect(out).toBe("x  y");
  expect(diagnostics[0]).toMatchObject({ severity: "error", code: "expr-error", span: { offset: 2 } });
});

test("{{expr}} with a runtime error (missing field, no celBindings) renders empty + diagnostic", () => {
  const diagnostics: MacroDiagnostic[] = [];
  const out = processMacros("{{expr::vars.mood}}", opts({ diagnostics }));
  expect(out).toBe("");
  expect(diagnostics[0]).toMatchObject({ code: "expr-error" });
});

test("{{expr}} resolves inner macros before evaluating (nesting order)", () => {
  const out = processMacros('{{expr::"{{getvar::name}}" == "grim"}}', opts({ env: { name: "grim" }, celBindings: {} }));
  expect(out).toBe("true");
});

// ── per-user global-variable macros (02 §4) — a SEPARATE plane from ctx.env ─────────────────────────

test("{{getglobalvar}} reads the staged global plane; missing key → empty", () => {
  expect(processMacros("{{getglobalvar::streak}}", opts({ globalVars: { streak: "7" } }))).toBe("7");
  expect(processMacros("{{getglobalvar::nope}}", opts({ globalVars: { streak: "7" } }))).toBe("");
  expect(processMacros("{{getglobalvar::x}}", opts())).toBe("");
});

test("{{setglobalvar}} collects ordered commit-time writes (last-write-wins) and renders nothing", () => {
  const globalVarWrites: GlobalVarWrite[] = [];
  const out = processMacros("{{setglobalvar::k::1}}{{setglobalvar::k::2}}", opts({ globalVarWrites }));
  expect(out).toBe("");
  expect(globalVarWrites).toEqual([
    { key: "k", value: "1" },
    { key: "k", value: "2" },
  ]);
});

test("a same-render {{setglobalvar}} is visible to a later {{getglobalvar}}", () => {
  const globalVars: Record<string, string> = { streak: "7" };
  const out = processMacros("{{setglobalvar::streak::9}}{{getglobalvar::streak}}", opts({ globalVars, globalVarWrites: [] }));
  expect(out).toBe("9");
});

test("the global plane is separate from runtime vars (env)", () => {
  const out = processMacros("{{setvar::streak::env-val}}{{getglobalvar::streak}}", opts({ globalVars: { streak: "global-val" } }));
  expect(out).toBe("global-val");
});

// ── rpg data-fed macros (docs/plans/rpg/design.md) — a game turn stages `rpgMacros`; a non-game chat resolves empty ──

test("rpg macros render EMPTY when nothing is staged (a non-game / non-rpg chat) — byte-identical", () => {
  expect(processMacros("[{{rpgWorld}}][{{rpgSceneState}}][{{rpgMorale}}]", opts({ chatId: castId<ChatId>("chat_x") }))).toBe("[][][]");
});

test("rpg macros render their staged value by name (chat stays rpg-blind — the generic map)", () => {
  const rpgMacros = { rpgWorld: "The Shattered Realm", rpgMorale: "Morale: high (72/100)", rpgSceneState: "Day 3, 14:30" };
  expect(processMacros("{{rpgWorld}} | {{rpgMorale}} | {{rpgSceneState}}", opts({ chatId: castId<ChatId>("chat_x"), rpgMacros }))).toBe(
    "The Shattered Realm | Morale: high (72/100) | Day 3, 14:30",
  );
});
