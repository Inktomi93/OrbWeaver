// The imagine modal in the shell's real dialog: Generate lives in the dialog footer, with the count in its label, and
// stays on screen when the options push the form past a short viewport.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ImagineInShellStory } from "./_imagine-shell-stories.tsx";
import { routeShell } from "./app-shell-ct.ts";

const STORY = "tests/client/features/app-shell/surfaces/_imagine-shell-stories/ImagineInShellStory";
// Past Home: the Chats section, the room read the modal makes, and the shell's theme reads.
const SERVED = [
  "sessions.me",
  "chat.listChats",
  "chat.countChats",
  "chat.getChat",
  "character.list",
  "rosterPreset.list",
  "databank.listGlobal",
  "worldInfo.listBooks",
  "settings.getUserSettings",
  "settings.listThemes",
  "settings.getTheme",
  "notifications.markAllRead",
  "plugin.list",
  "plugin.listSurfaces",
] as const;

test("Generate sits in the dialog footer and stays on screen at a phone height with the options open", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = typeIdSchema(ID_PREFIX.chat).parse(corpus.reads["chat.listChats"][0]?.output.items[0]?.id);
  await page.setViewportSize({ width: 430, height: 560 });
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SERVED);
  await mount<typeof ImagineInShellStory>(STORY, { seed: { chatId, mode: "free", prompt: "A lantern over a harbour" } });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "More options", exact: true }).click();
  await dialog.getByRole("group", { name: "Number of images", exact: true }).getByRole("button", { name: "4", exact: true }).click();
  const generate = dialog.locator('[data-slot="dialog-footer"]').getByRole("button", { name: "Generate 4 images", exact: true });
  await expect(generate).toBeInViewport();
});
