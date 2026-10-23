import type { UpdateCheck } from "@orb/kit/version-identity";
import { expectTypeOf, test } from "vitest";
import type { MacroArgViolation } from "#kit/macro/types.ts";

test("macro type errors require argument identity while arity errors stay call-scoped", () => {
  type Detail = Pick<MacroArgViolation, "macro" | "message">;
  expectTypeOf<Detail & { kind: "bad-type" }>().not.toExtend<MacroArgViolation>();
  expectTypeOf<Detail & { kind: "bad-type"; argIndex: number; argName: string }>().toExtend<MacroArgViolation>();
  expectTypeOf<Detail & { kind: "missing-required"; argIndex: number }>().not.toExtend<MacroArgViolation>();
  expectTypeOf<Detail & { kind: "list-bounds" }>().toExtend<MacroArgViolation>();
});

test("update verdicts correlate upstream identity and explanatory failure", () => {
  expectTypeOf<{ status: "behind"; local: string; remote: null; reason: null }>().not.toExtend<UpdateCheck>();
  expectTypeOf<{ status: "unknown"; local: string; remote: null; reason: null }>().not.toExtend<UpdateCheck>();
  expectTypeOf<{ status: "unknown"; local: string; remote: null; reason: string }>().toExtend<UpdateCheck>();
});
