// Unit tests for the engine-posture resolver (A.4) — the ONE topology decision + the back-compat mapping of
// the deprecated VLLM_DISABLED/STACK_ENGINES pair (with a VISIBLE deprecation log, never silent re-semantics).

import { effectiveVllmDisabled, postureManages, postureRegistersBackend, resolveEnginesPosture } from "@orb/server/foundation/env";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

describe("resolveEnginesPosture — explicit knob wins", () => {
  test("ENGINES_POSTURE set → used verbatim, no log of either kind", () => {
    const log = { deprecation: vi.fn(), defaulted: vi.fn() };
    expect(resolveEnginesPosture({ posture: "adopt-only", vllmDisabled: true, stackEngines: "yes" }, log)).toBe("adopt-only");
    expect(log.deprecation).not.toHaveBeenCalled();
    expect(log.defaulted).not.toHaveBeenCalled();
  });
});

describe("resolveEnginesPosture — deprecated pair mapping (each logs a deprecation line)", () => {
  test("VLLM_DISABLED=true → off", () => {
    const log = { deprecation: vi.fn(), defaulted: vi.fn() };
    expect(resolveEnginesPosture({ posture: undefined, vllmDisabled: true, stackEngines: "no" }, log)).toBe("off");
    expect(log.deprecation).toHaveBeenCalledOnce();
    expect(log.deprecation.mock.calls[0]?.[0]).toContain("VLLM_DISABLED=true");
  });

  test("STACK_ENGINES=yes → adopt-only", () => {
    const log = { deprecation: vi.fn(), defaulted: vi.fn() };
    expect(resolveEnginesPosture({ posture: undefined, vllmDisabled: false, stackEngines: "yes" }, log)).toBe("adopt-only");
    expect(log.deprecation.mock.calls[0]?.[0]).toContain("STACK_ENGINES=yes");
  });

  test("VLLM_DISABLED=true wins over STACK_ENGINES=yes (off beats adopt-only — a disabled box has no engines)", () => {
    const log = { deprecation: vi.fn(), defaulted: vi.fn() };
    expect(resolveEnginesPosture({ posture: undefined, vllmDisabled: true, stackEngines: "yes" }, log)).toBe("off");
  });
});

// The owner ruling that makes a BOOT harmless (2026-09-19, #2421): with nothing set the resolver picks the
// PASSIVE posture, so no process wakes a sleeping engine or cold-spawns a fleet just by starting. The line
// it logs is an ordinary default notice, NOT a deprecation warning — the severity is the operator-facing
// half of the ruling, so it is pinned here beside the value.
describe("resolveEnginesPosture — the unset default is the passive posture", () => {
  test("neither set → adopt-only, announced through `defaulted` and never as a deprecation", () => {
    const log = { deprecation: vi.fn(), defaulted: vi.fn() };
    expect(resolveEnginesPosture({ posture: undefined, vllmDisabled: false, stackEngines: "no" }, log)).toBe("adopt-only");
    expect(log.deprecation).not.toHaveBeenCalled();
    expect(log.defaulted).toHaveBeenCalledOnce();
    expect(log.defaulted.mock.calls[0]?.[0]).toContain("ENGINES_POSTURE unset — adopt-only");
    expect(log.defaulted.mock.calls[0]?.[0]).toContain("never waking or spawning");
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
