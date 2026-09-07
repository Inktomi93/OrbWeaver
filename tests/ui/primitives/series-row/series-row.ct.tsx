// <SeriesRow> CT — the data-series line that carries the accessible datum a stacked bar deliberately does
// not. Proves: the label/value/detail text IS the datum (the swatch is aria-hidden decoration), the swatch
// rides the ramp token, and the row is legal phrasing content INSIDE an interactive parent (the drill-in
// trigger it exists to live in) — a hidden control there would be invalid a11y.
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { SeriesRow } from "@orb/ui/series-row";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";

/** The trigger's accessible name is composed from the row's spans — match the label within it. */
const NAMED_BY_LABEL = /System/;

test("the TEXT is the datum: label, detail and value all render as accessible text", async ({ mount }) => {
  const component = await mount(<SeriesRow color={2} detail="41 turns · 3 dropped" label="History" value="1,624" />);

  await expect(component.getByText("History")).toBeVisible();
  await expect(component.getByText("41 turns · 3 dropped")).toBeVisible();
  await expect(component.getByText("1,624")).toBeVisible();
});

test("the swatch is decoration — aria-hidden, tinted by its ramp step", async ({ mount }) => {
  const component = await mount(<SeriesRow color={4} label="Cards" value="1,208" />);
  const swatch = component.locator("[data-slot=series-row-swatch]");

  await expect(swatch).toHaveAttribute("aria-hidden", "true");
  // The ramp token is polarity-aware `light-dark()` now (#697); the dark-scheme CT paints the resolved dark arm.
  await expect(swatch).toHaveCSS("background-color", resolvedTokenColor("color.track-4"));
});

test("no color ⇒ no swatch (a row that isn't keyed to a bar segment)", async ({ mount }) => {
  const component = await mount(<SeriesRow label="Total" value="4,300" />);
  await expect(component.locator("[data-slot=series-row-swatch]")).toHaveCount(0);
  await expect(component.getByText("Total")).toBeVisible();
});

test("the row composes INSIDE a collapsible trigger: one button, named by the row's own text", async ({ mount }) => {
  const component = await mount(
    <Collapsible>
      <CollapsibleTrigger>
        <SeriesRow color={1} detail="main prompt" label="System" value="412" />
      </CollapsibleTrigger>
      <CollapsiblePanel>the assembled system text</CollapsiblePanel>
    </Collapsible>,
  );

  // The trigger is the ONLY interactive node (the row renders no control of its own — nesting one inside a
  // button is invalid), and the row's text is what names it.
  const trigger = component.getByRole("button");
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toHaveAccessibleName(NAMED_BY_LABEL);

  // …and the drill-in actually reveals the panel (the affordance is the caller's, and it works).
  await expect(component.getByText("the assembled system text")).toHaveCount(0);
  await trigger.click();
  await expect(component.getByText("the assembled system text")).toBeVisible();
});
