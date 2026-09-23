// Macro-DX layer + the M3 runtime enforcement (§12A.3): registry metadata
// completeness, the typed violation core (checkMacroArgs), arg validation (strict-author /
// lenient-render), execution-path defaults, positional diagnostics, and the queryMacros autocomplete API.

import type { MacroDiagnostic, MacroMetadata, ProcessMacroOptions } from "@orb/kit/macro";
import { checkMacroArgs, createDefaultRegistry, processMacros, queryMacros, validateMacroArgs } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures.ts";

const REGISTRY = createDefaultRegistry();

function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "Alice", user: "Bob", persona: "Hero", scenario: "A quest", env: {}, ...extra };
}

// ── completeness (the "no metadata-less macro survives" gate) ─────────────────────────────────────

test("every registered builtin has composed DX metadata", () => {
  const missing = REGISTRY.names().filter((name) => REGISTRY.getMetadata(name) === undefined);
  expect(missing).toEqual([]);
});

test("every metadata entry maps back to a live handler (no orphan metadata)", () => {
  for (const meta of REGISTRY.allMetadata()) {
    expect(REGISTRY.get(meta.name), meta.name).toBeDefined();
  }
});

// ── volatile is DERIVED from the registration, not authored (D51 one-home) ────────────────────────

test("metadata.volatile is composed from the volatile registration", () => {
  expect(REGISTRY.getMetadata("random")?.volatile).toBe(true); // registerVolatileMacros
  expect(REGISTRY.getMetadata("setvar")?.volatile).toBe(true); // var-mutation, volatile option
  expect(REGISTRY.getMetadata("char")?.volatile).toBe(false); // stable identity
  expect(REGISTRY.getMetadata("getvar")?.volatile).toBe(false); // pure read
});

// ── arg validation: arity ─────────────────────────────────────────────────────────────────────

test("strictArgs: a missing required arg renders empty + an error diagnostic", () => {
  const diagnostics: MacroDiagnostic[] = [];
  const out = processMacros("{{getvar}}", opts({ strictArgs: true, diagnostics }));
  expect(out).toBe("");
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toMatchObject({ severity: "error", code: "bad-arity", span: { offset: 0 } });
});

test("lenient (default): a bad-arity call still renders best-effort + a warning diagnostic", () => {
  const diagnostics: MacroDiagnostic[] = [];
  const out = processMacros("{{getvar::mood::extra}}", opts({ env: { mood: "grim" }, diagnostics }));
  // getvar is not variadic (max 1); the extra arg is a warning, but the read still happens.
  expect(out).toBe("grim");
  expect(diagnostics[0]).toMatchObject({ severity: "warning", code: "bad-arity" });
});

test("a well-formed call produces no diagnostics", () => {
  const diagnostics: MacroDiagnostic[] = [];
  processMacros("{{getvar::mood}}", opts({ env: { mood: "grim" }, strictArgs: true, diagnostics }));
  expect(diagnostics).toEqual([]);
});

test("variadic macros ({{pick}}/{{random}}) never trip the too-many-args check", () => {
  const diagnostics: MacroDiagnostic[] = [];
  processMacros("{{pick::a::b::c::d}}", opts({ random: () => 0, strictArgs: true, diagnostics }));
  expect(diagnostics).toEqual([]);
});

// ── arg validation: type coercion (direct — no builtin has a number arg) ──────────────────────────

test("validateMacroArgs flags a non-numeric value for a number-typed arg", () => {
  const meta: MacroMetadata = {
    name: "wait",
    description: "test",
    category: "system",
    args: [{ name: "ms", type: "number", optional: false }],
    returnType: "string",
    aliases: [],
    variadic: false,
    volatile: false,
  };
  const span = { offset: 0, line: 1, col: 1, length: 12 };
  expect(validateMacroArgs(meta, ["500"], span, true)).toEqual([]);
  const bad = validateMacroArgs(meta, ["soon"], span, true);
  expect(bad).toHaveLength(1);
  expect(bad[0]).toMatchObject({ code: "bad-arg-type", severity: "error" });
});

// ── M3 (§12A.3): the typed violation core — checkMacroArgs classes every violation ───────────────

// A metadata fixture with every enforcement axis: required string, required number, optional boolean.
function typedMeta(extra: Partial<MacroMetadata> = {}): MacroMetadata {
  return {
    name: "typed",
    description: "test",
    category: "system",
    args: [
      { name: "label", type: "string", optional: false },
      { name: "count", type: "number", optional: false },
      { name: "loud", type: "boolean", optional: true },
    ],
    returnType: "string",
    aliases: [],
    variadic: false,
    volatile: false,
    ...extra,
  };
}

test("checkMacroArgs: a well-formed call yields no violations", () => {
  expect(checkMacroArgs(typedMeta(), ["hi", "3", "true"])).toEqual([]);
  expect(checkMacroArgs(typedMeta(), ["hi", "3"])).toEqual([]); // optional suffix absent is fine
});

test("checkMacroArgs classes a missing required arg", () => {
  const violations = checkMacroArgs(typedMeta(), ["hi"]);
  expect(violations).toHaveLength(1);
  expect(violations[0]).toMatchObject({ kind: "missing-required", macro: "typed" });
});

test("checkMacroArgs classes extra args on a non-variadic macro", () => {
  // The extra ("1") still coerces to the last def's boolean so ONLY the arity class fires; a
  // non-coercible extra would ADDITIONALLY class bad-type against the last def (tail-validation rule).
  const violations = checkMacroArgs(typedMeta(), ["hi", "3", "true", "1"]);
  expect(violations).toHaveLength(1);
  expect(violations[0]).toMatchObject({ kind: "too-many-args" });
});

test("checkMacroArgs classes a wrong-typed arg with its position and name", () => {
  const violations = checkMacroArgs(typedMeta(), ["hi", "soon"]);
  expect(violations).toHaveLength(1);
  expect(violations[0]).toMatchObject({ kind: "bad-type", argIndex: 1, argName: "count" });
});

test("checkMacroArgs coercion boundaries: number accepts finite numeric text, boolean the {{if}} literals", () => {
  // number: any finite Number() — scientific/decimal/negative pass; words and Infinity fail.
  expect(checkMacroArgs(typedMeta(), ["x", "1e3"])).toEqual([]);
  expect(checkMacroArgs(typedMeta(), ["x", "-1.5"])).toEqual([]);
  expect(checkMacroArgs(typedMeta(), ["x", "Infinity"])).toHaveLength(1);
  // boolean: the truthiness vocabulary (true/false/on/off/0/1), case-insensitive; anything else fails.
  expect(checkMacroArgs(typedMeta(), ["x", "1", "OFF"])).toEqual([]);
  expect(checkMacroArgs(typedMeta(), ["x", "1", "maybe"])).toHaveLength(1);
  // empty string is tolerated for a non-string type (the setvar::k:: idiom) — arity governs presence.
  expect(checkMacroArgs(typedMeta(), ["x", "", ""])).toEqual([]);
});

test("checkMacroArgs skips the TYPE check for an arg still containing {{ (lazy/passthrough)", () => {
  // A `?`-delivered raw arg or an unknown-macro passthrough isn't knowable — no false bad-type.
  expect(checkMacroArgs(typedMeta(), ["x", "{{roll::1d6}}"])).toEqual([]);
});

test("checkMacroArgs enforces the variadic LIST bounds (total count, min and max)", () => {
  const listed = typedMeta({ args: [{ name: "option", type: "string", optional: true }], variadic: true, list: { min: 2, max: 3 } });
  expect(checkMacroArgs(listed, ["a"])).toMatchObject([{ kind: "list-bounds" }]);
  expect(checkMacroArgs(listed, ["a", "b"])).toEqual([]);
  expect(checkMacroArgs(listed, ["a", "b", "c", "d"])).toMatchObject([{ kind: "list-bounds" }]);
});

test("the builtin {{pick}} declares list min 1 — a pick of nothing is an authoring diagnostic", () => {
  const diagnostics: MacroDiagnostic[] = [];
  const out = processMacros("{{pick}}", opts({ diagnostics }));
  expect(out).toBe(""); // lenient render still degrades to the handler's empty result
  expect(diagnostics[0]).toMatchObject({ severity: "warning", code: "bad-arity" });
});

test("builtin metadata declares optional args as a CONTIGUOUS SUFFIX (the arity model counts on it)", () => {
  for (const meta of REGISTRY.allMetadata()) {
    const firstOptional = meta.args.findIndex((a) => a.optional);
    if (firstOptional === -1) {
      continue;
    }
    expect(
      meta.args.slice(firstOptional).every((a) => a.optional),
      meta.name,
    ).toBe(true);
  }
});

// ── M3: execution-path enforcement — defaults reach the handler; strict degrades to "" ────────────

test("a declared default is PADDED onto the delivered args (the metadata IS the runtime contract)", () => {
  const registry = createDefaultRegistry();
  registry.register("greet", (args) => `Hello ${args[0]}`, {
    metadata: {
      name: "greet",
      description: "test",
      category: "system",
      args: [{ name: "who", type: "string", optional: true, default: "World" }],
      returnType: "string",
      aliases: [],
      variadic: false,
    },
  });
  expect(processMacros("{{greet}}", opts(), registry)).toBe("Hello World");
  expect(processMacros("{{greet::Bob}}", opts(), registry)).toBe("Hello Bob");
});

test("per-macro strict metadata degrades a violation to empty even under a LENIENT context", () => {
  const registry = createDefaultRegistry();
  registry.register("must", (args) => args[0] ?? "fallback", {
    metadata: {
      name: "must",
      description: "test",
      category: "system",
      args: [{ name: "value", type: "string", optional: false }],
      returnType: "string",
      aliases: [],
      variadic: false,
      strict: true,
    },
  });
  const diagnostics: MacroDiagnostic[] = [];
  const out = processMacros("[{{must}}]", opts({ diagnostics }), registry);
  expect(out).toBe("[]"); // degrade, never a throw — the D2 lenient-render outer boundary holds
  expect(diagnostics[0]).toMatchObject({ severity: "error", code: "bad-arity" });
});

// ── M3: the scoped-block path is enforced too — with the universal body slot exempt ───────────────

test("a universal block BODY never trips too-many (block capability is universal, M1)", () => {
  const diagnostics: MacroDiagnostic[] = [];
  const out = processMacros("{{char}}body{{/char}}", opts({ strictArgs: true, diagnostics }));
  expect(out).toBe("Alice"); // char ignores its content arg; the body slot is arity-exempt
  expect(diagnostics).toEqual([]);
});

test("a block body SATISFIES a required arg (content-as-last-arg is a real positional arg)", () => {
  const diagnostics: MacroDiagnostic[] = [];
  const out = processMacros("{{roll}}2d1{{/roll}}", opts({ strictArgs: true, diagnostics }));
  expect(out).toBe("2"); // the body fills roll's required `spec` slot: two 1-sided dice
  expect(diagnostics).toEqual([]);
});

test("strictArgs suppresses a violating BLOCK call to empty (the block path is enforced)", () => {
  const diagnostics: MacroDiagnostic[] = [];
  // getvar (max 1 arg) with an explicit arg AND a body = 2 delivered args > 1 + the body slot… still
  // within tolerance — use two explicit args + a body to genuinely exceed it.
  const out = processMacros("{{getvar::a::b}}body{{/getvar}}", opts({ env: { a: "v" }, strictArgs: true, diagnostics }));
  expect(out).toBe("");
  expect(diagnostics[0]).toMatchObject({ severity: "error", code: "bad-arity" });
});

// ── unknown-macro diagnostic (sink-only; passthrough render unchanged) ────────────────────────────

test("an unknown macro records a diagnostic but re-emits verbatim", () => {
  const diagnostics: MacroDiagnostic[] = [];
  const out = processMacros("a {{totallyMadeUp}} b", opts({ diagnostics }));
  expect(out).toBe("a {{totallyMadeUp}} b");
  expect(diagnostics[0]).toMatchObject({ code: "unknown-macro", severity: "warning" });
});

// ── span accuracy across lines ────────────────────────────────────────────────────────────────

test("diagnostics carry an accurate multi-line span", () => {
  const diagnostics: MacroDiagnostic[] = [];
  processMacros("line one\nline two {{getvar}}", opts({ strictArgs: true, diagnostics }));
  expect(diagnostics[0]?.span).toEqual({ offset: 18, line: 2, col: 10, length: 10 });
});

// ── queryMacros autocomplete ──────────────────────────────────────────────────────────────────

test("queryMacros prefix match returns the get* family, name-sorted", () => {
  const names = queryMacros(REGISTRY, { prefix: "get" }).map((m) => m.name);
  expect(names).toContain("getvar");
  expect(names).toContain("get");
  // stable name-sorted
  expect([...names]).toEqual(names.toSorted((a, b) => a.localeCompare(b)));
});

test("queryMacros filters by category", () => {
  const cats = new Set(queryMacros(REGISTRY, { category: "time" }).map((m) => m.category));
  expect([...cats]).toEqual(["time"]);
});
