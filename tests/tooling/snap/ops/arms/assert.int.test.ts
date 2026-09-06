// THE ASSERTION ARM'S NO-MATCH REFUSAL (#1343). A `--expect-*` whose selector resolves to NOTHING has not
// tested its requirement — it failed to ASK it — and the two outcomes must not read the same way.
//
// THE DEFECT THIS PINS. Side-eye's cold-agent dogfood (2026-09-04) ran
// `--expect-no-overflow '[data-slot=composer]'` believing that slot did not exist, read `PASS`, and nearly
// published "composer overflow: PASS" as a receipt. On this tree that selector is REAL (measured live:
// `document.querySelectorAll("[data-slot=composer]").length === 1` on the mobile room), so that run was an
// honest measurement — but the class is one keystroke away and the instrument could not distinguish it: a
// mistyped selector printed `FAIL no rendered match` and exited 1, the SAME code as "this box overflows".
// "The requirement is violated" and "the requirement was never tested" are different facts, and only the
// second means the run is not a verdict about the app at all.
//
// THE CONTRACT: zero rendered matches for a requirement ABOUT a matched element (text / focus /
// no-overflow) prints `NO-MATCH` and exits 2 (the zero-hygiene law, _shared/exit-contract.ts +
// _shared/evidence.ts). `--expect-visible` and `--expect-count` are DELIBERATELY excluded — a zero
// population is the very answer those two exist to give — and `--include-hidden` widens the population it
// always did.
//
// @instrument-proof: every arm below runs the SAME selectors against a page that carries the element and
// one that does not, through the real CLI, so a refusal that fired unconditionally reds the control.
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);

/** `#real` is present, clipped and readable; `#hidden-only` is attached but not rendered. */
const FIXTURE = `<!doctype html><html data-app-ready="settled"><head><style>
  body { margin: 0; font: 16px system-ui; }
  #real { width: 120px; height: 40px; overflow: hidden; }
  #hidden-only { display: none; }
</style></head><body>
  <div id="real"><span>Continue</span></div>
  <div id="hidden-only">Continue</div>
</body></html>`;

const QUIET = ["--text", "--no-shot", "--no-failure-evidence"];

test("a --expect-* selector that matches NOTHING refuses (exit 2) while the same flags on a real element measure", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "page.html": FIXTURE });
  const file = ["--file", `${root}/page.html`];

  // THE PLANTED CONTROL: the same three requirements against an element that IS there. A refusal that
  // fired on every run would red here.
  const measured = await runCli("snap", [...file, ...QUIET, "--expect-text", "#real=Continue", "--expect-no-overflow", "#real"], {
    timeoutMs: BROWSER_TIMEOUT_MS,
  });
  expect(measured.stdout).not.toContain("NO-MATCH");
  expect(measured.stdout).toContain("ASSERT text #real: PASS");
  await expect(measured).toExitWith(EXIT.clean);

  // …and against a selector nothing renders, the run is NOT a verdict about the app.
  const refused = await runCli("snap", [...file, ...QUIET, "--expect-text", "[data-slot=nope]=Continue", "--expect-no-overflow", "[data-slot=nope]"], {
    timeoutMs: BROWSER_TIMEOUT_MS,
  });
  expect(refused.stdout).toContain("ASSERT text [data-slot=nope]: NO-MATCH");
  expect(refused.stdout).toContain("ASSERT no-overflow [data-slot=nope]: NO-MATCH");
  await expect(refused).toExitWith(EXIT.toolError);
});

test("absence stays the ANSWER for --expect-visible and --expect-count, and --include-hidden widens the population", {
  timeout: 2 * BROWSER_TIMEOUT_MS,
}, async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "page.html": FIXTURE });
  const file = ["--file", `${root}/page.html`];

  // A missing element is the FINDING `--expect-visible` exists to report, and `=0` over an empty
  // population is a satisfied comparison — exit 1 (a verdict), never exit 2 (a refusal).
  const population = await runCli("snap", [...file, ...QUIET, "--expect-visible", "#gone", "--expect-count", "#gone=0"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(population.stdout).toContain("ASSERT visible #gone: FAIL");
  expect(population.stdout).toContain("ASSERT count #gone: PASS");
  expect(population.stdout).not.toContain("NO-MATCH");
  await expect(population).toExitWith(EXIT.violations);

  // `display:none` is outside the RENDERED population (a refusal), inside the all-DOM one (a measurement
  // — and one that PASSES here, so the widening cannot be mistaken for the refusal changing shape).
  const rendered = await runCli("snap", [...file, ...QUIET, "--expect-text", "#hidden-only=Continue"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(rendered.stdout).toContain("ASSERT text #hidden-only: NO-MATCH");
  await expect(rendered).toExitWith(EXIT.toolError);

  const attached = await runCli("snap", [...file, ...QUIET, "--include-hidden", "--expect-text", "#hidden-only=Continue"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(attached.stdout).toContain("ASSERT text #hidden-only: PASS");
  await expect(attached).toExitWith(EXIT.clean);
});

/** A hidden duplicate FIRST in document order, then a visible match under the same selector — the shape a
 *  conditional wrapper, an exit-animating twin or a mobile/desktop pair produces on the real tree. */
const DUPLICATE_FIXTURE = `<!doctype html><html data-app-ready="settled"><head><style>
  body { margin: 0; font: 16px system-ui; }
  .twin[hidden] { display: none; }
</style></head><body>
  <div class="twin" hidden>Save</div>
  <div class="twin">Save</div>
</body></html>`;

// #1509: `--expect-visible` asked `locator.first().isVisible()`, so the HIDDEN twin — first in document
// order — answered for the whole population and the flag reported FAIL about an element the user can see.
// Every other assertion in this file already goes through `visibleLocators`; this one did not.
test("--expect-visible judges the whole population, not whichever match happens to be first", { timeout: 2 * BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "twins.html": DUPLICATE_FIXTURE });
  const file = ["--file", `${root}/twins.html`];

  const found = await runCli("snap", [...file, ...QUIET, "--expect-visible", ".twin"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(found.stdout).toContain("ASSERT visible .twin: PASS");
  await expect(found).toExitWith(EXIT.clean);

  // THE CONTROL: with every twin hidden the answer must still be FAIL, so the fix cannot be "always PASS
  // when something is attached".
  const allHidden = await runCli("snap", [...file, ...QUIET, "--expect-visible", ".twin[hidden]"], { timeoutMs: BROWSER_TIMEOUT_MS });
  expect(allHidden.stdout).toContain("ASSERT visible .twin[hidden]: FAIL");
  await expect(allHidden).toExitWith(EXIT.violations);
});
