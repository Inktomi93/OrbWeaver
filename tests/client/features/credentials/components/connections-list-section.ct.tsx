// A connection row tells apart what its model can serve, which roles it holds now, and whether background work is on,
// so a capability never reads as an assignment.
import { CONNECTION_ROLE_LABELS, connectionSummary } from "@orb/client/lib";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { backgroundStateLabel, CAN_SERVE_LABEL, connectionRailGroupName, USED_FOR_LABEL } from "#client/features/credentials/lib/connections-copy.ts";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";

test("a connection that can serve Utility but does not hold it shows Utility as a capability, not as a role it holds", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const connections = await caller.connection.list();
  const target = connections.find((connection) => connection.tasks.includes("summarize") && connection.tasks.includes("chat"));
  if (target === undefined) {
    throw new Error("The corpus needs a connection that can serve both Chat and the Utility role");
  }
  await caller.connection.setBinding({ task: "chat", connectionId: target.id });
  await caller.connection.setBinding({ task: "summarize", connectionId: null });
  await caller.connection.update({ connectionId: target.id, patch: { allowBackground: false } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "connection.list",
      "connection.listBindings",
      "connection.providersAvailable",
      "credentials.list",
      "credentials.storageStatus",
    ]),
  });
  await mount<typeof ConnectionsListStory>(STORY, {});

  const name = connectionSummary(target);
  const canServe = page.getByRole("group", { name: connectionRailGroupName(CAN_SERVE_LABEL, name), exact: true });
  const usedFor = page.getByRole("group", { name: connectionRailGroupName(USED_FOR_LABEL, name), exact: true });
  await expect(canServe.getByText(CONNECTION_ROLE_LABELS.summarize, { exact: true })).toBeVisible();
  await expect(canServe.getByText(CONNECTION_ROLE_LABELS.chat, { exact: true })).toBeVisible();
  await expect(usedFor).toContainText(CONNECTION_ROLE_LABELS.chat);
  await expect(usedFor).not.toContainText(CONNECTION_ROLE_LABELS.summarize);
  // The background state is its own line, outside both role groups.
  await expect(page.getByText(backgroundStateLabel(false), { exact: true }).first()).toBeVisible();
  await expect(canServe).not.toContainText(backgroundStateLabel(false));
});
