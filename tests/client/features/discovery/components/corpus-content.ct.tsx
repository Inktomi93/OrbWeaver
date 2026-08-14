// CT: the Corpus CONTENT region's FIRST-RUN state and its inset (side-eye 2026-08-08 P1-2, receipt
// `reports/snaps/f-corpus-shot.png`).
//
// Two defects on one screen, both measured on a library that has never been analysed:
//   • EIGHT dead-end empty states. Themes / All themes / Keywords / Catalog / Theme drift each printed its
//     own muted "No … computed yet." line — seven notes stacked down the pane, none of which said what to
//     DO or offered anywhere to do it. They collapse into ONE state naming the two jobs that fill them,
//     with the live door to Settings → Jobs.
//   • ZERO horizontal padding. The shell's CONTENT region has no inset of its own and neither corpus
//     surface carried one, so body text sat flush at the list divider (x=363) and the trailing money column
//     was pinned to the viewport edge. The REGION pads now, once, for both surfaces (the Configuration
//     `config-content-surface` precedent).
//
// Both assertions are RENDERED facts — a resolved inset and the presence/absence of notes — never class
// lists, and both barrier on the settled suspense arm (the section headings) before measuring.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { readPhantomScrollers } from "../../../../support/ct/scroll-containing-block.ts";
import { CorpusContentStory } from "../_ct-stories.tsx";

/** A library with real characters but nothing analysed — the exact first-run shape. */
const UNANALYSED: TrpcRoutes = {
  "discovery.home": {
    coverage: { characters: 10, digests: 0, segments: 0 },
    topSceneThemes: [],
    topArcThemes: [],
    duplicateCounts: { characters: 0, chats: 0 },
  },
  "discovery.catalog": { totalDistilled: 0, genres: [], tones: [], topTags: [] },
  "discovery.forgottenGems": [],
  "discovery.unusedCharacters": [],
  "discovery.modelRouting": [],
};

/** …and the same library after the two jobs ran — the control for every absence below. */
const ANALYSED: TrpcRoutes = {
  ...UNANALYSED,
  "discovery.home": {
    coverage: { characters: 10, digests: 40, segments: 12 },
    topSceneThemes: [{ id: "theme_1", clusterIdx: 0, level: "scene", name: "The long road", size: 7 }],
    topArcThemes: [],
    duplicateCounts: { characters: 0, chats: 0 },
  },
  "discovery.catalog": { totalDistilled: 6, genres: [{ value: "fantasy", count: 6 }], tones: [], topTags: [] },
  "discovery.themes": [],
  "discovery.topKeywords": [],
  "discovery.themeDrift": [],
};

function stub(page: Page, shape: TrpcRoutes): Promise<TrpcRecorder> {
  return routeTrpc(page, shape);
}

/** The dead-end note shape the collapse replaced — "No scene themes computed yet", "No keyword cooccurrence
 *  computed yet", and their siblings. Module scope: a regex rebuilt per call is the `useTopLevelRegex` lint. */
const COMPUTED_YET_NOTE = /computed yet/;

/** The five analysis sections that stand down at zero — each rendered its own note, none of them actionable. */
const ANALYSIS_HEADINGS = ["Themes", "All themes", "Keywords", "Catalog", "Theme drift"] as const;

test("first run: the analysis sections collapse into ONE state that names the jobs and opens the door", async ({ mount, page }) => {
  await stub(page, UNANALYSED);
  const component = await mount(<CorpusContentStory />);

  // Coverage is REAL data and stays — the pane still says how big the library is.
  await expect(component.getByRole("heading", { name: "Coverage" })).toBeVisible();

  // The ONE state: the condition, the two jobs by their picker labels, and a live door.
  await expect(component.getByText("Nothing analysed yet")).toBeVisible();
  await expect(component.getByText("Run Distill characters and Compute themes to fill this in.")).toBeVisible();
  await expect(component.getByRole("button", { name: "Run a job…" })).toBeVisible();

  // …and NOT the seven dead ends it replaced. Each was true and each was a wall.
  await expect(component.getByText(COMPUTED_YET_NOTE)).toHaveCount(0);
  await expect(component.getByText("None distilled.")).toHaveCount(0);
  await expect(component.getByText("No tags distilled.")).toHaveCount(0);
  await Promise.all(
    ANALYSIS_HEADINGS.map(async (heading) =>
      expect(component.getByRole("heading", { name: heading, exact: true }), `${heading} must not render its own zero panel`).toHaveCount(0),
    ),
  );
});

test("once the jobs have run, the analysis sections are back and the collapsed state is gone", async ({ mount, page }) => {
  await stub(page, ANALYSED);
  const component = await mount(<CorpusContentStory />);

  await expect(component.getByRole("heading", { name: "Themes", exact: true })).toBeVisible();
  await expect(component.getByText("The long road")).toBeVisible();
  // The control for the assertion above: the collapse is CONDITIONAL, not a removal.
  await expect(component.getByText("Nothing analysed yet")).toHaveCount(0);
});

test("the CONTENT region insets its own body — no row starts flush at the pane edge", async ({ mount, page }) => {
  await stub(page, ANALYSED);
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { name: "Coverage" })).toBeVisible();

  // The RESOLVED token, never a hardcoded px: the region pads on the `section` step.
  const measured = await page.locator('[data-slot="corpus-content"]').evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-section)";
    el.append(probe);
    const expected = globalThis.getComputedStyle(probe).width;
    probe.remove();
    return { left: style.paddingLeft, right: style.paddingRight, expected };
  });
  expect(measured.left).toBe(measured.expected);
  expect(measured.right).toBe(measured.expected);

  // …and the rendered consequence: the first heading's box starts INSIDE the region's own box.
  const [regionBox, headingBox] = await Promise.all([
    page.locator('[data-slot="corpus-content"]').boundingBox(),
    component.getByRole("heading", { name: "Coverage" }).boundingBox(),
  ]);
  if (regionBox === null || headingBox === null) {
    throw new Error("the corpus content region or its first heading did not render a box");
  }
  expect(headingBox.x, "the body is inset from the pane's left edge").toBeGreaterThan(regionBox.x);
});

// THE CONTAINING-BLOCK PIN (phantom-scroll CLASS sweep, 2026-08-14). The corpus CONTENT region owns its scroll axis (`h-full min-h-0 overflow-y-auto overscroll-contain`), and each of its five tabs is its own `flex-1 overflow-y-auto` scroller.
// An `overflow` scroller only clips — and only absorbs the scrollable overflow of — an absolutely-positioned
// descendant whose CONTAINING BLOCK is inside it. A `position: static` scroller establishes none, so the
// `sr-only` boxes Base UI form primitives emit (`position: absolute` — NumberField's bounds announcer,
// Switch/Checkbox's hidden input, the combobox status line) resolve theirs further up and add their static
// positions to a POSITIONED ancestor's scrollable area instead. That is the owner's 2026-08-13 "scrolls past
// the end of its results" defect (fixed once for the settings pane region, swept as a class here), and
// `relative` on the scroller is the whole fix. `readPhantomScrollers` measures the MECHANISM document-wide —
// the SYMPTOM needs a positioned scrolling host, which is the settings shell CT's own story.
// HONEST LABEL: a FENCE, not a defect proof — measured GREEN against the pre-fix source, because this
// surface's CT story paints read-only content (no Base UI form primitive, so no `sr-only` absolute box
// exists to escape). The DEFECT PROOFS for this class are the preset-editor and character-editor pins,
// which red against HEAD. This fence is what stops the class coming back the day a form control lands
// in this pane — which is exactly how the settings pane acquired it.
test("no absolutely-positioned box escapes the corpus content scroller (the containing-block pin)", async ({ mount, page }) => {
  await stub(page, ANALYSED);
  const component = await mount(<CorpusContentStory />);
  // SETTLED: Coverage is the region's first real heading past the suspense arm.
  await expect(component.getByRole("heading", { name: "Coverage" })).toBeVisible();

  expect(await readPhantomScrollers(page)).toEqual([]);
});
