// The ONE GPU-presence probe — supervisor + boot seam both read this; no second `nvidia-smi` anywhere.
// Execs `nvidia-smi -L` once; success ⇒ GPU present. Never throws.

import { execFileSync } from "node:child_process";

const probeNvidiaSmi = (): void => {
  execFileSync("nvidia-smi", ["-L"], { stdio: "ignore" });
};

/** Detect a usable NVIDIA GPU. Success ⇒ true; ANY failure ⇒ false. `exec` defaults to the real call. */
export function detectGpu(exec: () => void = probeNvidiaSmi): boolean {
  try {
    exec();
    return true;
  } catch {
    return false;
  }
}

// `nvidia-smi -L` lists one line per GPU; the count is the line count (the shell's `nvidia-smi -L | wc -l`).
const listNvidiaSmi = (): string => execFileSync("nvidia-smi", ["-L"], { encoding: "utf8" });

/** Count usable NVIDIA GPUs — drives TP + the gpu-util split (2-card ⇒ TP=2, rerank on GPU1). 0 on any
 *  failure (no GPU / no driver). `exec` defaults to the real `nvidia-smi -L`. */
export function countGpus(exec: () => string = listNvidiaSmi): number {
  try {
    return exec()
      .split("\n")
      .filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}
