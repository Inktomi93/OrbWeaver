// Unit tests for the pure wake-budget headroom decision (B.6) — the VRAM pre-check that guards every wake
// and cold spawn. Fully deterministic: GPU facts are injected, only nvidia-smi is I/O (not exercised here).
// Covers: the per-engine need mapping (util fraction × card, gen spans both cards), fits vs refuses, the
// holder-naming refusal message format, and the CSV parsers.

import type { EngineUtilFractions, GpuVram, WakeBudgetVerdict } from "@orb/server/infra/providers/vllm/engine";
import { decideWakeBudget, engineVramNeed, parseComputeAppsCsv, parseGpuVramCsv } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

/** Narrow a verdict to its refusal arm or fail the test — avoids conditional-expect. */
function refusal(v: WakeBudgetVerdict): Extract<WakeBudgetVerdict, { ok: false }> {
  if (v.ok) {
    throw new Error("expected a wake refusal");
  }
  return v;
}

const GIB = 1_073_741_824;
const MIB = 1_048_576;

const UTIL: EngineUtilFractions = {
  embedGpuUtil: 0.14,
  rerankGpuUtilMulti: 0.16,
  rerankGpuUtilSingle: 0.22,
  genGpuUtilMulti: 0.55,
  genGpuUtilSingle: 0.5,
};

// Two 48GiB A6000s, mostly free.
const freeGpus = (freeGib: number): GpuVram[] => [
  { index: 0, totalBytes: 48 * GIB, freeBytes: freeGib * GIB, tenants: [] },
  { index: 1, totalBytes: 48 * GIB, freeBytes: freeGib * GIB, tenants: [] },
];

describe("engineVramNeed — per-engine GPU footprint (mirrors buildEngineArgv pinning)", () => {
  test("gen spans BOTH cards multi-GPU at the multi util", () => {
    const need = engineVramNeed("gen", 2, UTIL);
    expect(need.fractionByGpu.get(0)).toBe(0.55);
    expect(need.fractionByGpu.get(1)).toBe(0.55);
  });

  test("embed sits on GPU0 only", () => {
    const need = engineVramNeed("embed", 2, UTIL);
    expect([...need.fractionByGpu.entries()]).toEqual([[0, 0.14]]);
  });

  test("rerank sits on GPU0 (co-located with embed) with the matching multi/single util", () => {
    expect([...engineVramNeed("rerank", 2, UTIL).fractionByGpu.entries()]).toEqual([[0, 0.16]]);
    expect([...engineVramNeed("rerank", 1, UTIL).fractionByGpu.entries()]).toEqual([[0, 0.22]]);
  });

  test("single-GPU gen packs onto GPU0 only at the single util", () => {
    expect([...engineVramNeed("gen", 1, UTIL).fractionByGpu.entries()]).toEqual([[0, 0.5]]);
  });
});

describe("decideWakeBudget — fits", () => {
  test("gen fits with ample headroom (0.55×48 ≈ 26.4GiB + 1 pad on each card, 40 free)", () => {
    const verdict = decideWakeBudget("gen", engineVramNeed("gen", 2, UTIL), freeGpus(40));
    expect(verdict.ok).toBe(true);
  });
});

describe("decideWakeBudget — refuses (visible refusal, engine stays asleep)", () => {
  test("gen refuses when GPU0 is held, names the holder + need + free", () => {
    const gpus: GpuVram[] = [
      { index: 0, totalBytes: 48 * GIB, freeBytes: 9 * GIB, tenants: [{ pid: 3_356_292, processName: "python3", usedBytes: 38 * GIB }] },
      { index: 1, totalBytes: 48 * GIB, freeBytes: 40 * GIB, tenants: [] },
    ];
    const verdict = refusal(decideWakeBudget("gen", engineVramNeed("gen", 2, UTIL), gpus));
    // Only GPU0 short (GPU1 is free) → one shortfall naming python3.
    expect(verdict.shortfalls).toHaveLength(1);
    expect(verdict.shortfalls[0]?.index).toBe(0);
    expect(verdict.message).toContain("wake refused:");
    expect(verdict.message).toContain("gen needs ~");
    expect(verdict.message).toContain("on GPU0");
    expect(verdict.message).toContain("python3 (pid 3356292, 38.0GiB)");
  });

  test("a card with no facts is treated as a shortfall (can't prove headroom → refuse honestly)", () => {
    const verdict = refusal(decideWakeBudget("gen", engineVramNeed("gen", 2, UTIL), [{ index: 0, totalBytes: 48 * GIB, freeBytes: 40 * GIB, tenants: [] }]));
    expect(verdict.shortfalls.some((s) => s.index === 1)).toBe(true);
    expect(verdict.message).toContain("no named compute tenant");
  });
});

describe("nvidia-smi CSV parsers", () => {
  test("parseGpuVramCsv reads index/total/free (MiB → bytes), skips junk rows", () => {
    const rows = parseGpuVramCsv("0, 49140, 40000\n1, 49140, 12000\ngarbage\n");
    expect(rows).toEqual([
      { index: 0, totalBytes: 49_140 * MIB, freeBytes: 40_000 * MIB },
      { index: 1, totalBytes: 49_140 * MIB, freeBytes: 12_000 * MIB },
    ]);
  });

  test("parseComputeAppsCsv groups tenants by gpu_uuid (MiB → bytes)", () => {
    const map = parseComputeAppsCsv("3356292, python3, 38000, GPU-abc\n9999, comfyui, 12000, GPU-abc\n5, x, 100, GPU-def\n");
    expect(map.get("GPU-abc")).toEqual([
      { pid: 3_356_292, processName: "python3", usedBytes: 38_000 * MIB },
      { pid: 9999, processName: "comfyui", usedBytes: 12_000 * MIB },
    ]);
    expect(map.get("GPU-def")).toEqual([{ pid: 5, processName: "x", usedBytes: 100 * MIB }]);
  });
});
