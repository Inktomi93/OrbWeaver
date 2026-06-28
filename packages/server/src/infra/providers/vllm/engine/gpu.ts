// infra/providers/vllm/engine/gpu — the ONE GPU-presence probe. Both the supervisor's stack-takeover
// guard AND the boot seam (entry/lifecycle, via the providers front door) read THIS — there is no second
// `nvidia-smi` anywhere (one home; mirrors the stack supervisor's gpu_present). Execs `nvidia-smi -L` once;
// success ⇒ a usable NVIDIA GPU is present. NEVER throws — a missing binary / no device / any exec failure
// is simply "no GPU" (false). The `exec` seam is injectable so tests assert present/absent without hardware.

import { execFileSync } from "node:child_process";

/** The system-exec seam — runs the probe binary, THROWING on any failure (missing binary / no GPU), exactly
 *  like `execFileSync`. Inlined (infra has no contract/ home for a type export — types-and-schemas §7.4);
 *  tests pass a fake to drive present (returns) / absent (throws) without a real GPU. */
const probeNvidiaSmi = (): void => {
  execFileSync("nvidia-smi", ["-L"], { stdio: "ignore" });
};

/** Detect a usable NVIDIA GPU by exec'ing `nvidia-smi -L` once. Success ⇒ true; ANY failure ⇒ false (never
 *  throws). `exec` defaults to the real `nvidia-smi` call; tests inject a fake. */
export function detectGpu(exec: () => void = probeNvidiaSmi): boolean {
  try {
    exec();
    return true;
  } catch {
    return false;
  }
}
