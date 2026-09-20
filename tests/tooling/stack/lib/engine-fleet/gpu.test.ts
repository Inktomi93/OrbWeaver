// Unit tests for the ONE GPU-presence probe (`detectGpu`). The system-exec seam is injected so present
// (the probe returns) / absent (the probe throws) are asserted without real hardware, and a throwing probe
// is swallowed to `false` (never propagates) — the contract entry/lifecycle relies on at boot.

import { countGpus, detectGpu } from "@orb/tooling/stack/lib/engine-fleet";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/tool-fixtures.ts";

describe("detectGpu", () => {
  test("a successful probe (GPU present) → true, and the exec is run exactly once", () => {
    const exec = vi.fn<() => void>(() => undefined);

    expect(detectGpu(exec)).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  test("a throwing probe (no GPU / missing binary) → false, never propagates", () => {
    const exec = vi.fn<() => void>(() => {
      throw new Error("nvidia-smi: command not found");
    });

    expect(detectGpu(exec)).toBe(false);
    expect(exec).toHaveBeenCalledTimes(1);
  });
});

describe("countGpus (drives TP + the gpu-util split)", () => {
  test("counts one line per GPU from `nvidia-smi -L`", () => {
    const out = "GPU 0: NVIDIA RTX 6000 (UUID: GPU-a)\nGPU 1: NVIDIA RTX 6000 (UUID: GPU-b)\n";
    expect(countGpus(() => out)).toBe(2);
  });

  test("a single-GPU box counts 1", () => {
    expect(countGpus(() => "GPU 0: NVIDIA RTX 6000 (UUID: GPU-a)\n")).toBe(1);
  });

  test("a throwing probe (no driver) → 0, never propagates", () => {
    expect(
      countGpus(() => {
        throw new Error("nvidia-smi: command not found");
      }),
    ).toBe(0);
  });

  test("empty output → 0", () => {
    expect(countGpus(() => "")).toBe(0);
  });
});
