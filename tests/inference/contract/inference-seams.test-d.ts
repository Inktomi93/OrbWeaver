// @subject packages/inference/src/contract/runtime.ts
import type { InferenceDeps } from "@orb/inference";
import { expectTypeOf, test } from "vitest";

// The runtime seams the server root supplies from its process seams.
type InferenceSeam = keyof Pick<InferenceDeps, "scheduleTimeout" | "scheduleTimeoutUnref" | "random">;

const scheduleTimeout: InferenceDeps["scheduleTimeout"] = () => () => undefined;
const random = (): number => 0.5;

test("the inference runtime requires its timers and jitter source, so no backend falls back to the real ones", () => {
  expectTypeOf<Pick<InferenceDeps, InferenceSeam>>().toEqualTypeOf<Required<Pick<InferenceDeps, InferenceSeam>>>();
  expectTypeOf<undefined>().not.toExtend<InferenceDeps[InferenceSeam]>();
  const complete: Pick<InferenceDeps, InferenceSeam> = { scheduleTimeout, scheduleTimeoutUnref: scheduleTimeout, random };
  expectTypeOf(complete).toExtend<Pick<InferenceDeps, InferenceSeam>>();
  // @ts-expect-error a runtime without `scheduleTimeout` must not compile
  const withoutTimeout: Pick<InferenceDeps, InferenceSeam> = { scheduleTimeoutUnref: scheduleTimeout, random };
  // @ts-expect-error a runtime without `scheduleTimeoutUnref` must not compile
  const withoutUnref: Pick<InferenceDeps, InferenceSeam> = { scheduleTimeout, random };
  // @ts-expect-error a runtime without `random` must not compile
  const withoutRandom: Pick<InferenceDeps, InferenceSeam> = { scheduleTimeout, scheduleTimeoutUnref: scheduleTimeout };
  expectTypeOf([withoutTimeout, withoutUnref, withoutRandom]).toBeArray();
});
