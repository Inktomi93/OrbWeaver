// Settings search, the roster and the teacher door name a setting by the label its section's model gives it, so every control the Chat &
// message handling section renders for a modelled setting must wear that same label, unit included. The section is the production one over
// a corpus root.
// @subject packages/client/src/features/chat/components/chat-behavior-message-handling-section.tsx
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_MESSAGE_HANDLING_SUBCATEGORY } from "#client/features/chat/lib/chat-behavior-message-handling-model.ts";
import type { MessageHandlingSectionStory } from "./_message-handling-setting-names-stories.tsx";

const STORY = "tests/client/features/chat/components/_message-handling-setting-names-stories/MessageHandlingSectionStory";

test("each setting the message-handling model names has a control wearing that label", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "settings.updateUserSettingsSection"]));
  await mount<typeof MessageHandlingSectionStory>(STORY);

  const settings = CHAT_MESSAGE_HANDLING_SUBCATEGORY.settings ?? [];
  expect(settings.length).toBeGreaterThan(0);
  for (const { label } of settings) {
    await expect(page.getByLabel(label, { exact: true }).first()).toBeVisible();
  }
});
