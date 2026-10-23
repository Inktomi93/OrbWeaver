// @subject packages/server/src/infra/timers/scope.ts
import type { TimerScheduler } from "@orb/kit/time";
import type { installEgressFirewall, ScopedEgressOptions } from "@orb/server/infra/network";
import type { PluginHostSeamDeps } from "@orb/server/infra/plugin-host";
import type { createScopedTimers } from "@orb/server/infra/timers";
import { expectTypeOf, test } from "vitest";

test("infra timer scopes require the scheduler they wrap, so none falls back to the real timers", () => {
  expectTypeOf<Parameters<typeof createScopedTimers>>().toEqualTypeOf<[TimerScheduler]>();
  expectTypeOf<Pick<ScopedEgressOptions, "timers" | "buildConnector">>().toEqualTypeOf<Required<Pick<ScopedEgressOptions, "timers" | "buildConnector">>>();
  expectTypeOf<Parameters<typeof installEgressFirewall>[0]>().toEqualTypeOf<ScopedEgressOptions>();
  expectTypeOf<Pick<PluginHostSeamDeps, "timers" | "safeFetch">>().toEqualTypeOf<Required<Pick<PluginHostSeamDeps, "timers" | "safeFetch">>>();
  // @ts-expect-error a scoped egress without `timers` or `buildConnector` must not compile
  const egressWithoutTimers: ScopedEgressOptions = {};
  expectTypeOf(egressWithoutTimers).toBeObject();
});
