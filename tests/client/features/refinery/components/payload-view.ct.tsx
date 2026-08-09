// CT: the ONE payload renderer (schema-renderer §3) — the mock anatomy DERIVES from plan + hints alone
// (the blessed built-in look is the general renderer applied to a hinted schema, never a bespoke
// component), and a custom schema the build has never seen renders DESIGNED widgets — the raw-JSON
// floor does not exist. Values only fill; the schema decided every widget.

import { expect, test } from "@playwright/experimental-ct-react";
import { PayloadViewStory } from "../_ct-stories.tsx";

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
  await expect(banner).toHaveAttribute("data-tone", "warn");
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
