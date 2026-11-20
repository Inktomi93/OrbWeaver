// A chats-list row whose room ends on a reply carrying its own markup, the panel a preset's display script styles, shows
// that reply's words and none of its tags, attributes or stylesheet. The row is the production Chats list of the real
// shell, over a room a real server holds.
// @subject packages/client/src/features/chat/components/chat-summary-row.tsx
// @subject packages/kit/src/content/index.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness, seedCorpusConnections } from "@orb/testkit/node/composed";
import { CHAT_LIST_NAME } from "#client/features/chat/lib/chat-surface-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const STYLED = [
  "Sola leans in the doorway.",
  '<div class="hud" style="border: 1px solid #c80">',
  "<style>.hud { color: #c80; font-family: serif; }</style>",
  '<b>Mood:</b> <font color="#ff8800">wary</font>',
  "</div>",
].join("\n");
// What markup looks like when it prints: a bracket, an attribute name, or stylesheet text.
const SOURCE_MARKERS = ["<", ">", "style", "color", "font-family", "hud"] as const;

test.use({ viewport: { width: 1440, height: 900 } });

test("a room ending on a styled reply shows the reply's words in its chats-list row, never its markup", async ({ corpus, mount, page }) => {
  await using root = await createFirstBootHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await seedCorpusConnections(root, await root.principalFor(root.ownerId));
  const keeper = await caller.character.create({ input: createCharacterSchema.parse({ handle: "sola", name: "Sola", description: "Keeps the inn." }) });
  const { chat } = await caller.chat.startChat({ characterIds: [keeper.id], opening: "none" });
  await caller.chat.commitMessage({ chatId: chat.id, content: STYLED, timeZone: UTC_TIME_ZONE });
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...ROOM_PROCEDURES]));
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});

  const row = page.getByRole("list", { name: CHAT_LIST_NAME, exact: true }).locator('[data-slot="list-row-root"]').first();
  await expect(row).toContainText("Sola leans in the doorway. Mood: wary");
  const shown = (await row.textContent()) ?? "";
  expect(SOURCE_MARKERS.filter((marker) => shown.includes(marker))).toEqual([]);
});
