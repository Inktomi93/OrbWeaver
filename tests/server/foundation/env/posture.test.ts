// Unit tests for the engine-posture resolver (A.4) — the ONE topology decision + the back-compat mapping of
// the deprecated VLLM_DISABLED/STACK_ENGINES pair (with a VISIBLE deprecation log, never silent re-semantics).

import { effectiveVllmDisabled, postureManages, postureRegistersBackend, resolveEnginesPosture } from "@orb/server/foundation/env";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

describe("resolveEnginesPosture — explicit knob wins", () => {
  test("ENGINES_POSTURE set → used verbatim, no deprecation log", () => {
    const log = vi.fn();
    expect(resolveEnginesPosture({ posture: "adopt-only", vllmDisabled: true, stackEngines: "yes" }, log)).toBe("adopt-only");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("resolveEnginesPosture — deprecated pair mapping (each logs a deprecation line)", () => {
  test("VLLM_DISABLED=true → off", () => {
    const log = vi.fn();
    expect(resolveEnginesPosture({ posture: undefined, vllmDisabled: true, stackEngines: "no" }, log)).toBe("off");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain("VLLM_DISABLED=true");
  });

  test("STACK_ENGINES=yes → adopt-only", () => {
    const log = vi.fn();
    expect(resolveEnginesPosture({ posture: undefined, vllmDisabled: false, stackEngines: "yes" }, log)).toBe("adopt-only");
    expect(log.mock.calls[0]?.[0]).toContain("STACK_ENGINES=yes");
  });

  test("neither set → adopt-or-start (the fleet manager default)", () => {
    const log = vi.fn();
    expect(resolveEnginesPosture({ posture: undefined, vllmDisabled: false, stackEngines: "no" }, log)).toBe("adopt-or-start");
    expect(log.mock.calls[0]?.[0]).toContain("adopt-or-start");
  });

  test("VLLM_DISABLED=true wins over STACK_ENGINES=yes (off beats adopt-only — a disabled box has no engines)", () => {
    const log = vi.fn();
    expect(resolveEnginesPosture({ posture: undefined, vllmDisabled: true, stackEngines: "yes" }, log)).toBe("off");
  });
});

describe("posture predicates", () => {
  test("postureRegistersBackend: true for adopt-*, false for off", () => {
    expect(postureRegistersBackend("off")).toBe(false);
    expect(postureRegistersBackend("adopt-only")).toBe(true);
    expect(postureRegistersBackend("adopt-or-start")).toBe(true);
  });

  test("postureManages: only adopt-or-start spawns + owns auto-sleep", () => {
    expect(postureManages("off")).toBe(false);
    expect(postureManages("adopt-only")).toBe(false);
    expect(postureManages("adopt-or-start")).toBe(true);
  });
});

// The boot fact `entry/lifecycle` derives from posture × local-GPU probe. The load-bearing row is
// `adopt-only × no GPU` → NOT disabled: a passive consumer's engines may live on ANOTHER host
// (VLLM_ENGINE_HOST — profile-2/D2, docs/design/containerize-prod-image-spec.md §3.6), so a GPU-less app
// box must still register the backend and probe/adopt. Only the MANAGING posture spawns locally and
// therefore requires a local GPU.
describe("effectiveVllmDisabled — the local-GPU requirement is MANAGER-scoped", () => {
  test("off → disabled regardless of GPU", () => {
    expect(effectiveVllmDisabled("off", true)).toBe(true);
    expect(effectiveVllmDisabled("off", false)).toBe(true);
  });

  test("adopt-or-start (the manager spawns locally) → requires a local GPU", () => {
    expect(effectiveVllmDisabled("adopt-or-start", true)).toBe(false);
    expect(effectiveVllmDisabled("adopt-or-start", false)).toBe(true);
  });

  test("adopt-only (passive consumer, possibly-remote fleet) → available WITHOUT a local GPU", () => {
    expect(effectiveVllmDisabled("adopt-only", true)).toBe(false);
    expect(effectiveVllmDisabled("adopt-only", false)).toBe(false);
  });
});
