// @subject packages/client/src/features/credentials/components/connections-list-section.tsx
// @subject packages/client/src/features/credentials/components/connections-roles-section.tsx
// One struck key never takes the Connections page down: with the key bound to Chat revoked, the list and the Model
// roles both draw, the row says its key was rejected, and Chat reads as set but not running with its picker in place.

import { ROLE_ROWS_ORDERED, ROLE_STATUS_LABELS } from "@orb/client/lib";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { connectionRolePickerName } from "#client/components/shared-control-names.ts";
import { CONNECTION_KEY_REJECTED_BADGE } from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionsPaneStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsPaneStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "credentials.storageStatus",
  "connection.providersAvailable",
  "connection.catalogModels",
  "search.spaceStatus",
] as const;
const STRUCK_LABEL = "Struck chat";
const HEALTHY_LABEL = "Healthy utility";

test.use({ viewport: { width: 1440, height: 1400 } });

test("a revoked key bound to Chat leaves the list and the roles drawn, and names the rejected key", async ({ mount, page }) => {
  await using root = await createServerHarness({
    startJobs: false,
    secretBoxKey: Buffer.alloc(32, 23),
    providerFetch: () => Promise.reject(new Error("the Connections page dials no provider")),
  });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const struck = await root.services.credentials.add({ principal, provider: "openai", key: "sk-struck-fixture-key-000000000000" });
  const healthy = await root.services.credentials.add({ principal, provider: "openrouter", key: "sk-or-healthy-fixture-key-0000000000" });
  const chat = await caller.connection.create({ providerId: "openai", credentialId: struck.id, baseUrl: null, model: "gpt-5-mini", label: STRUCK_LABEL });
  await caller.connection.create({
    providerId: "openrouter",
    credentialId: healthy.id,
    baseUrl: null,
    model: "openai/gpt-4o-mini",
    label: HEALTHY_LABEL,
  });
  await caller.connection.setBinding({ task: "chat", connectionId: chat.id });
  await root.services.credentials.markRevokedByUser({ principal, credentialId: struck.id });

  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...READS]));
  await mount<typeof ConnectionsPaneStory>(STORY, {});

  const struckRow = page.locator('[data-slot="list-row-root"]').filter({ hasText: STRUCK_LABEL }).locator("..");
  await expect(struckRow.getByText(CONNECTION_KEY_REJECTED_BADGE, { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="list-row-root"]').filter({ hasText: HEALTHY_LABEL })).toBeVisible();
  const chatRole = ROLE_ROWS_ORDERED.find(({ task }) => task === "chat");
  const chatSlot = page.getByRole("group", { name: chatRole?.heading ?? "", exact: true });
  await expect(chatSlot.getByRole("img", { name: ROLE_STATUS_LABELS.blocked, exact: true })).toBeVisible();
  await expect(chatSlot.getByRole("combobox", { name: connectionRolePickerName(chatRole?.label ?? ""), exact: true })).toBeEnabled();
});
