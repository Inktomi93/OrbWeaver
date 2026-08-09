import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { Unprojected, WireReady } from "@orb/kit/json-schema";
import { projectJsonSchema, scrubWireSchema } from "@orb/kit/json-schema";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";

// Type-level pins for the D79 structured-output wire-closure invariant (LANE #61): `ResponseFormat.schema`
// accepts ONLY a `WireReady`, and `projectJsonSchema` is the sole producer of that brand — so a raw / stored
// (`Unprojected`) schema at a send-site is a `tsc` error, not a doc-note (task #41 → compile-time).

test("projectJsonSchema is the ONE producer of WireReady, and its output fills ResponseFormat.schema", () => {
  expectTypeOf(projectJsonSchema(z.object({ a: z.string() }))).toEqualTypeOf<WireReady>();
  const ok: ResponseFormat = { name: "x", schema: projectJsonSchema(z.object({ a: z.string() })) };
  expectTypeOf(ok.schema).toEqualTypeOf<WireReady>();
});

test("scrubWireSchema is brand-transparent — a WireReady in stays WireReady out (the strict-compatible arm)", () => {
  expectTypeOf(scrubWireSchema(projectJsonSchema(z.object({ a: z.string() })), "strict-compatible").schema).toEqualTypeOf<WireReady>();
});

test("a raw / stored (Unprojected) schema CANNOT fill ResponseFormat.schema — the compile-time enforcement", () => {
  // An Unprojected blob is not a WireReady — the type gap the send-site invariant rests on.
  expectTypeOf<Unprojected>().not.toMatchTypeOf<WireReady>();
  const stored: Unprojected = { type: "object", properties: {} };
  // @ts-expect-error — a stored/unprojected blob is not WireReady; it must go through projectJsonSchema first.
  const fromStored: ResponseFormat = { name: "x", schema: stored };
  void fromStored;
  // @ts-expect-error — an inline raw JSON-Schema literal is likewise refused at the send-site (phantom brand).
  const fromLiteral: ResponseFormat = { name: "x", schema: { type: "object" } };
  void fromLiteral;
});

test("the brand is one-directional — WireReady IS a Record, a Record is NOT a WireReady", () => {
  expectTypeOf<WireReady>().toMatchTypeOf<Record<string, unknown>>();
  expectTypeOf<Record<string, unknown>>().not.toMatchTypeOf<WireReady>();
});
