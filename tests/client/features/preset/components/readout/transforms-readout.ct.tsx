// CT: the TRANSFORMS readout prints the PIPELINE ORDER, and the order it prints is the DECLARED one.
//
// This surface's entire claim is "this is the order things run in", so a wrong row here is worse than no
// row: it is an instrument that lies. It used to be nine `<StepRow index={n}>` rows hand-numbered against
// an engine someone read once, and it had drifted into four untruths at the same time — `REASONING` before
// the post-process block (the engine runs it after), the three receive switches in exactly reverse order,
// and `collapseNewlines` on the reply lane at all (it is an ASSEMBLE transform the reply path never calls).
//
// So the pin is RENDERED and DERIVED: the row labels are read off the page in DOM order and compared to
// `PROMPT_LANE_STEPS`/`REPLY_LANE_STEPS` — the same tuples the server's post-process executors iterate. A
// reorder on either side breaks here. Nothing in this file spells a step's position.

import { PROMPT_LANE_STEPS, pipelineStepKey, REPLY_LANE_STEPS } from "@orb/contracts/preset";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../../support/ct/route-trpc.ts";
import { TransformsReadoutStory } from "./_readout-stories.tsx";

/** The readout resolves the preset's ATTACHED scripts; an empty set is enough (the pin is the ORDER, and
 *  every row renders regardless of its count — a stage with no scripts reads "off", never vanishes). */
const NO_ATTACHED_SCRIPTS = { "regex.listForPreset": [] };

test("the RENDERED rows are the DECLARED lanes, in order (prompt lane then reply lane)", async ({ mount, page }) => {
  await routeTrpc(page, NO_ATTACHED_SCRIPTS);
  const component = await mount(<TransformsReadoutStory />);
  await expect(component).toContainText("Prompt-side");

  const rendered = await page.locator("[data-pipeline-step]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-pipeline-step")));
  // Not "the same set" — the same SEQUENCE, which is the readout's entire claim.
  expect(rendered).toEqual([...PROMPT_LANE_STEPS, ...REPLY_LANE_STEPS].map(pipelineStepKey));
});

test("every row is numbered by its POSITION IN ITS LANE (never a hand-authored index)", async ({ mount, page }) => {
  await routeTrpc(page, NO_ATTACHED_SCRIPTS);
  await mount(<TransformsReadoutStory />);

  // The row's FIRST child is its ordinal (label and state follow) — read as an element, not by splitting the
  // row's text: the three spans render with no whitespace between them.
  const numbers = await page.locator("[data-pipeline-step]").evaluateAll((nodes) => nodes.map((node) => node.firstElementChild?.textContent?.trim() ?? ""));
  const expected = [...PROMPT_LANE_STEPS.map((_step, at) => String(at + 1)), ...REPLY_LANE_STEPS.map((_step, at) => String(at + 1))];
  expect(numbers).toEqual(expected);
});

test("the REPLY lane prints the model-output pass BEFORE the reasoning pass, and reasoning AFTER the switches", async ({ mount, page }) => {
  await routeTrpc(page, NO_ATTACHED_SCRIPTS);
  const component = await mount(<TransformsReadoutStory />);
  const body = (await component.textContent()) ?? "";

  const at = (needle: string): number => {
    const index = body.indexOf(needle);
    expect(index, `the readout never printed “${needle}”`).toBeGreaterThan(-1);
    return index;
  };
  // The four rewritten facts, as a reader meets them top to bottom.
  expect(at("Regex · model output")).toBeLessThan(at("Regex · reasoning channel"));
  expect(at("Single line")).toBeLessThan(at("Drop a dangling sentence"));
  expect(at("Drop a dangling sentence")).toBeLessThan(at("Trim trailing whitespace"));
  expect(at("Trim trailing whitespace")).toBeLessThan(at("Regex · reasoning channel"));
  expect(at("Regex · reasoning channel")).toBeLessThan(at("Regex · rendered transcript"));
});

test("Collapse blank lines is printed on the PROMPT lane only — it never runs on a reply", async ({ mount, page }) => {
  await routeTrpc(page, NO_ATTACHED_SCRIPTS);
  const component = await mount(<TransformsReadoutStory />);
  const body = (await component.textContent()) ?? "";

  // ONE occurrence, and it sits above the reply lane's heading.
  expect(body.split("Collapse blank lines").length - 1).toBe(1);
  expect(body.indexOf("Collapse blank lines")).toBeLessThan(body.indexOf("Reply-side"));
});
