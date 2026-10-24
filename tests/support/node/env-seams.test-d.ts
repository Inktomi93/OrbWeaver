// The raw `env` door takes only raw rows: a key with a named option, a composed key or a deploy-only key fails to compile.
import { expectTypeOf, test } from "vitest";
import type { ServerHarnessOptions } from "./server.ts";

type RawKeys = keyof NonNullable<ServerHarnessOptions["env"]>;

declare const compose: (options: ServerHarnessOptions) => void;

test("the env door names raw rows only", () => {
  expectTypeOf<"AUTH_MODE">().toExtend<RawKeys>();
  expectTypeOf<"PORT">().not.toExtend<RawKeys>();
  expectTypeOf<"DATA_DIR">().not.toExtend<RawKeys>();
  expectTypeOf<"LOG_LEVEL">().not.toExtend<RawKeys>();
  compose({ env: { ["AUTH_MODE"]: "local" } });
  // @ts-expect-error — `PORT` is deploy-only: the root listens through `listen()`.
  compose({ env: { ["PORT"]: "1" } });
});
