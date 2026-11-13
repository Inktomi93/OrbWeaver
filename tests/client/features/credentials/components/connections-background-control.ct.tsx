// A connection's background work has one control, the switch in its editor. The list row and the Model-roles repair
// show the state and open that editor; neither carries a switch of its own.
import { allowBackgroundSwitchName, connectionSummary, openConnectionName, ROLE_ROWS_ORDERED } from "@orb/client/lib";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { backgroundStateLabel } from "#client/features/credentials/lib/connections-copy.ts";
import type { ConnectionsPaneStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsPaneStory";

const UTILITY = ROLE_ROWS_ORDERED.find((row) => row.task === "summarize");

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Connection = Awaited<ReturnType<Caller["connection"]["list"]>>[number];

/** A Utility-capable connection with background work off and no Utility binding, so Model roles offers its repair. */
async function heldUtilityConnection(caller: Caller): Promise<Connection> {
  const target = (await caller.connection.list()).find((connection) => connection.tasks.includes("summarize"));
  if (target === undefined) {
    throw new Error("The corpus needs a connection that can serve the Utility role");
  }
  await caller.connection.setBinding({ task: "summarize", connectionId: null });
  await caller.connection.update({ connectionId: target.id, patch: { allowBackground: false } });
  return target;
}

async function servePane(page: Page, corpus: CorpusPlayback, root: ServerTestHarness, caller: Caller): Promise<void> {
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "search.spaceStatus",
      "workloads.list",
      "preset.list",
      "connection.list",
      "connection.listBindings",
      "connection.providersAvailable",
      "connection.get",
      "connection.capabilities",
      "connection.catalogModels",
      "connection.update",
      "credentials.list",
      "credentials.storageStatus",
    ]),
  });
}

test("the Utility repair shows the state and opens the editor, whose switch is the one control", async ({ corpus, mount, page }) => {
  if (UTILITY === undefined) {
    throw new Error("Model roles carries no Utility row");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const target = await heldUtilityConnection(caller);
  await servePane(page, corpus, root, caller);
  await mount<typeof ConnectionsPaneStory>(STORY, {});

  const utility = page.getByRole("group", { name: UTILITY.heading, exact: true });
  const door = utility.getByRole("button", { name: openConnectionName(target), exact: true });
  await expect(door).toBeVisible();
  await expect(utility.getByRole("switch")).toHaveCount(0);

  await door.click();
  const control = page.getByRole("switch", { name: allowBackgroundSwitchName(target), exact: true });
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(control).toHaveCount(1);
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(door).toHaveCount(0);
});

test("a list row shows its background state and opens the editor that holds the switch", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const target = await heldUtilityConnection(caller);
  await servePane(page, corpus, root, caller);
  await mount<typeof ConnectionsPaneStory>(STORY, {});

  const row = page.getByRole("button", { name: connectionSummary(target), exact: true });
  await expect(row).toBeVisible();
  await expect(page.getByText(backgroundStateLabel(false), { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("switch", { name: allowBackgroundSwitchName(target), exact: true })).toHaveCount(0);

  await row.click();
  await expect(page.getByRole("switch", { name: allowBackgroundSwitchName(target), exact: true })).toHaveAttribute("aria-checked", "false");
});
