// Form identity (UI-Primitives-and-Reuse §13.10): every native form field of every registered section, modal and settings
// group carries an `id` or `name` and an associated label. The rosters are the production tuples, never a list here.
import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { presetIdInputSchema } from "@orb/contracts/preset";
import { auditSurface, formatFormIdentityFindings } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { BareFieldPrimitivesStory, FieldWrappedPrimitivesStory, FormKeysStory } from "./_field-identity-stories.tsx";
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

test("every @orb/ui field primitive emits an id or name without a caller", async ({ mount, page }) => {
  await mount<typeof BareFieldPrimitivesStory>("tests/client/features/app-shell/_field-identity-stories/BareFieldPrimitivesStory", {});
  const report = await auditSurface({
    name: "mounted field primitives",
    scope: page.locator("body"),
    state: "loaded",
    witnesses: [page.getByRole("textbox", { name: "Plain text", exact: true }), page.getByRole("checkbox", { name: "Agree", exact: true })],
    checks: ["forms"],
    requireBothFormKeys: true,
  });
  expect(formatFormIdentityFindings(report.forms)).toBe("");
});

test("every @orb/ui field primitive inside a Field emits an id and a name", async ({ mount, page }) => {
  await mount<typeof FieldWrappedPrimitivesStory>("tests/client/features/app-shell/_field-identity-stories/FieldWrappedPrimitivesStory", {});
  const report = await auditSurface({
    name: "mounted field primitives",
    scope: page.locator("body"),
    state: "loaded",
    witnesses: [page.getByRole("textbox", { name: "Plain text", exact: true }), page.getByRole("checkbox", { name: "Agree", exact: true })],
    checks: ["forms"],
    requireBothFormKeys: true,
  });
  expect(formatFormIdentityFindings(report.forms)).toBe("");
});

test("the loaded preset detail identifies and labels every form field", async ({ corpus, mount, page }) => {
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
    checks: ["forms"],
  });
  expect(formatFormIdentityFindings(report.forms)).toBe("");
});

test.describe("submitted form keys", () => {
  const submittedKeys = (page: Page): Promise<string[]> => page.evaluate(() => [...new FormData(document.querySelector("form") as HTMLFormElement).keys()]);

  test("a caller's own name is the key a Field-wrapped Input, Checkbox and Select submit under", async ({ mount, page }) => {
    await mount<typeof FormKeysStory>("tests/client/features/app-shell/_field-identity-stories/FormKeysStory", { named: true });
    await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
    expect((await submittedKeys(page)).sort()).toEqual(["agree", "email", "kind"]);
  });

  test("unnamed controls still submit under distinct minted keys", async ({ mount, page }) => {
    await mount<typeof FormKeysStory>("tests/client/features/app-shell/_field-identity-stories/FormKeysStory", { named: false });
    await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
    const keys = await submittedKeys(page);
    expect(new Set(keys).size).toBe(3);
    expect(keys.every((key) => key !== "")).toBe(true);
  });
});

for (const section of SECTION_IDS) {
  test(`section ${section} identifies and labels every form field`, async ({ mount, page }) => {
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    const report = await auditSurface({ ...sectionScenario(page, section), checks: ["forms"] });
    expect(formatFormIdentityFindings(report.forms)).toBe("");
  });
}

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} identifies and labels every form field`, async ({ mount, page }) => {
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    const report = await auditSurface({ ...modalScenario(page, modal), checks: ["forms"] });
    expect(formatFormIdentityFindings(report.forms)).toBe("");
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} identifies and labels every form field`, async ({ mount, page }) => {
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group });
    const report = await auditSurface({ ...groupScenario(page, group), checks: ["forms"] });
    expect(formatFormIdentityFindings(report.forms)).toBe("");
  });
}
