// CT: the Image-prompts settings SECTION (Phase B ⑫ — imagery-templates-section.tsx), a settings-section
// CONTRIBUTION into the chat-behavior pane. Drives the production autosave path: getUserSettings seeds the
// per-mode MacroFields (empty ⇒ the shipped default ghosts as the placeholder), a typed value debounces then
// fires updateUserSettingsSection("imagery") with the nested {templates,captions} patch, and CLEARING an
// override sends the leaf `null` (reset-to-default). Asserts the fired patch shape (assert-the-mutation-fired).

// @orb-waive-file no-test-fabrication(Record<string, unknown> | undefined): baselined when the gate widened to value casts; burn-down item 906.

import { DEFAULT_PROMPT_TEMPLATES } from "@orb/contracts/imagery";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { makePresetDetail } from "@orb/testkit/node/factories/preset-view.ts";
import { lastSettingsPatch, UPDATE_USER_SETTINGS_SECTION } from "@orb/testkit/node/last-settings-patch.ts";
import type { TrpcRecorder, TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { userSettingsView } from "@orb/testkit/node/user-settings-view.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { ImageryTemplatesSectionStory } from "../_ct-stories.tsx";

/** Build the getUserSettings view with an optional imagery override seed (default: virgin — no overrides). */
function settingsView(imagery = DEFAULT_USER_SETTINGS.imagery): TrpcWireOutput<"settings.getUserSettings"> {
  return userSettingsView({ imagery }, { schemaVersion: 6 });
}

function stub(page: Page, imagery?: (typeof DEFAULT_USER_SETTINGS)["imagery"]): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => settingsView(imagery),
    [UPDATE_USER_SETTINGS_SECTION]: () => settingsView(imagery),
    // IMGMAC — the section now reads the active-preset plane (the built-in default declares none, so the
    // pre-IMGMAC tests below are unaffected: the hook doesn't even fetch when `defaultPresetId` is null).
    "preset.get": () => makePresetDetail({ config: { ...DEFAULT_PROMPT_CONFIG, userMacros: [] } }),
  });
}

function templates(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return lastSettingsPatch(trpc, "imagery")?.["templates"] as Record<string, unknown> | undefined;
}

// The MacroField renders a textarea playing `combobox` (ARIA); each card's label is the mode title (unique).
const CHARACTER_FIELD = "Character portrait";

test("a virgin section ghosts each shipped default as the field placeholder (empty ⇒ use the default)", async ({ mount, page }) => {
  await stub(page);
  await mount(<ImageryTemplatesSectionStory />);
  const characterField = page.getByRole("textbox", { name: CHARACTER_FIELD, exact: true });
  await expect(characterField).toHaveValue(""); // no override
  await expect(characterField).toHaveAttribute("placeholder", DEFAULT_PROMPT_TEMPLATES.character);
});

test("typing a character-mode override fires updateUserSettingsSection('imagery') with the nested templates patch", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ImageryTemplatesSectionStory />);
  const characterField = page.getByRole("textbox", { name: CHARACTER_FIELD, exact: true });
  await characterField.fill("my custom {{char}} portrait prompt");
  await characterField.blur();
  await expect.poll(() => templates(trpc)?.["character"], { intervals: [20, 50, 100] }).toBe("my custom {{char}} portrait prompt");
  // An untouched mode is sent as null (the leaf-clear sentinel — it has no override to preserve).
  expect(templates(trpc)?.["face"]).toBeNull();
});

test("clearing an existing override sends the leaf null (reset to the shipped default)", async ({ mount, page }) => {
  // Seed an active character override, then clear the field → the patch carries `templates.character: null`.
  const trpc = await stub(page, { templates: { character: "an existing override" }, captions: {} });
  await mount(<ImageryTemplatesSectionStory />);
  const characterField = page.getByRole("textbox", { name: CHARACTER_FIELD, exact: true });
  await expect(characterField).toHaveValue("an existing override");
  await characterField.fill("");
  await characterField.blur();
  await expect.poll(() => templates(trpc)?.["character"], { intervals: [20, 50, 100] }).toBeNull();
});

// IMGMAC (owner ruling: YES) — the user-macro plane REACHES the imagery mode templates. This file used to
// carry the opposite: the section's suggestion list was hand-curated to `{{char}}`/`{{user}}` with a written
// exemption saying a user macro provably does not resolve at extract time (`extractQuiet` ran `processMacros`
// with no registry). The server half now builds the per-call registry from both authoring homes, so the
// popover offers the plane — and a caption card, whose instruction resolves NO macros at all, still offers
// nothing (the exemption that survives, because it is still true).

const USER_MACRO_ROW = "{{sceneTone}}";
const USER_MACRO_GLOSS = "This game's tonal register.";
const ACTIVE_PRESET_ID = "preset_ct_active";
const USER_MACROS = [{ name: "sceneTone", description: USER_MACRO_GLOSS, args: [], body: "hushed", inputs: [], strict: false }];

/** The settings view with a real ACTIVE preset (the plane's source), plus the imagery seed. */
function stubWithPlane(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => userSettingsView({ seeds: { defaultPresetId: castId<PresetId>(ACTIVE_PRESET_ID) } }, { schemaVersion: 6 }),
    "preset.get": () => makePresetDetail({ config: { ...DEFAULT_PROMPT_CONFIG, userMacros: USER_MACROS } }),
    [UPDATE_USER_SETTINGS_SECTION]: () => userSettingsView({ seeds: { defaultPresetId: castId<PresetId>(ACTIVE_PRESET_ID) } }, { schemaVersion: 6 }),
  });
}

test("IMGMAC: an EXTRACTION mode template completes against the active preset's user macros, gloss and all", async ({ mount, page }) => {
  await stubWithPlane(page);
  const component = await mount(<ImageryTemplatesSectionStory />);

  const characterField = component.getByRole("textbox", { name: CHARACTER_FIELD, exact: true });
  await characterField.click();
  await characterField.pressSequentially("{{scen");

  // The ROW is the affordance — and it carries the DEFINITION's own gloss, so it came from the plane.
  await expect(page.getByRole("option", { name: USER_MACRO_ROW })).toBeVisible();
  await expect(page.getByText(USER_MACRO_GLOSS)).toBeVisible();
});

test("IMGMAC: a CAPTION card still offers nothing — the surviving exemption (the image is the subject)", async ({ mount, page }) => {
  await stubWithPlane(page);
  const component = await mount(<ImageryTemplatesSectionStory />);

  const captionField = component.getByRole("textbox", { name: "Character portrait (from avatar)", exact: true });
  await captionField.click();
  await captionField.pressSequentially("{{scen");

  await expect(page.getByRole("option", { name: USER_MACRO_ROW })).toHaveCount(0);
});
