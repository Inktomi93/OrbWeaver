// entry/compose/side-gen-params — which preset a Utility-role background task reads (D299). Task defaults
// resolve no params; "same as chat" follows the active preset; a named preset lends only its generation params;
// a stale id degrades to task defaults while a real read failure surfaces (#759).

import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, rolePresetParamsOf } from "@orb/contracts/preset";
import type { RolePresetChoice } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS, ROLE_PRESET_CHOICE_KINDS } from "@orb/contracts/settings";
import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PresetService } from "@orb/server/domain/preset";
import { PresetNotFoundError } from "@orb/server/domain/preset";
import type { Mock } from "vitest";
import { describe, vi } from "vitest";
import { buildSideGenParams } from "../../../../packages/server/src/entry/compose/side-gen-params.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { presetDetail, presetWithPromptStructure, utilityPresetResolver } from "../../../support/utility-preset.ts";

const USER_ID = castId<UserId>("user_sidegen");
const ACTIVE_PRESET_ID = "preset_sidegen_active";
const UTILITY_PRESET_ID = "preset_sidegen_utility";

// A chat preset with a short reply cap — the setting that used to cap every background task.
const CHAT_PARAMS: UserIntent = { temperature: 1.1, maxOutputTokens: 300, replyMedia: "text+image" };

type PresetGet = PresetService["get"];

function resolverFor(choice: RolePresetChoice | null, get: Mock<PresetGet>): ReturnType<typeof buildSideGenParams>["resolveUtilityPresetParams"] {
  return buildSideGenParams({
    preset: { get },
    settings: {
      loadUserSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_USER_SETTINGS,
        seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: ACTIVE_PRESET_ID, summarizePreset: choice },
      }),
    },
  }).resolveUtilityPresetParams;
}

const chatPresetGet = (): Mock<PresetGet> => vi.fn<PresetGet>().mockResolvedValue(presetDetail({ ...DEFAULT_PROMPT_CONFIG, params: CHAT_PARAMS }));

describe("resolveUtilityPresetParams — the Utility role's preset choice", () => {
  test("task defaults resolve no params, so a short chat reply cap never reaches a background task", async () => {
    const get = chatPresetGet();
    await expect(resolverFor(null, get)(USER_ID)).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  test("same as chat follows the active preset, projected to the role fields", async () => {
    const get = chatPresetGet();
    await expect(resolverFor({ kind: ROLE_PRESET_CHOICE_KINDS.sameAsChat }, get)(USER_ID)).resolves.toEqual({ temperature: 1.1, maxOutputTokens: 300 });
    expect(get).toHaveBeenCalledWith({ userId: USER_ID, id: castId<PresetId>(ACTIVE_PRESET_ID) });
  });

  test("same as chat with no active preset follows the built-in, exactly as a chat turn does", async () => {
    const resolve = buildSideGenParams({
      preset: { get: vi.fn<PresetGet>() },
      settings: {
        loadUserSettings: vi.fn().mockResolvedValue({
          ...DEFAULT_USER_SETTINGS,
          seeds: { ...DEFAULT_USER_SETTINGS.seeds, summarizePreset: { kind: ROLE_PRESET_CHOICE_KINDS.sameAsChat } },
        }),
      },
    }).resolveUtilityPresetParams;
    await expect(resolve(USER_ID)).resolves.toEqual(rolePresetParamsOf(DEFAULT_PROMPT_CONFIG.params));
  });

  test("a named preset lends its generation params and nothing else — not its templates, not chat-only intent", async () => {
    const params: UserIntent = { temperature: 0.9, maxOutputTokens: 640, compaction: { mode: "managed" }, replyMedia: "text+image" };
    expect(presetWithPromptStructure(params).sections).not.toEqual(DEFAULT_PROMPT_CONFIG.sections);
    await expect(utilityPresetResolver(params)(USER_ID)).resolves.toEqual({ temperature: 0.9, maxOutputTokens: 640 });
  });

  test("a named preset's inline reasoning tag pair rides with its params, so a summary splits on that pair", async () => {
    const config = { ...DEFAULT_PROMPT_CONFIG, params: { temperature: 0.9 }, reasoningParse: { autoParse: true, prefix: "<reason>", suffix: "</reason>" } };
    const get = vi.fn<PresetGet>().mockResolvedValue(presetDetail(config));
    await expect(resolverFor({ kind: ROLE_PRESET_CHOICE_KINDS.preset, presetId: UTILITY_PRESET_ID }, get)(USER_ID)).resolves.toEqual({
      temperature: 0.9,
      reasoningTags: { prefix: "<reason>", suffix: "</reason>" },
    });
  });

  test("a stale or unowned named preset degrades to task defaults", async () => {
    const get = vi.fn<PresetGet>().mockRejectedValue(new PresetNotFoundError(castId<PresetId>(UTILITY_PRESET_ID)));
    await expect(resolverFor({ kind: ROLE_PRESET_CHOICE_KINDS.preset, presetId: UTILITY_PRESET_ID }, get)(USER_ID)).resolves.toBeUndefined();
  });

  test("a non-not-found rejection PROPAGATES — never silently replaces the caller's configured sampling (#759)", async () => {
    const dbDown = new Error("connection terminated unexpectedly");
    const get = vi.fn<PresetGet>().mockRejectedValue(dbDown);
    await expect(resolverFor({ kind: ROLE_PRESET_CHOICE_KINDS.preset, presetId: UTILITY_PRESET_ID }, get)(USER_ID)).rejects.toBe(dbDown);
  });
});
