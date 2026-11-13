// Two-direction controls for the glow census's pseudo-element sweep, through real computed paint.
//
// WHY THIS TIER: the exemption is a STRUCTURAL reading of a pseudo-element's computed style
// (`isDedicatedGlowLayer`, ops/walker/census-decor.ts) and no node-side unit can see a `::before`. The
// checker-side arm (`sanctioned` short-circuits `checkGlowShadow`) is pinned in index.test.ts; this file
// pins the DERIVATION — which is where a widening or a wall would come from.
//
// Every fixture below differs from its twin in exactly ONE property, so a green here names the condition
// that carried the verdict rather than a shape that happened to pass. Colour is deliberately plain rgba:
// this file is about LAYERING, and the OKLCH colour reading has its own pins in index.test.ts.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RelationalPopulationReport } from "@orb/testkit/node";
import {
  AUDIT_ARGV,
  auditReport,
  configureRelationalCliBudget,
  findingSelectors,
  RELATIONAL_CLI_TIMEOUT_MS,
  readAuditReport,
  relationalDocument,
} from "@orb/testkit/node";
import type { ToolFixtures } from "@orb/testkit/tooling";
import { auditRuleTest, expect, test } from "@orb/testkit/tooling";

configureRelationalCliBudget();

/** The exact live house pattern, in CSS: `relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-… before:shadow-glow before:content-['']` — the shape all
 *  six real carriers share (discovery/corpus-family-map, discovery/corpus-understanding-invitation,
 *  chat/home-hearth-room, config/config-welcome, refinery/focal-treatment, app-shell/shell.css). */
const GLOW_FIXTURE = `<style>
.box { position: relative; isolation: isolate; width: 220px; height: 60px; margin: 12px; border-radius: 12px; }
.layer::before { content: ""; position: absolute; inset: -1px; border-radius: 12px; pointer-events: none; }
#house::before { z-index: -10; box-shadow: 0 0 18px rgba(240, 130, 60, 0.4); }
#over-content::before { z-index: 1; box-shadow: 0 0 18px rgba(240, 130, 60, 0.4); }
#decorated::before { z-index: -10; background: rgba(240, 130, 60, 0.3); box-shadow: 0 0 18px rgba(240, 130, 60, 0.4); }
#grabby::before { z-index: -10; pointer-events: auto; box-shadow: 0 0 18px rgba(240, 130, 60, 0.4); }
#neutral::before { z-index: 1; box-shadow: 0 0 18px rgba(0, 0, 0, 0.35); }
#on-the-element, #sanctioned-cell { box-shadow: 0 0 18px rgba(240, 130, 60, 0.4); }
</style>
<div class="box layer" id="house">house layered glow</div>
<div class="box layer" id="over-content">layer painting over the content</div>
<div class="box layer" id="decorated">layer carrying its own fill</div>
<div class="box layer" id="grabby">layer eating pointer events</div>
<div class="box layer" id="neutral">achromatic layer</div>
<div class="box" id="on-the-element">glow on the element itself</div>
<div class="box" id="sanctioned-cell" data-slot="media-grid-cell">owner effect carrier</div>`;

test("the glow census sweeps pseudo layers, exempting the house discipline and judging every deviation from it", async ({ runSnap, scratch }) => {
  await writeFile(join(scratch, "pseudo-glow.html"), relationalDocument(GLOW_FIXTURE));
  const res = await runSnap(["--file", join(scratch, "pseudo-glow.html"), "--fail-on", "P3", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as {
    readonly findings: readonly { readonly rule: string; readonly selector: string }[];
  };
  const glowSelectors = report.findings.filter((finding) => finding.rule === "glow-shadow").map((finding) => finding.selector);

  // FIRES — the whole point of the sweep: a chromatic glow on a pseudo was invisible to the old
  // element-only census, and each of these deviates from the house form in exactly one property.
  expect(glowSelectors, "a pseudo glow painting OVER the content is not the behind-the-content house layer").toContain("#over-content::before");
  expect(glowSelectors, "a decorative layer carrying its own fill is not a layer whose only job is the shadow").toContain("#decorated::before");
  expect(glowSelectors, "a layer that eats pointer events is an interaction defect wearing a glow").toContain("#grabby::before");
  // UNCHANGED — the element-level arm the structural test deliberately does not reach.
  expect(glowSelectors, "a glow on the element itself clobbers the focus ring; it was judged before and still is").toContain("#on-the-element");

  // SILENT — the house layered form on a legitimate carrier, and the owner effect axes.
  expect(glowSelectors, "the live `before:shadow-glow` discipline must not become a wall of false positives").not.toContain("#house::before");
  expect(glowSelectors, "chroma still gates the rule — an achromatic elevation shadow is not a glow tell").not.toContain("#neutral::before");
  expect(glowSelectors, "SANCTIONED_GLOW_SEL keeps exempting the owner effect carriers").not.toContain("#sanctioned-cell");
});

// A primary CTA the pointer rests on paints its hover glow during the rest walk. The rest census matches a
// hovered element's shadow against the resolved `--shadow-cta-glow` token, as the forced-state census does. A
// halo that differs from the token by one layer still fires, and so does the token painted at rest without hover.
const CTA_FIXTURE = `<style>
:root { --shadow-cta-glow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 0 0 1px rgba(240, 130, 60, 0.4), 0 0 18px rgba(240, 130, 60, 0.18); }
.cta { width: 160px; height: 40px; margin: 12px; }
#hovered-cta:hover { box-shadow: var(--shadow-cta-glow); }
#near-cta:hover { box-shadow: var(--shadow-cta-glow), 0 0 24px rgba(240, 130, 60, 0.5); }
#static-card { width: 240px; height: 80px; margin: 12px; box-shadow: var(--shadow-cta-glow); }
</style>`;

async function ctaRun(
  runSnap: ToolFixtures["runSnap"],
  scratch: string,
  name: string,
  page: { readonly body: string; readonly hover: readonly string[] },
): Promise<{ readonly stdout: string; readonly report: RelationalPopulationReport }> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(`${CTA_FIXTURE}${page.body}`));
  const res = await runSnap(["--file", join(scratch, `${name}.html`), ...page.hover, ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return { stdout: res.stdout, report: await readAuditReport(res.stdout) };
}

auditRuleTest(
  [
    {
      rule: "glow-shadow",
      kind: "silent",
      reason: "a rest-walk shadow equal to the resolved CTA glow token is the ratified hover treatment on a hovered call to action",
      disposition: { kind: "excluded", reason: "sanctionedGlowCarrier" },
    },
  ],
  "a hovered CTA's token glow is sanctioned in the rest glow census",
  async ({ runSnap, scratch }) => {
    const { report } = await ctaRun(runSnap, scratch, "rest-cta-glow", {
      body: '<button class="cta" id="hovered-cta">Start chat</button>',
      hover: ["--hover", "#hovered-cta"],
    });
    expect(report.populationAccounting?.["glow-shadow"]).toMatchObject({ affected: 0, excluded: { sanctionedGlowCarrier: 1 } });
    return report;
  },
);

auditRuleTest(
  [{ rule: "glow-shadow", kind: "fires", reason: "a halo one layer past the token is a hand-spelled glow, not the ratified CTA treatment" }],
  "a near-miss of the CTA glow token still fires in the rest glow census",
  async ({ runSnap, scratch }) => {
    const { stdout } = await ctaRun(runSnap, scratch, "rest-cta-near", {
      body: '<button class="cta" id="near-cta">Start chat</button>',
      hover: ["--hover", "#near-cta"],
    });
    expect(findingSelectors(stdout, "glow-shadow")).toEqual(["#near-cta"]);
  },
);

auditRuleTest(
  [{ rule: "glow-shadow", kind: "fires", reason: "the token is ratified for hover only, so a card painting it at rest is a stray glow" }],
  "the CTA glow token painted at rest without hover still fires",
  async ({ runSnap, scratch }) => {
    const { stdout } = await ctaRun(runSnap, scratch, "rest-cta-static", { body: '<div id="static-card">A card that glows at rest</div>', hover: [] });
    expect(findingSelectors(stdout, "glow-shadow")).toEqual(["#static-card"]);
  },
);
