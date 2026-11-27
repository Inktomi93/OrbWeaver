// @subject packages/client/src/features/credentials/components/connection-fact-rows.tsx
// The own-server switches and the lines that say what the server needs fit a phone at 200% text in each engine: the switch stays inside
// its row and the screen, and the row's words wrap inside it instead of running past it.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CONNECTION_EDITOR_TIER_TITLES } from "#client/features/credentials/lib/credentials-names.ts";
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
] as const;
const LABEL = "Own vLLM box";
const PHONE_WIDTH = 390;
const ROWS = ["features.samplerEnvelope", "features.antislop"] as const;

test.use({ viewport: { width: PHONE_WIDTH, height: 844 }, isMobile: true, hasTouch: true });

test("the own-server switches and what they need fit a phone at 200% text", async ({ mount, page }) => {
  await page.addInitScript(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.connection.create({ providerId: "vllm", credentialId: null, baseUrl: "http://127.0.0.1:8000/v1", model: "own-model", label: LABEL });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ConnectionActionGroupsStory>(STORY, { width: PHONE_WIDTH, appearance: appearanceSettingsSchema.parse({}) });
  await page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL }).click();
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CONNECTION_EDITOR_TIER_TITLES.advanced)}`, "u") }).click();

  for (const path of ROWS) {
    const row = page.locator(`[data-fact="${path}"]`);
    const toggle = row.getByRole("switch");
    await expect(toggle).toBeVisible();
    const geometry = await actionGroupGeometry(row, [toggle]);
    expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
    // The switch is a touch target, and the row's words never run past the row's own box.
    const needs = await row.getByText(/^Needs /u).boundingBox();
    expect(needs).not.toBeNull();
    expect((needs?.x ?? Number.POSITIVE_INFINITY) + (needs?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(geometry.host.x + geometry.host.width + 1);
  }
});
