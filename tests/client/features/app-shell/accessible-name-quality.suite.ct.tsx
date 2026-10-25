// Namecraft (UI-Primitives-and-Reuse §13.10): every registered section, modal and settings group is mounted through the
// production door and judged by the name-quality probes. The rosters are the production tuples, never a list here.

import { testId } from "@orb/client/lib";
import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { presetIdInputSchema } from "@orb/contracts/preset";
import { formatVersionIdentity } from "@orb/kit/version-identity";
import { formatFindings, nameQualityFindings, productNameFindings, settleSurface } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { routeSurfaceReads } from "./_surface-harness.ts";
import type { ConfigGroupStory, ModalShellStory, PresetDetailShellStory, SectionShellStory } from "./_surface-stories.tsx";

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

test.describe("planted defects", () => {
  test("an unnamed button, a duplicate landmark, an unnamed form and a label missing from its name each fail", async ({ page }) => {
    await page.setContent(
      '<nav aria-label="Same"><a href="/a">A</a></nav><nav aria-label="Same"><a href="/b">B</a></nav>' +
        '<button type="button"></button><form><input aria-label="Field" name="field"></form>' +
        '<button type="button" aria-label="Open">Jump</button>',
    );
    const rules = new Set((await nameQualityFindings(page)).map((finding) => finding.rule));
    expect([...rules].sort()).toEqual(["duplicate-landmark", "label-not-in-name", "nameless-control", "unnamed-landmark"]);
  });

  test("a duplicate name is the product's unless the rows repeat the same record", async ({ page }) => {
    await page.setContent(
      '<div><span>Notes</span><button type="button">Edit Notes</button></div><div><span>Notes</span><button type="button">Edit Notes</button></div>',
    );
    const reported = (await productNameFindings(page)).filter((finding) => finding.rule === "ambiguous-duplicate");
    expect(reported.map((finding) => finding.subject)).toEqual(["Edit Notes"]);

    await page.setContent(
      '<ul><li><span>Your chat is now hosted</span><button type="button">Dismiss: Your chat is now hosted</button></li>' +
        '<li><span>Your chat is now hosted</span><button type="button">Dismiss: Your chat is now hosted</button></li></ul>',
    );
    expect(await productNameFindings(page)).toEqual([]);
    expect((await nameQualityFindings(page)).map((finding) => finding.rule)).toEqual(["ambiguous-duplicate"]);
  });

  test("clean markup reports nothing", async ({ page }) => {
    await page.setContent(
      '<nav aria-label="Primary"><a href="/a">A</a></nav><nav aria-label="Secondary"><a href="/b">B</a></nav>' +
        '<button type="button" aria-label="Save">Save</button><form aria-label="Sign in"><input aria-label="Handle" name="handle"></form>',
    );
    expect(await nameQualityFindings(page)).toEqual([]);
    // The probe reads this page: the same call reports a defect planted into it.
    await page.setContent('<button type="button"></button>');
    expect((await nameQualityFindings(page)).map((finding) => finding.rule)).toEqual(["nameless-control"]);
  });
});

for (const section of SECTION_IDS) {
  test(`section ${section} has no name-quality findings`, async ({ mount, page }) => {
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    await settleSurface(page);
    expect(formatFindings(await productNameFindings(page))).toBe("");
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
  await settleSurface(page);
  expect(formatFindings(await productNameFindings(page))).toBe("");
});

test("the loaded Admin controls have no name-quality findings", async ({ mount, page }) => {
  await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group: "admin" });
  await expect(page.getByRole("textbox", { name: "Max generated-image download (MB)", exact: true })).toBeVisible();
  await settleSurface(page);
  expect(formatFindings(await productNameFindings(page))).toBe("");
});

test("the served build identity is rendered before the About name audit", async ({ mount, page }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  const version = await caller.settings.getVersion();
  await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group: "about" });
  await expect(page.getByTestId(testId("aboutVersionLine"))).toHaveText(formatVersionIdentity(version));
  await settleSurface(page);
  expect(formatFindings(await productNameFindings(page))).toBe("");
});

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} has no name-quality findings`, async ({ mount, page }) => {
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    await settleSurface(page);
    expect(formatFindings(await productNameFindings(page))).toBe("");
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} has no name-quality findings`, async ({ mount, page }) => {
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group });
    await settleSurface(page);
    expect(formatFindings(await productNameFindings(page))).toBe("");
  });
}
