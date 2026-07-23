import { describe } from "vitest";
import { DEFAULTS, resolveCfg } from "../../../../../packages/server/src/domain/chat/memory/constants";
import { expect, test } from "../../../../support/fixtures";

describe("memory/constants — DEFAULTS + resolveCfg", () => {
  test("DEFAULTS are the grounded core/Knowledge-Cluster.md §5 numbers (blockSize 8 · verbatimWindow 8 · fanOut 4 · maxTier 3)", () => {
    expect(DEFAULTS.blockSize).toBe(8);
    expect(DEFAULTS.verbatimWindow).toBe(8);
    expect(DEFAULTS.fanOut).toBe(4);
    expect(DEFAULTS.maxTier).toBe(3);
    expect(DEFAULTS.mode).toBe("mixC");
  });

  test("resolveCfg with no input returns DEFAULTS", () => {
    expect(resolveCfg()).toEqual(DEFAULTS);
    expect(resolveCfg(null)).toEqual(DEFAULTS);
    expect(resolveCfg({})).toEqual(DEFAULTS);
  });

  test("resolveCfg layers a partial over DEFAULTS (each absent knob → the floor)", () => {
    const cfg = resolveCfg({ blockSize: 4, mode: "tiered" });
    expect(cfg.blockSize).toBe(4);
    expect(cfg.mode).toBe("tiered");
    expect(cfg.verbatimWindow).toBe(DEFAULTS.verbatimWindow);
    expect(cfg.fanOut).toBe(DEFAULTS.fanOut);
  });

  test("resolveCfg is deterministic (identical input → identical output)", () => {
    expect(resolveCfg({ minScore: 0.5 })).toEqual(resolveCfg({ minScore: 0.5 }));
  });
});
