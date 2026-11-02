// @subject packages/client/src/features/credentials/components/connection-account.tsx
// The ACCOUNT block's balance read goes through the shared boundary beside the standing label: a held read shows the loading line, and a
// failed one the shared error block with Retry, keeping the provider's own message.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AccountCreditsStory } from "./_account-credits-stories.tsx";

const STORY = "tests/client/features/credentials/components/_account-credits-stories/AccountCreditsStory";
const PROVIDER_MESSAGE = "OpenRouter refused the key";

test("a held balance read shows the loading line, and a failed one the error block with the provider message and a Retry", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  let held = false;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    ...serveCorpusProcedures(caller, ["connection.accountCredits"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return trpcError({ message: PROVIDER_MESSAGE });
    }),
  });
  await mount<typeof AccountCreditsStory>(STORY, { connectionId: mintTypeId(ID_PREFIX.userConnection, createSeededIds().next) });
  const block = page.locator('[data-slot="connection-credits"]');
  await hold.requested;
  await expect(block.getByText("Account credits", { exact: true })).toBeVisible();
  await expect(block.getByText("Reading the balance…", { exact: true })).toBeVisible();
  hold.fail();
  await expect(block.getByText("Couldn't load the balance.", { exact: true })).toBeVisible();
  await block.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(block.getByText(PROVIDER_MESSAGE, { exact: true })).toBeVisible();
  await expect(block.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
});
