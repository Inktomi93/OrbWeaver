import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

// FAKE AT THE EDGE (Spine-Testing §3): `busyGpuOwners` reaches the process table through `_shared/proc`'s
// `execNicedSync`, which itself wraps `node:child_process`. Planting the failure at the NODE boundary keeps
// the internal wrapper in the test — its status/stderr handling is exercised rather than assumed — and is
// the only faking this doctrine permits, since child_process is a genuine third-party edge.
const pgrep = vi.hoisted(() => ({ status: 1 }));
vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    execFileSync: (): never => {
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
