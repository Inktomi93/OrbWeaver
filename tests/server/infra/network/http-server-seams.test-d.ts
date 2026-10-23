// @subject packages/server/src/infra/network/http-server.ts
import type { ScheduleOp } from "@orb/kit/time";
import type { drainHttpServer } from "@orb/server/infra/network";
import { expectTypeOf, test } from "vitest";

test("the bounded drain requires its deadline timer, so a shutdown drain never arms an ambient setTimeout", () => {
  expectTypeOf<Parameters<typeof drainHttpServer>[2]>().toEqualTypeOf<ScheduleOp>();
  expectTypeOf<undefined>().not.toExtend<Parameters<typeof drainHttpServer>[2]>();
});
