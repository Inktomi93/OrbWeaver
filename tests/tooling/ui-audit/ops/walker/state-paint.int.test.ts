// Two-direction controls for the STATE-PAINT census: the
// escaped-selector fix (#24), the Base-UI attribute-forcing arm, its restore verification, and the
// state-gated glow reads — all driven through the real cli over real pages, because the mechanisms
// under test (CDP `forcePseudoState`, in-page setAttribute forcing, the pass-final release proof)
// have no pure-fixture form. Each fixture pins ONE property against its nearest legitimate twin.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

interface StatePaintReport {
  readonly findings: readonly { readonly rule: string; readonly selector: string; readonly value: string }[];
  readonly populationAccounting?: Readonly<
    Record<string, { readonly judged: number; readonly withheld: Readonly<Record<string, number>>; readonly excluded: Readonly<Record<string, number>> }>
  >;
  readonly hoverPass: { readonly outcome: { readonly kind: string }; readonly forceFailures: readonly string[] } | null;
}

/** `hover-*` rows of the RESULT machine line (cli.int.test.ts's token-split idiom). */
function hoverRow(stdout: string, key: string): string {
  const prefix = `hover-${key}=`;
  const token = stdout.split(/\s+/u).find((word) => word.startsWith(prefix));
  return token === undefined ? "ABSENT" : token.slice(prefix.length);
}

test("an escaped Tailwind class name no longer mangles the :hover strip — the pair is judged, not unparseable (#24)", async ({ runCli, scratch }) => {
  // `.dark\:hover\:bg-light:hover` carries `:hover` TWICE: once inside the escaped class NAME and
  // once as the real pseudo. The old strip removed both, minting a selector querySelectorAll throws
  // on — so this planted hover-only contrast defect was invisible and the whole population collapsed
  // to withheld(noHoverPaintUnproven), exit 2. RED-FIRST: on the pre-fix source this test fails on
  // every assertion below (unparseable=1, no finding, NO VERDICT).
  await writeFile(
    join(scratch, "escape-fix.html"),
    relationalDocument(`<style>
  .dark\\:hover\\:bg-light { display: inline-block; padding: 14px 18px; color: #ffffff; background: #101010; }
  .dark\\:hover\\:bg-light:hover { color: #d2d2d2; background: #ffffff; }
</style>
<a class="dark:hover:bg-light" href="#">Continue the story</a>
<p style="padding:12px">a paragraph no state rule touches</p>`),
  );
  const res = await runCli("snap", ["--file", join(scratch, "escape-fix.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as StatePaintReport;
  const row = report.populationAccounting?.["hover-contrast"];

  expect(hoverRow(res.stdout, "selectors-unparseable")).toBe("0");
  expect(report.findings.filter(({ rule }) => rule === "hover-contrast")).toHaveLength(1);
  // The population is PROVEN again: the untouched paragraph is a stated exclusion, not an unproven one.
  expect(row?.excluded["noHoverPaint"]).toBeGreaterThan(0);
  expect(row?.withheld["noHoverPaintUnproven"]).toBeUndefined();
  await expect(res).toExitWith(1);
});

test("the attribute census forces Base-UI state paint: a failing pair fires, the twin is judged silent, rest-lit state is excluded", async ({
  runCli,
  scratch,
}) => {
  // Base UI expresses interaction state as data-* attributes, never :hover — before this census the
  // pass published excluded(noHoverPaint) for every one of these, a FALSE measurement claim.
  // RED-FIRST: on the pre-fix source no hover-contrast finding exists on this page.
  await writeFile(
    join(scratch, "attr-census.html"),
    relationalDocument(`<style>
  .row { display: block; padding: 14px 18px; color: #ffffff; background: #101010; width: 240px; }
  .item[data-highlighted] { color: #d2d2d2; background: #ffffff; }
  .ok[data-highlighted] { color: #101010; background: #ffffff; }
  .cmd[data-selected="true"] { color: #cfcfcf; background: #fafafa; }
</style>
<div class="row item" id="fails">highlight makes me unreadable</div>
<div class="row ok" id="passes">highlight keeps me legible</div>
<div class="row item" id="lit" data-highlighted>already highlighted at rest</div>
<div class="row cmd" id="valued">the cmdk valued form</div>
<p style="padding:12px">a paragraph no state rule touches</p>`),
  );
  const res = await runCli("snap", ["--file", join(scratch, "attr-census.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as StatePaintReport;
  const row = report.populationAccounting?.["hover-contrast"];
  const hover = report.findings.filter(({ rule }) => rule === "hover-contrast");

  // FIRES — presence form and the valued cmdk form, each naming its state so a reader reproduces it.
  expect(hover.map(({ selector }) => selector)).toContain("#fails");
  expect(hover.find(({ selector }) => selector === "#fails")?.value).toContain("under [data-highlighted]");
  expect(hover.map(({ selector }) => selector)).toContain("#valued");
  expect(hover.find(({ selector }) => selector === "#valued")?.value).toContain('under [data-selected="true"]');
  // SILENT but JUDGED — the twin really was forced and measured.
  expect(hover.map(({ selector }) => selector)).not.toContain("#passes");
  expect(row?.judged).toBeGreaterThanOrEqual(3);
  // The rest-lit row's state paint is live and owned by the rest families — a measured exclusion.
  expect(row?.excluded["alreadyInState"]).toBeGreaterThan(0);
  expect(row?.excluded["noHoverPaint"]).toBeGreaterThan(0);
  // The in-page force gave every attribute back (the release proof covers both mechanisms).
  expect(hoverRow(res.stdout, "not-restored")).toBe("0");
  expect(res.stdout).toContain("STATE-PAINT");
  expect(report.hoverPass?.forceFailures).toEqual([]);
  await expect(res).toExitWith(1);
});

test("a listener re-arming the forced attribute is caught by the pass-final verify — the poisoned read is WITHHELD, never judged", async ({
  runCli,
  scratch,
}) => {
  // THE PLANTED POSITIVE CONTROL for the restore proof. The inline same-task restore check reads
  // clean here (the observer fires a microtask LATER), so if the pass-final verify were dropped this
  // page would publish a P1 from a state no interaction produces — the exact dead-join defect class
  // this pass's contract exists to prevent (samples-hover.ts, the `as number[]` history).
  await writeFile(
    join(scratch, "attr-stuck.html"),
    relationalDocument(`<style>
  .row { display: block; padding: 14px 18px; color: #ffffff; background: #101010; width: 240px; }
  .sticky[data-highlighted] { color: #d2d2d2; background: #ffffff; }
</style>
<div class="row sticky" id="stuck">my highlight never lets go</div>
<script>
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i += 1) {
      var target = records[i].target;
      if (!target.hasAttribute("data-highlighted")) target.setAttribute("data-highlighted", "");
    }
  }).observe(document.getElementById("stuck"), { attributes: true, attributeFilter: ["data-highlighted"] });
</script>`),
  );
  const res = await runCli("snap", ["--file", join(scratch, "attr-stuck.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as StatePaintReport;
  const row = report.populationAccounting?.["hover-contrast"];

  expect(Number(hoverRow(res.stdout, "not-restored"))).toBeGreaterThan(0);
  expect(row?.withheld["notRestored"]).toBeGreaterThan(0);
  // The read taken under the un-releasable state is withheld — no finding is published from it.
  expect(report.findings.filter(({ rule }) => rule === "hover-contrast")).toHaveLength(0);
  // A withheld candidate makes the run a NO VERDICT, exactly as a stuck :hover always has.
  await expect(res).toExitWith(2);
});

test("state-gated glow is read under force: a non-house layer under [data-selected] and an element :hover glow fire; the house form stays silent", async ({
  runCli,
  scratch,
}) => {
  // The glow doctrine (checks-decor.ts) sanctions the layered glow on selected/active carriers ONLY —
  // which means the paint it judges is gated behind exactly the states a static read never enters.
  // RED-FIRST: on the pre-fix source all three glows below are invisible (zero glow-shadow findings).
  await writeFile(
    join(scratch, "state-glow.html"),
    relationalDocument(`<style>
  :root { --shadow-cta-glow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 0 0 1px rgba(240, 130, 60, 0.4), 0 0 18px rgba(240, 130, 60, 0.18); }
  .gbox { position: relative; isolation: isolate; display: block; width: 220px; height: 60px; margin: 12px; border-radius: 12px; }
  .glayer[data-selected]::before { content: ""; position: absolute; inset: -1px; border-radius: 12px; pointer-events: none; }
  #gbad[data-selected]::before { z-index: 1; box-shadow: 0 0 18px rgba(240, 130, 60, 0.4); }
  #ghouse[data-selected]::before { z-index: -10; box-shadow: 0 0 18px rgba(240, 130, 60, 0.4); }
  #ghover:hover { box-shadow: 0 0 18px rgba(240, 130, 60, 0.4); }
  #gcta:hover { box-shadow: var(--shadow-cta-glow); }
  #gcta-near:hover { box-shadow: var(--shadow-cta-glow), 0 0 24px rgba(240, 130, 60, 0.5); }
  .curscope { --shadow-cta-glow: 0 0 18px currentColor; }
  #scopeA { color: rgb(240, 130, 60); }
  #scopeB { color: rgb(60, 130, 240); }
  .gcur:hover { box-shadow: var(--shadow-cta-glow); }
</style>
<div class="gbox glayer" id="gbad">glow painting over my content when selected</div>
<div class="gbox glayer" id="ghouse">the house layered glow when selected</div>
<div class="gbox" id="ghover">a hover glow on the element itself</div>
<div class="gbox" id="gcta">the token-exact CTA hover treatment</div>
<div class="gbox" id="gcta-near">the token PLUS a smuggled extra layer</div>
<div class="curscope" id="scopeA"><div class="gbox gcur" id="gcurA">token-exact under scope A</div></div>
<div class="curscope" id="scopeB"><div class="gbox gcur" id="gcurB">token-exact under scope B</div></div>`),
  );
  const res = await runCli("snap", ["--file", join(scratch, "state-glow.html"), "--fail-on", "P3", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as StatePaintReport;
  const glow = report.findings.filter(({ rule }) => rule === "glow-shadow").map(({ selector }) => selector);

  expect(glow, "a state-gated glow painting OVER content fires, with the state in the selector").toContain("#gbad[data-selected]::before");
  expect(glow, "an element-level glow reachable only under :hover fires through the CDP arm").toContain("#ghover:hover");
  expect(glow, "the house layered discipline stays sanctioned under the forced state").not.toContain("#ghouse[data-selected]::before");
  // The RATIFIED token-derivation exemption (owner 2026-09-01), both directions: a forced element
  // glow that EQUALS the resolved --shadow-cta-glow is the sanctioned CTA hover treatment; the same
  // token with one smuggled extra layer is a near-miss and still fires.
  expect(glow, "the token-exact CTA hover glow is the ratified idiom, not the glow tell").not.toContain("#gcta:hover");
  expect(glow, "a near-miss of the token — one extra layer — stays judged").toContain("#gcta-near:hover");
  // THE CACHE-GRANULARITY PIN (warm-leg F1): a currentColor-carrying token reads IDENTICAL raw text
  // under two colour scopes while resolving differently — the raw-keyed cache reused scope A's
  // serialization for scope B and FALSELY FIRED on whichever element resolved second. Per-element
  // resolution keeps both token-exact twins silent.
  expect(glow, "scope A's token-exact glow is exempt under per-element resolution").not.toContain("#gcurA:hover");
  expect(glow, "scope B's token-exact glow is exempt too — the cache must not reuse scope A's resolution").not.toContain("#gcurB:hover");
  expect(res.stdout).toContain("glow-state-rows=");
  await expect(res).toExitWith(1);
});
