// @orb/kit/custom-parameters — the Layer-2 prototype-pollution defense. PD-101: proves
// `deepMergeRequestBody` cannot be used to pollute `Object.prototype` via a `__proto__`/`constructor`/
// `prototype` key at ANY nesting depth, on EITHER side of the merge, while legitimate nested keys still
// merge (the defense-in-depth requirement — no behavior change for valid input).

import { deepMergeRequestBody } from "@orb/kit/custom-parameters";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("deepMergeRequestBody — prototype-pollution defense (PD-101 Layer 2)", () => {
  test("a top-level __proto__ on the patch does not pollute Object.prototype", () => {
    const base = { model: "m" };
    const patch = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
    const merged = deepMergeRequestBody(base, patch);
    expect((Object.prototype as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(merged["polluted"]).toBeUndefined();
    expect(merged).toEqual({ model: "m" });
  });

  test("a nested __proto__ (several levels deep) does not pollute Object.prototype", () => {
    const base = { a: { b: { c: 1 } } };
    const patch = JSON.parse('{"a":{"b":{"__proto__":{"polluted":true}}}}') as Record<string, unknown>;
    const merged = deepMergeRequestBody(base, patch);
    expect((Object.prototype as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(merged).toEqual({ a: { b: { c: 1 } } });
  });

  test("constructor/prototype keys are dropped as no-ops at every level, on either side", () => {
    const base = { constructor: { evil: true }, safe: 1 };
    const patch = { prototype: { evil: true }, safe: 2 };
    const merged = deepMergeRequestBody(base, patch);
    expect(merged).toEqual({ safe: 2 });
    expect(Object.prototype).not.toHaveProperty("evil");
  });

  test("a forbidden key survives neither side even when the OTHER side is clean", () => {
    // Forbidden on base only.
    // @orb-waive no-test-fabrication(Record<string, unknown>): `__proto__` in an object-literal position sets the prototype, not a data key — the cast smuggles it in as a plain property for THIS probe. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    expect(deepMergeRequestBody({ __proto__: { x: 1 } } as Record<string, unknown>, { a: 1 })).toEqual({ a: 1 });
    // Forbidden on patch only.
    expect(deepMergeRequestBody({ a: 1 }, { constructor: { x: 1 } })).toEqual({ a: 1 });
  });

  test("legitimate nested keys merge correctly — patch wins at the leaf, base survives elsewhere", () => {
    const base = { model: "m", reasoning: { effort: "low", enabled: true }, keep: 1 };
    const patch = { reasoning: { effort: "high" }, extra: "e" };
    expect(deepMergeRequestBody(base, patch)).toEqual({
      model: "m",
      reasoning: { effort: "high", enabled: true },
      keep: 1,
      extra: "e",
    });
  });

  test("a type mismatch (object vs primitive) replaces the whole node with the patch value", () => {
    expect(deepMergeRequestBody({ reasoning: { effort: "low" } }, { reasoning: "none" })).toEqual({
      reasoning: "none",
    });
  });

  test("arrays replace rather than concatenate (patch wins as a whole value)", () => {
    expect(deepMergeRequestBody({ stop: ["a", "b"] }, { stop: ["c"] })).toEqual({ stop: ["c"] });
  });

  test("a key present only on base (absent from patch) survives untouched", () => {
    expect(deepMergeRequestBody({ model: "m", stream: true }, { temperature: 0.5 })).toEqual({
      model: "m",
      stream: true,
      temperature: 0.5,
    });
  });

  test("a poison key nested inside a subtree present on ONLY ONE side is still stripped (regression: a whole-value copy must recurse too, not just merged nodes)", () => {
    const patchOnly = JSON.parse('{"nested":{"constructor":{"polluted":true},"ok":1}}') as Record<string, unknown>;
    expect(deepMergeRequestBody({ model: "m" }, patchOnly)).toEqual({
      model: "m",
      nested: { ok: 1 },
    });

    const baseOnly = JSON.parse('{"nested":{"__proto__":{"polluted":true},"ok":1}}') as Record<string, unknown>;
    expect(deepMergeRequestBody(baseOnly, { model: "m" })).toEqual({
      nested: { ok: 1 },
      model: "m",
    });
  });
});
