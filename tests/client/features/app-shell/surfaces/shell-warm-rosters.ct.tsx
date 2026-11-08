// The shell reads the saved-roster list when it boots, whichever section it opens on, so New chat's first open already knows whether its footer carries the
// door row and its skeleton declares the box the picker settles at.
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

test("the shell reads the saved rosters once at boot on the Chats section", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
  await seedShellState(page, { activeSection: "chats" });
  await mount<typeof AppShellStory>(`${SHELL_STORIES}/AppShellStory`);
  await expect.poll(() => calls.inputs("rosterPreset.list")).toEqual([undefined]);
});
