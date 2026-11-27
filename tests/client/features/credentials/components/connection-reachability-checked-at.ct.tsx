// @subject packages/client/src/features/credentials/components/connection-reachability.tsx
// The Diagnostics tier says when the check its verdict reports went out. A second ask inside the probe throttle window
// answers `throttled` with the time of the check that actually dialled, so the line keeps that check's stamp and does not
// read as fresh; a check past the window stamps its own time.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/helpers";
import { CONNECTION_CHECK_AGAIN_NAME, CONNECTION_EDITOR_TIER_TITLES } from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionActionGroupsStory } from "./_connection-action-groups-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connection-action-groups-stories/ConnectionActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "connection.providersAvailable",
  "connection.catalogModels",
  "connection.get",
  "connection.capabilities",
  "connection.probe",
  "connection.update",
  "connection.embedSpaceChangePreview",
  "settings.getAppSettingsWithOverrides",
] as const;
const LABEL = "Probed engine";
const MODEL = "probed-encoder";
// The stamp reads to the minute, so each step moves the root's clock into another minute.
const INSIDE_WINDOW_MS = 45_000;
const PAST_WINDOW_MS = 2 * 60_000;

test("the reachability line keeps the stamp of the check that went out, and a throttled answer does not read as fresh", async ({ mount, page }) => {
  await using root = await createServerHarness({
    startJobs: false,
    secretBoxKey: Buffer.alloc(32, 29),
    providerFetch: () => Promise.resolve(Response.json({ data: [{ id: MODEL }] })),
  });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const key = await root.services.credentials.add({
    principal,
    provider: TEST_PROVIDER_ID,
    key: "sk-probed-fixture-key-0000000000000",
    metadata: { auth: "endpoint" },
  });
  await caller.connection.create({
    providerId: TEST_PROVIDER_ID,
    credentialId: key.id,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: MODEL,
    label: LABEL,
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
  });

  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 768, appearance: appearanceSettingsSchema.parse({}) });
  await page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL }).click();
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CONNECTION_EDITOR_TIER_TITLES.diagnostics)}`, "u") }).click();

  const checkedAt = page.locator('[data-slot="connection-checked-at"]');
  const reached = page.locator('[data-slot="connection-reachable"]');
  const checkAgain = page.getByRole("button", { name: CONNECTION_CHECK_AGAIN_NAME, exact: true });

  await checkAgain.click();
  await expect(reached).toBeVisible();
  const first = await checkedAt.textContent();
  expect(first).toMatch(/\S/u);

  // Inside the window the server answers throttled: the verdict is no longer a reached one, and the stamp stays the first check's.
  root.clock.advance(INSIDE_WINDOW_MS);
  await checkAgain.click();
  await expect(reached).toBeHidden();
  await expect(checkedAt).toHaveText(first ?? "");

  // Past the window the check dials again and stamps its own time.
  root.clock.advance(PAST_WINDOW_MS);
  await checkAgain.click();
  await expect(reached).toBeVisible();
  await expect(checkedAt).not.toHaveText(first ?? "");
});
