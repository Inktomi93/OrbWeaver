// THE CGROUP READER — reads whatever CPU limit the kernel already imposes on this process tree (a
// container, CI, or a systemd slice can all set one), never sets or changes one itself: this process's own
// CPU ceiling (`cpu.max`) and how often it was stopped (`cpu.stat`). One INPUT to `load-budget.ts`'s box
// reading, split out of it at the size cap (2026-09-18): the budget math stays there, the two once-per-process
// filesystem walks live here, and the direction is one-way — this module imports nothing from
// `load-budget.ts`. Why the denominator and the wall-clock stretch honour the limit at all:
// `cgroupQuotaCores` below (#1985) and `load-budget.ts#throttleFactor` (#2206).
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import process from "node:process";

/** THE KERNEL'S OWN RECORD OF THE LIMIT BITING (#2206). `cpu.stat` counts scheduling PERIODS and how many
 *  of them ended with this tree THROTTLED — i.e. the quota, not the machine, stopped the work. */
export interface CpuThrottleSample {
  readonly periods: number;
  readonly throttled: number;
}

/** cgroup v2 writes exactly one `0::<path>` line into `/proc/self/cgroup`; v1's numbered lines are not it. */
const CGROUP_V2_PREFIX = "0::";

/** The cgroup v2 files, behind the platform guard: cgroups are a Linux kernel feature, and off Linux the walk
 *  has nothing to read and answers "no ceiling". */
function cgroupPaths(): { readonly procSelf: string; readonly root: string } | undefined {
  if (process.platform !== "linux") {
    return;
  }
  return { procSelf: "/proc/self/cgroup", root: "/sys/fs/cgroup" };
}

/** How the quota walk reads a cgroup file: the bytes, or `undefined` for absent/unreadable. Injectable so a
 *  planted control drives the ancestry instead of the box's real one. */
export type CgroupFileReader = (path: string) => string | undefined;

/** PURE: one `cpu.max` body — `"<quota|max> <period>"` — as whole CPUs, or `undefined` for `max`/garbage. */
function cpuMaxCores(body: string | undefined): number | undefined {
  if (body === undefined) {
    return;
  }
  const [quota, period] = body.trim().split(/\s+/u);
  const quotaUs = Number(quota);
  const periodUs = Number(period);
  return Number.isFinite(quotaUs) && Number.isFinite(periodUs) && quotaUs > 0 && periodUs > 0 ? quotaUs / periodUs : undefined;
}

/** PURE (given the reader): THE CGROUP v2 QUOTA CEILING on this process tree in whole-CPU units, or
 *  `undefined` when the tree is unbounded (no cgroup v2, an unreadable path, every `cpu.max` reading `max`).
 *
 *  WHY IT IS AN INPUT TO THE DENOMINATOR AND NOT A CURIOSITY (#1985, measured 2026-09-12). A cgroup CPU
 *  quota — a systemd `CPUQuota=` on the session's scope, a container's CPU limit — bounds the cores this
 *  tree may use, and `cpus().length` cannot see it. Under an 800% quota (EIGHT of a 24-thread box)
 *  `computeLoadFactor` divided a box-wide loadavg by cores this process tree is FORBIDDEN to use, and
 *  returned a flat factor 1 for every realistic multi-lane load: the quota itself holds loadavg well under
 *  24, which is the number the factor had to exceed before it moved at all. The measured consequence is the row this closes —
 *  `enforcement-registry-parity.int.test.ts` carries `scaledBudget(60_000)`, timed out under concurrent
 *  lanes and passed under lighter load inside one session on one commit, with the scaling never once
 *  engaging. The budget WAS scaled; the scaling was reading the wrong box.
 *
 *  The ceiling is the MINIMUM over the whole cgroup ANCESTRY, not the leaf: a quota on any ancestor bounds
 *  the tree. An unbounded tree finds `max` everywhere and this returns `undefined` — it keeps the physical
 *  count and its budgets stay byte-identical. */
export function cgroupQuotaCores(read: CgroupFileReader): number | undefined {
  const paths = cgroupPaths();
  const own =
    paths === undefined
      ? undefined
      : read(paths.procSelf)
          ?.split("\n")
          .find((line) => line.startsWith(CGROUP_V2_PREFIX))
          ?.slice(CGROUP_V2_PREFIX.length);
  if (paths === undefined || own === undefined || !own.startsWith("/")) {
    return;
  }
  const segments = own.split("/").filter((segment) => segment !== "");
  let cores: number | undefined;
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const quota = cpuMaxCores(read(`${paths.root}/${segments.slice(0, depth).join("/")}/cpu.max`));
    if (quota !== undefined) {
      cores = cores === undefined ? quota : Math.min(cores, quota);
    }
  }
  return cores;
}

function readCgroupFile(path: string): string | undefined {
  // ONE TAIL RETURN (the `pass.ts` accumulator idiom): biome's noUselessReturn refuses a bare `return` in
  // the catch and tsc's noImplicitReturns refuses falling out of it, so the verdict is a binding.
  let body: string | undefined;
  // @orb-waive caught-failure-ownership(catch): ABSENCE IS THE ANSWER — a cgroup path that does not exist (v1, or a host without the controller) or is unreadable under this uid means exactly "no ceiling is declared here", the same verdict `cpu.max` spells `max`. Ends if this reader ever needs to tell "unbounded" from "could not ask"; the absence then becomes a value and this catch becomes a branch.
  try {
    body = readFileSync(path, "utf8");
  } catch {
    body = undefined;
  }
  return body;
}

/** Read ONCE: the fence is applied at session start, before any lane's children exist, and a per-call
 *  filesystem walk would sit on the hot path of every budget in the fleet. */
let quotaCores: number | undefined | "unread" = "unread";

/** The cores a budget's denominator may honestly use: the physical count, capped by whatever ceiling the
 *  kernel is actually enforcing on this process tree. Never below 1, never above the physical count. */
export function effectiveCpuCount(read: CgroupFileReader = readCgroupFile): number {
  const physical = cpus().length;
  if (read !== readCgroupFile) {
    const injected = cgroupQuotaCores(read);
    return injected === undefined ? physical : Math.max(1, Math.min(physical, injected));
  }
  if (quotaCores === "unread") {
    quotaCores = cgroupQuotaCores(read);
  }
  return quotaCores === undefined ? physical : Math.max(1, Math.min(physical, quotaCores));
}

/** PURE (given the reader): the `nr_periods` / `nr_throttled` pair from a `cpu.stat` body, or `undefined`
 *  when the file is absent or does not carry both counters. */
function parseCpuStat(body: string | undefined): CpuThrottleSample | undefined {
  if (body === undefined) {
    return;
  }
  const read = (key: string): number | undefined => {
    const line = body.split("\n").find((candidate) => candidate.startsWith(`${key} `));
    const value = line === undefined ? Number.NaN : Number(line.slice(key.length + 1).trim());
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const periods = read("nr_periods");
  const throttled = read("nr_throttled");
  return periods === undefined || throttled === undefined || periods === 0 ? undefined : { periods, throttled };
}

/** PURE (given the reader): the TIGHTEST throttling record over this tree's cgroup ANCESTRY — the same walk
 *  `cgroupQuotaCores` makes, for the same reason: a quota on any ancestor bounds this tree, so the
 *  enforcement that hurts most is the one that counts. `undefined` on an unfenced box. */
export function readCpuThrottle(read: CgroupFileReader): CpuThrottleSample | undefined {
  const paths = cgroupPaths();
  const own =
    paths === undefined
      ? undefined
      : read(paths.procSelf)
          ?.split("\n")
          .find((line) => line.startsWith(CGROUP_V2_PREFIX))
          ?.slice(CGROUP_V2_PREFIX.length);
  if (paths === undefined || own === undefined || !own.startsWith("/")) {
    return;
  }
  const segments = own.split("/").filter((segment) => segment !== "");
  let worst: CpuThrottleSample | undefined;
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const sample = parseCpuStat(read(`${paths.root}/${segments.slice(0, depth).join("/")}/cpu.stat`));
    if (sample !== undefined && (worst === undefined || sample.throttled / sample.periods > worst.throttled / worst.periods)) {
      worst = sample;
    }
  }
  return worst;
}

/** Read ONCE, same reasoning as the quota: these are cumulative counters on a scope created at session
 *  start, and a per-budget filesystem walk would sit on the hot path of every budget in the fleet. */
let throttleSample: CpuThrottleSample | undefined | "unread" = "unread";

export function liveThrottle(): CpuThrottleSample | undefined {
  if (throttleSample === "unread") {
    throttleSample = readCpuThrottle(readCgroupFile);
  }
  return throttleSample;
}
