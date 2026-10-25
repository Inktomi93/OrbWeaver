// The hierarchy and boundary census: every registered section, modal and settings group is mounted through the
// production door and read for the rendered rules the law states (UI-Architecture-and-Layout.md §4.3 rule 3, UI-Density-Law.md
// §3 and §3.2) and for a suspending read outside a QueryBoundary (client-architecture-state-and-gates.md §11).
// The rosters are the production tuples, never a list here.

import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { presetIdInputSchema } from "@orb/contracts/preset";
import { densityFindings, formatDensityFindings, settleSurface } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { routeSurfaceReads } from "./_surface-harness.ts";
import type { ConfigGroupStory, ModalShellStory, PresetDetailShellStory, SectionShellStory } from "./_surface-stories.tsx";

const STORIES = "tests/client/features/app-shell/_surface-stories";
/** The message `requireQueryBoundary` makes a read outside a QueryBoundary throw. */
const MISSING_BOUNDARY = "[query-boundary]";

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

/** The messages a page raised that name the missing boundary, from the console and from uncaught errors. */
function watchMissingBoundary(page: Page): readonly string[] {
  const raised: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes(MISSING_BOUNDARY)) {
      raised.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (error.message.includes(MISSING_BOUNDARY)) {
      raised.push(error.message);
    }
  });
  return raised;
}

/** Empty when the surface settled with every read under a boundary and no density finding. */
async function censusReport(page: Page, boundary: readonly string[]): Promise<string> {
  await settleSurface(page);
  return [...boundary, formatDensityFindings(await densityFindings(page))].filter((line) => line !== "").join("\n");
}

test.describe("planted defects", () => {
  test("a second primary control in one region, a same-tier Surface and a boxed card in a boxed card each fail", async ({ page }) => {
    const box = "border:1px solid #888;border-radius:8px;background:#eee;padding:4px";
    await page.setContent(
      '<aside class="shell-panel"><button data-slot="button" data-cta>Save</button><button data-slot="button" data-cta>Send</button></aside>' +
        '<section data-surface-tier="form"><div data-surface-tier="form">inner</div></section>' +
        `<div data-slot="card-root" style="${box}">outer<div data-slot="card-root" style="${box}">inner</div></div>`,
    );
    expect((await densityFindings(page)).map((finding) => finding.rule).toSorted()).toEqual(["nested-box", "same-tier-surface", "second-primary"]);
  });

  test("one primary per region, a different tier inside a tier and an unboxed well in a card all pass", async ({ page }) => {
    const box = "border:1px solid #888;border-radius:8px;background:#eee;padding:4px";
    await page.setContent(
      '<aside class="shell-panel"><button data-slot="button" data-cta>Save</button></aside>' +
        '<main class="shell-content"><button data-slot="button" data-cta>Send</button><button data-slot="button" data-cta disabled>Off</button></main>' +
        '<section data-surface-tier="instrument"><div data-surface-tier="form">inner</div></section>' +
        `<div data-slot="card-root" style="${box}">outer<div data-slot="card-root" style="background:#ddd;border-radius:6px">well</div></div>`,
    );
    expect(await densityFindings(page)).toEqual([]);
  });
});

for (const section of SECTION_IDS) {
  test(`section ${section} reads clean`, async ({ mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    expect(await censusReport(page, boundary)).toBe("");
  });
}

test("the loaded preset detail reads clean", async ({ corpus, mount, page }) => {
  const captured = corpus.libraryRelations?.reads.presetDetail.input;
  if (captured === undefined) {
    throw new Error("The corpus has no captured preset detail");
  }
  const { id: presetId } = presetIdInputSchema.parse(captured);
  const boundary = watchMissingBoundary(page);
  await mount<typeof PresetDetailShellStory>(`${STORIES}/PresetDetailShellStory`, { presetId });
  expect(await censusReport(page, boundary)).toBe("");
});

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} reads clean`, async ({ mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    expect(await censusReport(page, boundary)).toBe("");
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} reads clean`, async ({ mount, page }) => {
    const boundary = watchMissingBoundary(page);
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group });
    expect(await censusReport(page, boundary)).toBe("");
  });
}
