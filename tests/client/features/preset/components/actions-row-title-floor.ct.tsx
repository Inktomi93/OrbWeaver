// @subject packages/client/src/features/preset/components/actions-view.tsx
// The Actions tab pins each template's name to a name column beside its gloss. At the largest browser text on a phone the title floor, a rem
// length, outgrows the row: the floor yields to the row, and the name is cut short inside it.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, resolvedLength, setPlatformTextSize, titleReach } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
const PHONE = { width: 390, height: 844 } as const;
const LARGEST_TEXT = PLATFORM_TEXT_SCALES[2];
// Two templates in different kinds share this label, so each row's name carries a kind qualifier.
const SHARED_LABEL = "Past tense";

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test("the Actions rows cut a template name inside the row at the largest browser text on a phone", async ({ mount, page }) => {
  await using _textSize = await setPlatformTextSize(page, LARGEST_TEXT);
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Action floor witness", kind: "generation" });
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
  await mount<typeof PresetActionGroupsStory>(STORY, {
    width: PHONE.width,
    appearance: appearanceSettingsSchema.parse({}),
    subject: "editor",
    presetId: preset.id,
  });
  await page.getByRole("tab", { name: "Actions", exact: true }).click();

  const rows = page.locator('[data-slot="list-row-root"]').filter({ hasText: SHARED_LABEL });
  await expect(rows).toHaveCount(2);
  const floor = await resolvedLength(page, `var(${TOKENS["width.title-floor"].cssVar})`, rows.first());
  for (const row of await rows.all()) {
    const reach = await titleReach(row, floor);
    expect(reach.pastRowBy).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    expect(reach.nameKeepsItsFloor).toBe(true);
  }
});
