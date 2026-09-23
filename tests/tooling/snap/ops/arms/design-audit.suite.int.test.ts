// @instrument-proof: the folded design-audit ARM must still BITE. Every case below plants a real defect
// through the real `pnpm snap … --design-audit` door and requires the verdict; the twin cases prove the
// red is the plant and not the harness. Three of them are the census's own reproductions
// (2026-09-04 §2.1/§2.2/§2.3) — they were RED on
// `main@b767bedfc` before this fold and are the receipts #1324/#1325/#1326 close.
//
// @instrument-absence-proof: a walk that censused nothing, a reveal action that did not land, and a
// selector the emitted finding cannot be reopened by are each reported as an ABSENCE (exit 2, or a named
// SELECTOR row) rather than folded into "no findings — clean".
//
// The fixtures declare `data-app-ready` on <html> themselves so the readiness wait resolves instantly (a
// file page never runs the app; without the attribute every case burns the full ceiling), and carry a
// <main> landmark so the only P1-severity finding in play is the planted one.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(120_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const QUIET = ["--no-shot", "--no-deadcss", "--no-failure-evidence"];
/** The harness knob that makes the selector-proof cap's truncation REACHABLE (`snap/lib/budgets.ts`).
 *  Spelled once here, and once there — a literal in a third place is how a knob quietly stops working. */
const SELECTOR_PROOF_CAP_ENV = "ORB_SNAP_SELECTOR_PROOF_CAP";
const CENSUS_RE = /census=(\d+)/u;

/** Rows of the RESULT findings table for one rule — VERDICTS, anchored on the severity column. A bare
 *  `toContain(rule)` is not that assertion: the run also prints a POPULATION row naming every rule it
 *  judged, which satisfies every `toContain` and falsifies every `not.toContain`. */
function findingRows(stdout: string, rule: string): readonly string[] {
  const row = new RegExp(`^P[0-3]\\s+${rule}\\s`, "u");
  return stdout.split("\n").filter((line) => row.test(line));
}

function page(body: string, head = ""): string {
  return `<!doctype html>
<html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>t</title>${head}</head>
<body style="margin:0">${body}</body></html>`;
}

/** The `report <path>` line the arm prints — the artifact is where a collapsed finding's other instances
 *  live, and reading it is the point of filing one (#1342). */
function reportPath(stdout: string): string {
  const line = stdout.split("\n").find((entry) => entry.startsWith("report "));
  expect(line, `no report line in:\n${stdout}`).toBeTypeOf("string");
  return String(line).slice("report".length).trim();
}

async function plant(scratch: string, name: string, html: string): Promise<string> {
  const file = join(scratch, name);
  await writeFile(file, html);
  return file;
}

// ── the founding two-sided proof: the scan cannot be a green that cannot fail ─────────────────────────

const READING_SURFACE = '<p style="%STYLE%;font-size:16px;margin:24px">the reading surface under audit</p>';

test("a planted 1:1 contrast defect REDs the arm, and its white-on-black twin exits clean over a real census", async ({ runCli, scratch }) => {
  const bad = await plant(scratch, "bad.html", page(`<main>${READING_SURFACE.replace("%STYLE%", "background:#000;color:#000")}</main>`));
  const red = await runCli("snap", ["--file", bad, "--design-audit", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(red.stdout, "contrast")).not.toEqual([]);
  expect(red.stdout).toContain("design-audit=measured");
  await expect(red).toExitWith(EXIT.violations);

  const good = await plant(scratch, "good.html", page(`<main>${READING_SURFACE.replace("%STYLE%", "background:#000;color:#fff")}</main>`));
  const clean = await runCli("snap", ["--file", good, "--design-audit", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(clean.stdout, "contrast")).toEqual([]);
  expect(clean.stdout).toContain("p1=0");
  await expect(clean).toExitWith(EXIT.clean);
  // ZERO HYGIENE (#409): "no P1s" is a verdict only when the walk actually censused nodes AND every
  // detector family dispatched — a family that folded an empty list into silence is not a clean surface.
  expect(Number(CENSUS_RE.exec(clean.stdout)?.[1])).toBeGreaterThan(0);
  for (const family of ["a11y", "color", "decor", "media", "ornament", "quality", "structure", "typography"]) {
    expect(clean.stdout, family).toMatch(new RegExp(`scanned-${family}=[1-9]\\d*`, "u"));
  }
});

// ── #1325: snap's own --contrast was blind to a fixed painted layer; the arm never was ────────────────

/** The census's §2.1 control: a `position:fixed; z-index:-1` WHITE band under white text. No DOM ancestor
 *  of the text carries it, so an ancestor-only resolver composites against the black body and reports
 *  21:1 — measured on main at b767bedfc through `pnpm snap --contrast '#layer-text'`. */
const LAYER_FIXTURE = page(
  '<div style="position:fixed;inset:0 0 auto 0;height:120px;z-index:-1;background:#fff"></div>' +
    '<main><p id="layer-text" style="color:#fff;font-size:16px;margin:24px">white text over a fixed white band</p></main>',
  "<style>body{background:#000}</style>",
);

test("#1325 — a fixed contentless painted layer is seen by BOTH doors now: --contrast fails it and the arm files it", async ({ runCli, scratch }) => {
  const file = await plant(scratch, "layer.html", LAYER_FIXTURE);

  // The per-selector door. Before the fold this printed `21.00:1 PASS` — the resolver could not see a
  // layer that is not an ancestor, and said so in its own comment.
  const perSelector = await runCli("snap", ["--file", file, "--contrast", "#layer-text", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(perSelector.stdout).not.toContain("21.00:1");
  expect(perSelector.stdout).toMatch(/CONTRAST\s+#layer-text: 1\.0\d:1/u);
  await expect(perSelector).toExitWith(EXIT.violations);

  // The whole-surface door, over the same fixture: the same layer, the same verdict.
  const audited = await runCli("snap", ["--file", file, "--design-audit", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(audited.stdout, "contrast")).not.toEqual([]);
  await expect(audited).toExitWith(EXIT.violations);
});

// ── #1324: the accessible-name key was spec-INVERTED in both homes ────────────────────────────────────

/** The census's §2.2 control. Pair one shares `aria-label="Same label"` under DIFFERENT `aria-labelledby`
 *  targets; pair two carries different `aria-label`s under the SAME one. accname 1.2 puts 2B
 *  (labelledby) before 2C (aria-label), so the real names are Alpha/Beta — NOT duplicates — and
 *  Menu/Menu, which IS one. Each door sits in a differently-classed home so the per-datum path collapse
 *  (twelve "Open" buttons in one list are twelve chats, not twelve doors) does not apply. */
const ACCNAME_FIXTURE = page(
  '<main style="background:#000;color:#fff">' +
    '<div class="hero"><span id="alpha-label">Alpha action</span>' +
    '<button id="both-a" aria-label="Same label" aria-labelledby="alpha-label" style="width:48px;height:48px">A</button></div>' +
    '<div class="rail"><span id="beta-label">Beta action</span>' +
    '<button id="both-b" aria-label="Same label" aria-labelledby="beta-label" style="width:48px;height:48px">B</button></div>' +
    '<div class="topbar"><span id="menu-label">Menu</span>' +
    '<button id="dup-a" aria-label="Open menu" aria-labelledby="menu-label" style="width:48px;height:48px">O</button></div>' +
    '<div class="footer">' +
    '<button id="dup-b" aria-label="Close menu" aria-labelledby="menu-label" style="width:48px;height:48px">C</button></div>' +
    "</main>",
);

test("#1324 — the door census reads aria-labelledby BEFORE aria-label: Alpha/Beta are not duplicates, Menu/Menu is", async ({ runCli, scratch }) => {
  const file = await plant(scratch, "accname.html", ACCNAME_FIXTURE);
  const audited = await runCli("snap", ["--file", file, "--design-audit", "--fail-on", "P3", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  const doors = findingRows(audited.stdout, "duplicate-action-door");
  // Exactly ONE duplicate, and it is the pair whose labelledby actually names one thing.
  expect(doors).toHaveLength(1);
  expect(doors[0]).toContain("menu");
  // The FALSE positive is gone: the shared aria-label no longer decides the key.
  expect(doors[0]).not.toContain("same label");
  expect(audited.stdout).not.toContain('2x button "same label"');
  await expect(audited).toExitWith(EXIT.violations);

  // THE ORACLE, in the same invocation: Playwright's own accname engine agrees with the key above.
  // Nothing else in the fleet computes a spec-correct name, so a hand-rolled key must be checked
  // against it rather than against itself.
  const aria = await runCli("snap", ["--file", file, "--aria", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(aria.stdout).toContain('"Alpha action"');
  expect(aria.stdout).toContain('"Beta action"');
  expect(aria.stdout).not.toContain('"Same label"');
});

// ── #1326: an emitted finding selector nobody can reopen ──────────────────────────────────────────────

/** The census's §2.2(b) control: two identical seven-deep subtrees with no id/testid/slot, each ending in
 *  an undersized button whose ONLY distinguishing mark is its aria-label. `describe()` climbed six steps
 *  and emitted one path matching BOTH — measured `querySelectorAll(<that selector>).length === 2`. */
function twinSubtree(label: string): string {
  const button = `<button class="tiny" aria-label="${label}" style="width:18px;height:18px">t</button>`;
  return `<div><div><div><div><div><div>${button}</div></div></div></div></div></div>`;
}
const SELECTOR_FIXTURE = page(`<main style="background:#000;color:#fff">${twinSubtree("First tiny")}${twinSubtree("Second tiny")}</main>`);

test("#1326 — every emitted finding selector resolves to exactly one element, and the twin subtrees get distinct ones", async ({ runCli, scratch }) => {
  const file = await plant(scratch, "selector.html", SELECTOR_FIXTURE);
  const audited = await runCli("snap", ["--file", file, "--design-audit", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  const taps = findingRows(audited.stdout, "tap-target");
  expect(taps.length).toBeGreaterThan(0);
  // The Node-side proof, published on the machine line: the arm asked Playwright how many elements each
  // emitted selector matches. A `-1`/`>1` row would print a SELECTOR block naming it.
  expect(audited.stdout).toMatch(/selectors-proven=[1-9]\d*/u);
  expect(audited.stdout).toContain("selectors-ambiguous=0");
  // #1538: the proof cap's remainder is published on EVERY run, including the zero. Without the pair a
  // truncated proof list is indistinguishable from a complete one on the machine line.
  expect(audited.stdout).toContain("selectors-unproven=0");
  expect(audited.stdout).not.toContain("proof cap truncated the list");
  expect(audited.stdout).not.toContain("do NOT resolve to exactly one element");
  // The two twins are now told apart by the aria-label anchor rather than by an identical six-step path.
  // The SECOND one lives in `representatives` (both instances share one authored target-size decision, so
  // the rung-4 strategy collapses them into one row), and that is exactly why the proof above covers the
  // representative list too — reading only the printed row would have proved the easy half.
  const report = JSON.parse(await readFile(reportPath(audited.stdout), "utf8")) as {
    readonly findings: readonly { readonly rule: string; readonly selector: string; readonly representatives?: readonly string[] }[];
    readonly selectorProof: readonly { readonly selector: string; readonly matches: number }[];
    readonly selectorsUnproven: number;
  };
  expect(report.selectorsUnproven).toBe(0);
  const tap = report.findings.find((finding) => finding.rule === "tap-target");
  expect(tap?.representatives).toEqual(['[aria-label="First tiny"]', '[aria-label="Second tiny"]']);
  expect(report.selectorProof).toEqual([
    { selector: '[aria-label="First tiny"]', matches: 1 },
    { selector: '[aria-label="Second tiny"]', matches: 1 },
  ]);
});

// ── #1361 / the new border-contrast rule ──────────────────────────────────────────────────────────────

/** A field whose DECLARED boundary is invisible against what it sits on (#1361's live class, planted:
 *  `#2a2a2a` on `#232323` is ~1.1:1), beside a twin whose border clears 1.4.11's 3:1. */
const BORDER_FIXTURE = page(
  '<main style="background:#232323;color:#fff;padding:24px">' +
    '<label for="quiet">Quiet</label><input id="quiet" style="border:1px solid #2a2a2a;background:#232323;color:#fff;width:200px;height:32px">' +
    '<label for="loud">Loud</label><input id="loud" style="border:1px solid #cccccc;background:#232323;color:#fff;width:200px;height:32px">' +
    "</main>",
);

test("border-contrast — a declared boundary below WCAG 1.4.11's 3:1 is a P2, and the clearing twin is silent", async ({ runCli, scratch }) => {
  const file = await plant(scratch, "border.html", BORDER_FIXTURE);
  const audited = await runCli("snap", ["--file", file, "--design-audit", "--fail-on", "P2", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  const rows = findingRows(audited.stdout, "border-contrast");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain("#quiet");
  expect(rows[0]).not.toContain("#loud");
  // The DENOMINATOR: both fields were judged, neither withheld — silence on `#loud` is a measurement.
  expect(audited.stdout).toMatch(/POPULATION\s+border-contrast candidates=2 judged=2 affected=1/u);
  await expect(audited).toExitWith(EXIT.violations);
});

test("border-contrast — a control that declares NO border is excluded by name, never silently skipped", async ({ runCli, scratch }) => {
  const file = await plant(
    scratch,
    "borderless.html",
    page(
      '<main style="background:#232323;color:#fff;padding:24px"><input aria-label="Bare" style="border:none;background:#333;width:200px;height:32px"></main>',
    ),
  );
  const audited = await runCli("snap", ["--file", file, "--design-audit", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(audited.stdout, "border-contrast")).toEqual([]);
  expect(audited.stdout).toMatch(/POPULATION\s+border-contrast candidates=1 judged=0 .*excluded\(noDeclaredBorder=1\)/u);
});

// ── the refusals: an absence is never a clean surface ─────────────────────────────────────────────────

test("a reveal action that did not land is NO VERDICT, not a scan of the wrong surface", async ({ runCli, scratch }) => {
  const file = await plant(scratch, "reveal.html", page('<main style="background:#000;color:#fff"><p style="font-size:16px">present</p></main>'));
  const refused = await runCli("snap", ["--file", file, "--design-audit", "--click", "#no-such-control", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stdout).toContain("INSTRUMENT ERROR");
  expect(refused.stdout).toContain("design-audit=NO-VERDICT");
  // The tables must NOT print under a failed reveal: they would describe a surface nobody asked for.
  expect(refused.stdout).not.toContain("no findings — clean");
});

test("a page the app declares a FAILURE SURFACE is refused on sight, tables and all", async ({ runCli, scratch }) => {
  const file = await plant(
    scratch,
    "notfound.html",
    page('<main data-app-failure="not-found" style="background:#000;color:#fff"><p style="font-size:16px">there is nothing here</p></main>'),
  );
  const refused = await runCli("snap", ["--file", file, "--design-audit", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stdout).toContain("INSTRUMENT ERROR");
  expect(refused.stdout).not.toMatch(/^POPULATION/mu);
});

// ── #1538: the typed FACT names WHICH verdict channel, and the help text stops overclaiming ──────────

/** The design-audit arm's typed run fact, read out of the immutable index the run just wrote. */
async function auditFact(stdout: string): Promise<Record<string, unknown>> {
  const indexPath = /\bindex=(\/\S+\/run\.json)\b/u.exec(stdout)?.[1];
  expect(indexPath, `no run index in:\n${stdout}`).toBeTypeOf("string");
  const index = JSON.parse(await readFile(String(indexPath), "utf8")) as {
    readonly results?: { readonly batches: readonly { readonly arms: readonly { readonly arm: string; readonly data: Record<string, unknown> }[] }[] };
  };
  const fact = index.results?.batches.flatMap((batch) => batch.arms).find((arm) => arm.arm === "design-audit");
  if (fact === undefined) {
    throw new Error(`the run index carries no design-audit arm fact:\n${stdout}`);
  }
  return fact.data;
}

test("#1538 — the five verdict channels are INDEPENDENT: one withheld channel does not move the other four", async ({ runCli, scratch }) => {
  // A clean surface: every channel the walk reached is `complete`, so this is the all-complete baseline the
  // arm below is measured against.
  const clean = await plant(scratch, "channels.html", page('<main style="background:#000;color:#fff"><p style="font-size:16px">legible copy here</p></main>'));
  const baseline = await auditFact((await runCli("snap", ["--file", clean, "--design-audit", "--json", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS })).stdout);

  expect(baseline).toMatchObject({
    censusCapVerdict: "complete",
    populationVerdict: "complete",
    hoverVerdict: "complete",
    forceVerdict: "complete",
    instrumentPageErrorVerdict: "complete",
    unprovenSelectors: 0,
  });

  // …and a surface whose SELECTION IDIOM has no selected twin withholds `population` and NOTHING else.
  // TWO unselected rows sharing one authored claim + home and NO selected sibling: `census-selection.ts`
  // needs SELECT_COMPARISON_MIN_MEMBERS (2) in the group to get past `insufficientPopulation`, then finds
  // `group.selected.length === 0` and withholds `unmatchedUnselected` (#1114's structural no-verdict).
  // A ONE-row fixture does not reach it — it is EXCLUDED as insufficient, which is why the first draft of
  // this test came back all-`complete` and proved nothing.
  const partial = await plant(
    scratch,
    "withheld.html",
    page(
      '<main style="background:#000;color:#fff"><ul style="list-style:none;margin:0;padding:0">' +
        '<li><button data-slot="row" aria-selected="false" style="width:200px;height:44px">First row</button></li>' +
        '<li><button data-slot="row" aria-selected="false" style="width:200px;height:44px">Second row</button></li>' +
        "</ul></main>",
    ),
  );
  const run = await runCli("snap", ["--file", partial, "--design-audit", "--json", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  const withheld = await auditFact(run.stdout);

  // THE INDEPENDENCE CLAIM, both halves: ONE channel says no-verdict and the OTHER FOUR still say
  // complete. A shape assertion over the `complete|no-verdict` union cannot tell this fact from the
  // baseline above; these two lines can.
  expect(withheld["populationVerdict"]).toBe("no-verdict");
  expect(withheld).toMatchObject({
    censusCapVerdict: "complete",
    hoverVerdict: "complete",
    forceVerdict: "complete",
    instrumentPageErrorVerdict: "complete",
  });
  // …and the run says WHICH rule withheld, so the channel is attributable rather than merely non-clean.
  expect(run.stdout).toContain("selection-idiom: unmatchedUnselected=1");
  await expect(run).toExitWith(EXIT.toolError);
});

test("#1538 — a TRUNCATED selector proof publishes its remainder end-to-end, and never reads as a clean sweep", async ({ runCli, scratch }) => {
  // THE TRUNCATION, REACHED (#1566). The shipped cap is 64 distinct emitted selectors — roughly 13 firing
  // rules on a planted page, which is expensive to build and fragile against every future rule change. The
  // HARNESS knob lowers the cap for this one child process instead (`budgets.ts`), so the SAME code path
  // that truncates in production truncates here, on a fixture that emits more than one selector.
  const file = await plant(scratch, "unproven.html", SELECTOR_FIXTURE);
  const capped = await runCli("snap", ["--file", file, "--design-audit", "--json", ...QUIET], {
    timeoutMs: CLI_TIMEOUT_MS,
    env: { [SELECTOR_PROOF_CAP_ENV]: "1" },
  });

  // The RESULT pair, the SELECTOR line, and the machine-readable fact all carry it — a reader arriving at
  // any one of the three learns the list was cut, which is the whole defect: above the cap the remainder
  // used to read exactly like a clean sweep.
  expect(capped.stdout).toContain("selectors-proven=1");
  expect(capped.stdout).toContain("selectors-unproven=1");
  expect(capped.stdout).toContain("proof cap truncated the list");
  const report = JSON.parse(await readFile(reportPath(capped.stdout), "utf8")) as {
    readonly selectorsUnproven: number;
    readonly problems: readonly { readonly metric: string; readonly subject: string; readonly observed: string }[];
  };
  expect(report.selectorsUnproven).toBe(1);
  expect(report.problems).toContainEqual(
    expect.objectContaining({ metric: "finding-selector-uniqueness", subject: "selector-proof-cap", observed: "1 unproven" }),
  );
  expect(await auditFact(capped.stdout)).toMatchObject({ unprovenSelectors: 1 });

  // THE CONTROL, same fixture, shipped cap: nothing is truncated and no row appears. Without it the arm
  // above would pass on an instrument that always claims a truncation.
  const uncapped = await runCli("snap", ["--file", file, "--design-audit", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(uncapped.stdout).toContain("selectors-unproven=0");
  expect(uncapped.stdout).not.toContain("proof cap truncated the list");
});

test("#1538 — --design-audit's help states the selector proof's LIMIT instead of promising locatability", async ({ runCli }) => {
  const help = await runCli("snap", ["--help"], { timeoutMs: CLI_TIMEOUT_MS });

  // The old text promised "each with a locatable selector" while `/config` printed two unresolvable ones
  // and exited 0 (deliberately — #1326 keeps an instrument limit out of the app's verdict). The claim
  // moves, not the exit code.
  expect(help.stdout).not.toContain("each with a locatable selector");
  expect(help.stdout).toContain("selectors-ambiguous / selectors-unproven");
  expect(help.stdout).toContain("not the app's verdict, so it does not change the exit code");
});

test("the arm is OFF by default: an ordinary snap run neither walks nor claims a design verdict", async ({ runCli, scratch }) => {
  const file = await plant(scratch, "plain.html", page('<main style="background:#000;color:#000"><p style="font-size:16px">invisible</p></main>'));
  const plain = await runCli("snap", ["--file", file, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(plain).toExitWith(EXIT.clean);
  expect(plain.stdout).toContain("design-audit=off");
  expect(plain.stdout).not.toContain("census=");
});

// ── #1659: `--eval` IS the positive-control channel, because it now runs BEFORE the walk ─────────────
//
// The defect this pins, reported by a lane that spent four runs on it: three `--eval` plants (two
// `<style>` blocks and a real appended `<div>` whose `getBoundingClientRect` came back live) left the
// design-audit population counts BYTE-IDENTICAL to the unplanted run. The eval had run — it just ran
// AFTER the census. `ops/capture.ts` split TRAILING evals out of the drive queue and executed them inside
// the page-arm pass, one line below `runArms.afterSettle`, which is where the design-audit walk lives.
// The consequence was not cosmetic: the house rule "a bare zero owes a planted positive control in the
// same invocation" was UNSATISFIABLE for every design-audit rule through the one flag built for it, and
// worst for the RUNG-1 walker rules (`ui-audit/lib/collect.ts`), which publish no population row at all.
const EVAL_PLANT =
  "(() => { const p = document.createElement('p'); p.setAttribute('style', 'background:#000;color:#000;font-size:16px;margin:24px'); " +
  "p.textContent = 'the planted reading surface'; document.querySelector('main').append(p); " +
  "return { planted: true, paragraphs: document.querySelectorAll('p').length }; })()";

const EVAL_ONCE =
  "(() => { globalThis.__evalRuns = (globalThis.__evalRuns ?? 0) + 1; " +
  "return { runs: globalThis.__evalRuns, ready: document.documentElement.dataset.appReady }; })()";

test("#1659 — an --eval-planted defect ENTERS the design-audit census, and the same run without it does not", async ({ runCli, scratch }) => {
  // The page is clean on its own: white-on-black text over a real census. Nothing but the plant differs
  // between the two runs — same file, same argv, same flags.
  const file = await plant(
    scratch,
    "eval-control.html",
    page(`<main style="background:#000">${READING_SURFACE.replace("%STYLE%", "background:#000;color:#fff")}</main>`),
  );

  const planted = await runCli("snap", ["--file", file, "--design-audit", "--eval", EVAL_PLANT, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  // The eval itself ran and says so — the half that was ALREADY true before the fix, and which made the
  // silence so convincing.
  expect(planted.stdout).toContain('"planted": true');
  // …and THIS is the half that was missing: the walk saw it.
  expect(findingRows(planted.stdout, "contrast"), "the planted 1:1 paragraph must reach the census").not.toEqual([]);
  await expect(planted).toExitWith(EXIT.violations);

  // THE OTHER DIRECTION, in the same invocation family: without the plant the identical page is clean, so
  // the arm above cannot be satisfied by a detector that reds everything.
  const bare = await runCli("snap", ["--file", file, "--design-audit", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(bare.stdout, "contrast")).toEqual([]);
  expect(Number(CENSUS_RE.exec(bare.stdout)?.[1])).toBeGreaterThan(0);
  await expect(bare).toExitWith(EXIT.clean);
});

test("#1659 FENCE (green before the fix too) — a trailing --eval still settles, and still runs exactly ONCE", async ({ runCli, scratch }) => {
  // THIS ARM IS A REGRESSION FENCE, NOT A DEFECT PROOF, and says so because the distinction was worth a
  // verifier's time (v-V4): it passed against the PRE-fix `capture.ts` as well, since the old ordering
  // also ran a trailing `--eval` once and after settle. What it fences is the ordering change that landed
  // beside it: moving the evals ahead of the run-arm settle hook must not (a) cost the flag its own
  // guarantee — the expression still reads a SETTLED page, `data-app-ready` included — nor (b) double-run
  // them, which is exactly what handing the same list to the page-arm pass again would do. A second
  // execution prints `"runs": 2`; a pre-settle read prints a `ready` that is not `settled`.
  // The DEFECT proof for #1659 is the arm above (a planted element entering the census).
  const file = await plant(scratch, "eval-once.html", page('<main><p style="font-size:16px">settled</p></main>'));
  const run = await runCli("snap", ["--file", file, "--design-audit", "--eval", EVAL_ONCE, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(run).toExitWith(EXIT.clean);
  expect(run.stdout).toContain('"runs": 1');
  expect(run.stdout).toContain('"ready": "settled"');
});
