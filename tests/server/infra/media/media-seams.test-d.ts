// @subject packages/server/src/infra/media/index.ts
import type { InferenceDeps } from "@orb/inference";
import type { ScheduleOp } from "@orb/kit/time";
import type * as media from "@orb/server/infra/media";
import { expectTypeOf, test } from "vitest";

test("the video preparer is built from the root's timer and child environment, and no module instance holds an ambient deadline", () => {
  expectTypeOf<Parameters<typeof media.createVideoPreparer>>().toEqualTypeOf<[ScheduleOp, InferenceDeps["env"]["childProcessEnv"]]>();
  expectTypeOf<ReturnType<typeof media.createVideoPreparer>>().toEqualTypeOf<media.PrepareVideo>();
  expectTypeOf<"prepareVideo">().not.toExtend<keyof typeof media>();
});
