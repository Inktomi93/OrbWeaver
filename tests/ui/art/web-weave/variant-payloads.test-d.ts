import { expectTypeOf, test } from "vitest";
import type { WeavePoint, WeaveStrand } from "#ui/art/web-weave/web-weave-geometry.ts";
import type { PreyState } from "#ui/art/web-weave/web-weave-prey.ts";

test("chase modes carry a target but rest does not", () => {
  type Common = Pick<PreyState, "x" | "y" | "angle" | "until" | "placed">;
  expectTypeOf<Common & { mode: "sprint"; target: null }>().not.toExtend<PreyState>();
  expectTypeOf<Common & { mode: "rest"; target: WeavePoint }>().not.toExtend<PreyState>();
  expectTypeOf<Common & { mode: "rest"; target: null }>().toExtend<PreyState>();
  expectTypeOf<Common & { mode: "alert" | "sprint" | "inspect" | "return"; target: WeavePoint }>().toExtend<PreyState>();
});

test("spiral strands require their birth timing and ordinary strands do not borrow it", () => {
  type Common = Pick<WeaveStrand, "pts" | "t0" | "t1" | "width" | "length">;
  expectTypeOf<Common & { kind: "capture" }>().not.toExtend<WeaveStrand>();
  expectTypeOf<Common & { kind: "frame"; vt: readonly number[] }>().not.toExtend<WeaveStrand>();
  expectTypeOf<Common & { kind: "aux" | "capture"; vt: readonly number[] }>().toExtend<WeaveStrand>();
  expectTypeOf<Common & { kind: "bridge" | "frame" | "radius" }>().toExtend<WeaveStrand>();
});
