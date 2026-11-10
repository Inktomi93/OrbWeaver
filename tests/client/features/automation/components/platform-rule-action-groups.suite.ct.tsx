import { IMAGE_SIZE_LABELS, IMAGE_SIZE_MODE_DEFAULT, ROLE_ROWS_ORDERED, ROLE_STATUS_LABELS, ROW_DELETE_NAME } from "@orb/client/lib";
import { AUTOMATION_RULE_NAME_MAX_CHARS, automationActionSchema, automationRuleEditableSchema, automationTriggerFor } from "@orb/contracts/automation";
import { MAX_IMAGE_COUNT, MIN_IMAGE_COUNT, SIZE_PRESET_NAMES } from "@orb/contracts/imagery";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { RULE_UNSET_EFFECTS, ruleEnabledSwitchName } from "#client/features/automation/lib/rule-copy.ts";
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
      const edit = page.getByRole("button", { name: `Edit ${name}`, exact: true });
      const dryRun = page.getByRole("button", { name: `Test ${name}`, exact: true });
      const more = page.getByRole("button", { name: `More actions for ${name}`, exact: true });
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
      const editor = page.getByRole("region", { name: "Rule editor", exact: true });
      await expect(editor.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue(name);
      await editor.getByRole("button", { name: "Close editor", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(editor).toBeHidden();
      await expect(edit).toBeFocused();
      expect(calls.count("automation.updateRule")).toBe(0);
      await dryRun.focus();
      await page.keyboard.press("Enter");
      const result = page.getByRole("status", { name: `Test result for ${name}`, exact: true });
      await expect(result).toContainText(/Condition would (?:NOT )?match\./u);
      expect(calls.count("automation.testRule")).toBe(1);
      const previousIds = new Set(beforeFires.map((fire) => fire.id));
      const added = (await caller.automation.listFires({ ruleId: rule.id })).filter((fire) => !previousIds.has(fire.id));
      expect(added.map((fire) => fire.outcome)).toEqual(["test_run"]);
      await more.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menuitem", { name: "Run now", exact: true })).toBeVisible();
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
    await page.getByRole("button", { name: `Edit ${captured.name}`, exact: true }).click();
    const editor = page.getByRole("region", { name: "Rule editor", exact: true });
    const typeOf = (label: string): Promise<string> =>
      editor.getByText(label, { exact: true }).evaluate((node) => {
        const style = getComputedStyle(node);
        return `${style.fontSize}/${style.fontWeight}`;
      });
    expect(await typeOf("When")).toBe(await typeOf("Rule name"));
    const automationSwitch = editor.getByRole("switch", { name: "Include events caused by automation", exact: true });
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
    await page.getByRole("button", { name: `Connections for ${captured.name}`, exact: true }).click();
    const slot = page.getByRole("group", { name: role.heading, exact: true });
    await expect(slot.getByRole("combobox", { name: `${role.label} connection`, exact: true })).toContainText(`Same as my ${role.label} role`);
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
    const trigger = page.getByRole("button", { name: `Connections for ${captured.name}`, exact: true });
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
    await page.getByRole("button", { name: `Edit ${captured.name}`, exact: true }).click();
    const editor = page.getByRole("region", { name: "Rule editor", exact: true });
    await editor.getByRole("textbox", { name: "Rule name", exact: true }).fill("");
    const held = editor.getByRole("status").filter({ hasText: "Not saved" });
    await expect(held).toBeVisible();
    const sizeOf = (node: Pick<typeof held, "evaluate">): Promise<number> => node.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const sentence = await sizeOf(held.locator("p").last());
    const body = await sizeOf(editor.getByText("Actions run in this order", { exact: true }));
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
    await page.getByRole("button", { name: `Edit ${captured.name}`, exact: true }).click();
    const editor = page.getByRole("region", { name: "Rule editor", exact: true });
    const line = editor.getByText(/^Edits save automatically when complete/u);
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
    await page.getByRole("button", { name: `Edit ${target.name}`, exact: true }).click();
    const outputs = page.getByRole("group", { name: "Outputs", exact: true });
    await outputs.getByRole("switch", { name: "World book", exact: true }).click();
    await outputs.getByRole("switch", { name: "Suggested turns", exact: true }).click();

    const warning = outputs.getByRole("alert");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("World book");
    await expect(warning).toContainText("Suggested turns");
    const [alertBox, lastSwitchBox] = await Promise.all([
      warning.boundingBox(),
      outputs.getByRole("switch", { name: "Score variable", exact: true }).boundingBox(),
    ]);
    if (alertBox === null || lastSwitchBox === null) {
      throw new Error("The warning and the switch list must render");
    }
    expect(alertBox.y).toBeGreaterThanOrEqual(lastSwitchBox.y);
    // The stamp selects the tone's ink in the actual theme, and the paint proves the stamp reached the text.
    await expect(warning).toHaveAttribute("data-tone", "destructive");
    const ink = (locator: typeof warning): Promise<string> => locator.evaluate((node) => getComputedStyle(node).color);
    expect(await ink(warning)).not.toBe(await ink(outputs.getByText("Outputs", { exact: true })));
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
    await page.getByRole("button", { name: `Edit ${captured.name}`, exact: true }).click();
    const editor = page.getByRole("region", { name: "Rule editor", exact: true });
    const add = editor.getByRole("button", { name: "Add negative prompt", exact: true });
    const remove = editor.getByRole("button", { name: "Remove negative prompt", exact: true });
    const field = editor.getByRole("textbox", { name: "Negative prompt", exact: true });
    const confirm = page.getByRole("alertdialog", { name: "Remove negative prompt?", exact: true });

    await add.click();
    await remove.click();
    await expect(confirm).toHaveCount(0);
    await expect(add).toBeFocused();

    await add.click();
    await field.fill("extra fingers");
    await expect.poll(() => calls.lastInput("automation.updateRule")?.actions[0]).toMatchObject({ negative: "extra fingers" });
    await remove.click();
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
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
    await page.getByRole("button", { name: `Edit ${captured.name}`, exact: true }).click();
    const editor = page.getByRole("region", { name: "Rule editor", exact: true });
    await editor.getByRole("button", { name: "Remove keyword 1", exact: true }).click();
    await page.getByRole("alertdialog", { name: "Remove keyword 1?", exact: true }).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Add keyword", exact: true })).toBeFocused();
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
    await page.getByRole("button", { name: `Edit ${captured.name}`, exact: true }).click();
    const editor = page.getByRole("region", { name: "Rule editor", exact: true });
    await editor.getByRole("button", { name: "Add negative prompt", exact: true }).click();
    await editor.getByRole("textbox", { name: "Negative prompt", exact: true }).fill("extra fingers");
    await editor.getByRole("button", { name: "Choose image size", exact: true }).click();
    await editor.getByRole("combobox", { name: "Image size", exact: true }).click();
    await page.getByRole("option", { name: IMAGE_SIZE_LABELS[size], exact: true }).click();
    await expect.poll(() => calls.lastInput("automation.updateRule")?.actions[0]).toMatchObject({ type: "generate_image", negative: "extra fingers", size });
    await editor.getByRole("button", { name: `Use the ${IMAGE_SIZE_MODE_DEFAULT}`, exact: true }).click();
    await expect(editor.getByRole("button", { name: "Choose image size", exact: true })).toBeFocused();
    await editor.getByRole("button", { name: "Choose image size", exact: true }).click();
    await editor.getByRole("combobox", { name: "Image size", exact: true }).click();
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
