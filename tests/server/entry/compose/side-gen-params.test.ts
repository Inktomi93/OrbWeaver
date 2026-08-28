// entry/compose/side-gen-params — the preset-read catch that resolves a user's side-gen sampling knobs
// (#759). `paramsForDefaultPreset` is the ONE closure both `resolveUserPresetParams` and
// `resolveChatPresetParams` funnel through, so this pins it once at `resolveUserPresetParams`, the
// direct caller. The rule: a genuinely stale/unowned/missing preset id degrades to
// `DEFAULT_PROMPT_CONFIG.params` (`PresetNotFoundError`, the documented lenient-id fallback); a database,
// I/O, or program failure must propagate and never silently replace the caller's configured sampling.
//
// Pure unit test — `buildSideGenParams` takes its `preset`/`settings` deps injected (`SideGenParamsDeps`),
// so this needs no db/compose graph, just fakes.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PresetNotFoundError } from "@orb/server/domain/preset";
import { describe, vi } from "vitest";
import { buildSideGenParams } from "../../../../packages/server/src/entry/compose/side-gen-params.ts";
import { expect, test } from "../../../support/fixtures.ts";

const USER_ID = castId<UserId>("user_sidegen");
const PRESET_ID = "preset_sidegen_default";

describe("buildSideGenParams — the preset-read catch narrows to PresetNotFoundError (#759)", () => {
  test("a non-not-found rejection PROPAGATES — never silently replaces the caller's configured sampling", async () => {
    const dbDown = new Error("connection terminated unexpectedly");
    const { resolveUserPresetParams } = buildSideGenParams({
      preset: { get: vi.fn().mockRejectedValue(dbDown) },
      settings: { loadUserSettings: vi.fn().mockResolvedValue({ seeds: { defaultPresetId: PRESET_ID } }) },
      resolveChatHostUserId: vi.fn(),
    });

    await expect(resolveUserPresetParams(USER_ID)).rejects.toBe(dbDown);
  });

  test("a genuinely stale/unowned/missing preset id still degrades to the system default's params", async () => {
    const { resolveUserPresetParams } = buildSideGenParams({
      preset: { get: vi.fn().mockRejectedValue(new PresetNotFoundError(castId<PresetId>(PRESET_ID))) },
      settings: { loadUserSettings: vi.fn().mockResolvedValue({ seeds: { defaultPresetId: PRESET_ID } }) },
      resolveChatHostUserId: vi.fn(),
    });

    await expect(resolveUserPresetParams(USER_ID)).resolves.toEqual(DEFAULT_PROMPT_CONFIG.params);
  });

  test("no default preset id at all is unaffected — the floor never calls preset.get", async () => {
    const get = vi.fn();
    const { resolveUserPresetParams } = buildSideGenParams({
      preset: { get },
      settings: { loadUserSettings: vi.fn().mockResolvedValue({ seeds: { defaultPresetId: null } }) },
      resolveChatHostUserId: vi.fn(),
    });

    await expect(resolveUserPresetParams(USER_ID)).resolves.toEqual(DEFAULT_PROMPT_CONFIG.params);
    expect(get).not.toHaveBeenCalled();
  });
});
