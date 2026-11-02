// @subject packages/client/src/features/automation/components/rule-tool-fields.tsx
// The rule editor's catalog reads go through the shared boundary: a held read shows the loading skeleton, a failed one the
// shared error block, and Retry refetches. The rest of the editor stands while one field's read is out.

import type { AutomationActionInput } from "@orb/contracts/automation";
import { automationRuleEditableSchema } from "@orb/contracts/automation";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
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
type Held = ReturnType<typeof holdServed>;

/** The first request is held, then it fails until the test calls `recover()`. */
function heldThenFailing(): {
  readonly hold: Held;
  readonly intercept: () => Held | ReturnType<typeof trpcError> | undefined;
  readonly recover: () => void;
} {
  const hold = holdServed();
  let held = false;
  let failing = true;
  return {
    hold,
    intercept: (): Held | ReturnType<typeof trpcError> | undefined => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    },
    recover: (): void => {
      failing = false;
    },
  };
}

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
  await page.getByRole("button", { name: `Edit ${ruleName}`, exact: true }).click();
  return page.getByRole("region", { name: "Rule editor", exact: true });
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
  await editor.getByRole("combobox", { name: "Action to add", exact: true }).click();
  await page.getByRole("option", { name: /run a tool/iu }).click();
  await editor.getByRole("button", { name: "Add action", exact: true }).click();
  await read.hold.requested;
  await expect(editor.locator('[aria-busy="true"]')).toBeVisible();
  // The result-capture control and the editable argument template are read-independent and stay standing.
  await expect(editor.getByRole("button", { name: "Capture tool result", exact: true })).toBeVisible();
  await expect(editor.getByText("Argument template (JSON)", { exact: true })).toBeVisible();
  read.hold.fail();
  await expect(editor.getByText("Couldn't load your tool catalog.", { exact: true })).toBeVisible();
  await expect(editor.getByText("Argument template (JSON)", { exact: true })).toBeVisible();
  read.recover();
  await editor.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(editor.getByText("Couldn't load your tool catalog.", { exact: true })).toHaveCount(0);
  await expect(editor.getByText("Tool", { exact: true })).toBeVisible();
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
  await expect(editor.getByText("Couldn't load world books.", { exact: true })).toBeVisible();
  read.recover();
  await editor.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(editor.getByText("Couldn't load world books.", { exact: true })).toHaveCount(0);
  await expect(editor.getByText("World book", { exact: true })).toBeVisible();
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
  await expect(editor.getByText("The selected character is unavailable. Its saved identity is retained until you replace it.", { exact: true })).toBeVisible();
  await expect(editor.getByText(`Speaker: ${character.id}`, { exact: true })).toBeVisible();
  read.recover();
  await editor.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(editor.getByText("The selected character is unavailable. Its saved identity is retained until you replace it.", { exact: true })).toHaveCount(0);
  await expect(editor.getByText(`Speaker: ${character.name}`, { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Add a rule", exact: true }).click();
  await page.getByRole("button", { name: "Auto-add lore entries", exact: true }).click();
  const popover = page.getByRole("dialog");
  await read.hold.requested;
  await expect(popover.locator('[aria-busy="true"]')).toBeVisible();
  read.hold.fail();
  await expect(popover.getByText("Couldn't load this room's world books.", { exact: true })).toBeVisible();
  read.recover();
  await popover.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(popover.getByText("Couldn't load this room's world books.", { exact: true })).toHaveCount(0);
});
