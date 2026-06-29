import { describe, expect, test } from "vitest";
import {
  DEFAULTS,
  resolveCfg,
} from "../../../../../packages/server/src/domain/chat/memory/constants";

describe("memory/constants — DEFAULTS + resolveCfg", () => {
  test("DEFAULTS adopt the new tuning (blockSize 16 · verbatimWindow 30 · fanOut 8)", () => {
    expect(DEFAULTS.blockSize).toBe(16);
    expect(DEFAULTS.verbatimWindow).toBe(30);
    expect(DEFAULTS.fanOut).toBe(8);
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
    // untouched knobs fall back to the floor
    expect(cfg.verbatimWindow).toBe(DEFAULTS.verbatimWindow);
    expect(cfg.fanOut).toBe(DEFAULTS.fanOut);
  });

  test("resolveCfg is deterministic (identical input → identical output)", () => {
    expect(resolveCfg({ minScore: 0.5 })).toEqual(resolveCfg({ minScore: 0.5 }));
  });
});
