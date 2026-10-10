import { localLightCpuThreads } from "../../../../packages/inference/src/backends/local-light/cpu-budget.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("native threads honor an ancestor quota even when the leaf is unlimited", () => {
  const files = new Map([
    ["/proc/self/cgroup", "0::/parent/child"],
    ["/sys/fs/cgroup/parent/child/cpu.max", "max 100000"],
    ["/sys/fs/cgroup/parent/cpu.max", "200000 100000"],
  ]);
  expect(localLightCpuThreads(24, () => undefined)).toBe(12);
  expect(localLightCpuThreads(24, (path) => files.get(path))).toBe(1);
  expect(localLightCpuThreads(1, (path) => files.get(path))).toBe(1);
});

test("the native worker reserves half the available CPUs with a one-thread floor", () => {
  for (const [allocation, threads] of [
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 2],
    [8, 4],
  ]) {
    expect(localLightCpuThreads(allocation, () => undefined)).toBe(threads);
  }
});

test("configured percentages apply after fractional and ancestor quotas, never below one thread", () => {
  const files = new Map([
    ["/sys/fs/cgroup/cpu/cpu.cfs_quota_us", "350000"],
    ["/sys/fs/cgroup/cpu/cpu.cfs_period_us", "100000"],
  ]);
  expect(localLightCpuThreads(24, (path) => files.get(path), 75)).toBe(2);
  expect(localLightCpuThreads(24, (path) => files.get(path), 100)).toBe(3);
  expect(localLightCpuThreads(4, () => undefined, 75)).toBe(3);
  expect(localLightCpuThreads(4, () => undefined, 1)).toBe(1);
  for (const percent of [0, 101, 50.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => localLightCpuThreads(4, () => undefined, percent)).toThrow();
  }
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
