// @subject packages/client/src/features/chat/components/room-overrides-form.tsx
// An override row is named by its field and described by its state word: inheriting at rest, then overridden with the text's opening
// line once a host writes one and shuts the row.
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_OVERRIDE_SCENARIO_LABEL, overrideStateWord } from "#client/features/chat/lib/chat-settings-names.ts";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";
import { hostedRoom } from "./hosted-room.fixtures.ts";

const TAB_STORY = "tests/client/features/chat/components/_chat-forks-stories/ChatContextTabStory";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listForks",
  "chat.listChatInjections",
  "chat.setRoomOverrides",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
] as const;
const SCENARIO = "A storm over the harbour";

test("the state word moves from inheriting to overridden in the row's description, with the text after it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { chatId } = await hostedRoom(root, page, PROCEDURES);
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });
  const row = page.getByRole("button", { name: CHAT_OVERRIDE_SCENARIO_LABEL, exact: true });
  await expect(row).toHaveAccessibleDescription(overrideStateWord(false));

  await row.click();
  await page.getByRole("textbox", { name: CHAT_OVERRIDE_SCENARIO_LABEL, exact: true }).fill(SCENARIO);
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(row).toHaveAccessibleDescription(`${overrideStateWord(true)} ${SCENARIO}`);
});
