// @subject packages/server/src/foundation/env/record/index.ts
// Every root-facing deps type requires the parsed env record, so no factory can fall back to the process env.
import type { ShareGraphOptions } from "@orb/server/domain/share";
import type { createHttpApp, ServicesDeps } from "@orb/server/entry/compose";
import type { ENV_KEYS, Env, EnvKey } from "@orb/server/foundation/env/record";
import type { ScopedEgressOptions } from "@orb/server/infra/network";
import type { PluginHostSeamDeps } from "@orb/server/infra/plugin-host";
import { createTestEnv } from "@orb/testkit/node/helpers";
import { expectTypeOf, test } from "vitest";

type HttpAppDeps = Parameters<typeof createHttpApp>[0];

const env = createTestEnv();

test("the composition root, the HTTP app, the scoped egress, the share graph and the plugin host each require the record", () => {
  expectTypeOf<Pick<ServicesDeps, "env">>().toEqualTypeOf<Required<Pick<ServicesDeps, "env">>>();
  expectTypeOf<Pick<HttpAppDeps, "env">>().toEqualTypeOf<Required<Pick<HttpAppDeps, "env">>>();
  expectTypeOf<Pick<ScopedEgressOptions, "env">>().toEqualTypeOf<Required<Pick<ScopedEgressOptions, "env">>>();
  expectTypeOf<Pick<ShareGraphOptions, "env">>().toEqualTypeOf<Required<Pick<ShareGraphOptions, "env">>>();
  expectTypeOf<Pick<PluginHostSeamDeps, "env">>().toEqualTypeOf<Required<Pick<PluginHostSeamDeps, "env">>>();
  expectTypeOf<undefined>().not.toExtend<ServicesDeps["env"]>();
  expectTypeOf<undefined>().not.toExtend<HttpAppDeps["env"]>();
  expectTypeOf<undefined>().not.toExtend<ScopedEgressOptions["env"]>();
  expectTypeOf<undefined>().not.toExtend<ShareGraphOptions["env"]>();
  expectTypeOf<undefined>().not.toExtend<PluginHostSeamDeps["env"]>();
  expectTypeOf(env).toExtend<ServicesDeps["env"]>();
  // @ts-expect-error a scoped egress without its record must not compile
  const withoutEnv: Pick<ScopedEgressOptions, "env"> = {};
  expectTypeOf(withoutEnv).toBeObject();
});

test("the env key tuple is every key the schema reads and nothing the parse derives", () => {
  expectTypeOf<(typeof ENV_KEYS)[number]>().toEqualTypeOf<EnvKey>();
  expectTypeOf<EnvKey>().toEqualTypeOf<Exclude<keyof Env, "DATA_LAYOUT">>();
});
