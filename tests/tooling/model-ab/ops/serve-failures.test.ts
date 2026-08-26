import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const pgrep = vi.hoisted(() => ({ status: 1 }));
vi.mock("../../../../tooling/src/_shared/proc.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../tooling/src/_shared/proc.ts")>();
  return {
    ...real,
    execNicedSync: () => {
      throw Object.assign(new Error(`planted pgrep status ${pgrep.status}`), { status: pgrep.status });
    },
  };
});

const { busyGpuOwners } = await import("../../../../tooling/src/model-ab/ops/serve.ts");

test("pgrep status 1 alone means no GPU owner; an execution failure refuses to fabricate an idle fleet", () => {
  pgrep.status = 1;
  expect(busyGpuOwners()).toEqual([]);
  pgrep.status = 2;
  expect(() => busyGpuOwners()).toThrow("planted pgrep status 2");
});
