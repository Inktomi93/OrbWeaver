// D46 runtime-variable model (kit) — the shared mutation semantics (`applyVarOp`), the replay fold
// (`foldVarOps`), and the op-log capture the mutation handlers push (`ctx.opLog`). These are the primitives the
// chat domain persists per-variant + folds along the selected-variant chain to kill the swipe-clobber (#3263).

import type { MacroEnv, VarOp } from "@orb/kit/macro";
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

test("applyVarOp inc/dec parse-or-zero on a missing/non-numeric key", () => {
  const env: MacroEnv = { junk: "not-a-number" };
  applyVarOp(env, { op: "inc", key: "fresh" });
  expect(env["fresh"]).toBe("1");
  applyVarOp(env, { op: "dec", key: "junk" });
  expect(env["junk"]).toBe("-1");
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
