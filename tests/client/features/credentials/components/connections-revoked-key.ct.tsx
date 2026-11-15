// @subject packages/client/src/features/credentials/components/connections-list-section.tsx
// @subject packages/client/src/features/credentials/components/connections-roles-section.tsx
// @subject packages/client/src/lib/revoked-key-copy.ts
// One revoked key never takes the Connections page down, and every surface says why it was revoked. For each stored
// reason, with the key bound to Chat, the list and the Model roles both draw, the row's badge and the Chat readout use
// that reason's words, and Chat keeps its picker in place. The Saved keys row's line and its Replace on a revoked key
// are `platform-credential-fact-action-groups.suite.ct.tsx`'s.

import { ROLE_ROWS_ORDERED, ROLE_STATUS_LABELS } from "@orb/client/lib";
import type { CredentialHealth, CredRevokedReason } from "@orb/contracts/credentials";
import { CRED_REVOKED_REASONS } from "@orb/contracts/credentials";
import type { UserCredentialId } from "@orb/kit/ids";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { connectionRolePickerName } from "#client/components/shared-control-names.ts";
import { REVOKED_KEY_COPY } from "#client/lib/revoked-key-copy.ts";
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
// Past the probe throttle window, so each recorded failure is its own probe.
const PROBE_GAP_MS = 2 * 60_000;
// Far past any strike limit: the loop stops at the first probe that revokes.
const STRIKES_MAX = 10;
const REMOTE_FAILURE = { status: "unreachable", checkedAt: 0, reason: "scripted remote transport failure" } satisfies CredentialHealth;
const PROVIDER_REJECTED = { status: "revoked", checkedAt: 0, reason: "scripted provider rejection" } satisfies CredentialHealth;

type Revoke = (root: ServerTestHarness, credentialId: UserCredentialId) => Promise<void>;

// Each reason through the production path that writes it: the health probe's row half, and the user's own revoke.
const REVOKE: Record<CredRevokedReason, Revoke> = {
  ["auth_failed"]: async (root, credentialId) => {
    const principal = await root.principalFor(root.ownerId);
    await root.services.credentials.recordProbeOutcome({ principal, credentialId, localEndpoint: false, result: PROVIDER_REJECTED });
  },
  unreachable: async (root, credentialId) => {
    const principal = await root.principalFor(root.ownerId);
    for (let strike = 0; strike < STRIKES_MAX; strike += 1) {
      const health = await root.services.credentials.recordProbeOutcome({ principal, credentialId, localEndpoint: false, result: REMOTE_FAILURE });
      if (health.status === "revoked") {
        return;
      }
      root.clock.advance(PROBE_GAP_MS);
    }
    throw new Error("the remote failure streak never revoked the key");
  },
  user: async (root, credentialId) => {
    await root.services.credentials.markRevokedByUser({ principal: await root.principalFor(root.ownerId), credentialId });
  },
};

test.use({ viewport: { width: 1440, height: 1400 } });

for (const reason of CRED_REVOKED_REASONS) {
  test(`a key revoked for ${reason} leaves the list and the roles drawn, and every surface says why`, async ({ mount, page }) => {
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
    await REVOKE[reason](root, struck.id);
    // Positive control: the seam wrote the reason this case is about.
    expect((await caller.credentials.list()).find((key) => key.id === struck.id)?.revokedReason).toBe(reason);

    await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...READS]));
    await mount<typeof ConnectionsPaneStory>(STORY, {});

    const copy = REVOKED_KEY_COPY[reason];
    const struckRow = page.locator('[data-slot="list-row-root"]').filter({ hasText: STRUCK_LABEL }).locator("..");
    await expect(struckRow.getByText(copy.badge, { exact: true })).toBeVisible();
    await expect(page.locator('[data-slot="list-row-root"]').filter({ hasText: HEALTHY_LABEL })).toBeVisible();
    const chatRole = ROLE_ROWS_ORDERED.find(({ task }) => task === "chat");
    const chatSlot = page.getByRole("group", { name: chatRole?.heading ?? "", exact: true });
    await expect(chatSlot.getByRole("img", { name: ROLE_STATUS_LABELS.blocked, exact: true })).toBeVisible();
    await expect(chatSlot).toContainText(copy.roleClause);
    await expect(chatSlot.getByRole("combobox", { name: connectionRolePickerName(chatRole?.label ?? ""), exact: true })).toBeEnabled();
  });
}
