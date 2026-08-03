// The MG GRAMMAR CORPUS (parity-plus §12A.tests — language-kernel bar): every M1/M4 construct ×
// nesting × malformed × escaping, driven by shared {input → expected} tables so a new construct is one
// row ([[exhaustive-testing-posture]] shared-kit posture). Pins the FINAL launch grammar the owner
// ratified (§13 #17/#18/#21/#23): universal scoped blocks (`{{name::args}}body{{/name}}`, content as the
// last unnamed arg, trim+dedent default), the reserved flag run (`/ # ! ? ~ >` — reserved flags carry +
// no-op), the raw byte-identical re-emit for every unknown/malformed path, and the eager-vs-lazy
// determinism property that guards the M2 seam. A byte here changing means the permanent grammar moved —
// that is exactly the loud failure these goldens exist for.

import type { MacroRegistry, ProcessMacroOptions, VarOp } from "@orb/kit/macro";
import { createDefaultRegistry, MACRO_FLAG_DEFS, parseMacros, processMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures.ts";

function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "Alice", user: "Bob", persona: "Hero", scenario: "A quest", env: {}, ...extra };
}

// One corpus row: a construct, the env it needs, the pinned render.
interface CorpusRow {
  readonly name: string;
  readonly input: string;
  readonly env?: Record<string, unknown>;
  readonly expected: string;
}

// ── M1: universal scoped blocks — content becomes the LAST unnamed arg ─────────────────────────────

const UNIVERSAL_BLOCK_CORPUS: readonly CorpusRow[] = [
  {
    name: "body is trimmed by default before becoming the last arg",
    input: "{{setvar::k}}  hello  {{/setvar}}[{{getvar::k}}]",
    expected: "[hello]",
  },
  {
    name: "the # PRESERVE_WHITESPACE flag keeps the body verbatim",
    input: "{{#setvar::k}}  hello  {{/setvar}}[{{getvar::k}}]",
    expected: "[  hello  ]",
  },
  {
    name: "a multiline body dedents to the common indent, relative indent preserved",
    input: "{{setvar::k}}\n    line1\n      line2\n{{/setvar}}[{{getvar::k}}]",
    expected: "[line1\n  line2]",
  },
  {
    name: "macros inside a body resolve before delivery",
    input: "{{setvar::k}}Hi {{user}}{{/setvar}}{{getvar::k}}",
    expected: "Hi Bob",
  },
  {
    name: ":: inside a body is literal (bodies are never arg-split)",
    input: "{{setvar::k}}a::b{{/setvar}}{{getvar::k}}",
    expected: "a::b",
  },
  {
    name: "stray single braces inside a body pass through",
    input: "{{setvar::k}}a { b } c{{/setvar}}{{getvar::k}}",
    expected: "a { b } c",
  },
  {
    name: "an empty body still delivers (empty-string) content",
    input: "{{setvar::k}}{{/setvar}}{{hasvar::k}}",
    expected: "true",
  },
  {
    name: "a macro that ignores its content arg still resolves the body (side effects fire)",
    input: "{{char}}{{setvar::s::1}}{{/char}}{{getvar::s}}",
    expected: "Alice1",
  },
  {
    name: "nested known blocks of different names compose inside-out",
    input: "{{uppercase}}a{{lowercase}}B{{/lowercase}}c{{/uppercase}}",
    expected: "ABC",
  },
  {
    name: "a comment inside a body is stripped, never closes the block",
    input: "{{uppercase}}a{{// hidden }}b{{/uppercase}}",
    expected: "AB",
  },
  {
    name: "an unclosed tag is simply the inline call it always was (no rescue, no block)",
    input: "{{if::x}}tail",
    env: { x: "1" },
    expected: "tail",
  },
  {
    name: "a children-mode transform used inline (no close) renders empty, not an error",
    input: "[{{trim}}]",
    expected: "[]",
  },
  {
    name: "a mismatched close inside a block re-emits verbatim among the children",
    input: "{{if::x}}A{{/uppercase}}B{{/if}}",
    env: { x: "1" },
    expected: "A{{/uppercase}}B",
  },
  {
    name: "crossing pairs degrade: the inner candidate reverts to inline, the stray close is literal",
    input: "{{if::x}}A{{trim}}B{{/if}}C{{/trim}}",
    env: { x: "1" },
    expected: "ABC{{/trim}}",
  },
];

// ── M4: the flag run — implemented flags bite (`/ # ! ?`), reserved flags carry + no-op (`~ >`) ─────

const FLAG_CORPUS: readonly CorpusRow[] = [
  { name: "! IMMEDIATE on an eager-default handler changes nothing (already eager)", input: "{{!setvar::x::1}}{{getvar::x}}", expected: "1" },
  { name: "? DELAYED on plain-text args is delivery-identical (nothing to defer)", input: "{{setvar::x::7}}{{?getvar::x}}", expected: "7" },
  {
    // The ME semantics pin (§12A.2): `?` hands the handler its RAW args. A lazy-unaware handler
    // (setvar) stores the raw bytes — the author asked for deferral, the deferral is visible.
    name: "? DELAYED delivers RAW args — an unresolving handler passes the raw bytes through",
    input: "{{?setvar::k::{{user}}}}[{{getvar::k}}]",
    expected: "[{{user}}]",
  },
  {
    // The eager baseline for the row above — unflagged setvar resolves the sub-macro before storing.
    name: "unflagged (eager) setvar resolves a sub-macro arg before storing",
    input: "{{setvar::k::{{user}}}}[{{getvar::k}}]",
    expected: "[Bob]",
  },
  {
    // `!` on the lazy-default {{if}}: args pre-resolve (eager), the body still branch-picks lazily
    // (flags flip only the ARG axis — an eager-forced if must never resolve BOTH branches).
    name: "! IMMEDIATE on the lazy-default if still branch-picks (body axis untouched)",
    input: "{{!if::flag}}Y{{else}}N{{/if}}",
    env: { flag: "1" },
    expected: "Y",
  },
  {
    // Only the picked branch's side effects fire under {{!if}} — the else branch stays unevaluated.
    name: "! IMMEDIATE if: the unpicked branch's side effects never fire",
    input: "{{!if::flag}}{{setvar::a::1}}{{else}}{{setvar::b::2}}{{/if}}{{getvar::a}}-{{hasvar::b}}",
    env: { flag: "1" },
    expected: "1-",
  },
  {
    // `?` on a universal block: raw args, body delivery unchanged (resolved content-as-last-arg).
    name: "? DELAYED on a universal block defers only the args — the body still resolves",
    input: "{{?setvar::k}}Hi {{user}}{{/setvar}}[{{getvar::k}}]",
    expected: "[Hi Bob]",
  },
  {
    name: "a conflicting !? run resolves IMMEDIATE (eager delivery is universally safe)",
    input: "{{!?setvar::k::{{user}}}}[{{getvar::k}}]",
    expected: "[Bob]",
  },
  { name: "~ REEVALUATE is reserved — the un-reevaluated render, never a parse error", input: "{{~char}}", expected: "Alice" },
  { name: "> PIPE is reserved — resolves as if unflagged", input: "{{>char}}", expected: "Alice" },
  { name: "# on an INLINE call is a no-op (nothing to preserve)", input: "{{#char}}", expected: "Alice" },
  { name: "a full flag RUN parses; the reserved members no-op", input: "{{!?~>char}}", expected: "Alice" },
  { name: "flags don't break the argument-less env catch-all", input: "{{#POV}}", env: { pov: "first" }, expected: "first" },
  { name: "a flagged close still closes its block (extra flags on a close no-op)", input: "{{setvar::k}}v{{/#setvar}}{{getvar::k}}", expected: "v" },
];

// ── the raw posture: unknown / malformed constructs re-emit BYTE-IDENTICAL (render == input) ───────
// The golden round-trip pins — parse → evaluate → the exact input bytes come back out.

const ROUND_TRIP_CORPUS: readonly string[] = [
  "{{~mystery}}",
  "{{!?~>mystery::a}}",
  "{{#mystery:one,two}}",
  "{{box:one,two}}X{{/box}}", // unknown block: legacy-colon open re-emits raw, never normalized
  "{{box}}x{{box}}y{{/box}}z{{/box}}", // nested same-name unknown blocks
  "{{box}}x{{/#box}}", // flags on the close carried verbatim through closeRaw
  "{{/#box}}", // unmatched flagged close
  "{{/box}}", // unmatched plain close
  "{{~}}", // flag run with no identifier → literal
  "{{/}}",
  "{{>|filter}}", // reserved > then a non-identifier → literal
  "{{unknown::{{newline}}}}", // nested macro inside an unknown's args stays raw (R1)
];

function runCorpus(rows: readonly CorpusRow[], label: string): void {
  for (const row of rows) {
    test(`[corpus/${label}] ${row.name}`, () => {
      expect(processMacros(row.input, opts({ env: { ...row.env } }))).toBe(row.expected);
    });
  }
}
runCorpus(UNIVERSAL_BLOCK_CORPUS, "block");
runCorpus(FLAG_CORPUS, "flags");

test("[corpus/raw] unknown + malformed constructs round-trip byte-identical", () => {
  for (const input of ROUND_TRIP_CORPUS) {
    expect(processMacros(input, opts())).toBe(input);
  }
});

test("[corpus/raw] the literal-brace escape neutralizes a flagged opener too", () => {
  expect(processMacros("\\{{#if x}}", opts())).toBe("{{#if x}}");
});

// ── AST golden: the flag run parses into a `flags` object; raw/span stay byte-exact ────────────────

test("[corpus/ast] a flag run lands as a flags object on the node, raw byte-exact", () => {
  expect(parseMacros("{{~>roll::1d6}}")).toEqual([
    {
      type: "macro",
      name: "roll",
      args: ["1d6"],
      raw: "{{~>roll::1d6}}",
      span: { offset: 0, line: 1, col: 1, length: 15 },
      flags: { reevaluate: true, pipe: true },
    },
  ]);
});

test("[corpus/ast] a repeated flag char is idempotent (one key), raw still byte-exact", () => {
  expect(parseMacros("{{##char}}")).toEqual([
    {
      type: "macro",
      name: "char",
      args: [],
      raw: "{{##char}}",
      span: { offset: 0, line: 1, col: 1, length: 10 },
      flags: { preserveWhitespace: true },
    },
  ]);
});

// ── content-as-last-arg reaches EVERY macro: a body can be a picked option ─────────────────────────

test("[corpus/block] a body becomes a real argument — {{pick}} with only a body picks it", () => {
  expect(processMacros("{{pick}}only{{/pick}}", opts({ random: () => 0 }))).toBe("only");
});

// ── the determinism property (§12A.2 seam guard): eager vs lazy = byte-identical + same op-log ─────
// `{{if}}` is the lazy path TODAY (delayArgResolution + children-mode: its body resolves inside the
// handler via ctx.evaluateAST); the flattened template is the eager path. Same seed ⇒ the PRNG draws in
// document order either way, outputs byte-identical, VarOps recorded in the same sequence. M2's
// generalized resolve() contract must keep this pin green.

const LCG_MOD = 4_294_967_296;
const LCG_MULT = 1_664_525;
const LCG_INC = 1_013_904_223;
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * LCG_MULT + LCG_INC) % LCG_MOD;
    return state / LCG_MOD;
  };
}

const LAZY_TEMPLATE = "{{setvar::hp::5}}{{if::hp}}{{pick::a::b::c}}-{{roll::2d6}}-{{incvar::hp}}{{/if}}";
const EAGER_TEMPLATE = "{{setvar::hp::5}}{{pick::a::b::c}}-{{roll::2d6}}-{{incvar::hp}}";
const SEED = 42;

test("[corpus/determinism] lazy (block-body) vs eager resolution: byte-identical output + op-log", () => {
  const lazyOps: VarOp[] = [];
  const eagerOps: VarOp[] = [];
  const lazyOut = processMacros(LAZY_TEMPLATE, opts({ random: lcg(SEED), opLog: lazyOps }));
  const eagerOut = processMacros(EAGER_TEMPLATE, opts({ random: lcg(SEED), opLog: eagerOps }));
  expect(lazyOut).toBe(eagerOut);
  expect(lazyOps).toEqual(eagerOps);
});

test("[corpus/determinism] a swipe replay (same seed) reproduces the exact bytes and op sequence", () => {
  const ops1: VarOp[] = [];
  const ops2: VarOp[] = [];
  const out1 = processMacros(LAZY_TEMPLATE, opts({ random: lcg(SEED), opLog: ops1 }));
  const out2 = processMacros(LAZY_TEMPLATE, opts({ random: lcg(SEED), opLog: ops2 }));
  expect(out1).toBe(out2);
  expect(ops1).toEqual(ops2);
});

// ── ME determinism extensions (§12A.2): the flag overrides BOTH ways + lazy bodies with draws/vars ──
// The invariant (owner #19, FINAL): eager vs lazy resolution of the same program + seed = byte-identical
// output AND op-log. The `resolve()` handle threads the parent's PRNG/opLog/budget unchanged, so a
// handler resolving its args LATE draws in document order exactly like the evaluator resolving them
// EARLY — proven here with the same handler run under `?` (lazy) vs unflagged (eager), and `!` (eager)
// vs the lazy registry default.

// A body mixing draws + var ops — the op-log and the PRNG stream must interleave identically.
const DRAWY_BODY = "{{setvar::hp::5}}{{pick::a::b::c}}-{{roll::2d6}}-{{incvar::hp}}-{{getvar::hp}}";
// option|roll|counter — pins that the lazy-handler draws genuinely fired (top-level per useTopLevelRegex).
const JOIN_SHAPE = /^.\|\d+\|1$/;

test("[corpus/determinism] {{!if}} (eager-forced args) vs {{if}} (lazy default): byte-identical + op-log", () => {
  const eagerOps: VarOp[] = [];
  const lazyOps: VarOp[] = [];
  const eagerOut = processMacros(`{{!if::flag}}${DRAWY_BODY}{{/if}}`, opts({ env: { flag: "1" }, random: lcg(SEED), opLog: eagerOps }));
  const lazyOut = processMacros(`{{if::flag}}${DRAWY_BODY}{{/if}}`, opts({ env: { flag: "1" }, random: lcg(SEED), opLog: lazyOps }));
  expect(eagerOut).toBe(lazyOut);
  expect(eagerOps).toEqual(lazyOps);
  expect(eagerOps.length).toBeGreaterThan(0); // the property is over a REAL op sequence, not two empties
});

test("[corpus/determinism] `?` on a resolve()-capable handler vs eager delivery: byte-identical + op-log", () => {
  // ONE handler, both modes: eager delivery hands it pre-resolved args (resolve() on plain text is
  // identity); `?` hands it raw args it resolves itself. Same seed ⇒ same draws in document order.
  const registry: MacroRegistry = createDefaultRegistry();
  registry.register("join", (args, ctx) => args.map((a) => ctx.resolve(a)).join("|"));
  const template = (flag: string): string => `{{${flag}join::{{pick::a::b::c}}::{{roll::2d6}}::{{incvar::n}}}}`;
  const eagerOps: VarOp[] = [];
  const lazyOps: VarOp[] = [];
  const eagerOut = processMacros(template(""), opts({ random: lcg(SEED), opLog: eagerOps }), registry);
  const lazyOut = processMacros(template("?"), opts({ random: lcg(SEED), opLog: lazyOps }), registry);
  expect(eagerOut).toBe(lazyOut);
  expect(eagerOps).toEqual(lazyOps);
  expect(lazyOut).toMatch(JOIN_SHAPE); // and the draws actually happened
});

test("[corpus/determinism] a lazy BODY containing draws/vars replays byte-identical (same seed)", () => {
  // The universal content-as-last-arg path resolves the body through ctx.resolve — the same seam a
  // lazy handler uses. Two runs, one seed: identical bytes, identical op sequence.
  const template = `{{setvar::k}}${DRAWY_BODY}{{/setvar}}[{{getvar::k}}]`;
  const ops1: VarOp[] = [];
  const ops2: VarOp[] = [];
  const out1 = processMacros(template, opts({ random: lcg(SEED), opLog: ops1 }));
  const out2 = processMacros(template, opts({ random: lcg(SEED), opLog: ops2 }));
  expect(out1).toBe(out2);
  expect(ops1).toEqual(ops2);
});

// ── the M2 resolve() handle: the resolveContent seam (trim option) ─────────────────────────────────

test("[corpus/resolve] ctx.resolve on an AST body applies trimContent under {trim:true}, verbatim without", () => {
  const registry: MacroRegistry = createDefaultRegistry();
  registry.register("verbatim", (_args, ctx, children) => (children ? ctx.resolve(children) : ""), { blockChildren: true });
  registry.register("tidy", (_args, ctx, children) => (children ? ctx.resolve(children, { trim: true }) : ""), { blockChildren: true });
  expect(processMacros("[{{verbatim}}  {{user}}  {{/verbatim}}]", opts(), registry)).toBe("[  Bob  ]");
  expect(processMacros("[{{tidy}}\n    {{user}}\n      line2\n{{/tidy}}]", opts(), registry)).toBe("[Bob\n  line2]");
});

// ── the flag vocabulary is PERMANENT (owner-ratified #18) — the table itself is pinned ─────────────

test("[corpus/flags] MACRO_FLAG_DEFS is exactly the ratified set; / # ! ? are implemented (ME), ~ > reserved", () => {
  expect(MACRO_FLAG_DEFS.map((d) => d.char)).toEqual(["/", "#", "!", "?", "~", ">"]);
  expect(MACRO_FLAG_DEFS.filter((d) => d.status === "implemented").map((d) => d.key)).toEqual(["closing", "preserveWhitespace", "immediate", "delayed"]);
  expect(MACRO_FLAG_DEFS.filter((d) => d.status === "reserved").map((d) => d.key)).toEqual(["reevaluate", "pipe"]);
});

// ── volatility honesty is untouched by the grammar (ours-invariant, §12A.0) ────────────────────────

test("[corpus/invariant] volatileNames still reports the freeze set after the grammar change", () => {
  const registry: MacroRegistry = createDefaultRegistry();
  expect(registry.volatileNames()).toEqual(expect.arrayContaining(["random", "pick", "roll", "time", "setvar", "expr"]));
});

// parity-plus P6 (§12.3): the rpg data macros + {{idle_duration}} are `volatile:true` so the assembly cache-buster
// scan (`volatileNames()`) flags a preset placing `{{rpgSceneState}}` in a cached prefix — no silent cache churn.
test("[corpus/invariant] volatileNames includes the rpg data macros + idle_duration (the cache-buster scan)", () => {
  const registry: MacroRegistry = createDefaultRegistry();
  const vol = registry.volatileNames();
  expect(vol).toEqual(expect.arrayContaining(["rpgscenestate", "rpgcast", "rpgquests", "rpgdelta", "idle_duration"]));
});
