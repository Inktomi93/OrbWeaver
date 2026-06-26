import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "vitest";

test("jsonValueSchema accepts every JSON primitive", () => {
  expect(jsonValueSchema.safeParse("s").success).toBe(true);
  expect(jsonValueSchema.safeParse(1).success).toBe(true);
  expect(jsonValueSchema.safeParse(true).success).toBe(true);
  expect(jsonValueSchema.safeParse(null).success).toBe(true);
});

test("jsonValueSchema accepts deeply nested arrays and objects", () => {
  const nested: JsonValue = { a: [1, "x", true, null, { b: 2 }] };
  expect(jsonValueSchema.safeParse(nested).success).toBe(true);
});

test("jsonValueSchema rejects non-JSON values", () => {
  expect(jsonValueSchema.safeParse(undefined).success).toBe(false);
  expect(jsonValueSchema.safeParse(() => null).success).toBe(false);
  expect(jsonValueSchema.safeParse(10n).success).toBe(false);
  expect(jsonValueSchema.safeParse(Symbol("x")).success).toBe(false);
});

test("a parsed value is usable as a JsonValue", () => {
  const parsed = jsonValueSchema.parse({ ok: true });
  // The schema's output type is JsonValue — this assignment is the type-level assertion.
  const value: JsonValue = parsed;
  expect(value).toEqual({ ok: true });
});
