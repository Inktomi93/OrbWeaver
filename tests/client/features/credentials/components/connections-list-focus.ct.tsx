// The Add connection dialog hands focus back to the control that opened it, and the list keeps its focus handoffs.
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";
const SERVED = [
  "sessions.me",
  "connection.list",
  "connection.listBindings",
  "connection.providersAvailable",
  "credentials.list",
  "credentials.storageStatus",
] as const;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, { ...createShellAmbientReads(corpus), ...serveCorpusProcedures(caller, SERVED) });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("closing the Add connection dialog returns focus to the Add connection button", async ({ mount, page }) => {
  await mount<typeof ConnectionsListStory>(STORY, {});
  const add = page.getByRole("button", { name: "Add connection", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
});
