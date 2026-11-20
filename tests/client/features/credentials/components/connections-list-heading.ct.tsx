// The Connections list section keeps its heading in the outline but does not paint it: the shell crumb and the pane title already name the screen.

import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CONNECTIONS_LIST_NAME } from "#client/features/credentials/lib/connections-copy.ts";
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
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SERVED) });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("the list section's heading stays a level-3 heading and paints at most a pixel", async ({ mount, page }) => {
  await mount<typeof ConnectionsListStory>(STORY, {});
  const heading = page.getByRole("heading", { level: 3, name: CONNECTIONS_LIST_NAME, exact: true });
  await expect(heading).toHaveCount(1);
  const box = await heading.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(1);
  expect(box?.height ?? 0).toBeLessThanOrEqual(1);
});
