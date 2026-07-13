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
