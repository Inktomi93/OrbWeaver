import { createPersonaSchema } from "@orb/contracts/persona";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { PersonaActionGroupsStory } from "./_persona-action-groups-stories.tsx";

const STORY = "tests/client/features/persona/components/_persona-action-groups-stories/PersonaActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "persona.list",
  "persona.get",
  "worldInfo.listBooks",
  "worldInfo.listForPersona",
  "persona.listConnectedCharacters",
  "character.list",
  "preset.get",
  "persona.export",
  "persona.duplicate",
  "persona.create",
] as const;
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });

    test("the persona editor retains all lifecycle actions and cancelling Delete preserves the named persona", async ({ mount, page }, info) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const nameLimit = createPersonaSchema.shape.name.maxLength;
      if (nameLimit === null) {
        throw new Error("The persona name boundary must be available for the long-name case");
      }
      const persona = await caller.persona.create({
        input: {
          name: `${"Traveler from the northern provinces ".repeat(nameLimit).slice(0, nameLimit - 1)}x`,
          description: "The identity whose lifecycle controls are under review.",
        },
      });
      const name = persona.name;
      const before = await caller.persona.list();
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof PersonaActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
      const rowName = page.getByText(name, { exact: true });
      await expect(rowName).toBeVisible();
      const nameColumn = rowName.locator("..");
      const titleFloor = await resolvedLength(page, "var(--width-title-floor)", nameColumn);
      const nameBox = await nameColumn.boundingBox();
      if (nameBox === null) {
        throw new Error("The persona identity must retain its visible title column");
      }
      expect(nameBox.width).toBeGreaterThanOrEqual(titleFloor);
      const expand = page.getByRole("button", { name: `Show details for ${name}`, exact: true });
      await expand.focus();
      await page.keyboard.press("Enter");
      const editor = page.getByRole("group", { name: `Edit ${name}`, exact: true });
      const footer = editor.locator('[data-slot="persona-editor-footer"]');
      const duplicate = footer.getByRole("button", { name: "Duplicate", exact: true });
      const exportButton = footer.getByRole("button", { name: "Export", exact: true });
      const remove = footer.getByRole("button", { name: "Delete", exact: true });
      await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
      await duplicate.focus();
      await page.keyboard.press("Tab");
      await expect(exportButton).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(remove).toBeFocused();
      const geometry = await actionGroupGeometry(footer, [duplicate, exportButton, remove]);
      await info.attach("persona-footer-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      expect(
        (await actionGroupGeometry(page.getByRole("group", { name: "Persona action host", exact: true }), [duplicate, exportButton, remove])).inlineOverflow,
      ).toBeLessThanOrEqual(1);
      const floor = await resolvedLength(page, "var(--size-control-sm)", footer);
      for (const box of geometry.controls) {
        expect(box.height).toBeGreaterThanOrEqual(floor);
      }
      const previousMinimum = await duplicate.evaluate((node) => node.style.minInlineSize);
      await duplicate.evaluate((node) => {
        node.style.minInlineSize = "200vw";
      });
      const planted = await actionGroupGeometry(footer, [duplicate, exportButton, remove]);
      await duplicate.evaluate((node, previous) => {
        node.style.minInlineSize = previous;
      }, previousMinimum);
      expect(planted.inlineOverflow).toBeGreaterThan(1);
      await page.keyboard.press("Enter");
      const confirm = page.getByRole("alertdialog", { name: "Delete this persona?", exact: true });
      await expect(confirm).toContainText(name);
      await confirm.getByRole("button", { name: "Cancel", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(confirm).toBeHidden();
      await expect(remove).toBeFocused();
      expect(await caller.persona.list()).toEqual(before);
      expect(calls.count("persona.duplicate")).toBe(0);
      const exported = await caller.persona.export({ personaId: persona.id });
      const download = page.waitForEvent("download");
      await exportButton.focus();
      await page.keyboard.press("Enter");
      expect((await download).suggestedFilename()).toBe(exported.filename);
      expect(calls.lastInput("persona.export")).toEqual({ personaId: persona.id });
    });

    test("the persona band keeps Restore, From character and New reachable without conflating their actions", async ({ mount, page }, info) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const before = await caller.persona.list();
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof PersonaActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
      const from = page.getByRole("button", { name: "New persona from a character", exact: true });
      const restore = page.getByRole("button", { name: "Restore a persona from an Orbweaver backup file", exact: true });
      const create = page.getByRole("button", { name: "New persona", exact: true });
      await from.focus();
      await page.keyboard.press("Tab");
      await expect(restore).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(create).toBeFocused();
      const geometry = await actionGroupGeometry(page.getByRole("group", { name: "Persona action host", exact: true }), [from, restore, create]);
      await info.attach("persona-band-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      await from.focus();
      await page.keyboard.press("Enter");
      const picker = page.getByRole("dialog", { name: "New persona from a character", exact: true });
      await expect(picker.getByRole("combobox", { name: "New persona from a character", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(picker).toBeHidden();
      await expect(from).toBeFocused();
      expect(await caller.persona.list()).toEqual(before);
      const chooser = page.waitForEvent("filechooser");
      await restore.focus();
      await page.keyboard.press("Enter");
      await (await chooser).setFiles([]);
      expect(calls.count("persona.create")).toBe(0);
      await create.focus();
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await caller.persona.list()).length).toBe(before.length + 1);
      expect(calls.lastInput("persona.create")).toEqual({ input: { name: "New persona", description: "" } });
    });

    test("the expanded persona reports saving, preserves a refused edit and retries the actual pending save", async ({ mount, page }, info) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const persona = await caller.persona.create({
        input: { name: "Autosave feedback witness", description: "A real editor session under an external write failure." },
      });
      const firstSave = holdServed();
      let intercepted = false;
      const calls = await routeTrpc(page, {
        ...serveCorpusProcedures(caller, READS),
        ...serveCorpusProcedures(caller, ["persona.update"], (input) => {
          if (input.personaId !== persona.id || intercepted) {
            return;
          }
          intercepted = true;
          return firstSave;
        }),
      });
      await mount<typeof PersonaActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
      await page.getByRole("button", { name: `Show details for ${persona.name}`, exact: true }).focus();
      await page.keyboard.press("Enter");
      const editor = page.getByRole("group", { name: `Edit ${persona.name}`, exact: true });
      const title = editor.getByRole("textbox", { name: "Title", exact: true });
      await expect(title).toHaveValue(persona.title ?? "");
      const nextTitle = "A locally saved qualification identity";
      await title.fill(nextTitle);
      await firstSave.requested;
      const status = editor.locator('[data-slot="autosave-status"]');
      try {
        await expect(status).toHaveText("Saving…");
        expect((await caller.persona.get({ personaId: persona.id })).title).toBe(persona.title);
      } finally {
        firstSave.fail();
      }
      await expect(status).toHaveAttribute("role", "alert");
      await expect(status).toContainText("Save failed");
      await expect(title).toHaveValue(nextTitle);
      const retry = status.getByRole("button", { name: "Retry", exact: true });
      const geometry = await actionGroupGeometry(status, [retry]);
      await info.attach("persona-save-retry-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      await retry.focus();
      await page.keyboard.press("Enter");
      await expect(status).toHaveAttribute("role", "status");
      await expect(status).toHaveText("Saved");
      await expect.poll(async () => (await caller.persona.get({ personaId: persona.id })).title).toBe(nextTitle);
      expect(calls.count("persona.update")).toBe(2);
      await expect(title).toHaveValue(nextTitle);
    });
  });
}
