import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { estimateTokens } from "@orb/kit/tokens";
import { resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { editActionName } from "@orb/ui/lib";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { PERSONA_DESCRIPTION_FIELD_NAME, personaDetailsToggleName } from "#client/features/persona/lib/persona-copy.ts";
import type { PersonaActionGroupsStory } from "./_persona-action-groups-stories.tsx";

const STORY = "tests/client/features/persona/components/_persona-action-groups-stories/PersonaActionGroupsStory";
const DESCRIPTION = "A patient traveler records the people and places that {{user}} encounters, keeping their promises and the names of distant towns. ".repeat(
  5,
);
// The design law's reading band (UI-Architecture-and-Layout), and the widths at which the field reaches its cap.
const READING_BAND = { min: 65, max: 75 } as const;
const WIDE_LAYOUT_PX = 1280;
const REGIMES = [
  { name: "wide default", width: 1280, viewport: { width: 1440, height: 1000 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "wide enlarged", width: 1600, viewport: { width: 1920, height: 1000 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "narrow default", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });

    test("the real persona macro counter ends at its code editor without narrowing the editor column or changing chrome fonts", async ({
      mount,
      page,
    }, info) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const persona = await caller.persona.create({ input: { name: "Macro footprint witness", description: DESCRIPTION } });
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "sessions.me",
          "settings.getUserSettings",
          "persona.list",
          "persona.get",
          "worldInfo.listBooks",
          "worldInfo.listForPersona",
          "persona.listConnectedCharacters",
          "preset.get",
          "plugin.listMacros",
        ]),
      );
      await mount<typeof PersonaActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
      await page.getByRole("button", { name: personaDetailsToggleName(persona.name, false), exact: true }).focus();
      await page.keyboard.press("Enter");
      const editor = page.getByRole("group", { name: editActionName(persona.name), exact: true });
      const textarea = page.getByRole("textbox", { name: PERSONA_DESCRIPTION_FIELD_NAME, exact: true });
      await expect(textarea).toHaveValue(persona.description);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const counter = editor.getByText(`~${estimateTokens(persona.description)} tokens`, { exact: true });
      await expect(counter).toBeVisible();
      const field = editor.locator('[data-slot="field-root"]').filter({ has: textarea });
      const label = field.locator('[data-slot="field-label"]');
      const [controlBox, counterBox, fieldBox] = await Promise.all([textarea.boundingBox(), counter.boundingBox(), field.boundingBox()]);
      if (controlBox === null || counterBox === null || fieldBox === null) {
        throw new Error("The actual macro control and token counter must have a rendered footprint");
      }
      await info.attach("persona-macro-footprint", { body: JSON.stringify({ controlBox, counterBox, fieldBox }), contentType: "application/json" });
      expect(Math.abs(counterBox.x + counterBox.width - controlBox.x - controlBox.width)).toBeLessThanOrEqual(1);
      expect(counterBox.y).toBeGreaterThanOrEqual(controlBox.y + controlBox.height);
      const macro = editor.locator('[data-slot="macro-textarea"]').filter({ has: textarea });
      const measure = await resolvedLength(page, `var(${TOKENS["reading.measure-code"].cssVar})`, macro);
      expect(controlBox.width).toBeCloseTo(Math.min(fieldBox.width, measure), 0);
      // The line a reader scans: the text area's content box counted in the field's own monospace characters.
      const line = await textarea.evaluate((node) => {
        const style = getComputedStyle(node);
        const probe = document.createElement("div");
        probe.style.cssText = `position:absolute;visibility:hidden;inline-size:1ch;font:${style.font}`;
        node.parentElement?.append(probe);
        const advance = probe.getBoundingClientRect().width;
        probe.remove();
        const content = node.clientWidth - Number.parseFloat(style.paddingInlineStart) - Number.parseFloat(style.paddingInlineEnd);
        return { content, advance, characters: content / advance };
      });
      await info.attach("persona-description-measure", { body: JSON.stringify(line), contentType: "application/json" });
      // Narrow layouts hold fewer characters than the band; only the wide ones reach the cap, and none may pass it.
      expect(line.characters).toBeLessThanOrEqual(READING_BAND.max);
      expect(line.characters).toBeGreaterThanOrEqual(regime.width >= WIDE_LAYOUT_PX ? READING_BAND.min : 0);
      const fonts = await Promise.all([label, counter, textarea].map((part) => part.evaluate((node) => getComputedStyle(node).fontFamily)));
      expect(fonts[1]).toBe(fonts[0]);
      expect(fonts[2]).not.toBe(fonts[0]);
      // The editor's text fields share one right edge: Name and Title in the identity row, Description in the macro field.
      const rightEdge = async (control: Locator): Promise<number> => {
        const box = await control.boundingBox();
        if (box === null) {
          throw new Error("A persona editor field must have a rendered box");
        }
        return box.x + box.width;
      };
      const edges = await Promise.all(["Name", "Title", "Description"].map((name) => rightEdge(editor.getByRole("textbox", { name, exact: true }))));
      await info.attach("persona-field-edges", { body: JSON.stringify(edges), contentType: "application/json" });
      for (const edge of edges) {
        expect(Math.abs(edge - (edges[0] ?? edge))).toBeLessThanOrEqual(1);
      }
    });
  });
}

test.describe("macro popup composition", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, hasTouch: false, isMobile: false });

  test("the persona editor keeps keyboard completion, popup footprint and helper description on its actual macro control", async ({ mount, page }, info) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const persona = await caller.persona.create({ input: { name: "Keyboard macro witness", description: "Greetings " } });
    await routeTrpc(
      page,
      serveCorpusProcedures(caller, [
        "sessions.me",
        "settings.getUserSettings",
        "persona.list",
        "persona.get",
        "persona.update",
        "worldInfo.listBooks",
        "worldInfo.listForPersona",
        "persona.listConnectedCharacters",
        "preset.get",
        "plugin.listMacros",
      ]),
    );
    await mount<typeof PersonaActionGroupsStory>(STORY, { width: 1280, appearance });
    await page.getByRole("button", { name: personaDetailsToggleName(persona.name, false), exact: true }).focus();
    await page.keyboard.press("Enter");
    const editor = page.getByRole("group", { name: editActionName(persona.name), exact: true });
    const textarea = editor.getByRole("textbox", { name: PERSONA_DESCRIPTION_FIELD_NAME, exact: true });
    const field = editor.locator('[data-slot="field-root"]').filter({ has: page.getByRole("textbox", { name: PERSONA_DESCRIPTION_FIELD_NAME, exact: true }) });
    const label = field.locator('[data-slot="field-label"]');
    await label.click();
    await expect(textarea).toBeFocused();
    await expect(textarea).toHaveAccessibleName(PERSONA_DESCRIPTION_FIELD_NAME);
    await textarea.fill("Greetings ");
    await textarea.press("End");
    await textarea.pressSequentially("{{user");
    const popup = editor.getByRole("listbox", { name: "Macro suggestions", exact: true });
    await expect(popup).toBeVisible();
    const selected = popup.getByRole("option", { selected: true });
    await expect(selected).toContainText("{{user}}");
    await expect(textarea).toHaveAttribute("aria-controls", (await popup.getAttribute("id")) ?? "");
    await expect(textarea).toHaveAttribute("aria-activedescendant", (await selected.getAttribute("id")) ?? "");
    await textarea.press("ArrowDown");
    await textarea.press("ArrowUp");
    await expect(selected).toContainText("{{user}}");
    const [controlBox, popupBox] = await Promise.all([textarea.boundingBox(), popup.boundingBox()]);
    if (controlBox === null || popupBox === null) {
      throw new Error("The live macro popup and control must have rendered boxes");
    }
    await info.attach("persona-macro-popup-footprint", { body: JSON.stringify({ controlBox, popupBox }), contentType: "application/json" });
    expect(Math.abs(popupBox.x - controlBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(popupBox.width - controlBox.width)).toBeLessThanOrEqual(1);
    expect(popupBox.y).toBeGreaterThanOrEqual(controlBox.y + controlBox.height);
    const optionDescription = selected.locator("span > span").last();
    await expect(optionDescription).not.toBeEmpty();
    const helper = field.locator('[data-slot="macro-textarea-helper"]');
    const fonts = await Promise.all(
      [label, helper, popup, optionDescription, textarea].map((part) => part.evaluate((node) => getComputedStyle(node).fontFamily)),
    );
    expect(fonts[1]).toBe(fonts[0]);
    expect(fonts[2]).toBe(fonts[0]);
    expect(fonts[3]).toBe(fonts[0]);
    expect(fonts[4]).not.toBe(fonts[0]);
    await textarea.press("Enter");
    await expect(popup).toBeHidden();
    await expect(textarea).toBeFocused();
    await expect(textarea).toHaveValue("Greetings {{user}}");
    await textarea.press("Tab");
    await expect.poll(async () => (await caller.persona.get({ personaId: persona.id })).description).toBe("Greetings {{user}}");
    const counterText = `~${estimateTokens("Greetings {{user}}")} tokens`;
    await expect(editor.getByText(counterText, { exact: true })).toBeVisible();
    await expect(textarea).toHaveAccessibleName(PERSONA_DESCRIPTION_FIELD_NAME);
    await expect(textarea).toHaveAccessibleDescription(counterText);
  });
});
