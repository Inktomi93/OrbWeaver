// @subject packages/server/src/infra/network/egress.ts
import type { ShareGraphOptions } from "@orb/server/domain/share";
import type { installEgressFirewall, ScopedEgressOptions } from "@orb/server/infra/network";
import { expectTypeOf, test } from "vitest";

type NetworkSeam = "fetch" | "resolver";

test("a scoped egress requires its fetch and resolver, so no egress reaches the global fetch or real DNS by omission", () => {
  expectTypeOf<Pick<ScopedEgressOptions, NetworkSeam>>().toEqualTypeOf<Required<Pick<ScopedEgressOptions, NetworkSeam>>>();
  expectTypeOf<undefined>().not.toExtend<ScopedEgressOptions["fetch"]>();
  expectTypeOf<undefined>().not.toExtend<ScopedEgressOptions["resolver"]>();
  expectTypeOf<Parameters<typeof installEgressFirewall>>().toEqualTypeOf<[ScopedEgressOptions]>();
  const fetch: ScopedEgressOptions["fetch"] = () => Promise.reject(new Error("no fetch"));
  const resolver: ScopedEgressOptions["resolver"] = () => Promise.reject(new Error("no resolve"));
  // @ts-expect-error an egress without `resolver` must not compile
  const withoutResolver: Pick<ScopedEgressOptions, NetworkSeam> = { fetch };
  // @ts-expect-error an egress without `fetch` must not compile
  const withoutFetch: Pick<ScopedEgressOptions, NetworkSeam> = { resolver };
  expectTypeOf([withoutResolver, withoutFetch]).toBeArray();
});

test("the share graph requires its network execution, so its egress is built from the root's seams", () => {
  expectTypeOf<Pick<ShareGraphOptions, "networkExecution">>().toEqualTypeOf<Required<Pick<ShareGraphOptions, "networkExecution">>>();
  expectTypeOf<ShareGraphOptions["networkExecution"]>().toEqualTypeOf<Pick<ScopedEgressOptions, NetworkSeam>>();
});
