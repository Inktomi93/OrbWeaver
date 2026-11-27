// The type-ramp census: every registered section, modal and settings group, mounted through the production door with the
// viewer's font-scale setting raised, paints every text run at a `--text-*` step of the scaled root (UI-Density-Law.md §2.3,
// integer-line-boxes.md §2). The rosters are the production tuples, never a list here; the ramp read is auditSurface's typeRamp check.

import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { auditSurface, formatDensityFindings, formatTypeRampFindings } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { routeSurfaceReads } from "./_surface-harness.ts";
import { groupScenario, modalScenario, sectionScenario } from "./_surface-scenarios.ts";
import type { ConfigGroupStory, ModalShellStory, SectionShellStory } from "./_surface-stories.tsx";

const STORIES = "tests/client/features/app-shell/_surface-stories";
// At this slider stop no ramp step lands on a whole pixel, so a raw integer size can never pass as a scaled step.
const FONT_SCALE = 1.15;
// The UA root the `:root { font-size }` scale multiplies; no token names a browser default.
const UA_ROOT_PX = 16;
const DEFAULTS = appearanceSettingsSchema.parse({});
// The reading knobs multiply a step for transcript prose; at their defaults the prose is the step itself.
const APPEARANCE = { fontScale: FONT_SCALE, readingBodyScale: DEFAULTS.readingBodyScale };

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeSurfaceReads(page, corpus, root, { appearance: APPEARANCE });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** The ramp is read against the scaled root, so the viewer's font-scale setting must have reached it. */
async function expectScaledRoot(page: Page): Promise<void> {
  const rootPx = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(rootPx).toBeCloseTo(UA_ROOT_PX * FONT_SCALE, 3);
}

for (const section of SECTION_IDS) {
  test(`section ${section} paints every text run on the scaled ramp`, async ({ mount, page }) => {
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    const report = await auditSurface({ ...sectionScenario(page, section), checks: ["density", "typeRamp"] });
    expect(formatDensityFindings(report.density)).toBe("");
    expect(formatTypeRampFindings(report.typeRamp)).toBe("");
    await expectScaledRoot(page);
  });
}

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} paints every text run on the scaled ramp`, async ({ mount, page }) => {
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    const report = await auditSurface({ ...modalScenario(page, modal), checks: ["density", "typeRamp"] });
    expect(formatDensityFindings(report.density)).toBe("");
    expect(formatTypeRampFindings(report.typeRamp)).toBe("");
    await expectScaledRoot(page);
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} paints every text run on the scaled ramp`, async ({ mount, page }) => {
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group, appearance: APPEARANCE });
    const report = await auditSurface({ ...groupScenario(page, group), checks: ["density", "typeRamp"] });
    expect(formatDensityFindings(report.density)).toBe("");
    expect(formatTypeRampFindings(report.typeRamp)).toBe("");
    await expectScaledRoot(page);
  });
}
