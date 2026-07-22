// Macro-DX layer (automation-design/02 §5): registry metadata completeness, arg validation
// (strict/lenient), positional diagnostics, and the queryMacros autocomplete API.

import type { MacroDiagnostic, MacroMetadata, ProcessMacroOptions } from "@orb/kit/macro";
import { createDefaultRegistry, processMacros, queryMacros, validateMacroArgs } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures";

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
  expect([...names]).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test("queryMacros filters by category", () => {
  const cats = new Set(queryMacros(REGISTRY, { category: "time" }).map((m) => m.category));
  expect([...cats]).toEqual(["time"]);
});
