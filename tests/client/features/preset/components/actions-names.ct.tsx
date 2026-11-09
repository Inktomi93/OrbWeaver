// Templates in two kinds share a label ("Past tense" steers and greeting-transforms); the Actions tab names each one's doors apart.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
const WIDTH = 960;
const SHARED_LABEL = "Past tense";

test("templates that share a label across kinds have distinct door names on the Actions tab", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const appearance = appearanceSettingsSchema.parse({});
  const preset = await caller.preset.create({ name: "Action names witness", kind: "generation" });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "preset.list",
      "preset.get",
      "plugin.listMacros",
      "preset.resolveEffective",
      "connection.resolveChatCapability",
      "connection.providersAvailable",
      "connection.list",
    ]),
  );
  await mount<typeof PresetActionGroupsStory>(STORY, { width: WIDTH, appearance, subject: "editor", presetId: preset.id });
  await page.getByRole("tab", { name: "Actions", exact: true }).click();
  const sharing = page.getByRole("button", { name: new RegExp(`^Edit ${SHARED_LABEL}`, "u") });
  await expect(sharing).toHaveCount(2);
  const names = await sharing.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(new Set(names).size).toBe(2);
  const bodies = page.locator('[data-slot="list-row-body"]').filter({ hasText: SHARED_LABEL });
  await expect(bodies).toHaveCount(2);
  const bodyNames = await bodies.evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label")));
  expect(new Set(bodyNames).size).toBe(2);
});
