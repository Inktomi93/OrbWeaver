// Namecraft (UI-Primitives-and-Reuse §13.10): every registered section, modal and settings group is mounted through the
// production door and judged by the name-quality probes. The rosters are the production tuples, never a list here.

import { testId } from "@orb/client/lib";
import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { presetIdInputSchema } from "@orb/contracts/preset";
import { formatVersionIdentity } from "@orb/kit/version-identity";
import { auditSurface, formatFindings } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { routeSurfaceReads } from "./_surface-harness.ts";
import { groupScenario, modalScenario, sectionScenario } from "./_surface-scenarios.ts";
import type { ConfigGroupStory, ModalShellStory, PresetDetailShellStory, SectionShellStory } from "./_surface-stories.tsx";

const STORIES = "tests/client/features/app-shell/_surface-stories";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeSurfaceReads(page, corpus, root);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

for (const section of SECTION_IDS) {
  test(`section ${section} has no name-quality findings`, async ({ mount, page }) => {
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    const report = await auditSurface({ ...sectionScenario(page, section), checks: ["names"] });
    expect(formatFindings(report.names)).toBe("");
  });
}

test("the loaded preset detail has no name-quality findings", async ({ corpus, mount, page }) => {
  const captured = corpus.libraryRelations?.reads.presetDetail.input;
  if (captured === undefined) {
    throw new Error("The corpus has no captured preset detail");
  }
  const { id: presetId } = presetIdInputSchema.parse(captured);
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.get({ id: presetId });
  await mount<typeof PresetDetailShellStory>(`${STORIES}/PresetDetailShellStory`, { presetId });
  await expect(page.getByRole("heading", { name: preset.name, exact: true })).toBeVisible();
  const report = await auditSurface({
    name: "loaded preset detail",
    scope: page.locator("body"),
    state: "loaded",
    witnesses: [page.getByRole("heading", { name: preset.name, exact: true }), page.getByRole("button", { name: "Rename preset", exact: true })],
    checks: ["names"],
  });
  expect(formatFindings(report.names)).toBe("");
});

test("the loaded Admin controls have no name-quality findings", async ({ mount, page }) => {
  await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group: "admin" });
  await expect(page.getByRole("textbox", { name: "Max generated-image download (MB)", exact: true })).toBeVisible();
  const report = await auditSurface({ ...groupScenario(page, "admin"), checks: ["names"] });
  expect(formatFindings(report.names)).toBe("");
});

test("the served build identity is rendered before the About name audit", async ({ mount, page }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  const version = await caller.settings.getVersion();
  await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group: "about" });
  await expect(page.getByTestId(testId("aboutVersionLine"))).toHaveText(formatVersionIdentity(version));
  const report = await auditSurface({ ...groupScenario(page, "about"), checks: ["names"] });
  expect(formatFindings(report.names)).toBe("");
});

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} has no name-quality findings`, async ({ mount, page }) => {
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    const report = await auditSurface({ ...modalScenario(page, modal), checks: ["names"] });
    expect(formatFindings(report.names)).toBe("");
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} has no name-quality findings`, async ({ mount, page }) => {
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group });
    const report = await auditSurface({ ...groupScenario(page, group), checks: ["names"] });
    expect(formatFindings(report.names)).toBe("");
  });
}
