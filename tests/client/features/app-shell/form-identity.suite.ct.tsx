// Form identity (UI-Primitives-and-Reuse §13.10): every native form field of every registered section, modal and settings
// group carries an `id` or `name` and an associated label. The rosters are the production tuples, never a list here.
import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { formatFormIdentityFindings, formIdentityFindings, settleSurface } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { BareFieldPrimitivesStory, FieldWrappedPrimitivesStory, FormKeysStory } from "./_field-identity-stories.tsx";
import { routeSurfaceReads } from "./_surface-harness.ts";
import type { ConfigGroupStory, ModalShellStory, SectionShellStory } from "./_surface-stories.tsx";

const STORIES = "tests/client/features/app-shell/_surface-stories";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeSurfaceReads(page, corpus, await root.internalCallerFor(root.ownerId));
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("every @orb/ui field primitive emits an id or name without a caller", async ({ mount, page }) => {
  await mount<typeof BareFieldPrimitivesStory>("tests/client/features/app-shell/_field-identity-stories/BareFieldPrimitivesStory", {});
  await settleSurface(page);
  expect(formatFormIdentityFindings(await formIdentityFindings(page, { both: true }))).toBe("");
});

test("every @orb/ui field primitive inside a Field emits an id and a name", async ({ mount, page }) => {
  await mount<typeof FieldWrappedPrimitivesStory>("tests/client/features/app-shell/_field-identity-stories/FieldWrappedPrimitivesStory", {});
  await settleSurface(page);
  expect(formatFormIdentityFindings(await formIdentityFindings(page, { both: true }))).toBe("");
});

test.describe("submitted form keys", () => {
  const submittedKeys = (page: Page): Promise<string[]> => page.evaluate(() => [...new FormData(document.querySelector("form") as HTMLFormElement).keys()]);

  test("a caller's own name is the key a Field-wrapped Input, Checkbox and Select submit under", async ({ mount, page }) => {
    await mount<typeof FormKeysStory>("tests/client/features/app-shell/_field-identity-stories/FormKeysStory", { named: true });
    await settleSurface(page);
    expect((await submittedKeys(page)).sort()).toEqual(["agree", "email", "kind"]);
  });

  test("unnamed controls still submit under distinct minted keys", async ({ mount, page }) => {
    await mount<typeof FormKeysStory>("tests/client/features/app-shell/_field-identity-stories/FormKeysStory", { named: false });
    await settleSurface(page);
    const keys = await submittedKeys(page);
    expect(new Set(keys).size).toBe(3);
    expect(keys.every((key) => key !== "")).toBe(true);
  });
});

test.describe("planted defects", () => {
  test("a field with no id or name, and a field with no label, each fail", async ({ page }) => {
    await page.setContent('<label>Named by its label<input></label><input id="bare" name="bare">');
    const findings = await formIdentityFindings(page);
    expect(findings.map((finding) => finding.rule).sort()).toEqual(["no-id-or-name", "no-label"]);
  });

  test("a labelled field with an id and a name reports nothing", async ({ page }) => {
    await page.setContent('<label for="handle">Handle</label><input id="handle" name="handle">');
    expect(await formIdentityFindings(page)).toEqual([]);
  });
});

for (const section of SECTION_IDS) {
  test(`section ${section} identifies and labels every form field`, async ({ mount, page }) => {
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    await settleSurface(page);
    expect(formatFormIdentityFindings(await formIdentityFindings(page))).toBe("");
  });
}

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} identifies and labels every form field`, async ({ mount, page }) => {
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    await settleSurface(page);
    expect(formatFormIdentityFindings(await formIdentityFindings(page))).toBe("");
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} identifies and labels every form field`, async ({ mount, page }) => {
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group });
    await settleSurface(page);
    expect(formatFormIdentityFindings(await formIdentityFindings(page))).toBe("");
  });
}
