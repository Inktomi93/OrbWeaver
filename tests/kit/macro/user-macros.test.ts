// WAVE MU (parity-plus §12A.5 M5 + the #24 typed-input fold) — the language-kernel corpus extension:
// user-macro registration (collision-refusal, source attribution, derived volatility), evaluation
// (named-arg binding × declared defaults × strict × flags × universal blocks × the neutralizing splice),
// recursion bombs (MacroBudget-bounded degrade), the eager/lazy determinism + op-log property, the
// typed-input resolution matrix, random-pick determinism/freeze-at-commit replay, and the two-consumer
// byte-parity pin (same defs + values ⇒ identical bytes on independently composed registries).

import type { MacroDiagnostic, MacroRegistry, ProcessMacroOptions, UserMacroDef, UserMacroInputDef, VarOp } from "@orb/kit/macro";
import { createDefaultRegistry, processMacros, registerUserMacros, resolveUserMacroInputs, ZWSP } from "@orb/kit/macro";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const SOURCE = { kind: "preset", id: "preset_test" } as const;

function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "Alice", user: "Bob", persona: "Hero", scenario: "A quest", env: {}, ...extra };
}

/** A deterministic PRNG: cycles the given floats (defaults to a constant 0). */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % Math.max(values.length, 1)] ?? 0;
    i += 1;
    return v;
  };
}

/** A full def from a partial (the schema-default shape kit consumes). */
function def(partial: Partial<UserMacroDef> & { name: string; body: string }): UserMacroDef {
  return { description: "", args: [], inputs: [], strict: false, ...partial };
}

/** A full input def from a partial (the flat schema defaults). */
function input(partial: Partial<UserMacroInputDef> & { kind: UserMacroInputDef["kind"]; name: string }): UserMacroInputDef {
  return { label: "", options: [], separator: ", ", onValue: "true", offValue: "", defaultValue: "", ...partial };
}

function registryWith(defs: UserMacroDef[], inputBindings?: Record<string, Record<string, string>>): MacroRegistry {
  const registry = createDefaultRegistry();
  registerUserMacros(registry, defs, { source: SOURCE, inputBindings });
  return registry;
}

// ── registration: first-class entries, collision refusal, source attribution ──────────────────────

describe("registration", () => {
  test("a registered user macro is a first-class entry with full DX metadata + source attribution", () => {
    const registry = createDefaultRegistry();
    const result = registerUserMacros(
      registry,
      [def({ name: "greet", description: "Says hi.", args: [{ name: "who", type: "string", optional: false }], body: "Hello {{who}}!" })],
      { source: SOURCE },
    );
    expect(result.registered).toEqual(["greet"]);
    expect(result.rejected).toEqual([]);
    const meta = registry.getMetadata("greet");
    expect(meta).toMatchObject({ name: "greet", category: "user", source: SOURCE, variadic: false, volatile: false });
    expect(meta?.args).toEqual([{ name: "who", type: "string", optional: false }]);
  });

  test("a builtin name is REFUSED (never silently shadowed) and the builtin keeps working", () => {
    const registry = createDefaultRegistry();
    const result = registerUserMacros(registry, [def({ name: "char", body: "not the char" })], { source: SOURCE });
    expect(result.registered).toEqual([]);
    expect(result.rejected).toMatchObject([{ name: "char" }]);
    expect(processMacros("{{char}}", opts(), registry)).toBe("Alice");
  });

  test("a duplicate within the defs is refused — first wins", () => {
    const registry = createDefaultRegistry();
    const result = registerUserMacros(registry, [def({ name: "m", body: "first" }), def({ name: "M", body: "second" })], { source: SOURCE });
    expect(result.registered).toEqual(["m"]);
    expect(result.rejected).toMatchObject([{ name: "M" }]);
    expect(processMacros("{{m}}", opts(), registry)).toBe("first");
  });

  test("an unparseable name is refused with a reason", () => {
    const registry = createDefaultRegistry();
    const result = registerUserMacros(registry, [def({ name: "2bad name", body: "x" })], { source: SOURCE });
    expect(result.registered).toEqual([]);
    expect(result.rejected[0]?.reason).toContain("invalid macro name");
  });
});

// ── volatility derivation (D51 cache honesty) ────────────────────────────────────────────────────

describe("derived volatility", () => {
  test("a body reaching a volatile builtin is volatile; a stable body is not", () => {
    const registry = registryWith([def({ name: "lucky", body: "You rolled {{roll::1d6}}" }), def({ name: "plain", body: "Hello {{char}}" })]);
    expect(registry.getMetadata("lucky")?.volatile).toBe(true);
    expect(registry.getMetadata("plain")?.volatile).toBe(false);
    expect(registry.volatileNames()).toContain("lucky");
  });

  test("a random-pick input makes the macro volatile (a per-turn draw)", () => {
    const registry = registryWith([
      def({ name: "vibe", body: "{{mood}}", inputs: [input({ kind: "random-pick", name: "mood", options: [{ label: "A", value: "a" }] })] }),
    ]);
    expect(registry.getMetadata("vibe")?.volatile).toBe(true);
  });

  test("volatility propagates through user→user references (fixpoint)", () => {
    const registry = registryWith([def({ name: "outer", body: "[{{inner}}]" }), def({ name: "inner", body: "{{time}}" })]);
    expect(registry.getMetadata("inner")?.volatile).toBe(true);
    expect(registry.getMetadata("outer")?.volatile).toBe(true);
  });
});

// ── evaluation: named args × defaults × strict × blocks × flags ──────────────────────────────────

describe("evaluation", () => {
  test("declared args bind by NAME into the template", () => {
    const registry = registryWith([def({ name: "greet", args: [{ name: "who", type: "string", optional: false }], body: "Hello {{who}}!" })]);
    expect(processMacros("{{greet::Bob}}", opts(), registry)).toBe("Hello Bob!");
  });

  test("a declared optional default is padded (the metadata IS the runtime contract)", () => {
    const registry = registryWith([def({ name: "greet", args: [{ name: "who", type: "string", optional: true, default: "World" }], body: "Hello {{who}}!" })]);
    expect(processMacros("{{greet}}", opts(), registry)).toBe("Hello World!");
  });

  test("checkMacroArgs enforces a user macro's declared args exactly like a builtin's", () => {
    const registry = registryWith([def({ name: "need", args: [{ name: "value", type: "number", optional: false }], body: "[{{value}}]" })]);
    const diagnostics: MacroDiagnostic[] = [];
    // Lenient: bad type renders best-effort + a warning diagnostic.
    expect(processMacros("{{need::soon}}", opts({ diagnostics }), registry)).toBe("[soon]");
    expect(diagnostics[0]).toMatchObject({ code: "bad-arg-type", severity: "warning" });
  });

  test("per-macro strict degrades a violating call to empty even under a LENIENT context", () => {
    const registry = registryWith([def({ name: "must", args: [{ name: "value", type: "string", optional: false }], body: "[{{value}}]", strict: true })]);
    const diagnostics: MacroDiagnostic[] = [];
    expect(processMacros("<{{must}}>", opts({ diagnostics }), registry)).toBe("<>");
    expect(diagnostics[0]).toMatchObject({ code: "bad-arity", severity: "error" });
  });

  test("universal block: the body lands as {{content}} — zero registration work", () => {
    const registry = registryWith([def({ name: "shout", body: "«{{uppercase}}{{content}}{{/uppercase}}»" })]);
    expect(processMacros("{{shout}}hi there{{/shout}}", opts(), registry)).toBe("«HI THERE»");
  });

  test("a delivered block body overrides a declared arg named content (delivery order pins later-wins)", () => {
    const registry = registryWith([def({ name: "wrap", args: [{ name: "content", type: "string", optional: true, default: "arg" }], body: "[{{content}}]" })]);
    expect(processMacros("{{wrap}}body{{/wrap}}", opts(), registry)).toBe("[body]");
    expect(processMacros("{{wrap::explicit}}", opts(), registry)).toBe("[explicit]");
  });

  test("the # PRESERVE_WHITESPACE flag reaches a user macro's block body (flags work for free)", () => {
    const registry = registryWith([def({ name: "keep", body: "[{{content}}]" })]);
    expect(processMacros("{{keep}}  x  {{/keep}}", opts(), registry)).toBe("[x]");
    expect(processMacros("{{#keep}}  x  {{/keep}}", opts(), registry)).toBe("[  x  ]");
  });

  test("the ? DELAYED flag delivers raw args — the user-macro handler resolves them itself", () => {
    const registry = registryWith([def({ name: "echo", args: [{ name: "value", type: "string", optional: false }], body: "[{{value}}]" })]);
    expect(processMacros("{{?echo::{{user}}}}", opts(), registry)).toBe("[Bob]");
  });

  test("macros in the TEMPLATE resolve; macros smuggled through a VALUE are neutralized (no injection)", () => {
    const registry = registryWith([def({ name: "mood", body: "feels {{vibe}} near {{char}}", inputs: [input({ kind: "single-select", name: "vibe" })] })], {
      mood: { vibe: "{{char}}" },
    });
    const out = processMacros("{{mood}}", opts(), registry);
    // The template's own {{char}} resolves; the spliced pick's {{char}} is ZWSP-neutralized, inert.
    expect(out).toBe(`feels {${ZWSP}{char}${ZWSP}} near Alice`);
  });

  test("an evaluated user macro nests inside builtins like any other macro", () => {
    const registry = registryWith([def({ name: "who", body: "{{char}}" })]);
    expect(processMacros("{{uppercase}}{{who}}{{/uppercase}}", opts(), registry)).toBe("ALICE");
  });
});

// ── recursion bombs: MacroBudget-bounded degrade, never a hang ───────────────────────────────────

describe("recursion bombs", () => {
  test("a self-recursive user macro trips the depth cap and degrades (never hangs)", () => {
    const registry = registryWith([def({ name: "bomb", body: "x{{bomb}}" })]);
    const warnings: string[] = [];
    const out = processMacros("{{bomb}}", opts({ onWarn: (msg) => warnings.push(msg) }), registry);
    expect(out.length).toBeLessThan(1000); // bounded output, not an unbounded expansion
    expect(warnings.some((w) => w.includes("depth limit"))).toBe(true);
  });

  test("mutually-recursive user macros degrade the same way", () => {
    const registry = registryWith([def({ name: "ping", body: "p{{pong}}" }), def({ name: "pong", body: "q{{ping}}" })]);
    const warnings: string[] = [];
    const out = processMacros("{{ping}}", opts({ onWarn: (msg) => warnings.push(msg) }), registry);
    expect(out.length).toBeLessThan(1000);
    expect(warnings.some((w) => w.includes("depth limit"))).toBe(true);
  });
});

// ── determinism: eager vs lazy = byte-identical output AND identical op-log ──────────────────────

describe("determinism through nesting", () => {
  test("eager, !-forced, and ?-deferred calls produce byte-identical output + op-log under one seed", () => {
    const body = "{{setvar::k::{{roll::1d6}}}}{{getvar::k}}";
    const runs = ["{{stamp::{{pick::x::y}}}}", "{{!stamp::{{pick::x::y}}}}", "{{?stamp::{{pick::x::y}}}}"].map((template) => {
      const registry = registryWith([def({ name: "stamp", args: [{ name: "tag", type: "string", optional: false }], body: `${body}-{{tag}}` })]);
      const opLog: VarOp[] = [];
      const out = processMacros(template, opts({ random: seq(0.1, 0.7, 0.3), opLog }), registry);
      return { out, opLog };
    });
    expect(runs[1]?.out).toBe(runs[0]?.out);
    expect(runs[2]?.out).toBe(runs[0]?.out);
    expect(runs[1]?.opLog).toEqual(runs[0]?.opLog);
    expect(runs[2]?.opLog).toEqual(runs[0]?.opLog);
  });

  test("two independently composed registries render the same defs+values byte-identically (row-atom parity)", () => {
    const defs = [
      def({
        name: "scene",
        args: [{ name: "tone", type: "string", optional: false }],
        body: "{{char}} feels {{tone}} ({{mood}})",
        inputs: [input({ kind: "single-select", name: "mood", options: [{ label: "A", value: "calm" }] })],
      }),
    ];
    const bindings = { scene: { mood: "tense" } };
    const a = processMacros("{{scene::low}}", opts(), registryWith(defs, bindings));
    const b = processMacros("{{scene::low}}", opts(), registryWith(defs, bindings));
    expect(a).toBe(b);
    expect(a).toBe("Alice feels low (tense)");
  });
});

// ── the #24 typed-input resolution matrix ────────────────────────────────────────────────────────

describe("typed inputs — resolution matrix", () => {
  const single = input({
    kind: "single-select",
    name: "pov",
    options: [
      { label: "First", value: "first" },
      { label: "Third", value: "third" },
    ],
    defaultValue: "third",
  });
  const toggle = input({ kind: "boolean-toggle", name: "grim", onValue: "grim and dark", offValue: "light" });
  const multi = input({
    kind: "multi-select",
    name: "themes",
    options: [
      { label: "A", value: "war" },
      { label: "B", value: "loss" },
    ],
    separator: " + ",
    defaultValue: "war",
  });

  test("single-select: pick wins; empty-string pick falls back; no default falls to the first option", () => {
    expect(resolveUserMacroInputs([single], { pov: "first" }, { prng: seq() }).bindings).toEqual({ pov: "first" });
    expect(resolveUserMacroInputs([single], { pov: "" }, { prng: seq() }).bindings).toEqual({ pov: "third" });
    const noDefault = { ...single, defaultValue: "" };
    expect(resolveUserMacroInputs([noDefault], {}, { prng: seq() }).bindings).toEqual({ pov: "first" });
  });

  test("boolean-toggle: true/false map to on/off; unpicked follows the defaultValue truthiness", () => {
    expect(resolveUserMacroInputs([toggle], { grim: true }, { prng: seq() }).bindings).toEqual({ grim: "grim and dark" });
    expect(resolveUserMacroInputs([toggle], { grim: false }, { prng: seq() }).bindings).toEqual({ grim: "light" });
    expect(resolveUserMacroInputs([toggle], {}, { prng: seq() }).bindings).toEqual({ grim: "light" });
    const defaultOn = { ...toggle, defaultValue: "on" };
    expect(resolveUserMacroInputs([defaultOn], {}, { prng: seq() }).bindings).toEqual({ grim: "grim and dark" });
  });

  test("multi-select: picks join by the separator in pick order; [] is a real none; unpicked uses the default", () => {
    expect(resolveUserMacroInputs([multi], { themes: ["loss", "war"] }, { prng: seq() }).bindings).toEqual({ themes: "loss + war" });
    expect(resolveUserMacroInputs([multi], { themes: [] }, { prng: seq() }).bindings).toEqual({ themes: "" });
    expect(resolveUserMacroInputs([multi], {}, { prng: seq() }).bindings).toEqual({ themes: "war" });
  });

  test("static kinds never draw — the prng is untouched and draws stay empty", () => {
    let called = 0;
    const prng = (): number => {
      called += 1;
      return 0;
    };
    const { draws } = resolveUserMacroInputs([single, toggle, multi], { pov: "first" }, { prng });
    expect(called).toBe(0);
    expect(draws).toEqual({});
  });
});

// ── random-pick: seeded draw + freeze-at-commit replay (the standout #24 mechanic) ───────────────

describe("random-pick — determinism + freeze-at-commit", () => {
  const pool = input({
    kind: "random-pick",
    name: "twist",
    options: [
      { label: "A", value: "betrayal" },
      { label: "B", value: "storm" },
      { label: "C", value: "reunion" },
    ],
  });

  test("the draw rides the injected PRNG over the SELECTED pool in options order", () => {
    // Selection wire-order is irrelevant: the pool is options-ordered ∩ selection = [betrayal, reunion].
    const { bindings, draws } = resolveUserMacroInputs([pool], { twist: ["reunion", "betrayal"] }, { prng: seq(0.6) });
    expect(bindings).toEqual({ twist: "reunion" });
    expect(draws).toEqual({ twist: "reunion" });
  });

  test("an empty/foreign-only selection falls back to ALL options (a pool can never be dead)", () => {
    expect(resolveUserMacroInputs([pool], {}, { prng: seq(0) }).bindings).toEqual({ twist: "betrayal" });
    expect(resolveUserMacroInputs([pool], { twist: ["nonsense"] }, { prng: seq(0.99) }).bindings).toEqual({ twist: "reunion" });
  });

  test("a FROZEN draw replays byte-exact (a swipe re-draws NOTHING); a new turn draws fresh", () => {
    // Turn commit: a fresh draw happens and is reported for freezing.
    const first = resolveUserMacroInputs([pool], { twist: ["betrayal", "storm"] }, { prng: seq(0.9) });
    expect(first.draws).toEqual({ twist: "storm" });
    // Swipe replay: the frozen draw wins — a DIFFERENT prng cannot change it, and no fresh draw is made.
    const swipe = resolveUserMacroInputs([pool], { twist: ["betrayal", "storm"] }, { prng: seq(0), frozenDraws: first.draws });
    expect(swipe.bindings).toEqual({ twist: "storm" });
    expect(swipe.draws).toEqual({});
    // A new turn (no frozen record) draws fresh from the pool.
    const next = resolveUserMacroInputs([pool], { twist: ["betrayal", "storm"] }, { prng: seq(0) });
    expect(next.bindings).toEqual({ twist: "betrayal" });
    expect(next.draws).toEqual({ twist: "betrayal" });
  });

  test("an option-less random-pick resolves empty (nothing to draw from)", () => {
    const bare = input({ kind: "random-pick", name: "x" });
    expect(resolveUserMacroInputs([bare], {}, { prng: seq() }).bindings).toEqual({ x: "" });
  });

  test("an unthreaded input falls back to a per-render default resolution riding ctx.random", () => {
    const registry = registryWith([def({ name: "spin", body: "[{{twist}}]", inputs: [pool] })]);
    expect(processMacros("{{spin}}", opts({ random: seq(0.99) }), registry)).toBe("[reunion]");
    expect(processMacros("{{spin}}", opts({ random: seq(0) }), registry)).toBe("[betrayal]");
  });
});
