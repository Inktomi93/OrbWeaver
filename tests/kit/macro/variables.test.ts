// D46 runtime-variable model (kit) — the shared mutation semantics (`applyVarOp`), the replay fold
// (`foldVarOps`), and the op-log capture the mutation handlers push (`ctx.opLog`). These are the primitives the
// chat domain persists per-variant + folds along the selected-variant chain to kill the swipe-clobber (#3263).

import type { MacroDiagnostic, MacroEnv, VarOp } from "@orb/kit/macro";
import { applyVarOp, foldVarOps, processMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures.ts";

// ── applyVarOp — the ONE mutation-semantics home ──────────────────────────────────────────────

test("applyVarOp set/add/inc/dec/delete mutate env in place", () => {
  const env: MacroEnv = {};
  applyVarOp(env, { op: "set", key: "x", value: "hi" });
  expect(env["x"]).toBe("hi");
  applyVarOp(env, { op: "add", key: "x", value: " there" });
  expect(env["x"]).toBe("hi there");
  applyVarOp(env, { op: "set", key: "n", value: "5" });
  applyVarOp(env, { op: "inc", key: "n" });
  expect(env["n"]).toBe("6");
  applyVarOp(env, { op: "dec", key: "n" });
  expect(env["n"]).toBe("5");
  applyVarOp(env, { op: "delete", key: "x" });
  expect(Object.hasOwn(env, "x")).toBe(false);
});

// #1557, OWNER RULING: ALIGN with #1420's complete-bounded-integer refusal — inc/dec need a whole number
// or they refuse (leave the stored value untouched) rather than silently rebasing to 0. An ABSENT variable
// is still a fresh counter at 0 (that is not corruption, there is nothing to rebase away from); a variable
// holding a non-integer string IS corruption and `applyVarOp` says so via its boolean return, never by
// inventing a value.
test("applyVarOp inc/dec: an ABSENT key is a fresh counter at 0, a NON-INTEGER key is a refusal", () => {
  const env: MacroEnv = { junk: "not-a-number" };
  expect(applyVarOp(env, { op: "inc", key: "fresh" })).toBe(true);
  expect(env["fresh"]).toBe("1");
  expect(applyVarOp(env, { op: "dec", key: "junk" })).toBe(false);
  expect(env["junk"]).toBe("not-a-number"); // untouched — no silent rebase to -1
});

// {{incvar}}/{{decvar}} render a VISIBLE diagnostic no-op on a non-integer current value (#1557) — the
// author sees the unchanged number AND a diagnostic, never a value they didn't write.
test("{{incvar}}/{{decvar}} refuse a non-integer current value: byte-identical render + a diagnostic", () => {
  const env: MacroEnv = { junk: "not-a-number" };
  const diagnostics: MacroDiagnostic[] = [];
  const ctx = { char: "C", user: "U", persona: "", scenario: "", env, diagnostics };
  expect(processMacros("{{incvar::junk}}", ctx)).toBe("not-a-number");
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.code).toBe("non-integer-var");
  expect(env["junk"]).toBe("not-a-number");

  diagnostics.length = 0;
  expect(processMacros("{{decvar::junk}}", ctx)).toBe("not-a-number");
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.code).toBe("non-integer-var");
});

// ── foldVarOps — deterministic replay over ordered per-variant deltas ──────────────────────────

test("foldVarOps replays ordered deltas into the string-valued cache", () => {
  const deltas: VarOp[][] = [
    [{ op: "set", key: "mood", value: "calm" }],
    [
      { op: "set", key: "mood", value: "tense" },
      { op: "inc", key: "beats" },
    ],
    [{ op: "inc", key: "beats" }],
  ];
  expect(foldVarOps(deltas)).toEqual({ mood: "tense", beats: "2" });
});

test("foldVarOps is deterministic + order-sensitive (later ops win)", () => {
  const a: VarOp[][] = [[{ op: "set", key: "x", value: "1" }], [{ op: "set", key: "x", value: "2" }]];
  const b: VarOp[][] = [[{ op: "set", key: "x", value: "2" }], [{ op: "set", key: "x", value: "1" }]];
  expect(foldVarOps(a)).toEqual({ x: "2" });
  expect(foldVarOps(b)).toEqual({ x: "1" });
  // Pure: same input → same output, no shared state.
  expect(foldVarOps(a)).toEqual(foldVarOps(a));
});

test("foldVarOps: a delete rewinds a key set by an earlier delta", () => {
  const deltas: VarOp[][] = [[{ op: "set", key: "flag", value: "on" }], [{ op: "delete", key: "flag" }]];
  expect(foldVarOps(deltas)).toEqual({});
});

// ── op-log capture — the handlers push each op onto ctx.opLog (the per-turn delta source) ───────

test("mutation handlers record ops onto ctx.opLog when present", () => {
  const opLog: VarOp[] = [];
  processMacros("{{setvar::a::1}}{{addvar::a::2}}{{incvar::n}}{{decvar::n}}{{deletevar::a}}", {
    char: "C",
    user: "U",
    persona: "",
    scenario: "",
    env: {},
    opLog,
  });
  expect(opLog).toEqual([
    { op: "set", key: "a", value: "1" },
    { op: "add", key: "a", value: "2" },
    { op: "inc", key: "n" },
    { op: "dec", key: "n" },
    { op: "delete", key: "a" },
  ]);
});

test("the recorded op-log folds back to the same env the live pass produced", () => {
  const opLog: VarOp[] = [];
  const env: MacroEnv = {};
  processMacros("{{setvar::x::hi}}{{incvar::c}}{{incvar::c}}", {
    char: "C",
    user: "U",
    persona: "",
    scenario: "",
    env,
    opLog,
  });
  // Record-time (live env) and replay-time (fold of the captured log) agree — the ONE `applyVarOp` home.
  expect(foldVarOps([opLog])).toEqual({ x: "hi", c: "2" });
  expect(env).toEqual({ x: "hi", c: "2" });
});

test("absent opLog ⇒ handlers still mutate env, record nothing (preview posture)", () => {
  const env: MacroEnv = {};
  processMacros("{{setvar::x::1}}", { char: "C", user: "U", persona: "", scenario: "", env });
  expect(env["x"]).toBe("1");
});

// ── #1564 — RESERVED PROPERTY NAMES ARE ORDINARY VARIABLE NAMES ────────────────────────────────
// A variable key is length-validated and nothing else at every door, so `__proto__` is a legal name. With
// plain property syntax the plane got it wrong BOTH ways: `env[key] = value` hit the setter inherited from
// `Object.prototype` and created no own property (the write vanished, including out of `Object.entries` and
// therefore out of `chats.runtime_variables`), and `env[key]` answered `Object.prototype` — an OBJECT where
// every caller expects a string. `{{hasvar}}` has always used `Object.hasOwn`, which is precisely why
// `hasvar::__proto__` said "false" while the same env's `getvar::__proto__` said "[object Object]".

test("applyVarOp set/add/delete handle __proto__ as an ordinary OWN key", () => {
  const env: MacroEnv = {};
  applyVarOp(env, { op: "set", key: "__proto__", value: "13" });
  expect(Object.hasOwn(env, "__proto__")).toBe(true);
  expect(env["__proto__"]).toBe("13");
  // The prototype chain is untouched — this defines an own property, it does not reparent the object.
  expect(Object.getPrototypeOf(env)).toBe(Object.prototype);

  applyVarOp(env, { op: "add", key: "__proto__", value: "7" });
  expect(env["__proto__"]).toBe("137"); // and NOT "[object Object]7", the pre-fix inherited read

  applyVarOp(env, { op: "delete", key: "__proto__" });
  expect(Object.hasOwn(env, "__proto__")).toBe(false);
});

test("applyVarOp inc/dec on __proto__ count from the OWN value, never from Object.prototype", () => {
  const env: MacroEnv = {};
  applyVarOp(env, { op: "set", key: "__proto__", value: "5" });
  applyVarOp(env, { op: "inc", key: "__proto__" });
  expect(env["__proto__"]).toBe("6");
  applyVarOp(env, { op: "dec", key: "__proto__" });
  expect(env["__proto__"]).toBe("5");
  // A key the env does NOT own is the fresh-counter case, not an inherited-member read: parse-or-zero over
  // `undefined`, exactly as for any other absent key. (The parse-or-zero coercion itself is #1557.)
  applyVarOp(env, { op: "inc", key: "toString" });
  expect(env["toString"]).toBe("1");
});

test("foldVarOps carries a __proto__ key all the way into the durable cache", () => {
  const folded = foldVarOps([[{ op: "set", key: "__proto__", value: "13" }], [{ op: "inc", key: "beats" }]]);
  expect(Object.hasOwn(folded, "__proto__")).toBe(true);
  expect(folded["__proto__"]).toBe("13");
  // THE DURABLE HALF: the cache is JSON-serialized onto `chats.runtime_variables`, and a key that is not an
  // own property is simply absent from the row — the write reported success and the value was gone.
  const roundTripped = JSON.parse(JSON.stringify(folded)) as Record<string, string>;
  expect(roundTripped["__proto__"]).toBe("13");
});

test("{{getvar}} and {{hasvar}} agree about __proto__ — and neither reads an inherited member", () => {
  const env: MacroEnv = {};
  const ctx = { char: "C", user: "U", persona: "", scenario: "", env };
  // Before any write both say "absent": hasvar renders "", getvar renders "" (NOT "[object Object]").
  expect(processMacros("[{{getvar::__proto__}}][{{hasvar::__proto__}}]", ctx)).toBe("[][]");
  // A bare `{{toString}}` is a plane lookup too, and an inherited METHOD is not this vocabulary: the lookup
  // now answers `undefined`, so the evaluator's unknown-macro path leaves the token verbatim. Before the own-
  // key read it resolved to `Object.prototype.toString` and rendered the function's source into the prompt.
  expect(processMacros("[{{toString}}]", ctx)).toBe("[{{toString}}]");

  processMacros("{{setvar::__proto__::13}}", ctx);
  expect(processMacros("[{{getvar::__proto__}}][{{hasvar::__proto__}}]", ctx)).toBe("[13][true]");
});
