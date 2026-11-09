// The shell reads the saved-roster list when it boots, whichever section it opens on, so New chat's first open already knows whether its footer carries the
// door row and its skeleton declares the box the picker settles at. Development React replays the boot effect, so the count is read once the first answer
// has landed and a window has passed in which a second request would have left.
import { seedShellState } from "@orb/testkit/browser/spec";
import { absenceWindow, createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

// A replayed effect runs in the same commit as the first; a request it sent would leave well inside this window.
const SECOND_REQUEST_WINDOW_MS = 1000;

test("the shell reads the saved rosters once at boot on the Chats section", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
  await seedShellState(page, { activeSection: "chats" });
  const answered = page.waitForResponse((response) => response.url().includes("rosterPreset.list"));
  await mount<typeof AppShellStory>(`${SHELL_STORIES}/AppShellStory`);
  await answered;
  await absenceWindow(page, SECOND_REQUEST_WINDOW_MS);
  expect(calls.count("rosterPreset.list")).toBe(1);
});
