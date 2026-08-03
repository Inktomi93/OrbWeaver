// CT: the Prose settings SECTION (PROSE-1 S2 — prose-settings-section.tsx), a settings-section CONTRIBUTION
// into the chat-behavior pane. Drives the production autosave path: getUserSettings seeds one field per
// editable prose slot (empty ⇒ the shipped default ghosts as the placeholder), a typed value debounces then
// fires updateUserSettingsSection("prose") with the slot-id-keyed patch stamped at the slot's CURRENT
// version, and clearing an override sends the leaf `null` (reset to the shipped wording). Asserts the fired
// patch, never the UI reaction (assert-the-mutation-fired).

import { PROSE_SLOTS } from "@orb/contracts/prose";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ProseSettingsSectionStory } from "../_ct-stories.tsx";

const UPDATE_PROC = "settings.updateUserSettingsSection";
const ARBITER = "chat.arbiter.system";
const NUDGE = "chat.group.roundNudge";

/** The MacroField renders a textarea playing `combobox` (ARIA); each card's label is the slot title. */
const ARBITER_FIELD = PROSE_SLOTS[ARBITER].title;
const NUDGE_FIELD = PROSE_SLOTS[NUDGE].title;

function settingsView(prose: Record<string, unknown> = {}): Record<string, unknown> {
  return { userId: "user_ct_prose", schemaVersion: 7, config: { ...DEFAULT_USER_SETTINGS, prose }, updatedAt: 0 };
}

function stub(page: Page, prose?: Record<string, unknown>): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => settingsView(prose),
    [UPDATE_PROC]: () => ({}),
  });
}

/** The most recent prose-section patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "prose" ? input.patch : undefined;
}

test("a virgin section ghosts each shipped default as the field placeholder (empty ⇒ use the built-in)", async ({ mount, page }) => {
  await stub(page);
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  await expect(arbiter).toHaveValue(""); // no override
  await expect(arbiter).toHaveAttribute("placeholder", PROSE_SLOTS[ARBITER].text);
  // The honest "not customized" read — the state line, not a guess from the empty box.
  await expect(page.getByRole("group", { name: ARBITER_FIELD }).getByText("Using the built-in wording")).toBeVisible();
});

test("typing an override fires updateUserSettingsSection('prose') stamped at the slot's current version", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  await arbiter.fill("Pick whoever has been quiet longest.");
  await arbiter.blur();
  await expect
    .poll(() => lastPatch(trpc)?.[ARBITER], { intervals: [20, 50, 100] })
    .toEqual({ text: "Pick whoever has been quiet longest.", baseVersion: PROSE_SLOTS[ARBITER].version });
  // An untouched slot rides as null (it has no override to preserve) — the patch spells every slot.
  expect(lastPatch(trpc)?.[NUDGE]).toBeNull();
});

test("clearing an existing override sends the leaf null (reset to the shipped wording)", async ({ mount, page }) => {
  const trpc = await stub(page, { [ARBITER]: { text: "an existing director prompt", baseVersion: 1 } });
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  await expect(arbiter).toHaveValue("an existing director prompt");
  await arbiter.fill("");
  await arbiter.blur();
  await expect.poll(() => lastPatch(trpc)?.[ARBITER], { intervals: [20, 50, 100] }).toBeNull();
});

test("the Reset-to-built-in button clears the field, and the write clears the override", async ({ mount, page }) => {
  const trpc = await stub(page, { [ARBITER]: { text: "an existing director prompt", baseVersion: 1 } });
  await mount(<ProseSettingsSectionStory />);
  const card = page.getByRole("group", { name: ARBITER_FIELD });
  await card.getByRole("button", { name: "Reset to built-in" }).click();
  await expect(page.getByRole("textbox", { name: ARBITER_FIELD, exact: true })).toHaveValue("");
  await expect.poll(() => lastPatch(trpc)?.[ARBITER], { intervals: [20, 50, 100] }).toBeNull();
});

test("a required pre-substitution token dropped from an override lints — a warn, never a block", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ProseSettingsSectionStory />);
  const nudge = page.getByRole("textbox", { name: NUDGE_FIELD, exact: true });
  await nudge.fill("Write the next reply.");
  const card = page.getByRole("group", { name: NUDGE_FIELD });
  await expect(card.getByText("Missing {{name}}")).toBeVisible();
  // The lint never blocks: the edit still saves.
  await expect
    .poll(() => lastPatch(trpc)?.[NUDGE], { intervals: [20, 50, 100] })
    .toEqual({ text: "Write the next reply.", baseVersion: PROSE_SLOTS[NUDGE].version });
});
