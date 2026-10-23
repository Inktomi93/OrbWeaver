// @subject packages/server/src/infra/plugin-host/process-runtime.ts
import type { PluginHostSeamDeps } from "@orb/server/infra/plugin-host";
import { expectTypeOf, test } from "vitest";

test("the process plugin host requires its monotonic clock, so a broker connect deadline never reads performance.now", () => {
  expectTypeOf<Pick<PluginHostSeamDeps, "monotonicNow">>().toEqualTypeOf<Required<Pick<PluginHostSeamDeps, "monotonicNow">>>();
  expectTypeOf<undefined>().not.toExtend<PluginHostSeamDeps["monotonicNow"]>();
  // @ts-expect-error host seams without `monotonicNow` must not compile
  const withoutMonotonicNow: Pick<PluginHostSeamDeps, "monotonicNow"> = {};
  expectTypeOf(withoutMonotonicNow).toBeObject();
});
