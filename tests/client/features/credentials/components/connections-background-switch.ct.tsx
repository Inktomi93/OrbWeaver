// Each connection's background switch keeps one stable name for the connection; `aria-checked` alone carries the state.
import { allowBackgroundSwitchName } from "@orb/client/lib";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";

test("two connections in opposite states are found by their stable names, and a flip moves only aria-checked", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [allowed, held] = await caller.connection.list();
  if (allowed === undefined || held === undefined) {
    throw new Error("The corpus needs two connections to compare");
  }
  await caller.connection.update({ connectionId: allowed.id, patch: { allowBackground: true } });
  await caller.connection.update({ connectionId: held.id, patch: { allowBackground: false } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "connection.list",
      "connection.listBindings",
      "connection.providersAvailable",
      "connection.update",
      "credentials.list",
      "credentials.storageStatus",
    ]),
  });
  await mount<typeof ConnectionsListStory>(STORY, {});

  const allowedSwitch = page.getByRole("switch", { name: allowBackgroundSwitchName(allowed), exact: true });
  const heldSwitch = page.getByRole("switch", { name: allowBackgroundSwitchName(held), exact: true });
  await expect(allowedSwitch).toHaveAttribute("aria-checked", "true");
  await expect(heldSwitch).toHaveAttribute("aria-checked", "false");
  await heldSwitch.click();
  await expect(heldSwitch).toHaveAttribute("aria-checked", "true");
  await expect(allowedSwitch).toHaveAttribute("aria-checked", "true");
});
