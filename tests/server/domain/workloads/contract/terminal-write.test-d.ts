import { expectTypeOf, test } from "vitest";
import type { markTerminal } from "#server/domain/workloads/persistence/queries.ts";

type Write = Parameters<typeof markTerminal>[1];
type Identity = Pick<Write, "id" | "now">;
test("terminal status determines persisted payload without excluding void success", () => {
  expectTypeOf<Identity & { status: "succeeded"; error: string }>().not.toExtend<Write>();
  expectTypeOf<Identity & { status: "failed" }>().not.toExtend<Write>();
  expectTypeOf<Identity & { status: "worker_died" }>().not.toExtend<Write>();
  expectTypeOf<Identity & { status: "cancelled"; result: string }>().not.toExtend<Write>();
  expectTypeOf<Identity & { status: "succeeded"; result: undefined }>().toExtend<Write>();
  expectTypeOf<Identity & { status: "cancelled" }>().toExtend<Write>();
  expectTypeOf<Identity & { status: "failed"; error: string }>().toExtend<Write>();
  expectTypeOf<Identity & { status: "worker_died"; error: string }>().toExtend<Write>();
});
