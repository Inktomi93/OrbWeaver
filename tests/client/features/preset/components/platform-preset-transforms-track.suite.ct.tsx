// The preset Transforms view seats every label and control in the settings track the settings pane uses.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";

interface FieldEdges {
  readonly labelOffset: number;
  readonly controlOffset: number;
}

interface TrackGeometry {
  /** The width the settings pane gives its label track: the production token, resolved in the page. */
  readonly labelTrack: number;
  /** The container step below which the group stacks. */
  readonly step: number;
  /** The label track the group actually laid out, and the gap it laid out after it. */
  readonly laidOutTrack: number;
  readonly laidOutGap: number;
  readonly groupWidth: number;
}

function resolveTrackGeometry(group: Locator): Promise<TrackGeometry> {
  return group.evaluate((host) => {
    const px = (value: string): number => {
      const probe = document.createElement("div");
      probe.style.inlineSize = value;
      host.append(probe);
      const resolved = probe.getBoundingClientRect().width;
      probe.remove();
      return resolved;
    };
    const style = getComputedStyle(host);
    return {
      labelTrack: px("var(--width-control-col)"),
      step: px("var(--container-cq-32)"),
      laidOutTrack: Number.parseFloat(style.gridTemplateColumns),
      laidOutGap: Number.parseFloat(style.columnGap),
      groupWidth: host.getBoundingClientRect().width,
    };
  });
}

async function boxOf(locator: Locator, what: string): Promise<{ readonly x: number; readonly width: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`${what} must render`);
  }
  return box;
}

/** Each field's label and control x, relative to its own group, plus whether that group is wide enough for the track. */
async function readGroups(groups: Locator, step: number): Promise<{ readonly tracked: boolean; readonly fields: readonly FieldEdges[] }[]> {
  const read: { readonly tracked: boolean; readonly fields: readonly FieldEdges[] }[] = [];
  for (const group of await groups.all()) {
    const groupBox = await boxOf(group, "A settings group");
    const fields: FieldEdges[] = [];
    for (const field of await group.locator('[data-slot="field-root"]').all()) {
      const label = await boxOf(field.locator('[data-slot="field-label"]'), "A field label");
      const control = await boxOf(field.locator('[data-slot="field-control-col"]'), "A field control column");
      fields.push({ labelOffset: label.x - groupBox.x, controlOffset: control.x - groupBox.x });
    }
    read.push({ tracked: groupBox.width >= step, fields });
  }
  return read;
}

for (const regime of [
  { label: "desktop", viewport: { width: 1280, height: 900 }, coarse: false, tracked: true },
  { label: "phone", viewport: { width: 390, height: 844 }, coarse: true, tracked: false },
] as const) {
  test.describe(regime.label, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });

    test("Transforms rows share the settings track: one label edge, one control edge, stacked below the track step", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const appearance = appearanceSettingsSchema.parse({});
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
      const preset = await caller.preset.create({ name: "Transforms track witness", kind: "generation" });
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "sessions.me",
          "settings.getUserSettings",
          "preset.list",
          "preset.get",
          "preset.resolveEffective",
          "connection.resolveChatCapability",
          "connection.providersAvailable",
          "connection.list",
          "regex.listForPreset",
          "regex.listScripts",
        ]),
      );
      await mount<typeof PresetActionGroupsStory>(STORY, { width: regime.viewport.width, appearance, subject: "editor", presetId: preset.id });
      await page.getByRole("tab", { name: "Transforms", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Speaker names", exact: true })).toBeVisible();
      const groups = page.locator('[data-slot="setting-row-group"]');
      // Delivery, Collapsing, Inline reasoning parsing and Post-processing each own one group.
      await expect(groups).toHaveCount(4);

      const geometry = await resolveTrackGeometry(groups.first());
      const read = await readGroups(groups, geometry.step);
      const fields = read.flatMap((group) => group.fields);
      // Delivery 2, Collapsing 2, Inline reasoning 3, Post-processing 4.
      expect(fields).toHaveLength(11);
      expect(read.map(({ tracked }) => tracked)).toEqual(read.map(() => regime.tracked));
      // A wide group lays out the settings pane's label track; a group below the step is one track as wide as itself.
      expect(Math.round(geometry.laidOutTrack)).toBe(Math.round(regime.tracked ? geometry.labelTrack : geometry.groupWidth));
      // Every label starts at its group's edge, and every control in every group starts at ONE edge: after the label
      // track and within the label-to-control gutter (a Field's own subgrid gap trims the gutter, as in the settings pane).
      expect(fields.map(({ labelOffset }) => Math.round(labelOffset))).toEqual(fields.map(() => 0));
      const controlEdges = new Set(fields.map(({ controlOffset }) => Math.round(controlOffset)));
      expect(controlEdges.size).toBe(1);
      const [controlEdge = Number.NaN] = controlEdges;
      expect(controlEdge).toBeGreaterThanOrEqual(regime.tracked ? Math.round(geometry.labelTrack) : 0);
      expect(controlEdge).toBeLessThanOrEqual(regime.tracked ? Math.round(geometry.labelTrack + geometry.laidOutGap) : 0);
    });
  });
}
