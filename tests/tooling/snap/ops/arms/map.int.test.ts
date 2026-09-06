// --map's accessible-name derivation, driven through the real CLI against planted local mocks.
//
// #877 (instrument lie): the map printed the new-chat picker's primary button as
// "Pick a characterPick a characterto start" — it CONCATENATED both arms of a container-query two-arm
// label while Playwright's exact `toHaveAccessibleName` proved exactly one arm is in the a11y tree (the
// other is `display:none`). A map that manufactures a name no assertion can ever match is worse than no
// map: a reviewer filed a product finding on that reading (#852-1) and a second lane had to refute it.
//
// The fence is two-sided on purpose. Excluding non-rendered subtrees is only correct if a VISIBLE
// multi-span label still concatenates — over-exclusion would turn a real name into a shorter lie, which
// is the same defect class pointing the other way.
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);

// Each button carries exactly one non-rendered arm and one rendered arm, except `both-visible`, which is
// the negative control: two rendered spans, separated by source whitespace, must still read as one name.
const TWO_ARM_HTML = `<!doctype html><html data-app-ready="settled"><body>
<button id="display-none"><span style="display:none">Pick a character</span><span>Pick a character to start</span></button>
<button id="both-visible"><span>Save</span> <span>changes</span></button>
<button id="visibility-hidden"><span style="visibility:hidden">ghost arm</span><span>Delete room</span></button>
<button id="hidden-attribute"><span hidden>ghost arm</span><span>Archive room</span></button>
<button id="aria-hidden-arm"><span aria-hidden="true">DD</span><span>Diana</span></button>
</body></html>`;

test("--map computes the accessible name the a11y tree does: non-rendered arms contribute nothing", { timeout: BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "two-arm.html": TWO_ARM_HTML });
  const result = await runCli("snap", ["--file", `${root}/two-arm.html`, "--text", "--map", "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });

  await expect(result).toExitWith(EXIT.clean);
  // The lie itself: both arms welded together. Asserted as an ABSENCE of the concatenation, so the pin
  // survives any later change to how the map line is formatted.
  expect(result.stdout).not.toContain("Pick a characterPick a character to start");
  expect(result.stdout).toContain(`button  "Pick a character to start"`);
  expect(result.stdout).toContain(`button  "Delete room"`);
  expect(result.stdout).toContain(`button  "Archive room"`);
  // aria-hidden was already excluded before #877 — the fence keeps it that way (no "DDiana").
  expect(result.stdout).toContain(`button  "Diana"`);
  // The precision neighbour: two RENDERED spans are one name, whitespace-collapsed, not one arm.
  expect(result.stdout).toContain(`button  "Save changes"`);
});

// The map's `actionability` column is the promise "you can click this NOW". `stateOf` seeded `disabled`
// from the native property and then let ANY `aria-disabled` overwrite it, so a natively disabled control
// carrying `aria-disabled="false"` was published as `actionable` — a handle the browser refuses (#1509).
// aria-disabled is an ARIA-TREE claim; the native property is what the browser enforces, so native wins
// unless aria says true.
const DISABLED_HTML = `<!doctype html><html data-app-ready="settled"><body>
<button id="native-lies" disabled aria-disabled="false">Send anyway</button>
<button id="native-only" disabled>Send disabled</button>
<button id="aria-only" aria-disabled="true">Send aria-disabled</button>
<button id="live">Send live</button>
</body></html>`;

test("--map's actionability obeys the NATIVE disabled property when aria-disabled contradicts it", { timeout: BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "disabled.html": DISABLED_HTML });
  const result = await runCli("snap", ["--file", `${root}/disabled.html`, "--text", "--map", "--no-failure-evidence"], { timeoutMs: BROWSER_TIMEOUT_MS });

  await expect(result).toExitWith(EXIT.clean);
  // THE DEFECT: `disabled aria-disabled="false"` used to read `disabled=false actionability=actionable`.
  expect(result.stdout).toMatch(/"Send anyway".*disabled=true actionability=locator-only/u);
  // The three unambiguous neighbours, so the rule is a rule and not a special case.
  expect(result.stdout).toMatch(/"Send disabled".*disabled=true actionability=locator-only/u);
  expect(result.stdout).toMatch(/"Send aria-disabled".*disabled=true actionability=locator-only/u);
  expect(result.stdout).toMatch(/"Send live".*actionability=actionable/u);
});
