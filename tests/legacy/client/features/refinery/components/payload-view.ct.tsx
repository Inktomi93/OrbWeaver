// CT: the ONE payload renderer (schema-renderer §3) — the mock anatomy DERIVES from plan + hints alone
// (the blessed built-in look is the general renderer applied to a hinted schema, never a bespoke
// component), and a custom schema the build has never seen renders DESIGNED widgets — the raw-JSON
// floor does not exist. Values only fill; the schema decided every widget.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { HeroRampStory, PayloadViewStory } from "../_ct-stories.tsx";

const SCORE_PAYLOAD = {
  fieldScores: [
    {
      field: "description",
      score: 8,
      strengths: "Vivid physical detail.",
      weaknesses: "Backstory is thin.",
      suggestions: "Ground the backstory in one concrete event.",
    },
    {
      field: "greetings",
      greetingIndex: 2,
      score: 4,
      strengths: "Strong opening image.",
      weaknesses: "Reads generic after the first line.",
      suggestions: "Let the greeting reference the scenario.",
    },
  ],
  overallScore: 7.5,
  priorityImprovements: ["Deepen the backstory", "Differentiate greeting 3"],
  summary: "A solid card with a thin backstory.",
};

/** What a meter's fill actually PAINTED, beside the two intent tokens it is allowed to be. Both sides are
 *  resolved from the live stylesheet through a real attached node (a detached element computes to ""), so
 *  this compares against `--color-primary` / `--color-destructive` as the theme resolved them — never a
 *  hardcoded rgb literal. */
async function fillIntentOf(page: Page, scope: string): Promise<{ painted: string; primary: string; destructive: string }> {
  return await page.evaluate((selector) => {
    const fill = document.querySelector(`${selector} [data-slot="fill"]`);
    if (fill === null) {
      throw new Error(`no meter fill under ${selector}`);
    }
    const probe = document.createElement("div");
    document.body.append(probe);
    const resolve = (token: string): string => {
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(token);
      return getComputedStyle(probe).color;
    };
    const result = {
      painted: getComputedStyle(fill).backgroundColor,
      primary: resolve("--color-primary"),
      destructive: resolve("--color-destructive"),
    };
    probe.remove();
    return result;
  }, scope);
}

// ── SCORE VALENCE (side-eye 2026-08-17, finding a) ───────────────────────────────────────────────────
// A score is a VERDICT, not a magnitude: the Meter has shipped `dangerBelow` since it was minted and the
// refinery passed it at neither the hero nor the per-field site, so a 2/10 painted the identical accent
// fill as a 10/10. The line is the midpoint of the SCHEMA'S OWN bounds (this renderer runs over custom
// schemas — a 1-5 vibe rating, a 0-100 axis — so an absolute threshold would be right for the built-ins
// and wrong for everything else).

test("a FAILING score paints the danger intent and a strong one does not — the gauge carries valence, not just magnitude", async ({ mount, page }) => {
  await mount(<PayloadViewStory payload={{ ...SCORE_PAYLOAD, overallScore: 2 }} stage="score" />);
  const low = await fillIntentOf(page, '[data-testid="refinery-hero-gauge"]');
  expect(low.painted, "2/10 paints the danger token").toBe(low.destructive);
  // The per-field assay row's own bar agrees on the same rule: 8 is over the line, 4 is under it.
  const bars = await page.locator('[data-field="fieldScores"] [data-slot="fill"]').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(bars, "one bar per assay row").toHaveLength(2);
  expect(bars[0], "8/10 keeps the accent").toBe(low.primary);
  expect(bars[1], "4/10 takes the danger token").toBe(low.destructive);
});

test("a STRONG score keeps the accent — the swap is a verdict, not a decoration every score wears", async ({ mount, page }) => {
  await mount(<PayloadViewStory payload={{ ...SCORE_PAYLOAD, overallScore: 9 }} stage="score" />);
  const high = await fillIntentOf(page, '[data-testid="refinery-hero-gauge"]');
  expect(high.painted, "9/10 keeps the accent").toBe(high.primary);
});

test("the NOT-SCORED-YET hero rests on the accent, never on danger — an unrun stage is not a failing one", async ({ mount, page }) => {
  // The hero's shape always renders (this file's own "empty values are load-bearing" law) with the meter
  // parked at `min` — which is below any midpoint, so an unguarded threshold would paint "not run yet" red.
  await mount(<PayloadViewStory payload={{ summary: "Not scored yet." }} stage="score" />);
  const resting = await fillIntentOf(page, '[data-testid="refinery-hero-gauge"]');
  expect(resting.painted).toBe(resting.primary);
});

test("the assay rows are DATUM ROWS, not cards — hairline-separated, no box per number (chrome diet CD1/CD2)", async ({ mount, page }) => {
  await mount(<PayloadViewStory payload={SCORE_PAYLOAD} stage="score" />);
  const assay = page.locator('[data-field="fieldScores"]');
  await expect(page.getByTestId("refinery-assay-row")).toHaveCount(2);
  // The box is gone: six single numbers wearing bordered, padded cards was ~82px apiece in a 240px rail.
  await expect(assay.locator('[data-slot="card-root"]'), "no card chrome inside the assay block").toHaveCount(0);
  // …and the rows are still SEPARATED — a hairline between siblings, which is what the lane's rails use.
  await expect(assay.locator('[data-slot="separator"]'), "one hairline between the two rows").toHaveCount(1);
});

test("the SCORE mock anatomy derives: hero gauge with docked summary, assay rows with the score bar, bullet improvements — no raw JSON", async ({
  mount,
  page,
}) => {
  await mount(<PayloadViewStory payload={SCORE_PAYLOAD} stage="score" />);
  // The hero: the printed numeral at the schema's OWN scale + the label + the docked prose.
  // The numeral is its own node (display voice) beside a quiet `/max`, and it COUNTS UP on settle
  // (use-count-up.ts) — so this polls to the settled figure rather than reading one frame of the ramp.
  // The exact string matters: `overallScore` is FRACTIONAL, and a ramp that quantized to integers would
  // settle this on "8". That is a live regression guard, not a formatting assertion.
  const hero = page.getByTestId("refinery-hero-gauge");
  await expect(hero.getByTestId("refinery-hero-value")).toHaveText("7.5");
  await expect(hero.getByText("/10")).toBeVisible();
  await expect(hero.getByText("Overall score")).toBeVisible();
  await expect(hero.getByText("A solid card with a thin backstory.")).toBeVisible();
  // The per-field assay: one accordion row per entry, closed by default, the body opens on press.
  const rows = page.getByTestId("refinery-assay-row");
  await expect(rows).toHaveCount(2);
  await expect(page.getByText("Backstory is thin.")).toBeHidden();
  await rows.first().click();
  await expect(page.getByText("Backstory is thin.")).toBeVisible();
  // FORK A: one open at a time — opening the second closes the first.
  await rows.nth(1).click();
  await expect(page.getByText("Backstory is thin.")).toBeHidden();
  await expect(page.getByText("Reads generic after the first line.")).toBeVisible();
  // The improvements render as a designed list, and nothing on the surface is a JSON dump.
  await expect(page.getByRole("listitem").filter({ hasText: "Deepen the backstory" })).toBeVisible();
  await expect(page.getByTestId("refinery-payload-view")).not.toContainText("{");
  // D1 (built-in arm, AUDIBLE): every meter announces on the schema's OWN 1-10 scale — a screen-reader
  // user hears "7.5 of 10" for the hero, never "72%". This reaches the shipped built-in payload, which
  // is why the fix lives at the @orb/ui Meter primitive.
  await expect(hero.getByRole("meter")).toHaveAttribute("aria-valuetext", "7.5 of 10");
  // No meter on the surface announces a percent. Asserted as a FILTERED ARRAY so a failure names the
  // offending readouts rather than printing a bare `false`.
  const valueTexts = await page.getByRole("meter").evaluateAll((els) => els.map((el) => el.getAttribute("aria-valuetext")));
  expect(valueTexts.filter((t) => t?.includes("%"))).toEqual([]);
});

test("D1/D2: a non-hero bounded score meters on its OWN scale and labels exactly ONCE — no percent, no double-label", async ({ mount, page }) => {
  // Two both-bounded root numbers ⇒ no structural hero; both render as GaugeRows (showValue meters) —
  // the exact shape the live custom-schema drive hit when the forge spliced a second score
  // (`re_vividness`, where the demoted gauge printed "Overall score  Overall score  89%").
  await mount(
    <PayloadViewStory
      payload={{ overallScore: 8, clarity: 6 }}
      schema={{
        type: "object",
        properties: {
          overallScore: { type: "integer", minimum: 1, maximum: 10 },
          clarity: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: ["overallScore", "clarity"],
      }}
    />,
  );
  await expect(page.getByTestId("refinery-hero-gauge")).toHaveCount(0);
  const gauge = page.locator('[data-field="overallScore"]');
  // D1 (custom arm, VISIBLE + AUDIBLE): own scale, never "78%".
  await expect(gauge.getByRole("meter")).toHaveAttribute("aria-valuetext", "8 of 10");
  await expect(gauge.locator('[data-slot="meter-value"]')).toHaveText("8/10");
  await expect(gauge).not.toContainText("%");
  // D2: the field label paints exactly ONCE — the showValue Meter's own label is the accessible name;
  // the outer duplicate <Text> that double-printed it is gone.
  await expect(gauge.getByText("Overall score")).toHaveCount(1);
});

test("the ANALYZE mock anatomy derives: the verdict banner leads word-first with its authored tone and the docked soul axis pill", async ({ mount, page }) => {
  await mount(
    <PayloadViewStory
      payload={{
        preserved: ["Her dry humour"],
        lost: [],
        gained: ["A sharper scenario hook"],
        soulScore: 6,
        soulAssessment: "The voice survives, slightly flattened.",
        verdict: "NEEDS_REFINEMENT",
        issues: ["Greeting 2 lost its callback"],
        recommendations: ["Restore the callback line"],
      }}
      stage="analyze"
    />,
  );
  const banner = page.getByTestId("refinery-verdict-banner");
  // Word-primary: the enum member IS the headline; the tone is the authored map's word, as an attribute.
  await expect(banner.getByRole("heading", { name: "NEEDS_REFINEMENT" })).toBeVisible();
  // The render-hint tone rides `data-hint-tone` (#1113, mirroring #1097's chip fix): `data-tone` is the
  // @orb/ui variant-axis channel the ui-audit walker reads as an AUTHORED RECIPE ARM
  // (tooling/src/ui-audit/ops/walker/target-identity.ts), so a FEATURE word (good/warn/bad/info/neutral)
  // may not sit in it. Card stamps no tone axis today, so the second assertion pins the channel EMPTY —
  // it is what turns red the day Card grows one and a call site re-collides the two vocabularies.
  await expect(banner).toHaveAttribute("data-hint-tone", "warn");
  await expect(banner).not.toHaveAttribute("data-tone", /./);
  // The axis-hinted soul number docks on the banner (not stolen into a hero gauge).
  await expect(banner.getByText("6/10")).toBeVisible();
  await expect(banner.getByText("Soul")).toBeVisible();
  await expect(banner.getByText("The voice survives, slightly flattened.")).toBeVisible();
  await expect(page.getByTestId("refinery-hero-gauge")).toHaveCount(0);
  // The banner CLAIMS what it docks: the axis number and the body prose paint exactly ONCE (the
  // visual-fidelity loop caught the double-render — this pins the fix).
  await expect(page.locator('[data-field="soulScore"]')).toHaveCount(0);
  await expect(page.getByText("The voice survives, slightly flattened.")).toHaveCount(1);
  // The empty list is a designed state, never a collapse.
  await expect(page.locator('[data-field="lost"]').getByText("none listed")).toBeVisible();
});

test("a CUSTOM schema the build has never seen renders designed widgets — the generic floor, not raw JSON", async ({ mount, page }) => {
  await mount(
    <PayloadViewStory
      payload={{ vibeRating: 4, mood: "cozy", tropes: ["found family", "slow burn"], notes: "Warm but unhurried pacing throughout." }}
      schema={{
        type: "object",
        properties: {
          vibeRating: { type: "integer", minimum: 1, maximum: 5 },
          mood: { type: "string", enum: ["cozy", "tense"], "x-orb-ui": { tone: { cozy: "good", tense: "warn" } } },
          tropes: { type: "array", items: { type: "string", maxLength: 60 } },
          notes: { type: "string" },
        },
        required: ["vibeRating", "mood"],
      }}
    />,
  );
  // The single both-bounded number elevates structurally — /5 stays /5 (scale honesty, rendered).
  const customHero = page.getByTestId("refinery-hero-gauge");
  await expect(customHero.getByTestId("refinery-hero-value")).toHaveText("4");
  await expect(customHero.getByText("/5")).toBeVisible();
  // The enum chips with its authored tone; the scalar list bullets; the unbounded string proses.
  await expect(page.locator('[data-field="mood"]').getByText("cozy")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "slow burn" })).toBeVisible();
  await expect(page.getByText("Warm but unhurried pacing throughout.")).toBeVisible();
  await expect(page.getByTestId("refinery-payload-view")).not.toContainText("{");
});

// ── The HERO COUNT-UP ramp (side-eye polish item 5, "the money shot") ────────────────────────────────
// The SCORE story above takes the NO-RAMP path by construction: it mounts with the figure already
// present, which is a value that did not arrive and must not animate. These three pin the ramp itself —
// proven by the frames the numeral actually painted, collected by a MutationObserver, so nothing here
// races a 360ms animation.
//
// THEY DRIVE `PayloadLane`, NOT `PayloadView` (#47). The original trio mounted `PayloadView` directly with
// `pending` and no payload — a state the RUN PANE never produces, because the first-run wait is rendered
// by `RunningPane`, a DIFFERENT component, so `PayloadView` always mounts there holding its final number.
// (That mount shape does exist elsewhere — the schema editor's test preview — which is exactly why the
// story looked legitimate.) Those tests passed against a local `awaited` latch inside `PayloadView` that
// no run-pane render could reach; the live drive found the real surface printing exactly one value
// (`["0ms=8.7"]`, no ramp, ever).
// Driving the pane means the mount-with-value skip is INSIDE the test's arc: the run lands from the story's
// own "mutation", `arrived` is the surface's `landedRunIds` verdict, and neutering that thread reds these.

/** Record every distinct value the hero numeral prints from now on. Installed BEFORE the press, and it
 *  survives the node being created later (it observes the document, not the node). */
async function traceHeroValues(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    // @orb-waive no-test-fabrication(unknown): a page-scratch global, not a domain shape — the two evaluate calls need a shared handle and typeof globalThis has no slot for one. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    (globalThis as unknown as { __heroTrace: string[] }).__heroTrace = seen;
    const read = (): void => {
      const node = document.querySelector('[data-testid="refinery-hero-value"]');
      const text = node?.textContent ?? "";
      if (text.length > 0 && seen.at(-1) !== text) {
        seen.push(text);
      }
    };
    read();
    new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

function heroTrace(page: Page): Promise<string[]> {
  // @orb-waive no-test-fabrication(unknown): reads back the page-scratch global installed above — same reason. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return page.evaluate(() => (globalThis as unknown as { __heroTrace: string[] }).__heroTrace);
}

test("the money shot: a score landing into a pane that was WAITING counts up from 0 and settles EXACTLY on 7.5", async ({ mount, page }) => {
  // The REAL first-run arc, in the pane's own components: nothing settled → the running pane → the run
  // lands from the story's mutation. The gauge MOUNTS holding 7.5 — which is precisely why it needs the
  // surface's `arrived` verdict to know it should count, and why the deleted `awaited` latch never fired.
  await mount(<HeroRampStory to={7.5} />);
  await expect(page.getByText("Nothing settled for score yet")).toBeVisible();
  await page.getByRole("button", { name: "run" }).click();
  await expect(page.getByText("Running score…")).toBeVisible();
  // The gauge does not exist yet — a first run has no `PayloadView` on screen to have shown a skeleton.
  await expect(page.getByTestId("refinery-hero-value")).toHaveCount(0);
  await traceHeroValues(page);

  await page.getByRole("button", { name: "land" }).click();
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("7.5");

  const trace = await heroTrace(page);
  // The RAMP: values were painted between the start and the target, so this counted rather than snapped.
  expect(trace.map(Number).filter((n) => n > 0 && n < 7.5).length).toBeGreaterThan(0);
  // FRACTIONAL LANDING: the last frame is the target itself, never a quantized approximation of it — a
  // ramp that rounded to integers would settle this on "8" and silently change the reported score.
  expect(trace.at(-1)).toBe("7.5");
});

test("a RE-RUN retargets from the score on screen — it never snaps back to 0 (that would read as 'discarded')", async ({ mount, page }) => {
  // `from` is a run the session was merely OPENED on, so it is absent from the story's `landedRunIds` and
  // must not animate at mount — the other half of the arrival contract, pinned by the trace below.
  await mount(<HeroRampStory from={4} to={7.5} />);
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("4");
  await traceHeroValues(page);

  await page.getByRole("button", { name: "run" }).click();
  await page.getByRole("button", { name: "land" }).click();
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("7.5");

  const trace = await heroTrace(page);
  // Asserted as a FILTERED ARRAY, not a boolean: a `.every()` that fails prints `false` and tells you
  // nothing, while this prints the offending frames.
  expect(trace.filter((v) => Number(v) < 4)).toEqual([]);
  expect(trace.map(Number).filter((n) => n > 4 && n < 7.5).length).toBeGreaterThan(0);
});

test("REDUCED MOTION removes the ramp rather than shortening it — the figure is correct on the first frame", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<HeroRampStory to={7.5} />);
  await traceHeroValues(page);

  await page.getByRole("button", { name: "run" }).click();
  await page.getByRole("button", { name: "land" }).click();
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("7.5");

  // Every value the numeral ever printed is the answer. No intermediate state existed at all.
  expect(await heroTrace(page)).toEqual(["7.5"]);
});
