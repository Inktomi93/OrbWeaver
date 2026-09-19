// The per-process avatar-analysis memory (#2422). Its whole job is to make a verdict about a MODEL cost one
// question instead of one per asset, so what is pinned here is the LATCH EDGE — "did THIS call latch it" is
// what decides whether the caller logs, and a helper that returned true every time would restore the log
// storm the latch exists to end. Keyed by model id, never a global flag: a role re-point must get its own
// first attempt rather than inheriting the verdict about the model it replaced.

import { beforeEach, describe } from "vitest";
import {
  __resetAvatarAnalysisAvailability,
  announceAvatarAnalysisSkip,
  avatarAnalysisUnservable,
  markAvatarAnalysisUnservable,
} from "../../../../../packages/server/src/domain/embeddings/substrate/avatar-analysis-availability.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const VL_MODEL = "Qwen/Qwen3-VL-8B-Instruct";
const OTHER_MODEL = "Qwen/Qwen3-30B-A3B";

beforeEach(() => {
  __resetAvatarAnalysisAvailability();
});

describe("avatar-analysis availability", () => {
  test("a model is unservable only after the backend refused it, and only that model", () => {
    expect(avatarAnalysisUnservable(VL_MODEL)).toBe(false);
    markAvatarAnalysisUnservable(VL_MODEL);
    expect(avatarAnalysisUnservable(VL_MODEL)).toBe(true);
    // The role re-point case: a different model has its own first attempt coming.
    expect(avatarAnalysisUnservable(OTHER_MODEL)).toBe(false);
  });

  test("only the FIRST mark reports the latch edge — the caller's loud line is logged once, not per asset", () => {
    expect(markAvatarAnalysisUnservable(VL_MODEL)).toBe(true);
    expect(markAvatarAnalysisUnservable(VL_MODEL)).toBe(false);
    expect(markAvatarAnalysisUnservable(VL_MODEL)).toBe(false);
    expect(markAvatarAnalysisUnservable(OTHER_MODEL)).toBe(true);
  });

  test("the pre-call announcement is also once per model", () => {
    expect(announceAvatarAnalysisSkip(VL_MODEL)).toBe(true);
    expect(announceAvatarAnalysisSkip(VL_MODEL)).toBe(false);
    expect(announceAvatarAnalysisSkip(OTHER_MODEL)).toBe(true);
  });

  test("the reset seam drops both halves — a restart re-asks, which is the whole retry window", () => {
    markAvatarAnalysisUnservable(VL_MODEL);
    announceAvatarAnalysisSkip(VL_MODEL);
    __resetAvatarAnalysisAvailability();
    expect(avatarAnalysisUnservable(VL_MODEL)).toBe(false);
    expect(announceAvatarAnalysisSkip(VL_MODEL)).toBe(true);
  });
});
