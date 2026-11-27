// @subject packages/client/src/features/credentials/components/connection-editor.tsx
// A write the server refuses with one of the connection codes lands where its fix is: on the name, the Server URL or the
// model field of the open editor, on one line above the tiers when no control here holds it, and in a toast when the
// connection itself is gone. Entry: the Connections list's editor (`ConnectionActionGroupsStory`) over a composed server,
// the refusal scripted at the wire as the server's formatter sends it. Layer: Playwright CT.
// Red: dropping a branch of `connectionFieldRefusalOf` or its placement in the editor leaves the refusal unsaid.

import { connectionFieldRefusalOf } from "@orb/client/lib";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { ALERTS_REGION_NAME, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CONNECTION_NAME_FIELD_NAME } from "#client/features/credentials/lib/credentials-names.ts";
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
const RENAMED = "Renamed box";
// The refusals a connection write can meet on this surface, each by its wire code.
const WRITE_REFUSALS = [
  CONNECTION_OP_CODES.labelEmpty,
  CONNECTION_OP_CODES.baseUrlShape,
  CONNECTION_OP_CODES.modelNotInCatalog,
  CONNECTION_OP_CODES.modelIdShape,
  CONNECTION_OP_CODES.taskUnservable,
  CONNECTION_OP_CODES.providerUnknown,
  CONNECTION_OP_CODES.apiIncoherent,
  CONNECTION_OP_CODES.credentialForeign,
  CONNECTION_OP_CODES.notFound,
] as const;

test.use({ viewport: { width: 900, height: 900 } });

for (const reason of WRITE_REFUSALS) {
  test(`a ${reason} refusal of a rename is said where its fix is`, async ({ mount, page }) => {
    await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.connection.create({ providerId: "vllm", credentialId: null, baseUrl: "http://127.0.0.1:8000/v1", model: "own-model", label: LABEL });
    await routeTrpc(page, {
      ...serveCorpusProcedures(caller, READS),
      ...serveCorpusProcedures(caller, ["connection.update"], (input) =>
        input.patch.label === RENAMED ? trpcError({ code: "BAD_REQUEST", reason, message: "The server's own sentence." }) : undefined,
      ),
    });
    await mount<typeof ConnectionActionGroupsStory>(STORY, { width: 900, appearance: appearanceSettingsSchema.parse({}) });
    await page.locator('[data-slot="list-row-body"]').filter({ hasText: LABEL }).click();

    const name = page.getByRole("textbox", { name: CONNECTION_NAME_FIELD_NAME, exact: true });
    await name.fill(RENAMED);
    await name.blur();

    // The expected words and place come from the production reader of the same wire shape.
    const refusal = connectionFieldRefusalOf({ data: { code: "BAD_REQUEST", reason } });
    if (refusal === null) {
      throw new Error(`${reason} is a connection write refusal, so the editor reads it`);
    }
    const holder = {
      connection: page.getByRole("region", { name: ALERTS_REGION_NAME }),
      label: page.locator('[data-slot="field-root"]'),
      baseUrl: page.locator('[data-slot="field-root"]'),
      model: page.locator('[data-slot="connection-editor"]'),
      provider: page.locator('[data-slot="connection-editor-refusal"]'),
      api: page.locator('[data-slot="connection-editor-refusal"]'),
      credential: page.locator('[data-slot="connection-editor-refusal"]'),
    }[refusal.target];
    await expect(holder.getByText(refusal.copy, { exact: true })).toBeVisible();
    // The server's own sentence is never what the person reads for a code the editor words itself.
    await expect(page.getByText("The server's own sentence.", { exact: true })).toHaveCount(0);
  });
}
