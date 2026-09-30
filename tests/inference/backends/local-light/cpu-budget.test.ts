import { localLightCpuThreads } from "../../../../packages/inference/src/backends/local-light/cpu-budget.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("native threads honor an ancestor quota even when the leaf is unlimited", () => {
  const files = new Map([
    ["/proc/self/cgroup", "0::/parent/child"],
    ["/sys/fs/cgroup/parent/child/cpu.max", "max 100000"],
    ["/sys/fs/cgroup/parent/cpu.max", "200000 100000"],
  ]);
  expect(localLightCpuThreads(24, () => undefined)).toBe(24);
  expect(localLightCpuThreads(24, (path) => files.get(path))).toBe(2);
  expect(localLightCpuThreads(1, (path) => files.get(path))).toBe(1);
});

test("a cgroup mounted below its host root resolves the quota through mountinfo", () => {
  const files = new Map([
    ["/proc/self/cgroup", "0::/docker/container/worker"],
    ["/proc/self/mountinfo", "1 2 0:3 /docker/container /sys/quota ro - cgroup2 cgroup2 rw"],
    ["/sys/quota/worker/cpu.max", "max 100000"],
    ["/sys/quota/cpu.max", "150000 100000"],
  ]);
  expect(localLightCpuThreads(24, (path) => files.get(path))).toBe(1);
});

test("legacy controller quotas and sub-core quotas still produce at least one thread", () => {
  const files = new Map([
    ["/sys/fs/cgroup/cpu/cpu.cfs_quota_us", "50000"],
    ["/sys/fs/cgroup/cpu/cpu.cfs_period_us", "100000"],
  ]);
  expect(localLightCpuThreads(24, (path) => files.get(path))).toBe(1);
});
