// The ONE GPU-presence probe — supervisor + boot seam both read this; no second `nvidia-smi` anywhere.
// Execs `nvidia-smi -L` once; success ⇒ GPU present. Never throws.

import { execNicedSync } from "../../../_shared/proc.ts";

// Through the ONE subprocess door (policy `tooling-child-process-door`): the fleet moved into `tooling/`
// with the inference extraction and its probes ride the homelab's nice -19 floor like every other tool
// spawn. `execNicedSync` THROWS on a non-zero exit, the same signal `execFileSync` gave — no driver, no GPU.
const probeNvidiaSmi = (): void => {
  execNicedSync("nvidia-smi", ["-L"]);
};

/** Detect a usable NVIDIA GPU. Success ⇒ true; ANY failure ⇒ false. `exec` defaults to the real call. */
export function detectGpu(exec: () => void = probeNvidiaSmi): boolean {
  // @orb-waive caught-failure-ownership(catch): a GPU-presence probe (nvidia-smi -L) that throws returns false (no usable GPU) — a local hardware probe, no auth/credential/network. Ends if GPU presence ever gates a security decision.
  try {
    exec();
    return true;
  } catch {
    return false;
  }
}

// `nvidia-smi -L` lists one line per GPU; the count is the line count (the shell's `nvidia-smi -L | wc -l`).
const listNvidiaSmi = (): string => execNicedSync("nvidia-smi", ["-L"]);

/** Count usable NVIDIA GPUs — drives TP + the gpu-util split (2-card ⇒ TP=2, rerank on GPU1). 0 on any
 *  failure (no GPU / no driver). `exec` defaults to the real `nvidia-smi -L`. */
export function countGpus(exec: () => string = listNvidiaSmi): number {
  // @orb-waive caught-failure-ownership(catch): a GPU-count probe failure returns 0 (no GPU/driver); local hardware probe, no auth/credential/network. Ends if the count ever gates a security decision.
  try {
    return exec()
      .split("\n")
      .filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}
