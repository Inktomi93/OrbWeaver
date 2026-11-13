// @subject packages/client/src/features/credentials/components/connection-account.tsx
// The ACCOUNT block's balance read goes through the shared boundary beside the standing label: a held read shows the loading line, and a
// failed one the shared error block with Retry, keeping the provider's own message. It mounts through the Connections list's own editor.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ConnectionActionGroupsStory } from "./_connection-action-groups-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connection-action-groups-stories/ConnectionActionGroupsStory";
const PROVIDER_MESSAGE = "OpenRouter refused the key";
const LABEL = "Account witness";
const MODEL = "openrouter/witness-model";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "settings.getAppSettingsWithOverrides",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "connection.providersAvailable",
  "connection.catalogModels",
  "connection.get",
  "connection.capabilities",
] as const;

test.use({ viewport: { width: 1280, height: 900 } });

test("a held balance read shows the loading line, and a failed one the error block with the provider message and a Retry", async ({ mount, page }) => {
  const catalogFetch: typeof fetch = () => Promise.resolve(Response.json({ data: [{ id: MODEL }] }));
  await using root = await createServerHarness({ startJobs: false, providerFetch: catalogFetch, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  const credential = await caller.credentials.add({ provider: "openrouter", key: "synthetic-account-key" });
  await caller.connection.create({ providerId: "openrouter", credentialId: credential.id, baseUrl: null, model: MODEL, label: LABEL });
  const hold = holdServed();
  let held = false;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["connection.accountCredits"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return trpcError({ message: PROVIDER_MESSAGE });
    }),
  });
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });
  await page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL }).click();
  await page.getByText("Diagnostics", { exact: true }).click();
  const block = page.locator('[data-slot="connection-credits"]');
  await hold.requested;
  await expect(block.getByText("Account credits", { exact: true })).toBeVisible();
  await expect(block.getByText("Reading the balance…", { exact: true })).toBeVisible();
  hold.fail();
  await expect(block.getByText("Couldn't load the balance.", { exact: true })).toBeVisible();
  await block.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(block.getByText(PROVIDER_MESSAGE, { exact: true })).toBeVisible();
  await expect(block.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toBeVisible();
});
