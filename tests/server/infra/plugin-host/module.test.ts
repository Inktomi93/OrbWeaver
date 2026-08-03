// infra/plugin-host/module — the ONE process-wide QuickJS-ng WASM module (01 §0). Pins that the loader
// is a singleton (one WASM instantiation shared) and that it actually produces working, ISOLATED
// contexts (own globals per context — the property the runtime was chosen for).

import { getPluginQuickJS } from "@orb/server/infra/plugin-host";
import type { QuickJSContext } from "quickjs-emscripten-core";
import { isFail } from "quickjs-emscripten-core";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

/** Eval a string-returning guest expression, disposing the handle. Throws if the guest errored. */
function evalString(ctx: QuickJSContext, code: string): string {
  const result = ctx.evalCode(code);
  if (isFail(result)) {
    const message = ctx.getString(result.error);
    result.error.dispose();
    throw new Error(`guest errored: ${message}`);
  }
  const out = ctx.getString(result.value);
  result.value.dispose();
  return out;
}

describe("getPluginQuickJS", () => {
  test("memoizes one module per process", async () => {
    const a = await getPluginQuickJS();
    const b = await getPluginQuickJS();
    expect(a).toBe(b);
  });

  test("produces a working context that evaluates guest code", async () => {
    const mod = await getPluginQuickJS();
    const ctx = mod.newContext();
    try {
      const result = ctx.evalCode("40 + 2");
      expect(result.error).toBeUndefined();
      const value = result.error ? Number.NaN : ctx.getNumber(result.value);
      (result.error ?? result.value).dispose();
      expect(value).toBe(42);
    } finally {
      ctx.dispose();
    }
  });

  test("contexts are isolated — a global set in one is invisible to another", async () => {
    const mod = await getPluginQuickJS();
    const a = mod.newContext();
    const b = mod.newContext();
    try {
      const setResult = a.evalCode("globalThis.marker = 7");
      (isFail(setResult) ? setResult.error : setResult.value).dispose();
      expect(evalString(a, "typeof globalThis.marker")).toBe("number");
      expect(evalString(b, "typeof globalThis.marker")).toBe("undefined");
    } finally {
      a.dispose();
      b.dispose();
    }
  });
});
