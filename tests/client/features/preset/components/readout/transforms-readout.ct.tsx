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
import { routeTrpc, trpcError } from "../../../../../support/node/route-trpc.ts";
import { TransformsReadoutStory, TransformsReadoutSystemDefaultStory } from "./_readout-stories.tsx";

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

// A COUNT IS A CLAIM. "off" used to be printed whenever the attachment read produced no data — including
// when it FAILED — so the readout stated a fact it had not obtained. On the built-in default that failure is
// permanent (a null-owner preset; `ensurePresetOwned` refuses it by construction), which is the preset every
// new user has selected, so the confident wrong-mechanism answer was the one almost everyone saw.

test("the built-in default fires NO attachment query and says off as a KNOWN fact", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, NO_ATTACHED_SCRIPTS);
  const component = await mount(<TransformsReadoutSystemDefaultStory />);

  // BARRIER on the SETTLED arm first: `off` is reachable here ONLY through the not-attachable branch — an
  // in-flight read renders `…` and a failed one `couldn’t read` — so this row settling to `off` is proof the
  // component reached its final state, which is what makes the absence read below meaningful.
  const rows = page.locator("[data-pipeline-step^='regex:']");
  await expect(rows.first()).toContainText("off");
  await expect(component).not.toContainText("couldn’t read");
  // ONESHOT-OK: the settled-state barrier above has already rendered; a query, had one been enabled, would have been sent during that mount. The count is a read of finished state, not a sample mid-flight.
  expect(trpc.count("regex.listForPreset")).toBe(0);
});

test("a FAILED attachment read reads “couldn't read”, never “off”", async ({ mount, page }) => {
  // The REAL failure this arm exists for: `regex.listForPreset` answering NOT_FOUND (the shape the built-in
  // default produced by construction, and the shape any deleted/foreign preset produces).
  await routeTrpc(page, { "regex.listForPreset": trpcError({ code: "NOT_FOUND", message: "not found" }) });
  const component = await mount(<TransformsReadoutStory />);
  await expect(component).toContainText("Prompt-side");

  // Every regex stage says so; the non-regex steps still read their own config honestly.
  const rows = page.locator("[data-pipeline-step^='regex:']");
  await expect(rows.first()).toContainText("couldn’t read");
  await expect(rows.last()).toContainText("couldn’t read");
  await expect(component).toContainText("Single line");
});
