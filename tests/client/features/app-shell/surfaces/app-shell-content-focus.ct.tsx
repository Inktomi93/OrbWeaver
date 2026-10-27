// A feature asks the shell for its section's content landmark; the shell holds the node, takes the request once and
// drops one for a section that is not the screen.
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellContentFocusStory } from "./_content-focus-stories.tsx";

const STORY = "tests/client/features/app-shell/surfaces/_content-focus-stories/AppShellContentFocusStory";
const SERVED = [
  "sessions.me",
  "chat.listChats",
  "character.list",
  "rosterPreset.list",
  "notifications.markAllRead",
  "plugin.list",
  "plugin.listSurfaces",
] as const;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SERVED) });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("a request for the active section lands focus on its content landmark, and one for another section is dropped", async ({ mount, page }) => {
  await mount<typeof AppShellContentFocusStory>(STORY, {});
  const content = page.getByRole("main", { name: "Home content", exact: true });
  await expect(content).toBeVisible();

  await page.getByRole("button", { name: "Focus another section's content", exact: true }).click();
  await expect(content).not.toBeFocused();

  await page.getByRole("button", { name: "Focus the active content", exact: true }).click();
  await expect(content).toBeFocused();
});
