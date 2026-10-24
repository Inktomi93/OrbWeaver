// @subject packages/server/src/entry/compose/services.ts
import { createIdSource } from "@orb/kit/ids";
import type { createProcessSeams, ServicesDeps } from "@orb/server/entry/compose";
import { createTestEnv } from "@orb/testkit/node/helpers";
import { expectTypeOf, test } from "vitest";

// The seams the real source supplies; each one is named again below so a dropped seam still fails this test.
type ProcessSeam = keyof ReturnType<typeof createProcessSeams>;

const timers: ServicesDeps["timers"] = { timeout: () => () => undefined, timeoutUnref: () => () => undefined, interval: () => () => undefined };
const random = (): number => 0.5;
const randomInt = (max: number): number => max - 1;
const idSource = createIdSource(() => "seeded");
const newOpaqueId = (): string => "opaque";
const buildConnector: ServicesDeps["buildConnector"] = () => (_options, callback) => callback(new Error("no dial"), null);
const networkExecution: ServicesDeps["networkExecution"] = {
  fetch: () => Promise.reject(new Error("no fetch")),
  resolver: () => Promise.reject(new Error("no resolve")),
};
const monotonicNow = (): number => 0;
const env = createTestEnv();
const hostEnvAllowlist = (): Readonly<Record<string, string>> => ({});
const authModeSource: ServicesDeps["authModeSource"] = "default";
declare const logger: ServicesDeps["logger"];

test("the composition root requires every process seam, so a forgotten one cannot fall back to the ambient process", () => {
  expectTypeOf<Pick<ServicesDeps, ProcessSeam>>().toEqualTypeOf<Required<Pick<ServicesDeps, ProcessSeam>>>();
  expectTypeOf<undefined>().not.toExtend<ServicesDeps[ProcessSeam]>();

  const complete: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    randomInt,
    idSource,
    newOpaqueId,
    buildConnector,
    networkExecution,
    monotonicNow,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  expectTypeOf(complete).toExtend<Pick<ServicesDeps, ProcessSeam>>();
  // @ts-expect-error a root without `timers` must not compile
  const withoutTimers: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    random,
    randomInt,
    idSource,
    newOpaqueId,
    buildConnector,
    networkExecution,
    monotonicNow,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  // @ts-expect-error a root without `random` must not compile
  const withoutRandom: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    randomInt,
    idSource,
    newOpaqueId,
    buildConnector,
    networkExecution,
    monotonicNow,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  // @ts-expect-error a root without `randomInt` must not compile
  const withoutRandomInt: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    idSource,
    newOpaqueId,
    buildConnector,
    networkExecution,
    monotonicNow,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  // @ts-expect-error a root without `idSource` must not compile
  const withoutIdSource: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    randomInt,
    newOpaqueId,
    buildConnector,
    networkExecution,
    monotonicNow,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  // @ts-expect-error a root without `newOpaqueId` must not compile
  const withoutNewOpaqueId: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    randomInt,
    idSource,
    buildConnector,
    networkExecution,
    monotonicNow,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  // @ts-expect-error a root without `buildConnector` must not compile
  const withoutBuildConnector: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    randomInt,
    idSource,
    newOpaqueId,
    networkExecution,
    monotonicNow,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  // @ts-expect-error a root without `networkExecution` must not compile
  const withoutNetworkExecution: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    randomInt,
    idSource,
    newOpaqueId,
    buildConnector,
    monotonicNow,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  // @ts-expect-error a root without `monotonicNow` must not compile
  const withoutMonotonicNow: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    randomInt,
    idSource,
    newOpaqueId,
    buildConnector,
    networkExecution,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  // @ts-expect-error a root without `env` must not compile
  const withoutEnv: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    randomInt,
    idSource,
    newOpaqueId,
    buildConnector,
    networkExecution,
    monotonicNow,
    hostEnvAllowlist,
    authModeSource,
  };
  // @ts-expect-error a root without `hostEnvAllowlist` must not compile
  const withoutHostEnvAllowlist: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    randomInt,
    idSource,
    newOpaqueId,
    buildConnector,
    networkExecution,
    monotonicNow,
    env,
    authModeSource,
  };
  // @ts-expect-error a root without `authModeSource` must not compile
  const withoutAuthModeSource: Pick<ServicesDeps, ProcessSeam> = {
    logger,
    timers,
    random,
    randomInt,
    idSource,
    newOpaqueId,
    buildConnector,
    networkExecution,
    monotonicNow,
    env,
    hostEnvAllowlist,
  };
  // @ts-expect-error a root without `logger` must not compile
  const withoutLogger: Pick<ServicesDeps, ProcessSeam> = {
    timers,
    random,
    randomInt,
    idSource,
    newOpaqueId,
    buildConnector,
    networkExecution,
    monotonicNow,
    env,
    hostEnvAllowlist,
    authModeSource,
  };
  expectTypeOf([
    withoutTimers,
    withoutRandom,
    withoutRandomInt,
    withoutIdSource,
    withoutNewOpaqueId,
    withoutBuildConnector,
    withoutNetworkExecution,
    withoutMonotonicNow,
    withoutEnv,
    withoutHostEnvAllowlist,
    withoutAuthModeSource,
    withoutLogger,
  ]).toBeArray();
});
