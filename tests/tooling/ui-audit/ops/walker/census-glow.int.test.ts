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
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

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

test("the glow census sweeps pseudo layers, exempting the house discipline and judging every deviation from it", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "pseudo-glow.html"), relationalDocument(GLOW_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "pseudo-glow.html"), "--fail-on", "P3", ...AUDIT_ARGV], {
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
