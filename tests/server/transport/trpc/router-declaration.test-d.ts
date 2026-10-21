import type { AppRouter } from "@orb/server";
import type { TRPCClient } from "@trpc/client";
import { expectTypeOf, test } from "vitest";
import type { appRouter } from "#server/transport/trpc/router.ts";

test("the published declaration preserves every client procedure input, output, subscription and error", () => {
  expectTypeOf<TRPCClient<AppRouter>>().toEqualTypeOf<TRPCClient<typeof appRouter>>();
  expectTypeOf<AppRouter["_def"]["_config"]["$types"]["errorShape"]>().toEqualTypeOf<(typeof appRouter)["_def"]["_config"]["$types"]["errorShape"]>();
  expectTypeOf<keyof AppRouter["_def"]["_config"]["$types"]["ctx"]>().toEqualTypeOf<never>();
});
