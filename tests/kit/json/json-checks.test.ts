// @subject packages/kit/src/json/index.ts
import type { JsonValue } from "@orb/kit/json";
import { boundedJsonObjectSchema, JSON_BOUND_REFUSALS, JSON_MAX_DEPTH, JSON_NOT_OBJECT, jsonObjectOf, jsonObjectSchema, parseJsonText } from "@orb/kit/json";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const [MAX_DEPTH, NOT_JSON, CYCLE] = JSON_BOUND_REFUSALS;
// Walked once per path, a diamond this deep is 2^40 visits; walked once per node it is 40.
const DIAMOND_LEVELS = 40;

function nestedArrays(depth: number): JsonValue {
  let value: JsonValue = 1;
  for (let level = 0; level < depth; level += 1) {
    value = [value];
  }
  return value;
}

// Every level holds the level below it twice, as a YAML alias or a built object can.
function diamond(levels: number): JsonValue {
  let value: JsonValue = 1;
  for (let level = 0; level < levels; level += 1) {
    value = { left: value, right: value };
  }
  return value;
}

function refusalOf(value: unknown): string | null {
  const result = boundedJsonObjectSchema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

test("decoded JSON text keeps an overflowing number, deep nesting and own __proto__ keys, and the object guards pass it through as itself", () => {
  const text = `{"__proto__":{"a":1},"big":1e400,"deep":${"[".repeat(5000)}1${"]".repeat(5000)}}`;
  const decoded = present(jsonObjectOf(parseJsonText(text)));

  expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
  expect(decoded["big"]).toBe(Number.POSITIVE_INFINITY);
  expect(jsonObjectSchema.parse(decoded)).toBe(decoded);
  expect(parseJsonText("{not json")).toBeUndefined();
  expect(jsonObjectOf(parseJsonText("[1]"))).toBeNull();
  expect(jsonObjectSchema.safeParse([1]).error?.issues[0]?.message).toBe(JSON_NOT_OBJECT);
});

test("the bounded check refuses past its depth with its code, before a deep value can overflow the stack", () => {
  // The object is depth 0, so a chain of n arrays under one key puts its leaf at depth n + 1.
  const atBound = { value: nestedArrays(JSON_MAX_DEPTH - 1) };
  expect(boundedJsonObjectSchema.parse(atBound)).toBe(atBound);
  expect(refusalOf({ value: nestedArrays(JSON_MAX_DEPTH) })).toBe(MAX_DEPTH);
  expect(refusalOf({ value: nestedArrays(100_000) })).toBe(MAX_DEPTH);
});

test("the bounded check refuses a value no JSON text can hold with its code", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, (): number => 1, new Date(0), new Map()]) {
    expect(refusalOf({ nested: [{ value }] })).toBe(NOT_JSON);
  }
  expect(refusalOf([])).toBe(JSON_NOT_OBJECT);
});

test("a node shared down every level is walked once, and is judged by its depth wherever it appears", () => {
  const shared = { root: diamond(DIAMOND_LEVELS) };
  expect(boundedJsonObjectSchema.parse(shared)).toBe(shared);
  expect(refusalOf({ root: diamond(JSON_MAX_DEPTH) })).toBe(MAX_DEPTH);

  // The chain is first met shallow, where it fits, then again two levels deeper, where its leaf passes the bound.
  const chain = nestedArrays(JSON_MAX_DEPTH - 2);
  expect(refusalOf({ deeper: [[chain]], shallow: chain })).toBe(MAX_DEPTH);
  expect(refusalOf({ shallow: chain, deeper: [[chain]] })).toBe(MAX_DEPTH);
  expect(refusalOf({ shallow: chain, again: chain })).toBeNull();
});

test("a container that holds itself is refused as a cycle", () => {
  const loop: Record<string, unknown> = {};
  loop["left"] = loop;
  loop["right"] = loop;
  expect(refusalOf(loop)).toBe(CYCLE);

  const list: unknown[] = [];
  list.push({ back: list });
  expect(refusalOf({ list })).toBe(CYCLE);
});
