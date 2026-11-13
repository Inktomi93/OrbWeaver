// @subject packages/client/src/features/automation/components/rule-preset-picker.tsx
// A catalogue row carries its title and its sentence inside one button, so the button's name is that content: the words on
// screen are in the name (WCAG 2.5.3), where an `aria-label` of the title alone left the sentence out of it.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { accessibilityScan } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { RULE_ADD_NAME } from "#client/features/automation/lib/automation-names.ts";
import type { ChatRulesStory } from "./_rule-action-groups-stories.tsx";

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
const LABEL_MISMATCH = "label-content-name-mismatch";

test("a rule preset row's name contains its title and its sentence", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  let chatId: ChatId | undefined;
  for (const room of (await caller.chat.listChats({ limit: 100 })).items) {
    if ((await caller.chat.getChat({ chatId: room.id })).viewerIsHost) {
      chatId = room.id;
      break;
    }
  }
  if (chatId === undefined) {
    throw new Error("The corpus must contain a hosted room");
  }
  const presets = (await caller.automation.listRulePresets()).filter((preset) => preset.scope !== "global");
  const first = presets[0];
  if (first === undefined) {
    throw new Error("The catalogue must offer a room-scoped rule preset");
  }
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ChatRulesStory>(CHAT_STORY, { chatId, appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: RULE_ADD_NAME, exact: true }).click();
  const row = page.getByRole("dialog").getByRole("button", { name: first.title });
  await expect(row).toBeVisible();
  const name = await row.evaluate((button) => button.textContent);
  expect(name).toContain(first.title);
  await expect(page.getByRole("dialog").getByRole("button", { name: first.summary })).toBeVisible();
  const result = await accessibilityScan(page);
  const mismatched = result.violations.find(({ id }) => id === LABEL_MISMATCH)?.nodes ?? [];
  expect(mismatched.filter(({ html }) => html.includes(`aria-label="${first.title}"`))).toEqual([]);
});
