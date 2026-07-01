// Unit tests for the ONE GPU-presence probe (`detectGpu`). The system-exec seam is injected so present
// (the probe returns) / absent (the probe throws) are asserted without real hardware, and a throwing probe
// is swallowed to `false` (never propagates) — the contract entry/lifecycle relies on at boot.

import { detectGpu } from "@orb/server/infra/providers/vllm/engine";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

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
