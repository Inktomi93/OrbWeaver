// The saved-roster door is a way into the library's rosters: a library with none has no door, in every footer the picker wears (the pinned row, the
// stacked step under it, and the row above the picker). A control group with rosters keeps the door in the DOM, so the absence below is not vacuous.
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_SAVED_ROSTER_DOOR_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellModalStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellModalStory`;

const CELLS = [
  { name: "390x844 at 100%", width: 390, height: 844, touch: true, factor: 1 },
  { name: "390x844 at 300%", width: 390, height: 844, touch: true, factor: 3 },
  { name: "1440x900 at 300%", width: 1440, height: 900, touch: false, factor: 3 },
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** Serves the shell over a library with or without saved rosters, and seeds the Chats section. */
async function serveLibrary(root: Root, corpus: CorpusPlayback, page: Page, rosters: boolean): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  if (!rosters) {
    for (const roster of await caller.rosterPreset.list()) {
      await caller.rosterPreset.remove({ presetId: roster.id });
    }
  }
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
  await seedShellState(page, { activeSection: "chats" });
}

for (const cell of CELLS) {
  test.describe(`New chat at ${cell.name}`, () => {
    test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.touch, isMobile: cell.touch });

    test("a library with no saved rosters offers no door", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveLibrary(root, corpus, page, false);
      await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
      const dialog = page.getByRole("dialog");
      await setRootFontScale(page, channelName("fontScale"), cell.factor);
      await expect(dialog.getByRole("option").first()).toBeVisible();
      await expect(dialog.getByRole("button", { name: CHAT_SAVED_ROSTER_DOOR_NAME, exact: true })).toHaveCount(0);
    });

    test("a library with saved rosters offers the door", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveLibrary(root, corpus, page, true);
      await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
      const dialog = page.getByRole("dialog");
      await setRootFontScale(page, channelName("fontScale"), cell.factor);
      await expect(dialog.getByRole("option").first()).toBeVisible();
      await expect(dialog.getByRole("button", { name: CHAT_SAVED_ROSTER_DOOR_NAME, exact: true }).first()).toBeAttached();
    });
  });
}
