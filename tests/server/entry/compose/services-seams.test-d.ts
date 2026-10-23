// @subject packages/server/src/entry/compose/services.ts
import { createIdSource } from "@orb/kit/ids";
import type { createProcessSeams, ServicesDeps } from "@orb/server/entry/compose";
import { expectTypeOf, test } from "vitest";

// The seams the real source supplies; each one is named again below so a dropped seam still fails this test.
type ProcessSeam = keyof ReturnType<typeof createProcessSeams>;

const timers: ServicesDeps["timers"] = { timeout: () => () => undefined, timeoutUnref: () => () => undefined, interval: () => () => undefined };
const random = (): number => 0.5;
const randomInt = (max: number): number => max - 1;
const idSource = createIdSource(() => "seeded");
const newOpaqueId = (): string => "opaque";

test("the composition root requires every process seam, so a forgotten one cannot fall back to the ambient process", () => {
  expectTypeOf<Pick<ServicesDeps, ProcessSeam>>().toEqualTypeOf<Required<Pick<ServicesDeps, ProcessSeam>>>();
  expectTypeOf<undefined>().not.toExtend<ServicesDeps[ProcessSeam]>();

  const complete: Pick<ServicesDeps, ProcessSeam> = { timers, random, randomInt, idSource, newOpaqueId };
  expectTypeOf(complete).toExtend<Pick<ServicesDeps, ProcessSeam>>();
  // @ts-expect-error a root without `timers` must not compile
  const withoutTimers: Pick<ServicesDeps, ProcessSeam> = { random, randomInt, idSource, newOpaqueId };
  // @ts-expect-error a root without `random` must not compile
  const withoutRandom: Pick<ServicesDeps, ProcessSeam> = { timers, randomInt, idSource, newOpaqueId };
  // @ts-expect-error a root without `randomInt` must not compile
  const withoutRandomInt: Pick<ServicesDeps, ProcessSeam> = { timers, random, idSource, newOpaqueId };
  // @ts-expect-error a root without `idSource` must not compile
  const withoutIdSource: Pick<ServicesDeps, ProcessSeam> = { timers, random, randomInt, newOpaqueId };
  // @ts-expect-error a root without `newOpaqueId` must not compile
  const withoutNewOpaqueId: Pick<ServicesDeps, ProcessSeam> = { timers, random, randomInt, idSource };
  expectTypeOf([withoutTimers, withoutRandom, withoutRandomInt, withoutIdSource, withoutNewOpaqueId]).toBeArray();
});
