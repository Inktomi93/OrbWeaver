// CT: the Image-prompts settings SECTION (Phase B ⑫ — imagery-templates-section.tsx), a settings-section
// CONTRIBUTION into the chat-behavior pane. Drives the production autosave path: getUserSettings seeds the
// per-mode MacroFields (empty ⇒ the shipped default ghosts as the placeholder), a typed value debounces then
// fires updateUserSettingsSection("imagery") with the nested {templates,captions} patch, and CLEARING an
// override sends the leaf `null` (reset-to-default). Asserts the fired patch shape (assert-the-mutation-fired).

import { DEFAULT_PROMPT_TEMPLATES } from "@orb/contracts/imagery";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ImageryTemplatesSectionStory } from "../_ct-stories";

const UPDATE_PROC = "settings.updateUserSettingsSection";

/** Build the getUserSettings view with an optional imagery override seed (default: virgin — no overrides). */
function settingsView(imagery = DEFAULT_USER_SETTINGS.imagery): Record<string, unknown> {
  return { userId: "user_ct_imagery", schemaVersion: 6, config: { ...DEFAULT_USER_SETTINGS, imagery }, updatedAt: 0 };
}

function stub(page: Page, imagery?: (typeof DEFAULT_USER_SETTINGS)["imagery"]): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => settingsView(imagery),
    [UPDATE_PROC]: () => ({}),
  });
}

/** The most recent imagery-section patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "imagery" ? input.patch : undefined;
}

function templates(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return lastPatch(trpc)?.["templates"] as Record<string, unknown> | undefined;
}

// The MacroField renders a textarea playing `combobox` (ARIA); each card's label is the mode title (unique).
const CHARACTER_FIELD = "Character portrait";

test("a virgin section ghosts each shipped default as the field placeholder (empty ⇒ use the default)", async ({ mount, page }) => {
  await stub(page);
  await mount(<ImageryTemplatesSectionStory />);
  const characterField = page.getByRole("combobox", { name: CHARACTER_FIELD, exact: true });
  await expect(characterField).toHaveValue(""); // no override
  await expect(characterField).toHaveAttribute("placeholder", DEFAULT_PROMPT_TEMPLATES.character);
});

test("typing a character-mode override fires updateUserSettingsSection('imagery') with the nested templates patch", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ImageryTemplatesSectionStory />);
  const characterField = page.getByRole("combobox", { name: CHARACTER_FIELD, exact: true });
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
  const characterField = page.getByRole("combobox", { name: CHARACTER_FIELD, exact: true });
  await expect(characterField).toHaveValue("an existing override");
  await characterField.fill("");
  await characterField.blur();
  await expect.poll(() => templates(trpc)?.["character"], { intervals: [20, 50, 100] }).toBeNull();
});
