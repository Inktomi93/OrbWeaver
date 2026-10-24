// Namecraft (UI-Primitives-and-Reuse §13.10): every registered section, modal and settings group is mounted through the
// production door and judged by the name-quality probes. The rosters are the production tuples, never a list here.
import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { formatFindings, nameQualityFindings } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { productNameFindings, routeSurfaceReads, settleSurface } from "./_surface-harness.tsx";
import type { ConfigGroupStory, ModalShellStory, SectionShellStory } from "./_surface-stories.tsx";

const STORIES = "tests/client/features/app-shell/_surface-stories";

test.beforeEach(async ({ corpus, page }) => {
  await routeSurfaceReads(page, corpus);
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

  test("clean markup reports nothing", async ({ page }) => {
    await page.setContent(
      '<nav aria-label="Primary"><a href="/a">A</a></nav><nav aria-label="Secondary"><a href="/b">B</a></nav>' +
        '<button type="button" aria-label="Save">Save</button><form aria-label="Sign in"><input aria-label="Handle" name="handle"></form>',
    );
    expect(await nameQualityFindings(page)).toEqual([]);
  });
});

for (const section of SECTION_IDS) {
  test(`section ${section} has no name-quality findings`, async ({ corpus, mount, page }) => {
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    await settleSurface(page);
    expect(formatFindings(await productNameFindings(page, corpus))).toBe("");
  });
}

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} has no name-quality findings`, async ({ corpus, mount, page }) => {
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    await settleSurface(page);
    expect(formatFindings(await productNameFindings(page, corpus))).toBe("");
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} has no name-quality findings`, async ({ corpus, mount, page }) => {
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group });
    await settleSurface(page);
    expect(formatFindings(await productNameFindings(page, corpus))).toBe("");
  });
}
