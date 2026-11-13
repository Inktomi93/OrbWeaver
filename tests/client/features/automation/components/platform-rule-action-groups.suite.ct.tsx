import {
  IMAGE_NEGATIVE_PROMPT_FIELD_NAME,
  IMAGE_SIZE_FIELD_NAME,
  IMAGE_SIZE_LABELS,
  IMAGE_SIZE_MODE_DEFAULT,
  ROLE_ROWS_ORDERED,
  ROLE_STATUS_LABELS,
  ROW_DELETE_NAME,
} from "@orb/client/lib";
import { AUTOMATION_RULE_NAME_MAX_CHARS, automationActionSchema, automationRuleEditableSchema, automationTriggerFor } from "@orb/contracts/automation";
import { MAX_IMAGE_COUNT, MIN_IMAGE_COUNT, SIZE_PRESET_NAMES } from "@orb/contracts/imagery";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import {
  actionGroupGeometry,
  enlargedTextFindings as findings,
  resolvedLength,
  LAYOUT_SUBPIXEL_PX as SUBPIXEL,
  setRootFontScale,
} from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { defaultChoiceName, editActionName, moreActionsName } from "@orb/ui/lib";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { connectionRolePickerName } from "#client/components/shared-control-names.ts";
import {
  RULE_ACTIONS_ORDER_TEXT,
  RULE_ADD_KEYWORD_NAME,
  RULE_CHOOSE_IMAGE_SIZE_NAME,
  RULE_EDITOR_AUTOSAVE_NOTE,
  RULE_EDITOR_CLOSE_NAME,
  RULE_EDITOR_NAME,
  RULE_INCLUDE_AUTOMATION_EVENTS_NAME,
  RULE_NAME_FIELD_NAME,
  RULE_OUTPUTS_NAME,
  RULE_RUN_NOW_NAME,
  RULE_SCORE_VARIABLE_NAME,
  RULE_SUGGESTED_TURNS_NAME,
  RULE_WORLD_BOOK_NAME,
  ruleConnectionsName,
  ruleTestName,
  ruleTestResultName,
} from "#client/features/automation/lib/automation-names.ts";
import { RULE_UNSET_EFFECTS, ruleEnabledSwitchName } from "#client/features/automation/lib/rule-copy.ts";
import { AUTOSAVE_NOT_SAVED_TEXT } from "#client/forms/editor/autosave-status-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ChatRulesStory, RuleActionGroupsStory } from "./_rule-action-groups-stories.tsx";

const STORY = "tests/client/features/automation/components/_rule-action-groups-stories/RuleActionGroupsStory";
const CHAT_STORY = "tests/client/features/automation/components/_rule-action-groups-stories/ChatRulesStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "automation.listOwnerRules",
  "automation.listRulePresets",
  "automation.listRuleTools",
  "automation.testRule",
  "automation.listFires",
  "automation.updateRule",
  "automation.listRules",
  "worldInfo.listForChat",
] as const;
async function paintedBox(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The control must paint");
  }
  return box;
}

/** The lines a run paints, and the fewest its words need at `width`: laid greedily at its own font, a word wider than the room taking the lines
 *  it spans. Runs in the page. */
function wrappedLines(node: Element, width: number): { readonly needed: number; readonly painted: number } {
  const style = getComputedStyle(node);
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("The text measure needs a 2D canvas");
  }
  context.font = style.font;
  const space = context.measureText(" ").width;
  let needed = 0;
  let line = Number.POSITIVE_INFINITY;
  for (const word of node.textContent.split(/\s+/u).filter((part) => part !== "")) {
    const wide = context.measureText(word).width;
    if (line + space + wide <= width) {
      line += space + wide;
    } else {
      needed += Math.ceil(wide / width);
      line = wide > width ? wide % width : wide;
    }
  }
  return { needed, painted: Math.round(node.getBoundingClientRect().height / Number.parseFloat(style.lineHeight)) };
}

// The share of the phone a connection picker's value keeps at enlarged text, the rest going to the page, the card, the panel and the picker.
const VALUE_SHARE = 0.5;
const ENLARGED_PHONE_SCALES = [
  { name: "200% text", factor: 2 },
  { name: "300% layout", factor: 3 },
] as const;
const RULE_CONNECTION_READS = [...READS, "connection.list", "connection.listBindings", "connection.providersAvailable"] as const;
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

    test("an owned rule retains Edit, free Test and menu identity without dispatching a live action", async ({ mount, page }, info) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const captured = (await caller.automation.listOwnerRules())[0];
      if (captured === undefined) {
        throw new Error("The corpus must contain an owned library rule");
      }
      const name = "Library review ".repeat(AUTOMATION_RULE_NAME_MAX_CHARS).slice(0, AUTOMATION_RULE_NAME_MAX_CHARS);
      const rule = await caller.automation.updateRule({
        ...automationRuleEditableSchema.strip().parse(captured),
        name,
        ruleId: captured.id,
        timeZone: captured.timeZone ?? UTC_TIME_ZONE,
      });
      const beforeFires = await caller.automation.listFires({ ruleId: rule.id });
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof RuleActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
      const nameText = page.getByText(name, { exact: true });
      await expect(nameText).toBeVisible();
      await expect.poll(() => nameText.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      const nameBox = await nameText.boundingBox();
      const enableBox = await page.getByRole("switch", { name: ruleEnabledSwitchName(name), exact: true }).boundingBox();
      if (nameBox === null || enableBox === null) {
        throw new Error("The closed rule must retain its visible identity and enable switch");
      }
      expect(Math.min(nameBox.x + nameBox.width - enableBox.x, nameBox.y + nameBox.height - enableBox.y)).toBeLessThanOrEqual(0);
      const disclosure = page.getByRole("button").filter({ has: page.getByText(name, { exact: true }) });
      await disclosure.focus();
      await page.keyboard.press("Enter");
      const edit = page.getByRole("button", { name: editActionName(name), exact: true });
      const dryRun = page.getByRole("button", { name: ruleTestName(name), exact: true });
      const more = page.getByRole("button", { name: moreActionsName(name), exact: true });
      await edit.focus();
      await page.keyboard.press("Tab");
      await expect(dryRun).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(more).toBeFocused();
      const geometry = await actionGroupGeometry(dryRun.locator(".."), [edit, dryRun, more]);
      await info.attach("rule-actions-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      expect(
        (await actionGroupGeometry(page.getByRole("group", { name: "Rule action host", exact: true }), [edit, dryRun, more])).inlineOverflow,
      ).toBeLessThanOrEqual(1);
      const floor = await resolvedLength(page, `var(${TOKENS["size.control-sm"].cssVar})`, dryRun.locator(".."));
      for (const box of geometry.controls) {
        expect(box.height).toBeGreaterThanOrEqual(floor);
      }
      await edit.focus();
      await page.keyboard.press("Enter");
      const editor = page.getByRole("region", { name: RULE_EDITOR_NAME, exact: true });
      await expect(editor.getByRole("textbox", { name: RULE_NAME_FIELD_NAME, exact: true })).toHaveValue(name);
      await editor.getByRole("button", { name: RULE_EDITOR_CLOSE_NAME, exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(editor).toBeHidden();
      await expect(edit).toBeFocused();
      expect(calls.count("automation.updateRule")).toBe(0);
      await dryRun.focus();
      await page.keyboard.press("Enter");
      const result = page.getByRole("status", { name: ruleTestResultName(name), exact: true });
      await expect(result).toContainText(/Condition would (?:NOT )?match\./u);
      expect(calls.count("automation.testRule")).toBe(1);
      const previousIds = new Set(beforeFires.map((fire) => fire.id));
      const added = (await caller.automation.listFires({ ruleId: rule.id })).filter((fire) => !previousIds.has(fire.id));
      expect(added.map((fire) => fire.outcome)).toEqual(["test_run"]);
      await more.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menuitem", { name: RULE_RUN_NOW_NAME, exact: true })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(more).toBeFocused();
      expect(calls.count("automation.runRuleNow")).toBe(0);
      expect(calls.count("automation.deleteRule")).toBe(0);
      expect((await caller.automation.listOwnerRules()).find((entry) => entry.id === rule.id)).toEqual(rule);
    });
  });
}

test.describe("rule editor field rows", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the trigger label and the automation switch follow the form's own field grammar", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const captured = (await caller.automation.listOwnerRules())[0];
    if (captured === undefined) {
      throw new Error("The corpus must contain an owned library rule");
    }
    await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance });
    await page
      .getByRole("button")
      .filter({ has: page.getByText(captured.name, { exact: true }) })
      .click();
    await page.getByRole("button", { name: editActionName(captured.name), exact: true }).click();
    const editor = page.getByRole("region", { name: RULE_EDITOR_NAME, exact: true });
    const typeOf = (label: string): Promise<string> =>
      editor.getByText(label, { exact: true }).evaluate((node) => {
        const style = getComputedStyle(node);
        return `${style.fontSize}/${style.fontWeight}`;
      });
    expect(await typeOf("When")).toBe(await typeOf(RULE_NAME_FIELD_NAME));
    const automationSwitch = editor.getByRole("switch", { name: RULE_INCLUDE_AUTOMATION_EVENTS_NAME, exact: true });
    await expect(automationSwitch.locator("xpath=ancestor::*[@data-orientation][1]")).toHaveAttribute("data-orientation", "horizontal");
  });

  test("a rule's unset image slot says it follows the author's role in view, not only behind the hint", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const captured = (await caller.automation.listOwnerRules())[0];
    if (captured === undefined) {
      throw new Error("The corpus must contain an owned library rule");
    }
    const role = ROLE_ROWS_ORDERED.find((row) => row.task === "generateImage");
    if (role === undefined) {
      throw new Error("Model roles carries no image generation row");
    }
    await caller.connection.setBinding({ task: role.task, connectionId: null });
    await caller.automation.updateRule({
      ...automationRuleEditableSchema.strip().parse(captured),
      trigger: automationTriggerFor("character.updated"),
      actions: [automationActionSchema.parse({ type: "generate_image", mode: "character_multimodal", quiet: true })],
      ruleId: captured.id,
      timeZone: captured.timeZone ?? UTC_TIME_ZONE,
    });
    await routeTrpc(page, serveCorpusProcedures(caller, RULE_CONNECTION_READS));
    await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance });
    await page
      .getByRole("button")
      .filter({ has: page.getByText(captured.name, { exact: true }) })
      .click();
    await page.getByRole("button", { name: ruleConnectionsName(captured.name), exact: true }).click();
    const slot = page.getByRole("group", { name: role.heading, exact: true });
    await expect(slot.getByRole("combobox", { name: connectionRolePickerName(role.label), exact: true })).toContainText(`Same as my ${role.label} role`);
    await expect(slot.getByRole("img", { name: ROLE_STATUS_LABELS.unset, exact: true })).toBeVisible();
    // The readout says what the fallback resolves to, so the picker and the readout read as one state.
    await expect(slot.getByText(RULE_UNSET_EFFECTS.generateImage ?? "", { exact: true })).toBeVisible();
    // The unset consequence of the user's own role would be wrong here: an unset rule slot follows the author's role.
    await expect(slot.getByText(role.unsetEffect ?? "", { exact: true })).toHaveCount(0);
  });

  test("the Connections panel holds a role's hint and its focus ring inside its clip", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const captured = (await caller.automation.listOwnerRules())[0];
    if (captured === undefined) {
      throw new Error("The corpus must contain an owned library rule");
    }
    await caller.automation.updateRule({
      ...automationRuleEditableSchema.strip().parse(captured),
      trigger: automationTriggerFor("character.updated"),
      actions: [automationActionSchema.parse({ type: "generate_image", mode: "character_multimodal", quiet: true })],
      ruleId: captured.id,
      timeZone: captured.timeZone ?? UTC_TIME_ZONE,
    });
    await routeTrpc(page, serveCorpusProcedures(caller, RULE_CONNECTION_READS));
    await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance });
    await page
      .getByRole("button")
      .filter({ has: page.getByText(captured.name, { exact: true }) })
      .click();
    const trigger = page.getByRole("button", { name: ruleConnectionsName(captured.name), exact: true });
    await trigger.click();
    const panel = page
      .locator('[data-slot="collapsible-panel"]')
      .filter({ has: page.locator('[data-slot="rule-connections"]') })
      .last();
    const hint = panel.locator('[data-slot="hint-trigger"]').first();
    const picker = panel.getByRole("combobox").first();
    const [panelBox, weight, offset] = await Promise.all([
      panel.boundingBox(),
      resolvedLength(page, `var(${TOKENS["border-width.rule"].cssVar})`, hint),
      resolvedLength(page, `var(${TOKENS["focus-ring.offset"].cssVar})`, hint),
    ]);
    if (panelBox === null) {
      throw new Error("The panel must paint");
    }
    // The first row's controls each keep their whole focus ring inside the panel's clip.
    for (const control of [hint, picker]) {
      await control.focus();
      const box = await control.boundingBox();
      if (box === null) {
        throw new Error("The first row's controls must paint");
      }
      expect(box.y - (weight + offset)).toBeGreaterThanOrEqual(panelBox.y);
    }
    // A press on the hint's top edge reaches the hint, never the trigger above the panel.
    const hintBox = await hint.boundingBox();
    if (hintBox === null) {
      throw new Error("The hint must paint");
    }
    const topEdge = { x: hintBox.x + hintBox.width / 2, y: hintBox.y + 1 };
    expect(await page.evaluate((point) => document.elementFromPoint(point.x, point.y)?.closest('[data-slot="hint-trigger"]') !== null, topEdge)).toBe(true);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  for (const scale of ENLARGED_PHONE_SCALES) {
    test.describe(`phone at ${scale.name}`, () => {
      test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

      test("the rule card keeps its connection slot's heading, hint, badges and picker inside the panel, and the value on the lines the phone needs", async ({
        mount,
        page,
      }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        const appearance = appearanceSettingsSchema.parse({});
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        const captured = (await caller.automation.listOwnerRules())[0];
        if (captured === undefined) {
          throw new Error("The corpus must contain an owned library rule");
        }
        const role = ROLE_ROWS_ORDERED.find((row) => row.task === "generateImage");
        if (role === undefined) {
          throw new Error("Model roles carries no image generation row");
        }
        await caller.automation.updateRule({
          ...automationRuleEditableSchema.strip().parse(captured),
          trigger: automationTriggerFor("character.updated"),
          actions: [automationActionSchema.parse({ type: "generate_image", mode: "character_multimodal", quiet: true })],
          ruleId: captured.id,
          timeZone: captured.timeZone ?? UTC_TIME_ZONE,
        });
        await routeTrpc(page, serveCorpusProcedures(caller, RULE_CONNECTION_READS));
        await mount<typeof RuleActionGroupsStory>(STORY, { width: 390, appearance });
        await setRootFontScale(page, channelName("fontScale"), scale.factor);
        await page
          .getByRole("button")
          .filter({ has: page.getByText(captured.name, { exact: true }) })
          .click();
        await page.getByRole("button", { name: ruleConnectionsName(captured.name), exact: true }).click();
        const slot = page.getByRole("group", { name: role.heading, exact: true });
        await expect(slot.getByRole("combobox", { name: connectionRolePickerName(role.label), exact: true })).toBeVisible();
        await expect.poll(() => findings(page.getByRole("group", { name: "Rule action host", exact: true }))).toEqual([]);
        const panel = page
          .locator('[data-slot="collapsible-panel"]')
          .filter({ has: page.locator('[data-slot="rule-connections"]') })
          .last();
        const [panelBox, hintBox] = await Promise.all([paintedBox(panel), paintedBox(slot.locator('[data-slot="hint-trigger"]').first())]);
        expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
        // Every requirement badge wraps inside the panel too; a badge is no control, so the probe does not see one that runs past it. The status
        // dot shares the badge slot and carries no text, so only the worded chips count.
        const badges = await slot
          .locator('[data-slot="badge"]')
          .filter({ hasText: /\S/u })
          .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
        expect(badges.length).toBeGreaterThan(0);
        expect(badges.filter((right) => right > panelBox.x + panelBox.width + SUBPIXEL)).toEqual([]);
        // The picker takes a line of its own: it spans the slot to the held nested step, and its chrome is the tokens' width, so the value takes every
        // other pixel.
        const picker = slot.getByRole("combobox", { name: connectionRolePickerName(role.label), exact: true });
        const value = picker.locator('[data-slot="select-value"]');
        const [hostBox, slotBox, pickerBox, valueBox, iconBox, indent, inset, gap, edge] = await Promise.all([
          paintedBox(page.getByRole("group", { name: "Rule action host", exact: true })),
          paintedBox(slot),
          paintedBox(picker),
          paintedBox(value),
          paintedBox(picker.locator('[data-slot="select-icon"]')),
          resolvedLength(page, `var(${TOKENS["spacing.indent"].cssVar})`, slot),
          resolvedLength(page, `var(${TOKENS["spacing.picker-inset"].cssVar})`, slot),
          resolvedLength(page, `var(${TOKENS["spacing.picker-gap"].cssVar})`, slot),
          resolvedLength(page, `var(${TOKENS["border-width.control"].cssVar})`, slot),
        ]);
        expect(pickerBox.x - slotBox.x).toBeLessThanOrEqual(indent + SUBPIXEL);
        expect(slotBox.x + slotBox.width - (pickerBox.x + pickerBox.width)).toBeLessThanOrEqual(SUBPIXEL);
        const chrome = 2 * (inset + edge) + gap + iconBox.width;
        expect(Math.abs(pickerBox.width - valueBox.width - chrome)).toBeLessThanOrEqual(SUBPIXEL);
        // The value keeps half the phone's width, and paints no more lines than its own words need laid greedily into that half at its measured
        // font, so a page or panel inset that grows with the text costs it width and lines.
        const room = hostBox.width * VALUE_SHARE;
        expect(valueBox.width).toBeGreaterThanOrEqual(room);
        const lines = await value.evaluate(wrappedLines, room);
        expect(lines.painted, JSON.stringify({ room, valueWidth: valueBox.width, ...lines })).toBeLessThanOrEqual(lines.needed);
      });
    });
  }

  test("a held save is stated at the editor's body size, not under it", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const captured = (await caller.automation.listOwnerRules())[0];
    if (captured === undefined) {
      throw new Error("The corpus must contain an owned library rule");
    }
    await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance });
    await page
      .getByRole("button")
      .filter({ has: page.getByText(captured.name, { exact: true }) })
      .click();
    await page.getByRole("button", { name: editActionName(captured.name), exact: true }).click();
    const editor = page.getByRole("region", { name: RULE_EDITOR_NAME, exact: true });
    await editor.getByRole("textbox", { name: RULE_NAME_FIELD_NAME, exact: true }).fill("");
    const held = editor.getByRole("status").filter({ hasText: AUTOSAVE_NOT_SAVED_TEXT });
    await expect(held).toBeVisible();
    const sizeOf = (node: Pick<typeof held, "evaluate">): Promise<number> => node.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const sentence = await sizeOf(held.locator("p").last());
    const body = await sizeOf(editor.getByText(RULE_ACTIONS_ORDER_TEXT, { exact: true }));
    expect(sentence).toBeGreaterThanOrEqual(body);
  });

  test("the editor's explanatory lines keep the reading measure inside a wide pane", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const captured = (await caller.automation.listOwnerRules())[0];
    if (captured === undefined) {
      throw new Error("The corpus must contain an owned library rule");
    }
    await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance });
    await page
      .getByRole("button")
      .filter({ has: page.getByText(captured.name, { exact: true }) })
      .click();
    await page.getByRole("button", { name: editActionName(captured.name), exact: true }).click();
    const editor = page.getByRole("region", { name: RULE_EDITOR_NAME, exact: true });
    const line = editor.getByText(RULE_EDITOR_AUTOSAVE_NOTE, { exact: true });
    const box = await line.boundingBox();
    if (box === null) {
      throw new Error("The explanatory line must render");
    }
    expect(box.width).toBeLessThanOrEqual((await resolvedLength(page, `var(${TOKENS["reading.measure-prose"].cssVar})`, line)) + 1);
  });

  test("two analysis routes asking for confirmation are named inside the Outputs group, in the destructive ink", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    let target: { readonly chatId: ChatId; readonly name: string } | undefined;
    for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
      if (!(await caller.chat.getChat({ chatId: room.id })).viewerIsHost) {
        continue;
      }
      const rule = (await caller.automation.listRules({ chatId: room.id })).find((entry) => entry.actions.some((action) => action.type === "run_analysis"));
      if (rule !== undefined) {
        target = { chatId: room.id, name: rule.name };
        break;
      }
    }
    if (target === undefined) {
      throw new Error("The corpus must contain a room with an analysis rule");
    }
    await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof ChatRulesStory>(CHAT_STORY, { chatId: target.chatId, appearance });
    await page
      .getByRole("button")
      .filter({ has: page.getByText(target.name, { exact: true }) })
      .click();
    await page.getByRole("button", { name: editActionName(target.name), exact: true }).click();
    const outputs = page.getByRole("group", { name: RULE_OUTPUTS_NAME, exact: true });
    await outputs.getByRole("switch", { name: RULE_WORLD_BOOK_NAME, exact: true }).click();
    await outputs.getByRole("switch", { name: RULE_SUGGESTED_TURNS_NAME, exact: true }).click();

    const warning = outputs.getByRole("alert");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(RULE_WORLD_BOOK_NAME);
    await expect(warning).toContainText(RULE_SUGGESTED_TURNS_NAME);
    const [alertBox, lastSwitchBox] = await Promise.all([
      warning.boundingBox(),
      outputs.getByRole("switch", { name: RULE_SCORE_VARIABLE_NAME, exact: true }).boundingBox(),
    ]);
    if (alertBox === null || lastSwitchBox === null) {
      throw new Error("The warning and the switch list must render");
    }
    expect(alertBox.y).toBeGreaterThanOrEqual(lastSwitchBox.y);
    // The stamp selects the tone's ink in the actual theme, and the paint proves the stamp reached the text.
    await expect(warning).toHaveAttribute("data-tone", "destructive");
    const ink = (locator: typeof warning): Promise<string> => locator.evaluate((node) => getComputedStyle(node).color);
    expect(await ink(warning)).not.toBe(await ink(outputs.getByText(RULE_OUTPUTS_NAME, { exact: true })));
  });

  test("a filled rule field asks before its text goes, and an empty one leaves on the press", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const captured = (await caller.automation.listOwnerRules())[0];
    if (captured === undefined) {
      throw new Error("The corpus must contain an owned library rule");
    }
    await caller.automation.updateRule({
      ...automationRuleEditableSchema.strip().parse(captured),
      trigger: automationTriggerFor("character.updated"),
      actions: [automationActionSchema.parse({ type: "generate_image", mode: "character_multimodal", quiet: true })],
      ruleId: captured.id,
      timeZone: captured.timeZone ?? UTC_TIME_ZONE,
    });
    const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance });
    await page
      .getByRole("button")
      .filter({ has: page.getByText(captured.name, { exact: true }) })
      .click();
    await page.getByRole("button", { name: editActionName(captured.name), exact: true }).click();
    const editor = page.getByRole("region", { name: RULE_EDITOR_NAME, exact: true });
    const add = editor.getByRole("button", { name: "Add negative prompt", exact: true });
    const remove = editor.getByRole("button", { name: "Remove negative prompt", exact: true });
    const field = editor.getByRole("textbox", { name: IMAGE_NEGATIVE_PROMPT_FIELD_NAME, exact: true });
    const confirm = page.getByRole("alertdialog", { name: "Remove negative prompt?", exact: true });

    await add.click();
    await remove.click();
    await expect(confirm).toHaveCount(0);
    await expect(add).toBeFocused();

    await add.click();
    await field.fill("extra fingers");
    await expect.poll(() => calls.lastInput("automation.updateRule")?.actions[0]).toMatchObject({ negative: "extra fingers" });
    await remove.click();
    await confirm.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
    // The empty removal above opened no confirm, so it must not decide where this Cancel leaves focus.
    await expect(remove).toBeFocused();
    await expect(field).toHaveValue("extra fingers");
    await remove.click();
    await confirm.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(add).toBeFocused();
    await expect.poll(() => calls.lastInput("automation.updateRule")?.actions[0]).not.toMatchObject({ negative: "extra fingers" });
  });

  test("a confirmed keyword removal hands focus to Add keyword", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const captured = (await caller.automation.listOwnerRules())[0];
    const book = (await caller.worldInfo.listBooks())[0];
    if (captured === undefined || book === undefined) {
      throw new Error("The corpus must contain an owned library rule and an owned world book");
    }
    await caller.automation.updateRule({
      ...automationRuleEditableSchema.strip().parse(captured),
      trigger: automationTriggerFor("character.updated"),
      actions: [
        automationActionSchema.parse({
          type: "insert_world_info_entry",
          bookId: book.id,
          entryKey: "lantern",
          keys: ["lantern", "harbour"],
          contentTemplate: "A lantern marks the harbour.",
        }),
      ],
      ruleId: captured.id,
      timeZone: captured.timeZone ?? UTC_TIME_ZONE,
    });
    const calls = await routeTrpc(page, serveCorpusProcedures(caller, [...READS, "worldInfo.listBooks"]));
    await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance });
    await page
      .getByRole("button")
      .filter({ has: page.getByText(captured.name, { exact: true }) })
      .click();
    await page.getByRole("button", { name: editActionName(captured.name), exact: true }).click();
    const editor = page.getByRole("region", { name: RULE_EDITOR_NAME, exact: true });
    await editor.getByRole("button", { name: "Remove keyword 1", exact: true }).click();
    await page.getByRole("alertdialog", { name: "Remove keyword 1?", exact: true }).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(editor.getByRole("button", { name: RULE_ADD_KEYWORD_NAME, exact: true })).toBeFocused();
    await expect.poll(() => calls.lastInput("automation.updateRule")?.actions[0]).toMatchObject({ keys: ["harbour"] });
  });

  test("the image action's negative prompt and size controls drive the saved rule", async ({ mount, page }) => {
    const size = SIZE_PRESET_NAMES[2];
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const captured = (await caller.automation.listOwnerRules())[0];
    if (captured === undefined) {
      throw new Error("The corpus must contain an owned library rule");
    }
    await caller.automation.updateRule({
      ...automationRuleEditableSchema.strip().parse(captured),
      trigger: automationTriggerFor("character.updated"),
      actions: [automationActionSchema.parse({ type: "generate_image", mode: "character_multimodal", quiet: true })],
      ruleId: captured.id,
      timeZone: captured.timeZone ?? UTC_TIME_ZONE,
    });
    const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance });
    await page
      .getByRole("button")
      .filter({ has: page.getByText(captured.name, { exact: true }) })
      .click();
    await page.getByRole("button", { name: editActionName(captured.name), exact: true }).click();
    const editor = page.getByRole("region", { name: RULE_EDITOR_NAME, exact: true });
    await editor.getByRole("button", { name: "Add negative prompt", exact: true }).click();
    await editor.getByRole("textbox", { name: IMAGE_NEGATIVE_PROMPT_FIELD_NAME, exact: true }).fill("extra fingers");
    await editor.getByRole("button", { name: RULE_CHOOSE_IMAGE_SIZE_NAME, exact: true }).click();
    await editor.getByRole("combobox", { name: IMAGE_SIZE_FIELD_NAME, exact: true }).click();
    await page.getByRole("option", { name: IMAGE_SIZE_LABELS[size], exact: true }).click();
    await expect.poll(() => calls.lastInput("automation.updateRule")?.actions[0]).toMatchObject({ type: "generate_image", negative: "extra fingers", size });
    await editor.getByRole("button", { name: defaultChoiceName(IMAGE_SIZE_MODE_DEFAULT), exact: true }).click();
    await expect(editor.getByRole("button", { name: RULE_CHOOSE_IMAGE_SIZE_NAME, exact: true })).toBeFocused();
    await editor.getByRole("button", { name: RULE_CHOOSE_IMAGE_SIZE_NAME, exact: true }).click();
    await editor.getByRole("combobox", { name: IMAGE_SIZE_FIELD_NAME, exact: true }).click();
    await page.getByRole("option", { name: IMAGE_SIZE_LABELS[size], exact: true }).click();
    await expect.poll(() => calls.lastInput("automation.updateRule")?.actions[0]).toMatchObject({ size });

    // The count walks only inside the contract's range, so the stepper is the error message.
    const decrease = editor.getByRole("button", { name: "Decrease Image count", exact: true });
    const increase = editor.getByRole("button", { name: "Increase Image count", exact: true });
    await expect(decrease).toBeDisabled();
    for (let step = MIN_IMAGE_COUNT; step < MAX_IMAGE_COUNT; step += 1) {
      await increase.click();
    }
    await expect(increase).toBeDisabled();
    await expect.poll(() => calls.lastInput("automation.updateRule")?.actions[0]).toMatchObject({ n: MAX_IMAGE_COUNT });
    await expect
      .poll(async () => (await caller.automation.listOwnerRules()).find((row) => row.id === captured.id)?.actions[0])
      .toMatchObject({ type: "generate_image", negative: "extra fingers", size, n: MAX_IMAGE_COUNT });
  });
});
