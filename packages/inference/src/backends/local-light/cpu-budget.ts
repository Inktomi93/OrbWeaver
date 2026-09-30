import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, relative } from "node:path";

const CGROUP_PREFIX = "0::";
const CGROUP_ROOT = "/sys/fs/cgroup";

function readOptional(path: string): string | undefined {
  let result: string | undefined;
  // @orb-waive caught-failure-ownership(catch): an unavailable cgroup controller supplies no quota; affinity still bounds the session. Ends if this read becomes required for model admission.
  try {
    result = readFileSync(path, "utf8");
  } catch {
    result = undefined;
  }
  return result;
}

/** Bound native threads by affinity and every visible cgroup CPU quota. */
export function localLightCpuThreads(affinity = availableParallelism(), read: (path: string) => string | undefined = readOptional): number {
  let budget = affinity;
  const narrow = (quota: string | undefined, period: string | undefined): void => {
    const q = Number(quota);
    const p = Number(period);
    if (Number.isFinite(q) && Number.isFinite(p) && q > 0 && p > 0) {
      budget = Math.min(budget, q / p);
    }
  };
  const group =
    read("/proc/self/cgroup")
      ?.split("\n")
      .find((line) => line.startsWith(CGROUP_PREFIX))
      ?.slice(CGROUP_PREFIX.length) ?? "/";
  const mount = read("/proc/self/mountinfo")
    ?.split("\n")
    .find((line) => line.includes(" - cgroup2 "))
    ?.split(" ");
  const mountRoot = mount?.[3] ?? "/";
  const mountPoint = mount?.[4] ?? CGROUP_ROOT;
  let path = join(mountPoint, relative(mountRoot, group));
  // A namespaced cgroup can name an ancestry outside its mount; only the visible mount can constrain us.
  if (!path.startsWith(`${mountPoint}/`)) {
    path = mountPoint;
  }
  let atRoot = false;
  while (!atRoot) {
    const [quota, period] = read(join(path, "cpu.max"))?.trim().split(/\s+/u) ?? [];
    narrow(quota, period);
    atRoot = path === mountPoint;
    path = dirname(path);
  }
  narrow(read(`${CGROUP_ROOT}/cpu/cpu.cfs_quota_us`), read(`${CGROUP_ROOT}/cpu/cpu.cfs_period_us`));
  return Math.max(1, Math.floor(budget));
}
