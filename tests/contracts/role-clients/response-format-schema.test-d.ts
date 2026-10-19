// D79: the wire `schema` field is filled only by `projectJsonSchema`. WireReady is a phantom brand, so a hand-written
// JSON-Schema literal fails to compile at any indirection depth instead of being found by a gate afterwards.
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { Unprojected, WireReady } from "@orb/kit/json-schema";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";

const OBJECT = "object";
const KEY = "schema";
const local = { type: "object", properties: {} };
const localConstType = { type: OBJECT, properties: {} };
declare const stored: Unprojected;

test("a projected schema fills the wire field", () => {
  const projected: ResponseFormat = { name: "x", schema: projectJsonSchema(z.object({ a: z.string() })) };
  const viaConst = projectJsonSchema(z.object({ a: z.string() }));
  const held: ResponseFormat = { name: "x", schema: viaConst };
  expectTypeOf(projected.schema).toEqualTypeOf<WireReady>();
  expectTypeOf(held).toEqualTypeOf<ResponseFormat>();
});

test("a hand-written JSON-Schema literal is refused, however it is held", () => {
  // @ts-expect-error an inline literal
  const direct: ResponseFormat = { name: "x", schema: { type: "object", properties: {} } };
  // @ts-expect-error behind an `as const` wrap
  const wrapped: ResponseFormat = { name: "x", schema: { type: "object", properties: {} } as const };
  // @ts-expect-error held in a module-local const
  const indirect: ResponseFormat = { name: "x", schema: local };
  // @ts-expect-error the `type` value held in a const
  const constType: ResponseFormat = { name: "x", schema: localConstType };
  // @ts-expect-error a computed key names the same field
  const computed: ResponseFormat = { name: "x", [KEY]: { type: "object" } };
  expectTypeOf([direct, wrapped, indirect, constType, computed]).toEqualTypeOf<ResponseFormat[]>();
});

test("a stored or authored blob cannot fill the wire field without projection", () => {
  // @ts-expect-error Unprojected can never satisfy WireReady
  const raw: ResponseFormat = { name: "x", schema: stored };
  // @ts-expect-error a spread of the unprojected blob is still unprojected
  const spread: ResponseFormat = { name: "x", schema: { ...stored } };
  expectTypeOf([raw, spread]).toEqualTypeOf<ResponseFormat[]>();
});
