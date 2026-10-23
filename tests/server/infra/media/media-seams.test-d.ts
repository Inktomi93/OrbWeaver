// @subject packages/server/src/infra/media/index.ts
import type { ScheduleOp } from "@orb/kit/time";
import type * as media from "@orb/server/infra/media";
import { expectTypeOf, test } from "vitest";

test("the video preparer is built from the root's timer, and no module instance holds an ambient deadline", () => {
  expectTypeOf<Parameters<typeof media.createVideoPreparer>>().toEqualTypeOf<[ScheduleOp]>();
  expectTypeOf<ReturnType<typeof media.createVideoPreparer>>().toEqualTypeOf<media.PrepareVideo>();
  expectTypeOf<"prepareVideo">().not.toExtend<keyof typeof media>();
});
