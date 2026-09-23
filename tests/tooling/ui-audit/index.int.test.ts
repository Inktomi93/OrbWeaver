// @instrument-proof: a planted black-on-black paragraph (a 1:1 contrast defect) driven through the REAL
// cli over a file:// base must exit 1 with a `contrast` finding; the white-on-black twin must exit 0 —
// the deterministic scan cannot be a green-that-cannot-fail, and a misuse typo must never scan at all.
//
// THE DOOR IS `pnpm snap <route> --design-audit` (#1315). This suite kept its home, its fixtures and every
// assertion it could — the walker, the rule engine and the printed blocks did not move, so the POPULATION
// rows, the findings table and the `census=`/`reached=` denominators are byte-identical. What changed is
// the ENVELOPE: `RESULT design-audit` is now `RESULT snap` carrying `design-audit=measured`, and the three
// stage-flag refusals moved to the parser that owns those flags (see the ISOLATED STAGE block below).
// The suite stays under `tests/tooling/ui-audit/` because the ENGINE it proves still lives there — the
// same reason `tests/tooling/motion-audit/` outlived the retired `pnpm motion-audit`.
//
// The fixtures declare `data-app-ready` on <html> themselves so the readiness wait resolves instantly
// (a file page never runs the app; without the attribute every case burns the full 10s ceiling), and
// carry a <main> landmark so the only P1-severity finding in play is the planted one.
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { vi } from "vitest";
import type { DesignAuditRuleId } from "../../../tooling/src/ui-audit/index.ts";
import { livingChromiumIdentities, watchChromiumDescendants } from "../../support/chromium-processes.ts";
import type { ToolFixtures } from "../../support/tool-fixtures.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(90_000);
// Every test here boots a real headless chromium, so the SPAWN cap (above) is the meaningful ceiling —
// vitest's 5s default was always the smaller of the two, and the census-stability window (#808, ~2s per
// run) made that mismatch bite: a two-run case timed out at 5001ms while its CLI was still healthy.
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });
/** The argv every case here adds: the arm, plus the three snap defaults this suite has no use for. The
 *  PIXELS are the point of an ordinary snap run and beside the point of an audit — a PNG per case would
 *  cost ~80 screenshots to prove nothing this file asserts. */
const AUDIT = ["--design-audit", "--no-shot", "--no-deadcss", "--no-failure-evidence"] as const;

/** The RESULT line's node-census total — the denominator every "clean" verdict here rests on (#409). */
const CENSUS_RE = /census=(\d+)/u;
/** The REACH denominator (#653) — how many OFFERED controls the viewport-bound families measured. */
const REACHED_RE = /reached=[1-9]/u;

/** Rows of the RESULT findings table for one rule — VERDICTS, anchored on the severity column.
 *  A bare `stdout.toContain("contrast")` is not that assertion: the run also prints a POPULATION
 *  accounting row per rule (`POPULATION   contrast candidates=1 judged=1 …`), which names the rule
 *  without filing anything. That line satisfied every `toContain` and falsified every `not.toContain`
 *  — a fires-proof that could not fail beside a silence-proof that could not pass. Anchoring on
 *  `P0..P3 <rule> ` keeps both halves reading the verdict, and the denominators stay assertable
 *  separately (they are evidence about the walk, not about the page). */
function findingRows(stdout: string, rule: string): readonly string[] {
  const row = new RegExp(`^P[0-3]\\s+${rule}\\s`, "u");
  return stdout.split("\n").filter((line) => row.test(line));
}

interface AuditRuleProof {
  readonly rule: DesignAuditRuleId;
  readonly kind: "fires" | "silent";
  readonly reason: string;
}

function auditRuleTest(
  proofs: readonly AuditRuleProof[],
  title: string,
  fn: (fixtures: Pick<ToolFixtures, "runCli" | "scratch">) => void | Promise<void>,
): void {
  test(title, ({ runCli, scratch }) => {
    expect(proofs.every((proof) => proof.reason.trim() !== "")).toBe(true);
    return fn({ runCli, scratch });
  });
}

/** The `report <path>` line the arm prints. The retired CLI took `--out <path>` and wrote the audit JSON
 *  exactly there; snap's `--out` names the SHOT base, and the arm files its report inside the run slot
 *  under its own producer arm so `--report … --problems` can read it without the source (#1342). One
 *  door, and it is the one an operator reads off the terminal too. */
function auditReport(stdout: string): string {
  const line = stdout.split("\n").find((entry) => entry.startsWith("report "));
  expect(line, `no report line in:\n${stdout}`).toBeTypeOf("string");
  return String(line).slice("report".length).trim();
}

function page(bodyStyle: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0"><main><p style="${bodyStyle};font-size:16px;margin:24px">the reading surface under audit</p></main></body></html>`;
}

test("a planted contrast defect REDs the audit through the real cli", async ({ runCli, scratch }) => {
  const file = join(scratch, "bad.html");
  await writeFile(file, page("background:#000;color:#000"));
  const res = await runCli("snap", ["--file", join(scratch, "bad.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(res.stdout, "contrast")).not.toEqual([]);
  await expect(res).toExitWith(1);
});

test("the passing twin exits clean — the red above is the plant, not the harness", async ({ runCli, scratch }) => {
  const file = join(scratch, "good.html");
  await writeFile(file, page("background:#000;color:#fff"));
  const res = await runCli("snap", ["--file", join(scratch, "good.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  // The twin proves the PLANTED CLASS is absent (no contrast finding, no P1) — a fixture page still
  // legitimately trips the P2 font census (its default face is off the token ramp, and #23 now says so
  // with the measurement), which the exit verdict correctly ignores at the default --fail-on P1.
  expect(findingRows(res.stdout, "contrast")).toEqual([]);
  expect(res.stdout).toContain("p1=0");
  await expect(res).toExitWith(0);
  // ZERO HYGIENE (#409): "no P1s" is only a verdict when the walk actually censused nodes.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
  for (const family of ["a11y", "color", "decor", "media", "ornament", "quality", "structure", "typography"]) {
    expect(res.stdout).toMatch(new RegExp(`scanned-${family}=[1-9]\\d*`, "u"));
  }
});

// ── #23: the font census judged the DECLARED stack and called it "rendered" ────────────────────────
// THE LIE, reproduced through the real CLI and a real browser. `getComputedStyle().fontFamily` is a
// cascade fact no font loading can move, so a page declaring the token stack reported CLEAN whether or
// not the face existed — and on this tree it never does: no @font-face registers Geist, the host has
// none installed, and `document.fonts` holds twenty KaTeX faces and nothing else. Every design-audit run
// laundered that into a silent font census. The first fixture is that page; before the paint probe it
// emitted ZERO findings. The second is the probe's live POSITIVE control: an installed face measures as
// present in the same run, so a probe silently stuck at all-false (which would blind the rule a third
// way) cannot produce this pair.
function declaredFacePage(family: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff;font-family:${family}"><main><p style="font-size:16px;margin:24px">the reading surface under audit</p></main></body></html>`;
}

auditRuleTest(
  [{ rule: "off-theme-font", kind: "fires", reason: "a token face this environment cannot paint emits, with the measurement" }],
  "a declared token face that does not exist here REDs the font census — the false clean is closed",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "unpaintable.html"), declaredFacePage("Geist, ui-sans-serif, system-ui, sans-serif"));
    const res = await runCli("snap", ["--file", join(scratch, "unpaintable.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    const rows = findingRows(res.stdout, "off-theme-font");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("geist");
    // P2 only — the census reports what paints; it does not decide the exit at --fail-on P1.
    await expect(res).toExitWith(0);
    // The denominator says the verdict was MEASURED, not skipped: one candidate, judged, nothing withheld.
    expect(res.stdout).toContain("POPULATION   off-theme-font candidates=1 judged=1 affected=1");
    // #1345 — every owned counter is still accounted for inline, but the rules with NOTHING to judge ride
    // one line that NAMES them instead of ~40 rows of zeros (~5 KB of a 9.5-17 KB report). Both
    // directions: the fold line exists and names rules, and no zero-candidate row survives beside it.
    expect(res.stdout).toMatch(/^POPULATION {3}nothing-to-judge=\d+ rule\(s\) with candidates=0: \S/mu);
    expect(res.stdout).not.toMatch(/^POPULATION {3}\S+ candidates=0 /mu);

    // The probe's live positive direction: a face that IS installed here is judged as painting, so the
    // absence above is a measurement rather than a probe that answers "absent" to everything.
    await writeFile(join(scratch, "installed.html"), declaredFacePage('"Liberation Serif", serif'));
    const present = await runCli("snap", ["--file", join(scratch, "installed.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    const presentRows = findingRows(present.stdout, "off-theme-font");
    expect(presentRows).toHaveLength(1);
    expect(presentRows[0]).toContain("paints");
    expect(present.stdout).not.toContain("faceProbeUnusable");
  },
);

// ── tap-target populations (#983): one authored decision, one actionable finding ───────────────────

const TARGET_SIZE_PX = 18;

function repeatedTapTargetsPage(homes: readonly { readonly slot: string; readonly count: number }[]): string {
  const groups = homes
    .map(({ slot, count }) => {
      const controls = Array.from(
        { length: count },
        (_unused, index) =>
          `<button data-slot="tracker-value-rest" aria-label="Reset ${String(index)}" style="width:${String(TARGET_SIZE_PX)}px;height:${String(TARGET_SIZE_PX)}px;padding:0">${String(index)}</button>`,
      ).join("");
      return `<section data-slot="${slot}" aria-label="${slot}">${controls}</section>`;
    })
    .join("");
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>tap populations</title></head>
<body style="margin:0;background:#000;color:#fff"><main>${groups}</main></body></html>`;
}

interface TapPopulationReport {
  readonly findings: readonly {
    readonly rule: string;
    readonly selector: string;
    readonly representatives?: readonly string[];
    readonly population?: { readonly affected: number; readonly judged: number; readonly capped: number };
  }[];
  readonly populationAccounting?: {
    readonly "tap-target"?: {
      readonly candidates: number;
      readonly judged: number;
      readonly affected: number;
      readonly populations: number;
      readonly emitted: number;
      readonly withheld: { readonly extentTruncated: number; readonly cap: number };
      readonly collapsed: { readonly sameOwner: number };
    };
  };
}

interface TypographyPopulationReport {
  readonly findings: readonly {
    readonly rule: string;
    readonly representatives?: readonly string[];
    readonly population?: { readonly affected: number; readonly judged: number; readonly capped: number };
  }[];
  readonly populationAccounting?: Readonly<
    Record<
      string,
      {
        readonly candidates: number;
        readonly judged: number;
        readonly affected: number;
        readonly populations: number;
        readonly emitted: number;
        readonly withheld: Readonly<Record<string, number>>;
      }
    >
  >;
}

auditRuleTest(
  [{ rule: "tap-target", kind: "fires", reason: "eleven sibling instances share one authored target and structural-home decision" }],
  "repeated sibling target instances collapse into one population finding with an honest capped denominator",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "tap-population.html"), repeatedTapTargetsPage([{ slot: "meter-row", count: 11 }]));
    const res = await runCli("snap", ["--file", join(scratch, "tap-population.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as TapPopulationReport;
    const findings = report.findings.filter((finding) => finding.rule === "tap-target");
    expect(findings, "one authored target-size decision must not print once per rendered instance").toHaveLength(1);
    expect(findings[0]?.population).toEqual({ affected: 11, judged: 11, capped: 6 });
    expect(findings[0]?.representatives).toHaveLength(5);
    expect(report.populationAccounting?.["tap-target"]).toMatchObject({
      candidates: 11,
      judged: 11,
      affected: 11,
      populations: 1,
      emitted: 5,
      withheld: { extentTruncated: 0, cap: 6 },
      collapsed: { sameOwner: 0 },
    });
    await expect(res).toExitWith(1);
  },
);

auditRuleTest(
  [
    { rule: "undersized-ui-text", kind: "fires", reason: "eight sibling text instances share one authored type-floor decision" },
    { rule: "undersized-ui-text", kind: "fires", reason: "the equally-small label under a different authored home remains a separate repair" },
  ],
  "undersized UI text groups repeated instances without erasing a distinct authored home",
  async ({ runCli, scratch }) => {
    const repeated = Array.from(
      { length: 8 },
      (_unused, index) =>
        `<button data-slot="style-option" style="display:block;width:160px;height:44px"><span data-slot="text" style="font-size:10.5px">Style ${String(index)}</span></button>`,
    ).join("");
    const distinct =
      '<button data-slot="collapsible-trigger" style="display:block;width:160px;height:44px"><span data-slot="text" style="font-size:10.5px">Advanced</span></button>';
    await writeFile(
      join(scratch, "type-floor-populations.html"),
      `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>type floor populations</title></head>
<body style="margin:0;background:#000;color:#fff;font-family:system-ui"><main>${repeated}${distinct}</main></body></html>`,
    );
    const result = await runCli("snap", ["--file", join(scratch, "type-floor-populations.html"), "--fail-on", "P2", ...AUDIT], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as TypographyPopulationReport;
    const findings = report.findings.filter(({ rule }) => rule === "undersized-ui-text");

    expect(findings).toHaveLength(2);
    expect(findings.map(({ population }) => population?.affected).sort()).toEqual([1, 8]);
    expect(findings.map(({ representatives }) => representatives?.length).sort()).toEqual([1, 5]);
    expect(report.populationAccounting?.["undersized-ui-text"]).toMatchObject({
      candidates: 9,
      judged: 9,
      affected: 9,
      populations: 2,
      emitted: 6,
      withheld: { cap: 3 },
    });
    await expect(result).toExitWith(1);
  },
);

auditRuleTest(
  [{ rule: "tap-target", kind: "fires", reason: "the same target primitive appears under two distinct authored structural homes" }],
  "two genuinely distinct target homes remain two findings while each home's siblings collapse",
  async ({ runCli, scratch }) => {
    await writeFile(
      join(scratch, "tap-homes.html"),
      repeatedTapTargetsPage([
        { slot: "card-header", count: 3 },
        { slot: "meter-row", count: 3 },
      ]),
    );
    const res = await runCli("snap", ["--file", join(scratch, "tap-homes.html"), ...AUDIT], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as TapPopulationReport;
    const findings = report.findings.filter((finding) => finding.rule === "tap-target");
    expect(findings, "grouping on data-slot=button alone would incorrectly merge these homes").toHaveLength(2);
    expect(findings.map((finding) => finding.population?.affected).sort()).toEqual([3, 3]);
    await expect(res).toExitWith(1);
  },
);

auditRuleTest(
  [
    {
      rule: "tap-target",
      kind: "fires",
      reason: "the historical RPG shape repeats one reset primitive across four distinct authored repair homes",
    },
  ],
  "RPG target populations collapse repeated card instances without merging header, meter, condition, and generic-button decisions",
  async ({ runCli, scratch }) => {
    const homes = ["card-header", "meter-row", "rpg-conditions"]
      .map(
        (slot) =>
          `<section data-slot="${slot}"><button data-slot="tracker-value-rest" style="width:18px;height:18px">r</button><button data-slot="tracker-value-rest" style="width:18px;height:18px">r</button></section>`,
      )
      .join("");
    await writeFile(
      join(scratch, "rpg-target-homes.html"),
      `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>rpg targets</title></head>
<body style="margin:0;background:#000;color:#fff"><main>${homes}
  <section data-slot="badge"><button data-slot="button" style="width:18px;height:18px">x</button><button data-slot="button" style="width:18px;height:18px">x</button></section>
</main></body></html>`,
    );
    const res = await runCli("snap", ["--file", join(scratch, "rpg-target-homes.html"), ...AUDIT], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as TapPopulationReport;
    const findings = report.findings.filter((finding) => finding.rule === "tap-target");
    expect(findings, "four authored decisions must remain distinguishable after instance collapse").toHaveLength(4);
    expect(findings.map((finding) => finding.population?.affected)).toEqual([2, 2, 2, 2]);
    await expect(res).toExitWith(1);
  },
);

auditRuleTest(
  [{ rule: "tap-target", kind: "fires", reason: "a separately-authored nested action remains independently actionable" }],
  "a nested failing target remains visible when the outer and inner authored decisions differ",
  async ({ runCli, scratch }) => {
    await writeFile(
      join(scratch, "nested-target.html"),
      `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>nested target</title></head>
<body style="margin:0;background:#000;color:#fff"><main>
  <div data-slot="menu-trigger" role="button" aria-label="Open menu" tabindex="0" style="display:inline-flex;width:18px;height:18px">
    <span data-slot="button" role="button" aria-label="Open menu icon" tabindex="0" style="display:block;width:10px;height:10px"></span>
  </div>
  <button style="width:44px;height:44px">healthy twin</button>
</main></body></html>`,
    );
    const res = await runCli("snap", ["--file", join(scratch, "nested-target.html"), ...AUDIT], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as TapPopulationReport;
    const findings = report.findings.filter((finding) => finding.rule === "tap-target");
    expect(findings, "DOM nesting alone cannot erase a separately-authored inner action").toHaveLength(2);
    expect(report.populationAccounting?.["tap-target"]?.collapsed.sameOwner).toBe(0);
    await expect(res).toExitWith(1);
  },
);

// ── control silhouette (#430, from side-eye #420) ────────────────────────────

// @instrument-proof: a planted near-square `role="switch"` (48x44 — the exact pre-#420 coarse geometry,
// aspect 1.091) driven through the REAL cli must exit 1 with a `control-aspect` finding at --fail-on P2;
// the shipped 64x44 twin (aspect 1.455) must not carry the class at all. Before this rule the detector
// was structurally blind to a control collapsing toward square, and a green audit read as a verdict.
function switchPage(trackWidthPx: number): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000"><main>
<span role="switch" aria-checked="true" aria-label="Color quoted speech" tabindex="0" style="display:inline-block;width:${trackWidthPx}px;height:44px;border-radius:9999px;background:#f77f20"></span>
<span role="switch" aria-checked="false" aria-label="Color quoted speech" tabindex="0" style="display:inline-block;width:64px;height:44px;border-radius:9999px;background:#444"></span>
</main></body></html>`;
}

test("a planted near-square role=switch REDs the audit through the real cli", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "crescent.html"), switchPage(48));
  const res = await runCli("snap", ["--file", join(scratch, "crescent.html"), "--fail-on", "P2", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("control-aspect");
  expect(res.stdout, "the finding must name the measured aspect, not just the rule").toContain("1.09");
  await expect(res).toExitWith(1);
});

test("the shipped 64x44 twin carries no control-aspect finding — the red above is the plant", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "pill.html"), switchPage(64));
  const res = await runCli("snap", ["--file", join(scratch, "pill.html"), "--fail-on", "P2", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(res.stdout, "control-aspect"), "the population row names the rule without filing anything — anchor on the verdict").toEqual([]);
  // The twin still legitimately trips the P2 font census (a bare fixture page's default face is off the
  // token ramp), so the exit code is not the discriminator here — the ABSENCE of the planted class is.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

// ── the nested-card card PREDICATE (#538, from the rail-corpus lane) ─────────

// @instrument-proof: the walker's card predicate is (shadow||border) && (radius||bg), and an AVATAR
// carries all four — so a rounded-rect avatar seat inside any bordered panel minted a `nested-card`
// finding. On the corpus surface 11 of 12 nested-card findings were `[data-slot=avatar-stack-item]`.
// An avatar is a MEDIA/identity token, never a decorative PANEL, which is the rule's only real target;
// the round default hid the class behind the pill test (radius >= half the short side) and only the
// sanctioned rounded-rect register (AvatarStack `shape="rounded"`) exposed it. Both directions are
// pinned: a real panel-in-panel must still RED, or the exclusion has eaten the rule.
function panelInPanel(inner: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><div style="border:1px solid #444;border-radius:12px;background:#111;padding:16px;width:400px">
<p style="font-size:16px">the panel that legitimately owns this region</p>
${inner}
</div></main></body></html>`;
}

const REAL_NESTED_PANEL =
  '<div style="border:1px solid #666;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">a second bordered panel inside the first</p></div>';
const AVATAR_SEAT =
  '<span data-slot="avatar-stack-item" role="img" aria-label="Ada Lovelace" style="display:inline-flex;width:48px;height:48px;border-radius:8px;background:#333;border:2px solid #555"></span>';

test("a real panel nested in a panel still REDs — the exclusion did not eat the rule", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "nested-panel.html"), panelInPanel(REAL_NESTED_PANEL));
  const res = await runCli("snap", ["--file", join(scratch, "nested-panel.html"), "--fail-on", "P3", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("nested-card");
  await expect(res).toExitWith(1);
});

test("a rounded-rect avatar seat inside a panel is NOT a nested card", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "avatar-seat.html"), panelInPanel(AVATAR_SEAT));
  const res = await runCli("snap", ["--file", join(scratch, "avatar-seat.html"), "--fail-on", "P3", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("nested-card");
  // ZERO HYGIENE: the absence is only a verdict when the walk censused nodes at all.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

// ── the nested-card NAME arm and the control-shell wrapper (#552) ───────────

// @instrument-proof: two FP classes that made `nested-card` fire on sanctioned shapes, each pinned in
// BOTH directions. (1) `hasBorder` OR'd in /\bcard\b/i over the JOINED class string, so the colour
// utility `text-card-foreground` — which the @orb/ui `Card nested` arm emits BESIDE `border-0` — read
// as a border and outranked a measured zero on all four sides (8 of 10 findings on the populated corpus
// surface). (2) `isInteractiveIsland` tested self + ancestors only, so a shell AROUND a control
// (`[data-slot=autocomplete-input-group]`) was structurally unreachable while the code comment claimed
// the case was covered. The red twins below are what keeps the fixes from eating the rule: a MEASURED
// border still REDs even when the class carries the card word, and a panel that merely happens to offer
// an action is still judged.
const CARD_WORD_BORDERLESS_PANEL =
  '<div class="text-card-foreground" style="border:0;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">the sanctioned nested arm: fill only, no border</p></div>';
const CARD_WORD_BORDERED_PANEL =
  '<div class="text-card-foreground" style="border:1px solid #666;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">a second bordered panel inside the first</p></div>';
const CONTROL_SHELL =
  '<div style="border:1px solid #666;border-radius:6px;background:#222;width:240px;height:32px"><input aria-label="Search your corpus" style="width:236px;height:28px;border:0;background:transparent;font-size:16px"></div>';
const PANEL_WITH_AN_ACTION =
  '<div style="border:1px solid #666;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">a decorative panel that also offers an action</p><button style="font-size:16px">Act on it</button></div>';

// Each case here spawns a REAL cli subprocess + browser walk (~900ms measured solo, #666) — vitest's
// 5000ms default testTimeout has no headroom left once a sibling lane's process contention slows the
// spawn, so this one hit 5077ms under load and flaked. Not reducible from the test (the walk is real
// work in the tool under audit); an explicit budget with headroom is the fix, not a blanket file raise
// that would also hide the NEXT test that creeps toward the default.
test("a borderless panel whose class merely contains the card WORD is not a nested card", { timeout: scaledBudget(20_000) }, async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "card-word.html"), panelInPanel(CARD_WORD_BORDERLESS_PANEL));
  const res = await runCli("snap", ["--file", join(scratch, "card-word.html"), "--fail-on", "P3", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("nested-card");
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

test("a MEASURED border still REDs when the class carries the card word — the name arm went, the box stayed", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "card-word-bordered.html"), panelInPanel(CARD_WORD_BORDERED_PANEL));
  const res = await runCli("snap", ["--file", join(scratch, "card-word-bordered.html"), "--fail-on", "P3", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("nested-card");
  await expect(res).toExitWith(1);
});

test("a shell whose only child is a control is not a nested card", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "control-shell.html"), panelInPanel(CONTROL_SHELL));
  const res = await runCli("snap", ["--file", join(scratch, "control-shell.html"), "--fail-on", "P3", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("nested-card");
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

test("a panel that merely CONTAINS a control is still judged — the wrapper arm stayed bounded", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "panel-with-action.html"), panelInPanel(PANEL_WITH_AN_ACTION));
  const res = await runCli("snap", ["--file", join(scratch, "panel-with-action.html"), "--fail-on", "P3", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("nested-card");
  await expect(res).toExitWith(1);
});

// ── the OUTER-card predicate: a pane divider is not a card (#559) ───────────

// @instrument-proof: `nested-card` asked the SAME question of both halves of the pair, so a shell pane —
// an <aside> whose only box evidence is ONE border side (the divider against its neighbour), radius 0, no
// shadow — satisfied the card predicate and became the OUTER card. Every real card placed inside any shell
// pane then had a "nesting" partner it never had visually: a divider line is not a container edge. Latent
// app-wide when filed (the #552 inner-arm fix hid it on the corpus surface); pinned here in BOTH directions
// — a SECOND border side is a box, so that pane goes back to being an outer card and the pair still REDs.
function shellPane(paneBoxStyle: string, inner: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><aside style="${paneBoxStyle};background:#111;padding:16px;width:400px">
<p style="font-size:16px">the shell pane's own region label</p>
${inner}
</aside></main></body></html>`;
}

const PANE_DIVIDER_BOX = "border-right:1px solid #444;border-radius:0";
const PANE_TWO_SIDED_BOX = "border-right:1px solid #444;border-left:1px solid #444;border-radius:0";
const CARD_IN_A_PANE =
  '<div style="border:1px solid #666;border-radius:8px;background:#222;padding:12px;width:240px;height:96px"><p style="font-size:16px">a real card living inside the pane</p></div>';

test("a one-side-border shell pane is NOT the outer card of a nesting pair", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "pane-divider.html"), shellPane(PANE_DIVIDER_BOX, CARD_IN_A_PANE));
  const res = await runCli("snap", ["--file", join(scratch, "pane-divider.html"), "--fail-on", "P3", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("nested-card");
  // ZERO HYGIENE: the absence is only a verdict when the walk censused nodes at all.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

test("the same pane with a SECOND border side is a box again — the pair still REDs", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "pane-two-sided.html"), shellPane(PANE_TWO_SIDED_BOX, CARD_IN_A_PANE));
  const res = await runCli("snap", ["--file", join(scratch, "pane-two-sided.html"), "--fail-on", "P3", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("nested-card");
  await expect(res).toExitWith(1);
});

test("an unknown flag is CLI misuse before any browser boots", async ({ runCli }) => {
  const res = await runCli("snap", ["--definitely-not-a-flag", ...AUDIT]);
  await expect(res).toExitWith(3);
});

// ── the ISOLATED STAGE mode (#678): a lane must be able to audit its OWN branch ─────────────────────────
//
// THE THREE ARGV REFUSALS MOVED WITH THE FLAGS (#1315). `--ref`/`--isolated`/`--dirty` are SNAP's — they
// always were (Core-Tooling-Law §2.4: one lifecycle owner) — and the folded scan rides them like every
// other arm instead of re-deriving the conflict table. Their pins are `tests/tooling/snap/ops/parse.test.ts`
// (an unresolvable ref, `--base` beside a stage flag, `--ref` beside `--dirty`), where they are asserted
// against the parser that actually owns them. What stays HERE is the half that is about the AUDIT: the
// operator has to be told, at the door, that a stage serves its own db.

test("the help states WHERE it audits, the stage flags, and the stage-db provenance limit", async ({ runCli }) => {
  // `--help`, not a typo: snap answers a bad flag with `ARG ERROR` + a pointer AT the help rather than
  // reprinting 200 lines of it, which is a deliberate difference from the retired CLI's misuse path.
  const res = await runCli("snap", ["--help"]);
  expect(res.stdout).toContain("--isolated");
  expect(res.stdout).toContain("--ref <sha|branch|tag>");
  // The limitation is INHERITED from snap's stage and must not be inherited SILENTLY: a stage's db is
  // whatever its dir holds (fresh sha = a dev-db copy, cached dir = its older state), so a corpus-dependent
  // finding — or its absence — is a claim about that db, not about the app.
  expect(res.stdout).toContain("STAGE DB:");
});

// @instrument-absence-proof: an APP ORIGIN whose app never mounted must be an INSTRUMENT ERROR, never a
// clean audit. This is the #678 receipt's own failure: on a cold isolated stage (vite still optimizing) the
// walk censused 14 nodes and printed `findings=0 … exit 0` over a planted 1:1 contrast defect the same
// command REDed on at census 332 one run later. Fourteen is not zero and one reachable control is not zero,
// so the census and reach gaps are structurally blind to it — the readiness signal is the discriminator, and
// it must NOT fire on the file:// fixtures the rest of this file drives (no app is expected there).
// A real http origin is required: the exemption is keyed on the scheme, so a file:// plant proves nothing.
function serveOnce(html: string, status = 200): Promise<{ readonly base: string; readonly close: () => void }> {
  const server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${addr.port}`,
        close: (): void => {
          server.close();
        },
      });
    });
  });
}

/** The SHELL a half-booted app leaves behind: real nodes, real text, one control — and no readiness flag. */
// The bridge stub is what makes this an APP ORIGIN rather than a static page: snap reads the app's own
// console ring through `__orb.consoleErrors()` and refuses a ready-claiming origin that publishes none.
// The READINESS flag is deliberately absent here — that is this fixture's whole plant.
const SHELL_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><p style="font-size:16px;margin:24px">loading the workspace</p>
<button style="height:48px;width:120px;font-size:16px">Retry</button></main><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},shell:()=>null}</script></body></html>`;

// This case deliberately BURNS the readiness wait (the app never announces itself), so it costs the full
// selector budget on top of the browser spawn — an explicit budget, not a blanket file raise.
test("an app origin whose app never mounted is an INSTRUMENT ERROR, never a clean audit", { timeout: scaledBudget(30_000) }, async ({ runCli }) => {
  const witness = watchChromiumDescendants(process.pid);
  const server = await serveOnce(SHELL_HTML);
  try {
    const res = await runCli("snap", ["/", "--base", server.base, ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("INSTRUMENT ERROR");
    expect(res.stdout, "the refusal must name the readiness SIGNAL — a different absence from the census").toContain("data-app-ready");
    await expect(res).toExitWith(2);
  } finally {
    server.close();
  }
  const observed = witness.stop();
  expect(observed.length).toBeGreaterThan(0);
  const survivors = livingChromiumIdentities(observed);
  expect(survivors).toEqual([]);
});

test("the SAME page over the SAME origin with the readiness flag audits normally — the fence is not a blanket refusal", async ({ runCli }) => {
  const server = await serveOnce(SHELL_HTML.replace("<html>", '<html data-app-ready="settled">'));
  try {
    const res = await runCli("snap", ["/", "--base", server.base, ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toContain("INSTRUMENT ERROR");
    expect(res.stdout).toContain("design-audit=measured");
    await expect(res).toExitWith(0);
  } finally {
    server.close();
  }
});

// ── #1081: an ERROR BOUNDARY IS NOT A SURFACE, and neither is a page that never loaded ───────────────
//
// @instrument-absence-proof: THE LIE, reproduced 2026-09-01 through the real CLI against the dev stack —
// the scan of `/__no-such-route__` printed all 48 POPULATION rows, filed `landmark-missing` P2
// against the router's not-found boundary and exited 0. Every arm above passes on that page: the route
// RESOLVED so `data-app-ready` went up, the census was 11 (not 0) and one control was reached. The
// discriminator is the app's own declare — `data-app-failure`, stamped by the not-found boundary and the
// crash fallback (packages/client/src/lib/app-failure-surface.tsx) — and the fixtures below carry exactly
// what the app renders: the declare, real text, and NO <main>, so the finding the old run filed is
// available to fire and is asserted absent.
const FAILURE_SURFACE_HTML = `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><div data-app-failure="not-found">
<h1 style="font-size:32px;margin:24px">not found</h1>
<p style="font-size:16px;margin:24px">that route doesn’t exist.</p></div></body></html>`;

test("a page declaring the app's not-found boundary is a NO VERDICT, never an audited surface", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "not-found.html"), FAILURE_SURFACE_HTML);
  const res = await runCli("snap", ["--file", join(scratch, "not-found.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout, "the refusal names the KIND the app declared, so a reader knows which non-surface this was").toContain("not-found");
  // The whole point: no verdict-shaped output at all. The old run printed every one of these over the
  // app's apology — the populations, the findings table, and the RESULT line that reads as a measurement.
  expect(res.stdout).not.toContain("POPULATION ");
  expect(res.stdout).not.toContain("design-audit=measured");
  expect(findingRows(res.stdout, "landmark-missing")).toEqual([]);
  await expect(res).toExitWith(2);
});

test("the SAME page without the declare audits normally — the fence is the app's statement, not a shape heuristic", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "declare-free.html"), FAILURE_SURFACE_HTML.replace(' data-app-failure="not-found"', ""));
  const res = await runCli("snap", ["--file", join(scratch, "declare-free.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("design-audit=measured");
  // The positive control for the assertion above: this identical markup DOES file the landmark finding.
  expect(findingRows(res.stdout, "landmark-missing")).not.toEqual([]);
});

// @instrument-absence-proof: a nav error collected NO samples (ops/drive.ts returns `samples: null`), so the
// report printed under it — census 0, an empty findings table, `population-verdict=complete` — described no
// observation at all. The HTTP failure is still stated; it is stated as a refusal.
test("an HTTP nav error is a NO VERDICT, not a violation with an empty report under it", async ({ runCli }) => {
  const server = await serveOnce("<!doctype html><html><body>gone</body></html>", 404);
  try {
    const res = await runCli("snap", ["/", "--base", server.base, ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("INSTRUMENT ERROR");
    expect(res.stdout, "the refusal states the HTTP fact — it is the finding for a human").toContain("HTTP 404");
    expect(res.stdout).not.toContain("POPULATION ");
    expect(res.stdout).not.toContain("design-audit=measured");
    await expect(res).toExitWith(2);
  } finally {
    server.close();
  }
});

// @instrument-absence-proof: an action that did not land means the walk censused whatever surface the chain
// stalled on. Its findings are true of a page nobody asked about, filed under the name of one nobody saw.
test("a reveal action that did not land is a NO VERDICT, not findings about the surface it stalled on", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "good.html"), page("background:#000;color:#fff"));
  const res = await runCli("snap", ["--file", join(scratch, "good.html"), "--click", "#no-such-control", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("STEP FAILED");
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout, "the refusal names the queue, not the census — a different absence").toContain("reveal queue");
  expect(res.stdout).not.toContain("POPULATION ");
  expect(res.stdout).not.toContain("design-audit=measured");
  await expect(res).toExitWith(2);
});

// A run with no stage still says so: `stage=live` is the honest label for "whatever --base served", and it
// is what makes a PASTED receipt self-describing — the ambiguity that made #674's fix lane hand its receipt
// duty back to the orchestrator.
test("the machine line publishes WHICH tree was audited", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "good.html"), page("background:#000;color:#fff"));
  const res = await runCli("snap", ["--file", join(scratch, "good.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("stage=live");
});

// ── ZERO HYGIENE (#409): an empty node census is absent evidence, never "no findings — clean" ──

// @instrument-absence-proof: an EMPTY node census (a blank mount / swallowed error boundary) must report
// INSTRUMENT ERROR naming the census, never "no findings — clean".
test("a page the walk censused NOTHING on is an INSTRUMENT ERROR, never a clean audit", async ({ runCli, scratch }) => {
  // The defect class this stands for: a blank mount / swallowed error boundary renders an empty shell,
  // every check family receives an empty list, and the audit reports "no findings — clean".
  const file = join(scratch, "empty.html");
  await writeFile(file, `<!doctype html>\n<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body><main></main></body></html>`);
  const res = await runCli("snap", ["--file", join(scratch, "empty.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("census");
  // THE REFUSAL SAYS WHY, ON THE PROCESS'S OWN OUTPUT (#25). It writes no report artifact, so a harness
  // that only reads `--out` sees an ENOENT and cannot tell a refusal from a crashed walk; stdout is the
  // one channel that distinguishes them, and a silent exit-2 here would be the defect, not the fence.
  expect(res.stdout, "a refusal that does not state its reason is indistinguishable from a crash").toContain("censused 0 nodes");
  await expect(res).toExitWith(2);
});

// @instrument-absence-proof: THE POLARITY ERROR INSIDE THE REFUSAL (#25). The relational families
// (cohort-anatomy, row-void, pane-ink, tier-drift, …) were absent from the census total, so a fixture
// built to exercise a RELATIONAL rule — geometry and CSS, no text, no image, no control — refused with
// "the walk censused 0 nodes" even though the walker saw and judged its elements. The workaround was a
// stray text node in every relational fixture, unrelated to the rule under test. A censused relational
// sample is a censused node: this run must reach a VERDICT, and the tier-drift finding proves the walk
// judged the very elements the census claimed not to see.
test("a relational-only fixture is judged, never refused as an empty census", async ({ runCli, scratch }) => {
  const body = `<style>
  [data-surface-tier="instrument"] { --orb-tier-island-pad: 8px; --orb-tier-island-radius: 4px; }
  [data-surface-tier] [data-slot="card-root"] { padding: var(--orb-tier-island-pad); border-radius: var(--orb-tier-island-radius); }
</style><div data-surface-tier="instrument"><div data-slot="card-root" style="padding:20px;width:100px;height:60px;background:#222"></div></div>`;
  await writeFile(
    join(scratch, "relational-only.html"),
    `<!doctype html>\n<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body style="margin:0;background:#000;color:#fff"><main>${body}</main></body></html>`,
  );
  const res = await runCli("snap", ["--file", join(scratch, "relational-only.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "the census families are not the judged families — a relational sample IS a census").not.toContain("censused 0 nodes");
  expect(Number(CENSUS_RE.exec(res.stdout)?.[1])).toBeGreaterThan(0);
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as { readonly findings: readonly { readonly rule: string }[] };
  expect(report.findings.filter(({ rule }) => rule === "tier-drift")).toHaveLength(1);
});

// ── --upload (#651) ──────────────────────────────────────────────────────────
// design-audit's census over the plugin install/consent screen was a FALSE CLEAN — taken against an
// EMPTY dropzone, so the surface a bundle actually populates was never rendered, let alone scanned.
// Pinned with the same shape: a fixture whose file-input `change` handler reveals a real contrast
// defect. UNUPLOADED, the route is clean (the false-clean shape). Through `--upload`, the SAME route
// REDs with a `contrast` finding — proof the walk now censuses the file-populated surface, not the pick
// screen. A boundary-refusal control (never a silent no-op) closes the loop.

// A hidden real <input type="file"> under a decorative wrapper — the same shape every FileDropzone in
// this app uses (packages/ui/src/primitives/file-dropzone/file-dropzone.tsx). `change` reveals a
// black-on-black paragraph: a defect that exists ONLY once a file has been attached.
const UPLOAD_PAGE = `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000">
<main>
  <p style="color:#fff;font-size:16px;margin:24px">Drop a plugin bundle</p>
  <div id="wrap"><input type="file" id="f" hidden /></div>
</main>
<script>
document.getElementById('f').addEventListener('change', () => {
  var p = document.createElement('p');
  p.style.cssText = 'background:#000;color:#000;font-size:16px;margin:24px';
  p.textContent = 'revealed only by an upload';
  document.body.appendChild(p);
});
</script>
</body></html>`;

test("--upload populates the surface design-audit censuses — clean unuploaded, REDs through the step", async ({ runCli, scratch }) => {
  const file = join(scratch, "upload.html");
  await writeFile(file, UPLOAD_PAGE);

  // Unuploaded: the exact false-clean shape #651 named — a real defect sits behind a file pick, and a
  // census that never populates the surface reports nothing wrong.
  const clean = await runCli("snap", ["--file", join(scratch, "upload.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(clean.stdout, "contrast")).toEqual([]);
  await expect(clean).toExitWith(0);

  // Through --upload: the SAME route now REDs on the SAME rule, because the walk censused the
  // file-populated DOM instead of the empty dropzone.
  const fixture = join(scratch, "fixture.txt");
  await writeFile(fixture, "hello upload");
  const uploaded = await runCli("snap", ["--file", join(scratch, "upload.html"), "--upload", `#wrap=${fixture}`, ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(uploaded.stdout, "contrast")).not.toEqual([]);
  await expect(uploaded).toExitWith(1);
});

// ── CENSUS REACH (#653): below the fold is not unreachable, and unreachable is not silence ──────────
// @instrument-proof + @instrument-absence-proof. The interactive census required viewport intersection,
// so every control merely scrolled out of sight fell out of tapTargets, actionDoors AND controlAspects
// at once — and the run printed the same thing a clean surface prints. Measured on the surface that
// named the row (the chat "This chat" tab at 430x932): NO document scroll at all, an inner scroller of
// clientHeight 515 over scrollHeight 2261, ~20 sized controls at top 1073..2374, none censused.
//
// Three arms, because the fix has to survive all three: the defect below the fold must FIRE, a control
// nothing can reach must be COUNTED rather than dropped, and a page where NOTHING is reachable must
// refuse out loud instead of printing "no findings — clean" over three empty lists.
// The bands above and below are SIBLINGS, and a second control shares the wrapper — both deliberate.
// `ownsPoint` credits a control with any point whose owner CONTAINS it, and `sharedCompositeOwns` credits
// a LONE control with its wrapper's whole extent (the walker's own declared limit), so a bare button
// floating in a padded wrapper measures 44 no matter how short it is: a fixture without these would be a
// fence that cannot fail. The live defect has the same shape — the bands around the rule row's disclosure
// are not owned by it, and the row carries other controls.
const REACH_CONTROLS =
  '<div style="height:40px;width:413px">Nudge the pacing</div>' +
  '<button style="display:block;height:16px;width:413px;padding:0;font-size:16px">Recent activity</button>' +
  '<div style="height:40px;width:413px">Runs on every message</div>' +
  '<button style="display:block;height:48px;width:120px;font-size:16px">Run now</button>';

/** A page whose controls live ~900px down an INNER scroller — no document scroll exists, exactly like
 *  the live surface. `after` rides outside the scroller for the unreachable arm. */
function innerScrollerPage(after: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main>
<div style="height:400px;width:460px;overflow:auto"><div style="height:1600px"><div style="padding-top:900px">${REACH_CONTROLS}</div></div></div>
${after}
</main></body></html>`;
}

/** Fixed past the right edge: no ancestor scroll can bring it in — unreachable, not un-scrolled-to.
 *  This is the 2026-08-16 phantom class (an off-canvas detail panel at x=431 on a 430px viewport). */
const OFF_CANVAS_CONTROL = '<button style="position:fixed;inset-inline-start:300vw;top:0;width:20px;height:20px;font-size:16px">p</button>';

test("a 413x16 control below the fold of an INNER scroller REDs — three rule families were blind to it", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "below-fold.html"), innerScrollerPage(""));
  const res = await runCli("snap", ["--file", join(scratch, "below-fold.html"), "--fail-on", "P2", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "16px is under the 24px fine-pointer floor — and it is 900px down an inner scroller").toMatch(/^P1\s+tap-target/mu);
  // The denominator is not optional: a reader of a reach-bearing run is entitled to both numbers.
  expect(res.stdout).toContain("skipped-offviewport=0");
  expect(res.stdout).toMatch(REACHED_RE);
  // The healthy 48x48 twin sits in the SAME below-fold wrapper and must stay silent — the reveal widened
  // the census, it did not lower the floor. `tap-target` appears exactly once, for the 16px control.
  expect(res.stdout.match(/^P1\s+tap-target/gmu) ?? [], `only the 16px control may fire:\n${res.stdout}`).toHaveLength(1);
  await expect(res).toExitWith(1);
});

test("an unreachable control is COUNTED and NAMED on the run — never silently dropped", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "off-canvas.html"), innerScrollerPage(OFF_CANVAS_CONTROL));
  const res = await runCli("snap", ["--file", join(scratch, "off-canvas.html"), "--fail-on", "P2", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "the human line must say what was skipped and why").toContain("SKIPPED");
  expect(res.stdout).toContain("skipped-offviewport=1");
  // The reachable defect in the same page still fires: counting the phantom did not mute the census.
  expect(res.stdout).toMatch(/^P1\s+tap-target/mu);
});

// @instrument-absence-proof: a page whose ONLY offered control is unreachable has three verdict families
// resting on empty lists while the text census stays fat — so `census=` looks healthy and the run reads
// clean. That is #653 one step past where a reveal sweep can rescue it, and it must refuse.
test("a page where NO offered control can be reached is an INSTRUMENT ERROR, never a clean audit", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "all-off-canvas.html"),
    `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><p style="font-size:16px;margin:24px">a surface with plenty of text and one unreachable control</p>
${OFF_CANVAS_CONTROL}
</main></body></html>`,
  );
  const res = await runCli("snap", ["--file", join(scratch, "all-off-canvas.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout, "the gap must name the reach, not the node census — they are different absences").toContain("viewport reach");
  await expect(res).toExitWith(2);
});

// ── TYPE-HIERARCHY INVERSION: an alert outweighed by what it bounds (#652) ──────────────────────────
// @instrument-proof. The fixtures below are the plugin consent screen's OWN markup at two commits, with
// the computed steps it really rendered — not a synthetic shape. BEFORE 68c5d57d2 the unrecognised-
// permissions sentence was `<Text role="alert" voice="gloss">` at 10.5px sitting in the same block as raw
// egress hostnames set in the un-voiced 15px default: the most safety-relevant sentence on the screen,
// rendered smaller than the machine strings it qualifies. AFTER, `prose` lifts the alert to 13px and the
// hostnames dropped to the 12px `datumMono` register — the guarantee now outweighs the endpoints.
//
// The rule anchors on the ALERT ROLE and nothing else, and that was a MEASURED choice: anchored instead on
// `data-voice="gloss"` (the issue's other candidate) it fired 21 times across 18 live surfaces, because a
// gloss caption under a heading or a stat figure is the ratified pattern, not an inversion. Re-measured
// with the alert anchor: ZERO findings across the same 18 surfaces. The pair below is what keeps that zero
// honest — a zero from a rule that cannot fire is not a result.
function consentBlock(alertFontPx: string, hostFontPx: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><div style="padding:24px">
  <div><span data-voice="label" style="font-size:13px">Reach the network</span></div>
  <p role="alert" data-voice="gloss" style="font-size:${alertFontPx};margin:8px 0">This plugin asks for 2 permissions this version of Orbweaver doesn't recognise. Update Orbweaver before installing it.</p>
  <div>
    <span data-voice="label" style="font-size:13px">Hosts it can reach (2/4)</span>
    <div><div><span data-voice="${hostFontPx === "15px" ? "" : "datumMono"}" style="font-size:${hostFontPx}">api.example.com</span></div><div><span style="font-size:${hostFontPx}">cdn.example.com</span></div></div>
  </div>
</div></main></body></html>`;
}

test("an alert sentence set smaller than the endpoints it bounds is a caveat-outweighed finding", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "consent-pre.html"), consentBlock("10.5px", "15px"));
  const res = await runCli("snap", ["--file", join(scratch, "consent-pre.html"), "--fail-on", "P2", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "a 10.5px alert beside 15px hostnames inverts the reading order of a security argument").toContain("caveat-outweighed");
  expect(res.stdout, "the finding must name the measured pair, or a reader cannot act on it").toContain("10.5px alert under a 15px sibling");
  await expect(res).toExitWith(1);
});

test("the shipped twin is silent — `prose` lifted the alert above the register it bounds", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "consent-post.html"), consentBlock("13px", "12px"));
  const res = await runCli("snap", ["--file", join(scratch, "consent-post.html"), "--fail-on", "P2", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(res.stdout, "caveat-outweighed"), "the alert now outweighs the endpoints — flagging it would indict the fix").toEqual([]);
  // The absence is only a verdict when the walk censused nodes at all.
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

// The false-positive fence, and the reason the gloss anchor was refused: the SAME size relationship in the
// ratified caption pattern — a quiet explanatory line under the heading or figure it explains — must stay
// silent. Without an alert role there is no authored claim that the small text bounds the large one.
test("a quiet caption under the figure it explains is NOT an inversion — the rule is not a caption detector", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "caption.html"),
    `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><div style="padding:24px">
  <span data-voice="label" style="font-size:13px">Tokens this week</span>
  <span data-slot="stat-figure-value" data-voice="datum" style="font-size:24px">128,400</span>
  <p data-voice="gloss" style="font-size:10.5px">Counted from the last completed turn of every room you host.</p>
</div></main></body></html>`,
  );
  const res = await runCli("snap", ["--file", join(scratch, "caption.html"), "--fail-on", "P2", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(
    findingRows(res.stdout, "caveat-outweighed"),
    "a caption under a stat figure is what a caption is for — this shape fired 21x app-wide under the gloss anchor",
  ).toEqual([]);
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

test("--upload refuses a path OUTSIDE the repo/scratchpad boundary — loudly, never a silent no-op", async ({ runCli, scratch }) => {
  const file = join(scratch, "upload.html");
  await writeFile(file, UPLOAD_PAGE);
  const res = await runCli("snap", ["--file", join(scratch, "upload.html"), "--upload", "#wrap=/etc/hostname", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("STEP FAILED");
  expect(res.stdout).toContain("boundary");
  // Exit 2, not 1, since #1081: a refused upload is an action that did not land, so the surface the walk
  // would have scanned is not the populated one this run names. The refusal is unchanged and still loud —
  // what changed is that it no longer prints findings and populations about the empty dropzone underneath.
  await expect(res).toExitWith(2);
});

// ── the THIN CENSUS: a FRACTION of the surface, printed as a verdict (#808) ─────────────────────────

// @instrument-absence-proof: MEASURED 2026-08-29 on Settings → Plugins at 1280x2200 —
// `census=22 reached=3 findings=2 nav=OK` printed as a clean-looking verdict; the identical next command
// censused 1421 and reached 126. Every zero-arm passed it through: the app HAD published data-app-ready
// (the flag is ONE-SHOT at boot, so a surface reached by an --actions click inherits the previous
// surface's settle), 22 is not 0, and 3 reached is not 0. The discriminator has to be the surface's own
// population, measured twice — which is what the fixture below reproduces without an app: a page that
// renders a shell, then fills itself AFTER the walk has already censused it.
function lateFillPage(fillDelayMs: number): string {
  const fill =
    fillDelayMs === 0
      ? "document.getElementById('late').innerHTML = ROWS;"
      : `setTimeout(() => { document.getElementById('late').innerHTML = ROWS; }, ${fillDelayMs});`;
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main>
<p style="font-size:16px;margin:24px">the shell that is up before the route's reads land</p>
<div id="late"></div>
</main>
<script>
const ROWS = Array.from({ length: 60 }, (_, i) => '<div style="padding:8px"><span style="font-size:16px">row ' + i + '</span></div>').join('');
${fill}
</script>
</body></html>`;
}

test("a page that fills after the ordinary wait is settled BEFORE the judged walk", async ({ runCli, scratch }) => {
  // 1500ms lands past the default 500ms operator wait — exactly like #976's real settings/theme reads.
  // The instrument's own evidence floor must include it before taking the one judged subject snapshot.
  await writeFile(join(scratch, "late-fill.html"), lateFillPage(1500));
  const res = await runCli("snap", ["--file", join(scratch, "late-fill.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(0);
  const walked = Number(/dom-walk=(\d+)/u.exec(res.stdout)?.[1]);
  const settled = Number(/dom-settled=(\d+)/u.exec(res.stdout)?.[1]);
  expect(walked, "the late rows must be in the judged snapshot, not merely observed afterward").toBeGreaterThan(60);
  expect(settled).toBe(walked);
});

test("the settled twin is a verdict — the refusal above is the plant, not a fence that reds every run", async ({ runCli, scratch }) => {
  // The identical page filled inline instead of on a timer: same final DOM, same census, no growth after
  // the walk. If this refused too, the arm would have deleted the instrument rather than fixed it.
  await writeFile(join(scratch, "settled-fill.html"), lateFillPage(0));
  const res = await runCli("snap", ["--file", join(scratch, "settled-fill.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(0);
  // …and the RESULT line publishes the stability denominator that verdict rests on.
  const walked = Number(/dom-walk=(\d+)/u.exec(res.stdout)?.[1]);
  const settled = Number(/dom-settled=(\d+)/u.exec(res.stdout)?.[1]);
  expect(walked, "a page whose fill already landed must be censused whole").toBeGreaterThan(60);
  expect(settled).toBe(walked);
});

function sameCountReplacementPage(replacing: boolean): string {
  const replacement = replacing
    ? `let generation = 0;
setInterval(() => {
  const old = document.getElementById('replace-me');
  const next = old.cloneNode(true);
  generation += 1;
  next.dataset.generation = String(generation);
  old.replaceWith(next);
}, 40);`
    : "";
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main>
<section id="replace-me"><p style="font-size:16px;margin:24px">one subject, repeatedly replaced</p></section>
</main><script>${replacement}</script></body></html>`;
}

// @instrument-absence-proof: count-only settling sees every reading as equal while the judged identities
// are replaced underneath it. The pre-#976 instrument therefore emitted a verdict. Revision + count must
// hold together; this plant never does and must fail at the bounded ceiling instead of reporting clean.
test("continuous same-count replacement is an INSTRUMENT ERROR, never count-stable evidence", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "same-count-replacement.html"), sameCountReplacementPage(true));
  const res = await runCli("snap", ["--file", join(scratch, "same-count-replacement.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("still moving at its ceiling");
  await expect(res).toExitWith(2);
});

test("the non-replacing twin is a verdict — the revision fence does not refuse a stable equal count", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "same-count-stable.html"), sameCountReplacementPage(false));
  const res = await runCli("snap", ["--file", join(scratch, "same-count-stable.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  expect(res.stdout).toContain("dom-mutations=0");
  await expect(res).toExitWith(0);
});

const CUSTOM_LIGHT_ID = "theme_01customlight000000000000";
const CUSTOM_DARK_ID = "theme_01customdark0000000000000";

function serveCustomThemeProof(): Promise<{ readonly base: string; readonly close: () => void; readonly mutations: () => number }> {
  let writes = 0;
  const library = [
    { id: CUSTOM_LIGHT_ID, name: "Custom Light", isSeed: false },
    { id: CUSTOM_DARK_ID, name: "Custom Dark", isSeed: false },
  ];
  const html = `<!doctype html>
<html style="color-scheme:dark"><head><meta charset="utf-8"><title>custom theme proof</title></head>
<body style="margin:0;background:#111;color:#fff;font-family:Geist,sans-serif"><div id="scope" data-slot="theme-scope"><main>
<p style="font-size:16px;margin:24px">the custom theme subject</p>
</main></div><script>
fetch('/api/trpc/settings.getUserSettings?batch=1&input=%7B%7D').then((response) => response.json()).then((body) => {
  const id = body[0].result.data.config.theme.selectedThemeId;
  const light = id === '${CUSTOM_LIGHT_ID}';
  const scope = document.getElementById('scope');
  scope.style.setProperty('--color-background', light ? '#f8f8f8' : '#111111');
  scope.style.setProperty('--color-foreground', light ? '#111111' : '#f8f8f8');
  scope.style.background = 'var(--color-background)';
  scope.style.color = 'var(--color-foreground)';
  scope.style.colorScheme = light ? 'light' : 'dark';
  document.documentElement.setAttribute('data-app-ready', 'settled');
});
</script><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},shell:()=>null}</script></body></html>`;
  const server = createServer((req, res) => {
    if (req.method !== "GET") {
      writes += 1;
      res.writeHead(405).end();
      return;
    }
    const url = req.url ?? "/";
    res.setHeader("content-type", url.startsWith("/api/trpc/") ? "application/json" : "text/html; charset=utf-8");
    if (url.startsWith("/api/trpc/settings.listThemes")) {
      res.end(JSON.stringify([{ result: { data: library } }]));
      return;
    }
    if (url.startsWith("/api/trpc/settings.getUserSettings")) {
      res.end(JSON.stringify([{ result: { data: { config: { theme: { selectedThemeId: CUSTOM_DARK_ID } } } } }]));
      return;
    }
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${address.port}`,
        close: (): void => {
          server.close();
        },
        mutations: () => writes,
      });
    });
  });
}

test("custom light and dark requests prove catalog source, inline carrier, and effective subject polarity", async ({ runCli }) => {
  const server = await serveCustomThemeProof();
  try {
    for (const [name, polarity] of [
      ["Custom Light", "light"],
      ["Custom Dark", "dark"],
    ] as const) {
      const res = await runCli("snap", ["/", "--base", server.base, "--theme", name, ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
      expect(res.stdout).not.toContain("INSTRUMENT ERROR");
      expect(res.stdout).toContain("theme-source=custom");
      expect(res.stdout).toContain("theme-root=default");
      expect(res.stdout).toMatch(new RegExp(`theme-${polarity}=[1-9]`, "u"));
      const artifact = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as {
        findings: Array<{ rule: string; selector: string; value: string }>;
        themeEvidence: {
          resolution: { source: string; name: string };
          rendered: { shellScope: { inlineBackground: string | null }; subjectPolarities: Record<string, number> };
        };
      };
      // The carrier's own claim, scoped past ONE finding that belongs to the fixture rather than to the
      // theme: this page declares the app's real `Geist, sans-serif` stack over `file://` with no CSS
      // bundle, so the token face measurably cannot paint and #23's font census says so — correctly, and
      // in every run of this fixture. It is named and asserted rather than filtered blind, so a SECOND
      // finding class can never hide behind the exclusion.
      const fontRows = artifact.findings.filter(({ rule }) => rule === "off-theme-font");
      expect(fontRows.map(({ value }) => value)).toEqual(["geist (token face, not paintable)"]);
      expect(
        artifact.findings.filter(({ rule }) => rule !== "off-theme-font"),
        `the custom ${polarity} carrier must not introduce audit findings`,
      ).toEqual([]);
      await expect(res).toExitWith(0);
      expect(artifact.themeEvidence.resolution).toMatchObject({ source: "custom", name });
      expect(artifact.themeEvidence.rendered.shellScope.inlineBackground).not.toBeNull();
      expect(artifact.themeEvidence.rendered.subjectPolarities[polarity]).toBeGreaterThan(0);
    }
    expect(server.mutations(), "the proof shim must remain read-only").toBe(0);
  } finally {
    server.close();
  }
});

// ── the two collision families a whole mobile review fell through (#816) ────────────────────────────

// @instrument-absence-proof: MEASURED 2026-08-29 on the saved-casts picker at `--mobile`
// (2026-08-29 §3 P1-1 / §9): `design-audit --mobile` censused
// 420 nodes, reached 21 controls and returned ZERO P0/P1/P2 over a cast NAME rendered at 0px with a 57px
// natural width, and a "2 rules" badge overlapping the Start button by 48px whose own centre hit-tests to
// that button. `snap --expect-no-overflow [role=dialog]` passed too — the collision is INSIDE the dialog.
// Only a screenshot plus hand geometry caught the class.
//
// The fixtures below reproduce both shapes with pure CSS, which is the point: neither needs an app, so
// the walker's blindness was never about this surface being hard to reach.

/** A row whose shrink-0 cluster eats the width: the label keeps `flex-1 min-w-0 overflow-hidden` and
 *  collapses to 0px while its content is still 50-ish px wide. `clusterPx` is the whole defect knob. */
function collapsedRowPage(clusterPx: number): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><div style="display:flex;align-items:center;width:220px;padding:12px">
  <div style="flex:1 1 0%;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:16px">Spire Trio</div>
  <div style="flex:0 0 auto;width:${clusterPx}px;height:24px;background:#333;font-size:16px">actions</div>
</div></main></body></html>`;
}

test("a label collapsed to 0px is a truncated-to-nothing finding — the text is in the DOM and off the screen", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "collapsed.html"), collapsedRowPage(220));
  const res = await runCli("snap", ["--file", join(scratch, "collapsed.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("truncated-to-nothing");
  expect(res.stdout, "the finding must carry the erased string, or a reader cannot tell WHAT vanished").toContain("Spire Trio");
  // THE BLIND SPOT, PINNED: text-overflow's block arm needs clientWidth > 0 and its inline arm needs a
  // painted rect, so the total collapse falls between them. If this ever starts firing, the two families
  // have merged and one of them is now double-reporting.
  expect(res.stdout, "text-overflow structurally cannot see a zero-width box — that is why this family exists").not.toContain("text-overflow");
  await expect(res).toExitWith(1);
});

auditRuleTest(
  [{ rule: "truncated-to-nothing", kind: "silent", reason: "the same row with a narrow neighbour keeps a visible label" }],
  "the same row with a narrow cluster keeps its label and mints nothing — the fence is the collapse, not the truncation",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "roomy.html"), collapsedRowPage(60));
    const res = await runCli("snap", ["--file", join(scratch, "roomy.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P1\s+truncated-to-nothing/mu);
    // The absence is only a verdict when the walk censused nodes at all.
    const census = CENSUS_RE.exec(res.stdout)?.[1];
    expect(Number(census)).toBeGreaterThan(0);
  },
);

// ── truncation is a defect only WITHOUT an affordance (#825) ────────────────────────────────────────

// @instrument-proof: the `text-overflow` rule fired on `scrollWidth > clientWidth` ALONE, so it minted a
// P1 against the topbar chat title — `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`,
// scrollWidth 201 / clientWidth 116 — i.e. against the house's own correct truncation idiom, and would
// have fired on every truncating label in the app (2026-08-30 §6
// retraction 6 / §9-I1). All three arms drive the REAL cli: the bare clip must still RED (a rule that
// only learns to shut up is a deleted rule), and each affordance must silence it.

/** One clipped label, 80px wide, holding ~200px of text. `affordance` is the whole knob. */
function truncatedLabelPage(affordance: "ellipsis" | "none" | "title"): string {
  const clip = "width:80px;overflow:hidden;white-space:nowrap;font-size:16px;margin:24px";
  const style = affordance === "ellipsis" ? `${clip};text-overflow:ellipsis` : clip;
  const title = affordance === "title" ? ` title="the reply that never came"` : "";
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main>
<div style="${style}"${title}>the reply that never came</div>
</main></body></html>`;
}

function healthyQualityNeighboursPage(): string {
  return `<!doctype html><html data-app-ready="settled"><head><meta charset="utf-8"><title>healthy quality neighbours</title></head>
  <body style="margin:0;background:#fff;color:#111"><main style="padding:24px">
    <img alt="healthy" width="32" height="32" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='black'/%3E%3C/svg%3E">
    <section style="border:1px solid #222;border-radius:8px;background:#fff"><span>Active state</span><strong>Active state</strong></section>
    <div style="width:320px;height:90px;overflow-x:auto"><div style="width:480px;padding:12px"><article style="width:180px;height:48px;border:1px solid #222;background:#fff">Inset card</article></div></div>
    <div style="overflow:hidden;padding:12px;width:220px"><button style="width:120px;height:32px">Healthy action</button></div>
  </main></body></html>`;
}

auditRuleTest(
  [
    { rule: "broken-image", kind: "silent", reason: "a loaded image with natural dimensions is a real healthy neighbour" },
    { rule: "repeated-container-text", kind: "silent", reason: "two repeated labels remain below the three-place defect floor" },
    { rule: "clipped-overflow", kind: "silent", reason: "a padded in-flow control remains inside its clipping box" },
    { rule: "edge-flush-cards", kind: "silent", reason: "a card with real inset gutters is not flush to its scroller" },
  ],
  "healthy quality candidates stay silent at their nearest legal boundaries",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "healthy-quality.html"), healthyQualityNeighboursPage());
    const res = await runCli("snap", ["--file", join(scratch, "healthy-quality.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    for (const rule of ["broken-image", "repeated-container-text", "clipped-overflow", "edge-flush-cards"]) {
      expect(res.stdout, `${rule} must stay silent on its real healthy candidate`).not.toContain(rule);
    }
  },
);

// ── #1826: the CHEAPEST SIX of the owed planted RENDERED positive controls ───────────────────
// `broken-image`/`repeated-container-text`/`edge-flush-cards` already carry the SILENT arm above
// (`healthyQualityNeighboursPage`); this fixture is their FIRES twin, past each rule's own defect
// threshold, driven through the same real CLI.
function defectiveQualityNeighboursPage(): string {
  return `<!doctype html><html data-app-ready="settled"><head><meta charset="utf-8"><title>defective quality neighbours</title></head>
  <body style="margin:0;background:#fff;color:#111"><main style="padding:24px">
    <img alt="broken" src="">
    <div style="border:1px solid #222;border-radius:8px;background:#fff">
      <span class="a">Loading…</span><span class="b">Loading…</span><span class="c">Loading…</span>
    </div>
    <div style="width:320px;height:90px;overflow-x:auto"><div style="width:480px"><article style="width:180px;height:48px;border:1px solid #222;background:#fff">Flush card</article></div></div>
  </main></body></html>`;
}

auditRuleTest(
  [
    { rule: "broken-image", kind: "fires", reason: "an <img> with an empty src is a real broken-image box" },
    {
      rule: "repeated-container-text",
      kind: "fires",
      reason: "the identical label at three distinct structural signatures inside one decorated container is the defect population",
    },
    { rule: "edge-flush-cards", kind: "fires", reason: "a card with no leading gutter sits flush against the scroller's own content edge" },
  ],
  "quality candidates past their own defect thresholds fire",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "defective-quality.html"), defectiveQualityNeighboursPage());
    const res = await runCli("snap", ["--file", join(scratch, "defective-quality.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(findingRows(res.stdout, "broken-image")).toHaveLength(1);
    expect(findingRows(res.stdout, "repeated-container-text")).toHaveLength(1);
    expect(findingRows(res.stdout, "edge-flush-cards")).toHaveLength(1);
  },
);

// `tabindex-positive`, `justified-text` and `all-caps-body` had NO rendered plant at all (checker-level
// only) — both directions land here, following the same fires/silent pairing idiom as the block above.
auditRuleTest(
  [{ rule: "tabindex-positive", kind: "fires", reason: "a positive tabindex overrides natural DOM order on a real visible control" }],
  "a positive tabindex fires",
  async ({ runCli, scratch }) => {
    const body = `<!doctype html><html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body><main><button tabindex="1">Positive</button></main></body></html>`;
    await writeFile(join(scratch, "tabindex-positive.html"), body);
    const res = await runCli("snap", ["--file", join(scratch, "tabindex-positive.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(findingRows(res.stdout, "tabindex-positive")).toHaveLength(1);
  },
);

auditRuleTest(
  [{ rule: "tabindex-positive", kind: "silent", reason: "tabindex=0 keeps natural DOM order and must not fire" }],
  "a zero tabindex stays silent",
  async ({ runCli, scratch }) => {
    const body = `<!doctype html><html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body><main><button tabindex="0">Zero</button></main></body></html>`;
    await writeFile(join(scratch, "tabindex-zero.html"), body);
    const res = await runCli("snap", ["--file", join(scratch, "tabindex-zero.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(findingRows(res.stdout, "tabindex-positive")).toHaveLength(0);
  },
);

auditRuleTest(
  [{ rule: "justified-text", kind: "fires", reason: "justified prose with no hyphenation creates rivers of white" }],
  "justified text without hyphens: auto fires",
  async ({ runCli, scratch }) => {
    const body = `<!doctype html><html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body><main>
      <p style="text-align:justify;width:300px">This paragraph is long enough to wrap across several lines so the justified alignment can visibly create rivers of white space between words.</p>
    </main></body></html>`;
    await writeFile(join(scratch, "justified-fires.html"), body);
    const res = await runCli("snap", ["--file", join(scratch, "justified-fires.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(findingRows(res.stdout, "justified-text")).toHaveLength(1);
  },
);

auditRuleTest(
  [{ rule: "justified-text", kind: "silent", reason: "the identical justified prose with hyphens: auto is the ratified exemption" }],
  "justified text WITH hyphens: auto stays silent",
  async ({ runCli, scratch }) => {
    const body = `<!doctype html><html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body><main>
      <p style="text-align:justify;hyphens:auto;width:300px">This paragraph is long enough to wrap across several lines so the justified alignment with hyphenation avoids rivers of white space between words.</p>
    </main></body></html>`;
    await writeFile(join(scratch, "justified-silent.html"), body);
    const res = await runCli("snap", ["--file", join(scratch, "justified-silent.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(findingRows(res.stdout, "justified-text")).toHaveLength(0);
  },
);

auditRuleTest(
  [{ rule: "all-caps-body", kind: "fires", reason: "a long non-heading uppercase passage past the 30-char floor kills word shapes" }],
  "a long uppercase paragraph fires",
  async ({ runCli, scratch }) => {
    const body = `<!doctype html><html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body><main>
      <p style="text-transform:uppercase">This sentence has more than thirty characters and is not a heading element.</p>
    </main></body></html>`;
    await writeFile(join(scratch, "all-caps-fires.html"), body);
    const res = await runCli("snap", ["--file", join(scratch, "all-caps-fires.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(findingRows(res.stdout, "all-caps-body")).toHaveLength(1);
  },
);

auditRuleTest(
  [{ rule: "all-caps-body", kind: "silent", reason: "a short uppercase label is under the 30-char floor — the micro-caps voice this rule must not convict" }],
  "a short uppercase label stays silent",
  async ({ runCli, scratch }) => {
    const body = `<!doctype html><html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head><body><main>
      <p style="text-transform:uppercase">Short caps label</p>
    </main></body></html>`;
    await writeFile(join(scratch, "all-caps-silent.html"), body);
    const res = await runCli("snap", ["--file", join(scratch, "all-caps-silent.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(findingRows(res.stdout, "all-caps-body")).toHaveLength(0);
  },
);

test("a clipped label with NO ellipsis and no full-value affordance is still a text-overflow finding", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "bare-clip.html"), truncatedLabelPage("none"));
  const res = await runCli("snap", ["--file", join(scratch, "bare-clip.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("text-overflow");
  expect(res.stdout, "the finding must carry the measured spill, or it cannot be acted on").toMatch(/\d+px spill/u);
  await expect(res).toExitWith(1);
});

auditRuleTest(
  [{ rule: "text-overflow", kind: "silent", reason: "the same clipped label paints an ellipsis affordance" }],
  "the SAME label truncated with an ellipsis mints nothing — the shipped idiom is not a defect",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "ellipsis.html"), truncatedLabelPage("ellipsis"));
    const res = await runCli("snap", ["--file", join(scratch, "ellipsis.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout, "text-overflow:ellipsis is the affordance the rule's own message asks for").not.toContain("text-overflow");
    expect(res.stdout).toContain("p1=0");
    // ZERO HYGIENE (#409): the silence is only a verdict when the walk censused nodes at all.
    expect(Number(CENSUS_RE.exec(res.stdout)?.[1])).toBeGreaterThan(0);
  },
);

test("a bare clip carrying the full value in a title mints nothing either — the value is one hover away", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "titled.html"), truncatedLabelPage("title"));
  const res = await runCli("snap", ["--file", join(scratch, "titled.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).not.toContain("text-overflow");
  expect(Number(CENSUS_RE.exec(res.stdout)?.[1])).toBeGreaterThan(0);
});

/** A badge and a button sharing a row. `buttonLeftPx` decides whether the button sits ON the badge (the
 *  measured defect: press the badge, activate the button) or beside it. */
function overlapRowPage(buttonLeftPx: number): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main><div style="position:relative;width:320px;height:60px;margin:16px">
  <span style="position:absolute;left:40px;top:16px;width:80px;height:28px;background:#333;font-size:14px">2 rules</span>
  <button style="position:absolute;left:${buttonLeftPx}px;top:16px;width:140px;height:28px;font-size:14px">Start a chat</button>
</div></main></body></html>`;
}

test("a badge whose own centre hit-tests to the button on top of it is an obscured-target finding", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "collide.html"), overlapRowPage(70));
  const res = await runCli("snap", ["--file", join(scratch, "collide.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("obscured-target");
  expect(res.stdout, "the finding must name what the press ACTUALLY lands on").toContain("button");
  expect(res.stdout, "and the size of the collision, or it cannot be acted on").toMatch(/\d+px overlap/u);
  await expect(res).toExitWith(1);
});

auditRuleTest(
  [{ rule: "obscured-target", kind: "silent", reason: "the same badge and button side by side own their own centres" }],
  "the same pair side by side mints nothing — the rule is the hit test, not the row",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "beside.html"), overlapRowPage(160));
    const res = await runCli("snap", ["--file", join(scratch, "beside.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P[01]\s+obscured-target/mu);
    const census = CENSUS_RE.exec(res.stdout)?.[1];
    expect(Number(census)).toBeGreaterThan(0);
  },
);

// The FALSE-POSITIVE fence that decides whether this rule can live on a real app: deliberate stacking.
// An open dialog covers the page it sits over, and every covered element loses its own centre to the
// dialog — geometry alone would mint a finding per covered node. The walker requires the winner to be a
// LOCAL neighbour (a shared ancestor within a few levels), so a page-level overlay is never a collision.
test("a modal covering the page is NOT an obscured-target — deliberate stacking is not a collision", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "overlay.html"),
    `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff"><main>
  <section style="padding:24px"><p style="font-size:16px">the page underneath, fully covered</p><button style="font-size:14px;width:120px;height:32px">a covered button</button></section>
  <div role="dialog" style="position:fixed;inset:0;background:#111"><p style="font-size:16px;padding:24px">the dialog on top</p></div>
</main></body></html>`,
  );
  const res = await runCli("snap", ["--file", join(scratch, "overlay.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(res.stdout, "every covered node would be a finding if geometry decided this").not.toMatch(/^P[01]\s+obscured-target/mu);
  const census = CENSUS_RE.exec(res.stdout)?.[1];
  expect(Number(census)).toBeGreaterThan(0);
});

// ── cohort-anatomy (#978): the RELATIONAL lens ───────────────────────────────────────────────────────
// Every other family judges one element against a threshold; this one judges a POPULATION against
// itself. 16px is not wrong — 16px beside a 32px twin built from the same component is. The fixture
// mirrors the live config list that produced the surface's only P0, where three instruments had to
// agree independently because no single rule could say "these siblings disagree".
function cohortListPage(oddHeightPx: number): string {
  const rows = ["Appearance", "Backup", "Chat behavior", "Jobs", "Tags", "Regex scripts", "World Info"];
  const cells = rows
    .map((label, index) => {
      const height = index < 4 ? 32 : oddHeightPx;
      return `<li data-slot="config-band" style="display:flex;align-items:center;height:${height}px;padding:0 12px;background:#1a1a1a;margin-bottom:2px">${label}</li>`;
    })
    .join("\n  ");
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui"><main><ul style="list-style:none;margin:0;padding:16px">
  ${cells}
</ul></main></body></html>`;
}

auditRuleTest(
  [{ rule: "cohort-anatomy", kind: "fires", reason: "three of seven same-slot siblings render at half the cohort's mode height" }],
  "same-slot siblings that disagree on height are ONE finding carrying the population, not one per short row",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "diverge.html"), cohortListPage(16));
    const res = await runCli("snap", ["--file", join(scratch, "diverge.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toMatch(/^P2\s+cohort-anatomy/mu);
    // The population IS the finding: a bare min/max cannot say which side is the defect, and an
    // operator fixing "16px" needs to know 3 rows are wrong and 4 are right.
    expect(res.stdout, "the value must name the outlier count, the mode, and both heights").toContain("3 of 7 at 16px, 4 at 32px");
    // ONE finding for the whole cohort. Like tap-target's authored-decision populations, this must not
    // emit one row per rendered instance; that would recreate the noise the relational rule replaces.
    expect(res.stdout.match(/^P2\s+cohort-anatomy/gmu) ?? [], "one cohort is one finding").toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "cohort-anatomy",
      kind: "silent",
      reason: "the same list at a uniform height is the precision neighbour — the fence is the DISAGREEMENT, not the row count",
    },
  ],
  "a uniform cohort mints nothing — and the silence is a judged zero, not a blind one",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "uniform.html"), cohortListPage(32));
    const res = await runCli("snap", ["--file", join(scratch, "uniform.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+cohort-anatomy/mu);
    expect(res.stdout, "the uniform cohort itself must have reached the detector").toContain(
      "POPULATION   cohort-anatomy candidates=1 judged=1 affected=0 populations=0 representatives=0",
    );
  },
);

// A cohort just below BOTH thresholds stays silent: 24px against a 32px mode is 1.33x / 8px — inside the
// ratio band, so the pair still reads as one family and the rule must not fire on ordinary variation.
auditRuleTest(
  [{ rule: "cohort-anatomy", kind: "silent", reason: "a 24px-vs-32px spread is inside the ratio band — ordinary variation, not two anatomies" }],
  "a spread inside the ratio band is ordinary variation and mints nothing",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "narrow.html"), cohortListPage(24));
    const res = await runCli("snap", ["--file", join(scratch, "narrow.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+cohort-anatomy/mu);
  },
);

// ── row-void (#978): the label and its control, with an ocean between ────────────────────────────────
// "Every setting row is two lonely islands with an ocean between them." Both islands measure fine on
// their own; the defect is the distance. Live on config:appearance this reports 712px of 829px (86%)
// between "Your themes" and its control.
function voidRowPage(rowWidthPx: number, spread: "between" | "gap"): string {
  const justify = spread === "between" ? "justify-content:space-between" : "gap:16px";
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui"><main>
<div style="display:flex;align-items:center;${justify};width:${rowWidthPx}px;height:32px;padding:0 12px">
  <label id="avatar-shape-label" for="avatar-shape-control" style="width:75px">Avatar shape</label>
  <button id="avatar-shape-control" aria-labelledby="avatar-shape-label" style="width:48px;height:24px">on</button>
</div></main></body></html>`;
}

auditRuleTest(
  [{ rule: "row-void", kind: "fires", reason: "a labelled control pushed to the far edge of a wide row leaves most of the row empty" }],
  "a label and its control at opposite ends of a wide row is a row-void naming the label",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "void.html"), voidRowPage(1000, "between"));
    const res = await runCli("snap", ["--file", join(scratch, "void.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toMatch(/^P2\s+row-void/mu);
    // The LABEL is what makes the finding actionable — an operator does not fix "a row", they fix the
    // "Avatar shape" row. A selector path alone would not identify it in a pane of forty.
    expect(res.stdout, "the finding must name the row by its label text").toContain('between "Avatar shape" and its control');
    // The walker's whitespace-collapse regex lives in a TEMPLATE LITERAL, so a single backslash is
    // consumed and the emitted regex becomes /s+/g — which eats the letter s. This caught exactly that.
    expect(res.stdout, "the label must survive whitespace collapse intact").not.toContain("Avatar  hape");
  },
);

auditRuleTest(
  [{ rule: "row-void", kind: "silent", reason: "the same label and control adjacent at the same row width — the fence is the DISTANCE, not the pairing" }],
  "the same pair sitting adjacent mints nothing — the rule is the ocean, not the row",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "bound.html"), voidRowPage(1000, "gap"));
    const res = await runCli("snap", ["--file", join(scratch, "bound.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+row-void/mu);
    expect(res.stdout, "the adjacent bound row itself must have reached the detector").toContain(
      "POPULATION   row-void candidates=1 judged=1 affected=0 populations=0 representatives=0",
    );
  },
);

auditRuleTest(
  [{ rule: "row-void", kind: "silent", reason: "a narrow row's gap is ordinary spacing — the absolute floor separates a void from a layout" }],
  "a narrow row with the same proportional spread mints nothing — a gap is only an ocean at scale",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "tight-row.html"), voidRowPage(260, "between"));
    const res = await runCli("snap", ["--file", join(scratch, "tight-row.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+row-void/mu);
  },
);

// ── selection-idiom (#978): how many ways does one surface say "this one"? ───────────────────────────
// The population is Base UI's own closed state vocabulary (data-checked / data-selected / data-current /
// data-pressed / data-active, plus the ARIA equivalents the app authors), so it spans CONTAINERS — a
// list row and a picker card are never siblings, and "eight ways to say this one" is a claim about the
// whole surface that no sibling-scoped lens can make.
function selectionPage(treatments: readonly string[]): string {
  const cells = treatments
    .map(
      (
        style,
        index,
      ) => `<section data-slot="choice-group"><div data-slot="choice" data-selected style="${style};width:120px;height:40px">cell ${String(index)}</div>
  <div data-slot="choice" aria-selected="false" style="width:120px;height:40px">other ${String(index)}</div></section>`,
    )
    .join("\n  ");
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui"><main>
  ${cells}
</main></body></html>`;
}

const RING = "outline:2px solid orange";
const FILL = "background-color:#402000";
const RAIL = "border-left:3px solid orange";

auditRuleTest(
  [{ rule: "selection-idiom", kind: "fires", reason: "three different visual vocabularies express one selection state on one surface" }],
  "three vocabularies for one selection state is a finding naming the MECHANISMS, not the colours",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "idioms.html"), selectionPage([RING, FILL, RAIL]));
    const res = await runCli("snap", ["--file", join(scratch, "idioms.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("selection-idiom");
    // The signature is the MECHANISM. Two regions using one accent through different channels are still
    // two vocabularies, and a reader learns channels — so the value must name them and their populations.
    expect(res.stdout, "the value must name each mechanism and its count").toContain("ringx1 · fillx1 · bar-leftx1");
  },
);

auditRuleTest(
  [
    {
      rule: "selection-idiom",
      kind: "silent",
      reason: "one vocabulary repeated is a house style — the fence is the COUNT of vocabularies, not the count of selected elements",
    },
  ],
  "one vocabulary repeated across the same population mints nothing",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "one-idiom.html"), selectionPage([RING, RING, RING, RING]));
    const res = await runCli("snap", ["--file", join(scratch, "one-idiom.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+selection-idiom/mu);
    // ONE cohort, not four (#1059): the four regions are four instances of the same authored component in
    // the same authored home, and the cohort key is `claim + home + state` now rather than the raw parent
    // node. Every one of the four selected carriers is still compared against the cohort's unselected
    // base — the vocabulary count this test fences is unchanged — so what moved is the denominator, which
    // stopped reporting one repeated component as four separate decisions.
    expect(res.stdout, "the repeated cohort must have reached the detector as ONE judged population").toContain(
      "POPULATION   selection-idiom candidates=1 judged=1 affected=0 populations=0 representatives=0",
    );
  },
);

// A house style plus ONE variant is normal (a grid uses a ring, a list uses a rail). The fence sits above
// two, so the rule reports a vocabulary sprawl rather than the existence of a second idiom.
auditRuleTest(
  [{ rule: "selection-idiom", kind: "silent", reason: "two vocabularies is a house style with a variant, which is the recommended end state" }],
  "two vocabularies is the recommended end state and mints nothing",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "two-idioms.html"), selectionPage([RING, RING, RAIL, RAIL]));
    const res = await runCli("snap", ["--file", join(scratch, "two-idioms.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+selection-idiom/mu);
  },
);

// ── pane-ink · quiet-state · double-empty-state (#978): the region-scoped lens ───────────────────────
// Three questions no element can answer about itself: does this region earn its height, is the OFF
// state louder than the ON state, and how many panes of one surface are empty at once.
function inkPage(contentPx: number): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui">
<main role="region" style="height:900px;overflow:hidden">
  <p style="margin:0;height:${contentPx}px">Your personas</p>
  <p style="margin:0">New persona</p>
  <p style="margin:0">Traveler</p>
</main></body></html>`;
}

auditRuleTest(
  [{ rule: "pane-ink", kind: "fires", reason: "a 900px region whose last text sits near the top is evacuated, not airy" }],
  "a region whose authored paint ends near its top is a pane-ink finding",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "thin.html"), inkPage(40));
    const res = await runCli("snap", ["--file", join(scratch, "thin.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toMatch(/^P3\s+pane-ink/mu);
    // MEASURED ON AUTHORED PAINT, never the tallest descendant: a full-height transparent container spans
    // the region, so a max-descendant measure reports 100% ink on an empty pane.
    expect(res.stdout, "the finding must report the ink ratio and designed-subject count").toMatch(/% ink, \d+ text runs, \d+ designed subjects/u);
  },
);

auditRuleTest(
  [{ rule: "pane-ink", kind: "silent", reason: "the same region filled to its height is the precision neighbour — the fence is the VOID, not the height" }],
  "the same region filled to its height mints nothing",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "full.html"), inkPage(820));
    const res = await runCli("snap", ["--file", join(scratch, "full.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P3\s+pane-ink/mu);
    expect(res.stdout, "the filled pane itself must have reached the detector").toContain(
      "POPULATION   pane-ink candidates=1 judged=1 affected=0 populations=0 representatives=0",
    );
  },
);

function switchWeightPage(offFill: string, onFill: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui"><main>
  <span data-unchecked style="display:block;width:48px;height:24px;background-color:${offFill}">off</span>
  <span data-checked style="display:block;width:48px;height:24px;background-color:${onFill}">on</span>
</main></body></html>`;
}

auditRuleTest(
  [{ rule: "quiet-state", kind: "fires", reason: "a near-white OFF track against a dark page outshouts the accent ON track" }],
  "an OFF state louder than its ON state is a quiet-state finding — an ORDERING, not a threshold",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "loud-off.html"), switchWeightPage("#f5f5f5", "#7a4a12"));
    const res = await runCli("snap", ["--file", join(scratch, "loud-off.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("quiet-state");
    // Neither number is a violation on its own — the finding must show the RANK, which is the defect.
    expect(res.stdout, "the value must show both sides so the inversion is legible").toMatch(/OFF [\d.]+:1 vs ON [\d.]+:1/u);
  },
);

auditRuleTest(
  [{ rule: "quiet-state", kind: "silent", reason: "the same pair with the weights the right way round — the fence is the inversion, not the contrast" }],
  "a muted OFF beneath an accent ON mints nothing",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "quiet-off.html"), switchWeightPage("#2a2a2a", "#f0a020"));
    const res = await runCli("snap", ["--file", join(scratch, "quiet-off.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+quiet-state/mu);
  },
);

function emptyStatePage(count: number, withAction: boolean): string {
  const action = withAction ? '<button data-slot="empty-state-action">New book</button>' : "";
  const blocks = Array.from(
    { length: count },
    (_unused, index) => `<div data-slot="empty-state-root"><p>Nothing here yet ${String(index)}</p>${action}</div>`,
  ).join("\n  ");
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui"><main>
  ${blocks}
</main></body></html>`;
}

auditRuleTest(
  [{ rule: "double-empty-state", kind: "fires", reason: "two panes of one surface are empty at once, so each gives separate guidance" }],
  "two simultaneous empty states are one finding — the Extensions 'pick one on the left' with nothing on the left",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "two-empty.html"), emptyStatePage(2, true));
    const res = await runCli("snap", ["--file", join(scratch, "two-empty.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("double-empty-state");
    expect(res.stdout, "the value must count the rendered states and the actionless ones").toContain("2 empty state(s) rendered at once");
  },
);

auditRuleTest(
  [{ rule: "double-empty-state", kind: "fires", reason: "a lone empty state offering no action is a dead end — the second arm of the same sample" }],
  "one empty state with no action is still a finding — an empty pane owes a door out",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "dead-end.html"), emptyStatePage(1, false));
    const res = await runCli("snap", ["--file", join(scratch, "dead-end.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("double-empty-state");
    expect(res.stdout, "the actionless count is what distinguishes this arm").toContain("1 with no action");
  },
);

auditRuleTest(
  [{ rule: "double-empty-state", kind: "silent", reason: "ONE empty state that offers its action is the correct shape and must stay silent" }],
  "a single empty state with its action mints nothing",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "one-empty.html"), emptyStatePage(1, true));
    const res = await runCli("snap", ["--file", join(scratch, "one-empty.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+double-empty-state/mu);
    expect(res.stdout, "the actionable empty surface itself must have reached the detector").toContain(
      "POPULATION   double-empty-state candidates=1 judged=1 affected=0 populations=0 representatives=0",
    );
  },
);

// ── THE OKLCH PLANT (#978 repair) ────────────────────────────────────────────────────────────────────
// quiet-state originally scraped the first three numbers out of the computed background color. That
// works on the hex fixtures above — Chromium normalizes #f5f5f5 to rgb() — and is GARBAGE on the actual
// token system, which is authored in OKLCH and preserved as such: a live switch reads back
// "oklch(0.99 0.005 60 / 0.12)", so the scrape computed a near-black luminance from a near-WHITE colour
// and the whole ORDERING then ranked on noise. Every fixture was green while the rule was blind on the
// only surface that matters.
//
// These two plants are the fence: the first proves the rule reads OKLCH at all, the second proves alpha
// is composited rather than ignored — the live off-track is 12% alpha, and comparing a translucent fill
// as if it were opaque measures a colour nothing paints.
function oklchSwitchPage(offFill: string, onFill: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:oklch(0.15 0.006 60);color:#fff;font:14px system-ui"><main>
  <span data-unchecked style="display:block;width:48px;height:24px;background-color:${offFill}">off</span>
  <span data-checked style="display:block;width:48px;height:24px;background-color:${onFill}">on</span>
</main></body></html>`;
}

auditRuleTest(
  [{ rule: "quiet-state", kind: "fires", reason: "an OKLCH-authored OFF track outshouts its OKLCH ON track — the token system's real spelling" }],
  "quiet-state reads OKLCH, not just the rgb() spelling a hex fixture normalizes to",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "oklch-loud-off.html"), oklchSwitchPage("oklch(0.99 0.005 60)", "oklch(0.55 0.14 60)"));
    const res = await runCli("snap", ["--file", join(scratch, "oklch-loud-off.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).toContain("quiet-state");
    // A number-regex over "oklch(0.99 0.005 60)" yields 0.99/0.005/60 read as sRGB channels — a near-black
    // luminance for a near-white colour. If this ever reports an inverted or absent ratio, the parser
    // regressed to scraping instead of normalizing.
    expect(res.stdout, "the OFF side must measure as the LOUD one").toMatch(/OFF 1[0-9.]+:1 vs ON [1-9][0-9.]*:1/u);
  },
);

auditRuleTest(
  [
    {
      rule: "quiet-state",
      kind: "silent",
      reason: "a 12%-alpha OFF track composites down to a quiet fill — ignoring alpha would judge a colour nothing paints",
    },
  ],
  "a translucent OFF track is composited over its backdrop, not compared raw",
  async ({ runCli, scratch }) => {
    // Raw, this near-white fill would outshout the accent and fire. Composited at 12% over the dark page
    // it is a muted track — which is what the user actually sees, and the correct verdict.
    await writeFile(join(scratch, "oklch-alpha-off.html"), oklchSwitchPage("oklch(0.99 0.005 60 / 0.12)", "oklch(0.55 0.14 60)"));
    const res = await runCli("snap", ["--file", join(scratch, "oklch-alpha-off.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+quiet-state/mu);
  },
);

// ── THE CONTENT-DRIVEN COHORT PLANT (#978 repair) ────────────────────────────────────────────────────
// cohort-anatomy first shipped assuming a shared data-slot implies a shared intended height. True for
// the F1 case (16px config-band buttons beside 32px twins, identical content); false for a settings row
// whose height is set by what it holds. Live on config:appearance it reported a 234px theme-picker row
// against its 34px button sibling — half the findings on that surface were this shape.
function contentDrivenRowPage(tallChildPx: number): string {
  const rows = [tallChildPx, 24, 24].map((childPx) => `<div data-slot="setting-row"><div style="height:${String(childPx)}px">row</div></div>`).join("\n  ");
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui"><main>
  ${rows}
</main></body></html>`;
}

auditRuleTest(
  [
    {
      rule: "cohort-anatomy",
      kind: "silent",
      reason: "a row whose box grew because its CONTENT grew is doing its job — the fence is a mis-sized box, not a tall one",
    },
  ],
  "a row sized by its own content mints nothing — the theme-picker false positive, pinned",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "content-driven.html"), contentDrivenRowPage(200));
    const res = await runCli("snap", ["--file", join(scratch, "content-driven.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(res.stdout).not.toMatch(/^P2\s+cohort-anatomy/mu);
    expect(res.stdout, "the content-driven cohort itself must have reached the detector").toContain(
      "POPULATION   cohort-anatomy candidates=1 judged=1 affected=0 populations=0 representatives=0",
    );
  },
);

// ── border-contrast (#1361 folded into #1315): WCAG 1.4.11 over a form control's DECLARED boundary ───
//
// @instrument-proof: the failing and the clearing field differ ONLY in `border-color` — same tag, same
// fill, same surround, same box — so a rule that fired on the shape rather than on the measurement would
// fail the silence half. The borderless fixture is the biggest false-positive class this rule could carry
// (a control separated by fill, elevation or a label makes no boundary claim) and it must be a NAMED,
// printed exclusion rather than a quiet pass.
const BORDER_FIELDS = `<!doctype html>
<html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0"><main style="background:#232323;color:#fff;padding:24px">
<label for="quiet">Quiet</label><input id="quiet" style="border:1px solid #2a2a2a;background:#232323;color:#fff;width:200px;height:32px">
<label for="loud">Loud</label><input id="loud" style="border:1px solid #cccccc;background:#232323;color:#fff;width:200px;height:32px">
</main></body></html>`;

const BORDERLESS_FIELD = `<!doctype html>
<html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body style="margin:0"><main style="background:#232323;color:#fff;padding:24px">
<label for="bare">Bare</label><input id="bare" style="border:none;background:#333333;color:#fff;width:200px;height:32px">
</main></body></html>`;

auditRuleTest(
  [
    { rule: "border-contrast", kind: "fires", reason: "a 1px boundary at ~1.1:1 against the surface outside it is not perceivable" },
    { rule: "border-contrast", kind: "silent", reason: "the twin's boundary clears 1.4.11's 3:1 and is judged, not skipped" },
  ],
  "a declared field boundary below WCAG 1.4.11's 3:1 REDs, and the clearing twin is silent over a judged population",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "border-fields.html"), BORDER_FIELDS);
    const res = await runCli("snap", ["--file", join(scratch, "border-fields.html"), "--fail-on", "P2", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    const rows = findingRows(res.stdout, "border-contrast");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("#quiet");
    expect(rows[0]).not.toContain("#loud");
    // The DENOMINATOR is what makes the silence a measurement: both fields judged, neither withheld.
    expect(res.stdout).toMatch(/POPULATION\s+border-contrast candidates=2 judged=2 affected=1/u);
    await expect(res).toExitWith(1);
  },
);

auditRuleTest(
  [{ rule: "border-contrast", kind: "silent", reason: "a control that declares no border made no boundary claim — a closed, printed exclusion" }],
  "a borderless control is excluded by name, never a silent pass",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "borderless.html"), BORDERLESS_FIELD);
    const res = await runCli("snap", ["--file", join(scratch, "borderless.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    expect(findingRows(res.stdout, "border-contrast")).toEqual([]);
    expect(res.stdout).toMatch(/POPULATION\s+border-contrast candidates=1 judged=0 .*excluded\(noDeclaredBorder=1\)/u);
  },
);

// ── hover-contrast (#the forced-state pass) ────────────────────────────────────────────────────────
// These are the plants that a PURE fixture structurally cannot be: `CSS.forcePseudoState` is a CDP
// round trip against a real Chromium, so the only honest proof that the pass forces, reads and — the
// part that matters — RELEASES is to drive the real cli over a real page. A stuck `:hover` would
// silently corrupt every later sample in the run, so the release is asserted here every time.
//
// Every fixture pads its anchor past the 24px pointer:fine tap floor, so the only P1 in play is the
// planted contrast defect and the exit code means what it says.

/** `hover-*` rows of the RESULT line — the forced-state denominator and its cost. */
function hoverRow(stdout: string, key: string): string {
  // Token-split rather than a capture group: biome's type service reads `RegExp.exec` as non-nullish
  // here and rejects every guard tsc requires, so the machine line is read the way it is written.
  const prefix = `hover-${key}=`;
  const token = stdout.split(/\s+/u).find((word) => word.startsWith(prefix));
  return token === undefined ? "ABSENT" : token.slice(prefix.length);
}

interface HoverPopulationReport {
  readonly findings: readonly { readonly rule: string; readonly selector: string; readonly value: string }[];
  readonly populationAccounting?: {
    readonly "hover-contrast"?: {
      readonly candidates: number;
      readonly judged: number;
      readonly affected: number;
      readonly withheld: Readonly<Record<string, number>>;
      readonly excluded: Readonly<Record<string, number>>;
    };
  };
  readonly hoverPass: { readonly outcome: { readonly kind: string }; readonly subjectsForced: number; readonly forceFailures: readonly string[] } | null;
}

/** A nav CTA that reads cleanly at rest. `hoverRule` is whatever the broader selector wins with. */
function hoverPage(hoverRule: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>hover</title><style>
  body { margin: 0; background: #101010; color: #ffffff; font-size: 16px }
  a.cta { display: inline-block; padding: 14px 18px; color: #ffffff; background: #101010; text-decoration: none }
  ${hoverRule}
</style></head>
<body><main><nav class="nav-links"><a class="cta" href="#">Continue the story</a></nav>
<p style="padding:12px">a paragraph that no hover rule touches at all</p></main></body></html>`;
}

auditRuleTest(
  [{ rule: "hover-contrast", kind: "fires", reason: "a real forced :hover swaps in a pale plate the CTA is illegible on, driven through the real cli" }],
  "a planted HOVER-ONLY contrast defect REDs the audit through the real cli and real CDP",
  async ({ runCli, scratch }) => {
    // White on #101010 at rest (19:1). Under `.nav-links a:hover` the broader selector wins and the pair
    // becomes #d2d2d2 on white — 1.5:1, and invisible to every rest-state rule in this instrument.
    await writeFile(join(scratch, "hover-fires.html"), hoverPage(".nav-links a:hover { color: #d2d2d2; background: #ffffff }"));
    const res = await runCli("snap", ["--file", join(scratch, "hover-fires.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverPopulationReport;

    const hover = report.findings.filter(({ rule }) => rule === "hover-contrast");
    expect(hover).toHaveLength(1);
    expect(hover[0]?.value).toContain("hovered");
    // The REST state is clean — this defect is reachable only with the pointer on the control, which is
    // exactly the mechanism the rest-state contrast family is blind to.
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.hoverPass?.outcome.kind).toBe("ran");
    expect(report.hoverPass?.forceFailures).toEqual([]);
    expect(Number(hoverRow(res.stdout, "subjects-forced"))).toBeGreaterThan(0);
    await expect(res).toExitWith(1);
  },
);

auditRuleTest(
  [{ rule: "hover-contrast", kind: "silent", reason: "the nearest legitimate neighbour — the same CTA whose hover pair stays above the floor" }],
  "the hover twin exits clean, and the untouched paragraph is EXCLUDED rather than counted as a pass",
  async ({ runCli, scratch }) => {
    await writeFile(join(scratch, "hover-passes.html"), hoverPage(".nav-links a:hover { color: #101010; background: #ffffff }"));
    const res = await runCli("snap", ["--file", join(scratch, "hover-passes.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
    const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverPopulationReport;
    const row = report.populationAccounting?.["hover-contrast"];

    expect(report.findings.filter(({ rule }) => rule === "hover-contrast")).toEqual([]);
    // JUDGED, not skipped: the CTA's hover pair really was forced and measured. A silent rule whose
    // denominator is zero is a rule that never ran.
    expect(row?.judged).toBeGreaterThan(0);
    // …and the paragraph, which no hover rule reaches, is a stated exclusion rather than a silent pass.
    expect(row?.excluded["noHoverPaint"]).toBeGreaterThan(0);
    expect(row?.affected).toBe(0);
    expect(hoverRow(res.stdout, "pass")).toBe("ok");
    await expect(res).toExitWith(0);
  },
);

test("every forced :hover is RELEASED — the rest verdict is identical with the pass and without it", async ({ runCli, scratch }) => {
  // THE POISON CASE. Forcing is a page-wide mutation: one `:hover` left on corrupts every later sample in
  // the run, and the corruption looks like a real finding. So this fixture plants a REST-state contrast
  // defect on a paragraph AND a hover rule on a neighbouring CTA. The paragraph's verdict must be exactly
  // what it would be if the hover pass did not exist, and the pass's own re-read must find nothing stuck.
  await writeFile(
    join(scratch, "hover-release.html"),
    `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>release</title><style>
  body { margin: 0; background: #101010; color: #ffffff; font-size: 16px }
  a.cta { display: inline-block; padding: 14px 18px; color: #ffffff; background: #101010; text-decoration: none }
  .nav-links a:hover { color: #d2d2d2; background: #ffffff }
  p.dim { color: #111111; background: #101010; padding: 12px }
</style></head>
<body><main><nav class="nav-links"><a class="cta" href="#">Continue the story</a></nav>
<p class="dim">this line is unreadable at rest and stays that way</p></main></body></html>`,
  );
  const res = await runCli("snap", ["--file", join(scratch, "hover-release.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverPopulationReport;

  // The rest-state defect is reported ONCE, by `contrast`, exactly as it was before this rule existed.
  expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
  // The pass re-read every candidate's rest state after its last release and found none changed.
  expect(hoverRow(res.stdout, "not-restored")).toBe("0");
  expect(hoverRow(res.stdout, "sheets-unreadable")).toBe("0");
  expect(hoverRow(res.stdout, "selectors-unparseable")).toBe("0");
  // The hover defect on the CTA is found too — the release did not cost the pass its own verdict.
  expect(report.findings.filter(({ rule }) => rule === "hover-contrast")).toHaveLength(1);
  await expect(res).toExitWith(1);
});

test("a coarse-pointer run REFUSES the hover question instead of reporting a clean zero", async ({ runCli, scratch }) => {
  // Under `--mobile` the whole hover layer is behind a media query that does not match, so there is no
  // hover state to judge. The pass says so by name and publishes NO accounting row — an `affected=0` row
  // here would read as "117 controls checked, all fine" on a device that cannot hover.
  await writeFile(join(scratch, "hover-coarse.html"), hoverPage(".nav-links a:hover { color: #d2d2d2; background: #ffffff }"));
  const res = await runCli("snap", ["--file", join(scratch, "hover-coarse.html"), "--mobile", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverPopulationReport;

  expect(hoverRow(res.stdout, "pass")).toBe("no-hover-media");
  expect(report.populationAccounting?.["hover-contrast"]).toBeUndefined();
  expect(report.findings.filter(({ rule }) => rule === "hover-contrast")).toEqual([]);
});

test("a control whose color transition covers the forced read is a NAMED exclusion, not a plain noHoverChange", async ({ runCli, scratch }) => {
  // THE #detector-adapt REGRESSION PIN. Forcing `:hover` over CDP reads computed style at t≈0 — before a
  // live transition has advanced — so a control that DOES repaint on hover, but repaints via a slow
  // `transition: color`/`background-color`, reads back identical to rest and would silently fall into the
  // same `noHoverChange` bucket as a control with genuinely no hover paint at all. The duration here is on
  // the BASE rule (not `:hover`-only), so entry is slow in both directions and the release never drifts —
  // `notRestored` stays 0, which is what proves this is the transition blind spot and not the `hover-stuck`
  // poisoned-release case pinned above.
  await writeFile(
    join(scratch, "hover-transitioned.html"),
    `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>transitioned</title><style>
  body { margin: 0; background: #101010; color: #ffffff; font-size: 16px }
  a.cta { display: inline-block; padding: 14px 18px; color: #ffffff; background: #101010; text-decoration: none;
          transition: color 600s linear, background-color 600s linear }
  .nav-links a:hover { color: #d2d2d2; background: #ffffff }
</style></head>
<body><main><nav class="nav-links"><a class="cta" href="#">Continue the story</a></nav></main></body></html>`,
  );
  const res = await runCli("snap", ["--file", join(scratch, "hover-transitioned.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverPopulationReport;
  const row = report.populationAccounting?.["hover-contrast"];

  // Not published as judged (the forced read cannot tell "no paint" from "paint not visible yet"), and NOT
  // merged into the plain "genuinely no hover paint" bucket either — its own named reason.
  expect(report.findings.filter(({ rule }) => rule === "hover-contrast")).toEqual([]);
  expect(row?.excluded["noHoverChangeButTransitioned"]).toBe(1);
  expect(row?.excluded["noHoverChange"]).toBeUndefined();
  // The release genuinely worked — this is the transition blind spot, not the poisoned-release case.
  expect(hoverRow(res.stdout, "not-restored")).toBe("0");
});

test("a candidate whose rest state does NOT read back is WITHHELD, never published as judged", async ({ runCli, scratch }) => {
  // THE JOIN PIN. `hoverVerify` re-reads every candidate's rest state after the last release and returns
  // the ones that did not come back identical; `settleInputs` must drop exactly those. A long CSS
  // transition on the hovered properties makes that deterministic: at the instant the force is released
  // the computed colour is still the HOVER value on its way back, so the instrument genuinely cannot
  // prove it measured a rest state — and a reading taken through a state no pointer produced must not
  // reach a verdict.
  //
  // This is a REGRESSION PIN with teeth: while the verify list was joined by SELECTOR against a numeric
  // index (`Set<string>.has(number)` — always false), the withholding branch was unreachable, the poisoned
  // sample was published as JUDGED and could file a real P1, and the RESULT line still printed a correct
  // `hover-not-restored=1` beside it. The accounting balanced; it balanced wrong.
  await writeFile(
    join(scratch, "hover-stuck.html"),
    `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>stuck</title><style>
  body { margin: 0; background: #101010; color: #ffffff; font-size: 16px }
  a.cta { display: inline-block; padding: 14px 18px; color: #ffffff; background: #101010; text-decoration: none;
          transition: color 600s linear, background-color 600s linear }
  /* Duration 0 ON the way in, 600s ON THE WAY BACK: the forced read is the true hover pair, and the
     release then leaves the element ten minutes from its rest state. */
  .nav-links a:hover { transition-duration: 0s; color: #101010; background: #ffffff }
</style></head>
<body><main><nav class="nav-links"><a class="cta" href="#">Continue the story</a></nav></main></body></html>`,
  );
  const res = await runCli("snap", ["--file", join(scratch, "hover-stuck.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverPopulationReport;
  const row = report.populationAccounting?.["hover-contrast"];

  expect(Number(hoverRow(res.stdout, "not-restored"))).toBeGreaterThan(0);
  // The number the RESULT line prints and the number the DENOMINATOR withholds are the same number.
  expect(row?.withheld["notRestored"]).toBe(Number(hoverRow(res.stdout, "not-restored")));
  // Withheld, therefore un-judged, therefore incapable of filing a finding from a poisoned reading.
  expect(report.findings.filter(({ rule }) => rule === "hover-contrast")).toEqual([]);
  // A withheld candidate is a NO VERDICT run, not a quieter clean one.
  expect(res.stdout).toContain("notRestored=");
  // #1345 — and the RESULT line NAMES the withheld rule and its reason. `population-verdict=NO-VERDICT`
  // alone sent a 2026-09-04 review to the report JSON through a python heredoc to learn which rule and why.
  expect(res.stdout).toContain("population-verdict=NO-VERDICT");
  expect(res.stdout).toMatch(/population-withheld=\S*hover-contrast:notRestored×\d+/u);
  await expect(res).toExitWith(2);
});

/** A stylesheet served from its OWN origin with no CORS header — `sheet.cssRules` throws SecurityError
 *  on it, which is the only way to produce a genuinely unreadable sheet on purpose. */
function serveCssOnce(css: string): Promise<{ readonly href: string; readonly close: () => void }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
    res.end(css);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        href: `http://127.0.0.1:${addr.port}/x.css`,
        close: (): void => {
          server.close();
        },
      });
    });
  });
}

test("an UNREADABLE stylesheet makes noHoverPaint a WITHHELD count, not an exclusion — absence of measurement is not proof", async ({ runCli }) => {
  // THE POLARITY CONTROL, direction two. `excluded` means a measurement PROVED the rule does not apply;
  // `withheld` means there was no measurement. When a sheet's `cssRules` throws, its `:hover` rules were
  // never collected — so every element it would have painted falls into the "no hover paint" bucket, and
  // recording THAT as `excluded` files absence-of-measurement as proof-of-inapplicability. Direction one
  // (every sheet readable ⇒ the same bucket is a legitimate `excluded`) is pinned by the hover-twin test
  // above; this is the arm that must flip.
  const sheet = await serveCssOnce(".nav-links a:hover { color: #d2d2d2; background: #ffffff }");
  const host = await serveOnce(`<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>unreadable</title>
<link rel="stylesheet" href="${sheet.href}"><style>
  body { margin: 0; background: #101010; color: #ffffff; font-size: 16px }
  a.cta { display: inline-block; padding: 14px 18px; color: #ffffff; background: #101010; text-decoration: none }
</style></head>
<body><main><nav class="nav-links"><a class="cta" href="#">Continue the story</a></nav>
<p style="padding:12px">a paragraph whose hover paint we now cannot rule out</p></main></body></html>`);
  try {
    const res = await runCli("snap", ["/", "--base", host.base, "--out", "hover-unreadable", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });

    expect(hoverRow(res.stdout, "sheets-unreadable")).toBe("1");
    // NO VERDICT, by name — the run states which bucket it cannot vouch for.
    expect(res.stdout).toContain("noHoverPaintUnproven=");
    await expect(res).toExitWith(2);
  } finally {
    host.close();
    sheet.close();
  }
});

test("a forced-state pass that BREAKS is a NO VERDICT run, not a green one with a missing row", async ({ runCli, scratch }) => {
  // #953's ruling applied to this pass: a checker that FAILED is exit-2 class. The two non-running arms
  // are deliberately different — a coarse-pointer run is genuinely not-applicable and stays green and
  // silent (pinned above); a pass that was supposed to run and threw must redden the verdict, exactly as
  // ops/stage.ts does for a stage that will not boot. Before this, a thrown pass printed its reason,
  // contributed no accounting row, and the audit exited 0 — the shape of every false clean this
  // instrument exists to prevent.
  //
  // The break is planted, not simulated: a throwing `document.styleSheets` getter is the first thing the
  // hover census touches, so the in-page evaluation rejects for real and the Node side sees a genuine
  // failure rather than a test-only branch.
  await writeFile(
    join(scratch, "hover-broke.html"),
    `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>broke</title><style>
  body { margin: 0; background: #101010; color: #ffffff; font-size: 16px }
  a.cta { display: inline-block; padding: 14px 18px; color: #ffffff; background: #101010; text-decoration: none }
  .nav-links a:hover { color: #101010; background: #ffffff }
</style>
<script>Object.defineProperty(document, "styleSheets", { get: function () { throw new Error("planted stylesheet failure"); } });</script>
</head>
<body><main><nav class="nav-links"><a class="cta" href="#">Continue the story</a></nav></main></body></html>`,
  );
  const res = await runCli("snap", ["--file", join(scratch, "hover-broke.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverPopulationReport;

  expect(hoverRow(res.stdout, "pass")).toBe("BROKE");
  expect(res.stdout).toContain("HOVER REFUSED");
  expect(res.stdout).toContain("planted stylesheet failure");
  // Named as its OWN gap, so a reader can tell "this surface has no hover layer" from "we could not ask".
  expect(res.stdout).toContain("forced-state pass");
  expect(report.hoverPass?.outcome.kind).toBe("broke");
  // No fabricated row either — the denominator is absent because nothing was measured.
  expect(report.populationAccounting?.["hover-contrast"]).toBeUndefined();
  await expect(res).toExitWith(2);
});

// ── unreachable-hint (#2452): a tooltip no coarse pointer can open, with nothing else carrying its words ──
// THE MECHANISM, PLANTED IN THE SHIPPED SHAPE (RULE-AUTHORING.md step 2). The census selects Base UI's own
// `[data-base-ui-tooltip-trigger]` (TooltipTrigger.js:244) and reads `@orb/ui`'s published decision
// `data-tooltip-describes` (packages/ui/src/primitives/tooltip/tooltip.tsx). Both attributes are spelled
// here verbatim rather than rendered, because this suite drives FILE pages through the real cli — the
// RENDERED half, proving the real `<Tooltip>` actually emits this pair, is
// `tests/tooling/design-audit-walker.ct.tsx`. `--mobile` is load-bearing: at a fine pointer the popup opens
// on hover and the rule withholds the whole population by name.
function tooltipTriggerPage(trigger: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>hint</title><style>
  body { margin: 0; background: #101010; color: #ffffff; font-size: 16px }
  button { width: 48px; height: 48px; background: #101010; color: #ffffff; border: 0 }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%) }
</style></head>
<body><main>${trigger}</main></body></html>`;
}

auditRuleTest(
  [
    {
      rule: "unreachable-hint",
      kind: "fires",
      reason: "a coarse-pointer tooltip trigger whose seal left the description to a caller that never wrote one, with no press door",
    },
  ],
  "a coarse tooltip trigger with no reachable description and no press door REDs the audit",
  async ({ runCli, scratch }) => {
    await writeFile(
      join(scratch, "hint-fires.html"),
      tooltipTriggerPage('<button type="button" aria-label="Send message" data-base-ui-tooltip-trigger data-tooltip-describes="caller"></button>'),
    );
    const res = await runCli("snap", ["--file", join(scratch, "hint-fires.html"), "--mobile", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });

    // The ROW, not the exit code: this rule is P2 and the audit's failure threshold is P1, so a run
    // carrying exactly this finding still exits 0 — asserting the exit would be asserting the threshold.
    expect(findingRows(res.stdout, "unreachable-hint")).toHaveLength(1);
    expect(res.stdout).toContain("no tap can open");
  },
);

auditRuleTest(
  [
    {
      rule: "unreachable-hint",
      kind: "silent",
      reason: "the nearest legitimate neighbour — the SAME trigger with the seal's own always-mounted description resolving at rest",
    },
  ],
  "the same trigger whose description resolves at rest is an EXCLUSION, not a finding",
  async ({ runCli, scratch }) => {
    await writeFile(
      join(scratch, "hint-silent.html"),
      tooltipTriggerPage(
        '<button type="button" aria-label="Send message" aria-describedby="hint-copy" data-base-ui-tooltip-trigger data-tooltip-describes="self"></button>' +
          '<span class="sr" id="hint-copy" role="tooltip">Local engine is off — enable it to send.</span>',
      ),
    );
    const res = await runCli("snap", ["--file", join(scratch, "hint-silent.html"), "--mobile", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });

    expect(findingRows(res.stdout, "unreachable-hint")).toEqual([]);
    // Not a silent zero: the population is PRINTED with the reason it was judged inapplicable.
    expect(res.stdout).toContain("hasReachableDescription");
  },
);

test("a name-repeating tooltip is excluded, and a FINE pointer excludes the population without costing the verdict", async ({ runCli, scratch }) => {
  // The two remaining dispositions, both of which would otherwise read as a clean zero. `name` is the
  // seal's own verdict that the tooltip adds nothing (most icon-only controls in this app); a fine-pointer
  // pass is a pointer the defect cannot exist on, and saying so by name is what keeps a desktop run from
  // claiming it checked a touch affordance.
  //
  // THE FINE ARM IS AN EXCLUSION (#2468). It landed as a WITHHOLDING, which made every desktop audit of
  // every surface carrying a visible tooltip trigger a NO VERDICT — measured `finePointer=17` on
  // `--goto characters`. The second assertion pair below is the defect proof and the reason this arm
  // cannot silently regress: naming the pointer must cost the run nothing.
  const trigger = '<button type="button" aria-label="Notifications" data-base-ui-tooltip-trigger data-tooltip-describes="name"></button>';
  await writeFile(join(scratch, "hint-name.html"), tooltipTriggerPage(trigger));
  const named = await runCli("snap", ["--file", join(scratch, "hint-name.html"), "--mobile", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(named.stdout, "unreachable-hint")).toEqual([]);
  expect(named.stdout).toContain("tooltipRepeatsName");

  await writeFile(
    join(scratch, "hint-fine.html"),
    tooltipTriggerPage('<button type="button" aria-label="Send message" data-base-ui-tooltip-trigger data-tooltip-describes="caller"></button>'),
  );
  const fine = await runCli("snap", ["--file", join(scratch, "hint-fine.html"), ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });
  expect(findingRows(fine.stdout, "unreachable-hint"), "the SAME page that fires at coarse must not fire at fine").toEqual([]);
  expect(fine.stdout).toContain("excluded(finePointer=1)");
  expect(fine.stdout, "naming the pointer is a CLOSED negative — it must not cost the run its verdict").toContain("population-verdict=complete");
  expect(fine.stdout).not.toContain("withheld(finePointer");
});

test("a tooltip trigger OUTSIDE the @orb/ui seal is WITHHELD by name, never counted as clean", async ({ runCli, scratch }) => {
  // A raw Base UI trigger publishes no decision, so this instrument cannot tell "the tooltip repeats the
  // name" from "its words are unreachable" — that is missing evidence (#987 polarity), and a run carrying
  // it is NO VERDICT for this rule rather than a pass.
  await writeFile(
    join(scratch, "hint-bare.html"),
    tooltipTriggerPage('<button type="button" aria-label="Send message" data-base-ui-tooltip-trigger></button>'),
  );
  const res = await runCli("snap", ["--file", join(scratch, "hint-bare.html"), "--mobile", ...AUDIT], { timeoutMs: CLI_TIMEOUT_MS });

  expect(findingRows(res.stdout, "unreachable-hint")).toEqual([]);
  expect(res.stdout).toContain("noDescriptionWiring");
});
