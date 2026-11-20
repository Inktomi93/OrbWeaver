// @subject packages/client/src/features/automation/components/rule-tool-fields.tsx
// The rule editor's catalog reads go through the shared boundary: a held read shows the loading skeleton, a failed one the
// shared error block, and Retry refetches. The rest of the editor stands while one field's read is out.

import type { AutomationActionInput } from "@orb/contracts/automation";
import { automationRuleEditableSchema } from "@orb/contracts/automation";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { heldThenFailing, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { editActionName } from "@orb/ui/lib";
import type { Locator, Page } from "@playwright/test";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import {
  RULE_ACTION_PICKER_NAME,
  RULE_ADD_ACTION_NAME,
  RULE_ADD_NAME,
  RULE_CAPTURE_TOOL_RESULT_NAME,
  RULE_CHARACTER_UNAVAILABLE_TEXT,
  RULE_EDITOR_NAME,
  RULE_ROOM_WORLD_BOOKS_READ_LABEL,
  RULE_SPEAKER_FIELD_LABEL,
  RULE_TOOL_ARGUMENTS_NAME,
  RULE_TOOL_CATALOG_READ_LABEL,
  RULE_TOOL_FIELD_NAME,
  RULE_WORLD_BOOK_NAME,
  RULE_WORLD_BOOKS_READ_LABEL,
  ruleCharacterReadout,
} from "#client/features/automation/lib/automation-names.ts";
import { armLabel } from "#client/features/automation/lib/rule-copy.ts";
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
  "automation.listFires",
  "automation.listRules",
  "worldInfo.listForChat",
  "worldInfo.listBooks",
  "character.get",
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

/** Rewrite the owner's first library rule to carry one action, and serve the editor's reads with the given overrides. */
interface RuleScenario {
  readonly page: Page;
  /** The one action to leave on the rule; omitted, the rule is served as the corpus holds it. */
  readonly action?: AutomationActionInput;
  readonly overrides: TrpcRoutes;
  readonly chatId?: ChatId;
}

async function serveRuleWith(root: Root, { page, action, overrides, chatId }: RuleScenario): Promise<string> {
  const caller = await root.internalCallerFor(root.ownerId);
  const captured = chatId === undefined ? (await caller.automation.listOwnerRules())[0] : (await caller.automation.listRules({ chatId }))[0];
  if (captured === undefined) {
    throw new Error("The corpus must hold a rule in the scope under test");
  }
  const rule =
    action === undefined
      ? captured
      : await caller.automation.updateRule({
          ...automationRuleEditableSchema.strip().parse(captured),
          ruleId: captured.id,
          timeZone: captured.timeZone ?? UTC_TIME_ZONE,
          actions: [action],
        });
  await routeTrpc(page, { ...serveCorpusProcedures(caller, READS), ...overrides });
  return rule.name;
}

/** A room the owner hosts that already carries a rule to rewrite. */
async function hostedRoomWithRule(caller: Caller): Promise<ChatId> {
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    if ((await caller.chat.getChat({ chatId: room.id })).viewerIsHost && (await caller.automation.listRules({ chatId: room.id })).length > 0) {
      return room.id;
    }
  }
  throw new Error("The corpus must contain a hosted room with a rule");
}

async function openEditor(page: Page, ruleName: string): Promise<Locator> {
  await page
    .getByRole("button")
    .filter({ has: page.getByText(ruleName, { exact: true }) })
    .click();
  await page.getByRole("button", { name: editActionName(ruleName), exact: true }).click();
  return page.getByRole("region", { name: RULE_EDITOR_NAME, exact: true });
}

const MOUNT_PROPS = { width: 960, appearance: appearanceSettingsSchema.parse({}) };

test("a held tool catalog read shows the loading skeleton, a failed one the error block, the argument template stays editable, and Retry shows the Tool field", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const read = heldThenFailing();
  const name = await serveRuleWith(root, { page, overrides: serveCorpusProcedures(caller, ["automation.listRuleTools"], read.intercept) });
  await mount<typeof RuleActionGroupsStory>(STORY, MOUNT_PROPS);
  const editor = await openEditor(page, name);
  // The corpus offers no rule tool, so the tool action is added through the editor's own picker.
  await editor.getByRole("combobox", { name: RULE_ACTION_PICKER_NAME, exact: true }).click();
  await page.getByRole("option", { name: armLabel("run_tool"), exact: true }).click();
  await editor.getByRole("button", { name: RULE_ADD_ACTION_NAME, exact: true }).click();
  await read.hold.requested;
  await expect(editor.locator('[aria-busy="true"]')).toBeVisible();
  // The result-capture control and the editable argument template are read-independent and stay standing.
  await expect(editor.getByRole("button", { name: RULE_CAPTURE_TOOL_RESULT_NAME, exact: true })).toBeVisible();
  await expect(editor.getByText(RULE_TOOL_ARGUMENTS_NAME, { exact: true })).toBeVisible();
  read.hold.fail();
  await expect(editor.getByText(queryFailedLabel(RULE_TOOL_CATALOG_READ_LABEL), { exact: true })).toBeVisible();
  await expect(editor.getByText(RULE_TOOL_ARGUMENTS_NAME, { exact: true })).toBeVisible();
  read.recover();
  await editor.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(editor.getByText(queryFailedLabel(RULE_TOOL_CATALOG_READ_LABEL), { exact: true })).toHaveCount(0);
  await expect(editor.getByText(RULE_TOOL_FIELD_NAME, { exact: true })).toBeVisible();
});

test("a held world book read shows the loading skeleton, a failed one the error block, and Retry shows the World book field", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const book = (await caller.worldInfo.listBooks())[0];
  if (book === undefined) {
    throw new Error("The corpus must contain an owned world book");
  }
  const read = heldThenFailing();
  const name = await serveRuleWith(root, {
    page,
    action: { type: "insert_world_info_entry", bookId: book.id, entryKey: "", keys: [], contentTemplate: "", position: "before", confirmFirst: false },
    overrides: serveCorpusProcedures(caller, ["worldInfo.listBooks"], read.intercept),
  });
  await mount<typeof RuleActionGroupsStory>(STORY, MOUNT_PROPS);
  const editor = await openEditor(page, name);
  await read.hold.requested;
  await expect(editor.locator('[aria-busy="true"]')).toBeVisible();
  read.hold.fail();
  await expect(editor.getByText(queryFailedLabel(RULE_WORLD_BOOKS_READ_LABEL), { exact: true })).toBeVisible();
  read.recover();
  await editor.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(editor.getByText(queryFailedLabel(RULE_WORLD_BOOKS_READ_LABEL), { exact: true })).toHaveCount(0);
  await expect(editor.getByText(RULE_WORLD_BOOK_NAME, { exact: true })).toBeVisible();
});

test("a held selected-character read shows the loading skeleton, a failed one the error block with the saved identity kept, and Retry shows the name", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const character = (await caller.character.list({})).items[0];
  if (character === undefined) {
    throw new Error("The corpus must contain a character");
  }
  const chatId = await hostedRoomWithRule(caller);
  const read = heldThenFailing();
  const name = await serveRuleWith(root, {
    page,
    action: { type: "trigger_turn", speakerCharacterId: character.id, guidedTemplate: "", confirmFirst: true },
    overrides: serveCorpusProcedures(caller, ["character.get"], read.intercept),
    chatId,
  });
  await mount<typeof ChatRulesStory>(CHAT_STORY, { chatId, appearance: appearanceSettingsSchema.parse({}) });
  const editor = await openEditor(page, name);
  await read.hold.requested;
  await expect(editor.locator('[aria-busy="true"]')).toBeVisible();
  read.hold.fail();
  await expect(editor.getByText(RULE_CHARACTER_UNAVAILABLE_TEXT, { exact: true })).toBeVisible();
  await expect(editor.getByText(ruleCharacterReadout(RULE_SPEAKER_FIELD_LABEL, character.id), { exact: true })).toBeVisible();
  read.recover();
  await editor.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(editor.getByText(RULE_CHARACTER_UNAVAILABLE_TEXT, { exact: true })).toHaveCount(0);
  await expect(editor.getByText(ruleCharacterReadout(RULE_SPEAKER_FIELD_LABEL, character.name), { exact: true })).toBeVisible();
});

test("a held room world book read shows the loading skeleton in the preset knob, a failed one the error block, and Retry shows the chooser", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = await hostedRoomWithRule(caller);
  const read = heldThenFailing();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["worldInfo.listForChat"], read.intercept),
  });
  await mount<typeof ChatRulesStory>(CHAT_STORY, { chatId, appearance: appearanceSettingsSchema.parse({}) });
  // The catalogue names its presets over the wire, so the lore preset's row is found by the title the server serves.
  const lore = (await caller.automation.listRulePresets()).find((preset) => preset.id === "autoAddLore");
  if (lore === undefined) {
    throw new Error("The rule preset catalogue serves the lore preset");
  }
  await page.getByRole("button", { name: RULE_ADD_NAME, exact: true }).click();
  await page.getByRole("button", { name: lore.title }).click();
  const popover = page.getByRole("dialog");
  await read.hold.requested;
  await expect(popover.locator('[aria-busy="true"]')).toBeVisible();
  read.hold.fail();
  await expect(popover.getByText(queryFailedLabel(RULE_ROOM_WORLD_BOOKS_READ_LABEL), { exact: true })).toBeVisible();
  read.recover();
  await popover.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(popover.getByText(queryFailedLabel(RULE_ROOM_WORLD_BOOKS_READ_LABEL), { exact: true })).toHaveCount(0);
});
