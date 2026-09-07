// CT: the preset editor's REGEX tab, and the one fact it must not disagree with the readout about.
//
// THE DEFECT (side-eye 2026-08-07 P2): on the BUILT-IN DEFAULT — the preset every new user has selected —
// this tab fired `regex.listForPreset` with no guard, spent ~9s on a skeleton, and printed "Couldn't load
// your regex scripts. / Retry". The Retry can NEVER work: the built-in's `ownerId` is null and
// `ensurePresetOwned` refuses it BY CONSTRUCTION (that refusal is correct and stays). Meanwhile the CONTEXT
// readout 400px to the right answered "off" for the same eight pipeline stages off the SAME `attachable`
// fact — one fact, two homes, two different answers.
//
// So the pins are: the un-attachable arm makes NO request and offers no retryable failure, and the
// attachable arm still reaches the real picker (a gate that swallowed the working case would be the worse
// bug).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { RegexTabAttachableStory, RegexTabSystemDefaultStory } from "./_regex-tab-stories.tsx";

/** The owner's script library — one row in the `RegexScriptRow` wire shape (`@orb/contracts/regex`), so the
 *  attachable arm has something real to paint.
 *  FABRICATION-OK: this CT stubs the NETWORK, so the fixture is deliberately the raw JSON wire object the
 *  browser parses, not a typed row built through a factory. */
const LIBRARY_SCRIPT = {
  id: "regex_script_000000000000000a",
  name: "Strip OOC",
  enabled: true,
  findRegex: "\\(\\(.*?\\)\\)",
  replaceString: "",
  placement: ["AI_OUTPUT"],
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  // A fixed edit stamp (X-16's `RegexScriptRow.updatedAt`) — the wall clock never reaches a fixture.
  updatedAt: 1_760_000_000_000,
  substituteRegex: 0,
};

const RE_CANT_HOLD = /The built-in default can't hold regex scripts/;
const RE_COULDNT_LOAD = /Couldn't load/;
/** The retired bare token (P2-2) — anchored at the start of a subtitle so it cannot match a word inside a
 *  script name or a pattern. */
const RE_BARE_OFF = /^off · /;

test("the BUILT-IN default asks for nothing and says WHY — never a failure with a Retry that can't work", async ({ mount, page }) => {
  // Both reads are stubbed to the REAL refusal shape. If the tab asked, it would get exactly this — and the
  // old code turned it into a retry affordance.
  const trpc = await routeTrpc(page, {
    "regex.listForPreset": trpcError({ code: "NOT_FOUND", message: "not found" }),
    "regex.listScripts": trpcError({ code: "NOT_FOUND", message: "not found" }),
  });

  const component = await mount(<RegexTabSystemDefaultStory />);

  // BARRIER on the SETTLED arm: this sentence is rendered synchronously by the branch, so its presence means
  // the tab has reached its final state — which is what makes the absence reads below meaningful.
  await expect(component.getByText(RE_CANT_HOLD)).toBeVisible();
  // The group keeps its name and its place in the Transforms lane.
  await expect(component.getByRole("heading", { name: "Regex" })).toBeVisible();
  // No failure surface, and above all no button promising a retry that is refused by construction.
  await expect(component.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(component.getByText(RE_COULDNT_LOAD)).toHaveCount(0);
  // ONESHOT-OK: the settled barrier has already painted; a query, had one been fired, would have gone out during that mount — a read of finished state.
  expect(trpc.count("regex.listForPreset")).toBe(0);
  // ONESHOT-OK: same settled barrier — the picker (which is what reads the library) is not mounted at all on this arm.
  expect(trpc.count("regex.listScripts")).toBe(0);
});

test("an OWNED preset still gets the real picker — the gate blocks the refused preset, not the working one", async ({ mount, page }) => {
  await routeTrpc(page, {
    "regex.listForPreset": () => [],
    "regex.listScripts": () => [LIBRARY_SCRIPT],
  });

  const component = await mount(<RegexTabAttachableStory />);

  await expect(component.getByRole("heading", { name: "Regex" })).toBeVisible();
  // The library row and its attach switch — the picker, not the explanation.
  await expect(component.getByRole("switch", { name: "Attach Strip OOC" })).toBeVisible();
  await expect(component.getByText(RE_CANT_HOLD)).toHaveCount(0);
});

// P2-2 (side-eye 2026-08-22): the row's own scent led with a bare `off ·` while the switch ~500px away was
// named `Attach <name>` and read ON — two state words, two different facts, neither labelled, and the fact
// that actually matters ("attached, but disabled in your library, so it will not run") was said nowhere. A
// user who flips the switch and sees nothing happen has no path to the cause. The pin is the NAMED state,
// asserted through what a user reads; `off` returning to that line is the collision coming back.
test("P2-2: an attached-but-disabled script names its own state instead of a bare `off`", async ({ mount, page }) => {
  const disabled = { ...LIBRARY_SCRIPT, enabled: false };
  await routeTrpc(page, {
    "regex.listForPreset": () => [disabled],
    "regex.listScripts": () => [disabled],
  });

  const component = await mount(<RegexTabAttachableStory />);

  // SETTLED barrier: the attached row's switch is ON, which is the state the finding is about.
  const attach = component.getByRole("switch", { name: "Attach Strip OOC" });
  await expect(attach).toBeVisible();
  await expect(attach).toBeChecked();

  await expect(component.getByText("Disabled in your library", { exact: true }).first()).toBeVisible();
  await expect(component.getByText(RE_BARE_OFF)).toHaveCount(0);
});
