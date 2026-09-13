// Gate: css-family-ownership-health — the INSTRUMENT half of the six-home declaration wall. Every ownership
// verdict its twin reports rests on a census, and a census that read nothing is not a clean tree.
//
// FAMILY `css-hook-provenance`, identical to `css-family-ownership`'s. THE SPLIT IS AUTHORITY (guide §2): a
// blind sheet, a `@theme` block that resolved no direct declaration, or an incomplete runtime-writer
// seam concerns the MEASUREMENT. No author absolves one, and none has an authored marker coordinate.
//
// THE THREE ARMS THE §5b AUDIT MEASURED UNREACHED, and what changed. `zero-declarations` (cut f02) and
// `zero-theme-values` (cut f03) were reached by ZERO committed proof rows, and `reportClosedSeamDrift`
// (cut f07) by none either — positive control f05 fired 49 of 49, so those zeros were measurements. Each
// now carries a `mustFlag` that dies without it, which is what §4.1 asks and what the retirement commit's
// "costs nothing in instrument health" claim rested on without proving.
//
// THE COUNT RATCHETS ARE ALL GONE, AND THE SEAM ARM ASSERTS NO CARDINALITY AT ALL. `EXPECTED_RUNTIME_WRITERS`
// and `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` were bare current-population literals §12.5 bans, reached by no
// row (cut f08: `12 → 13` killed nothing); the direct-skin EXEMPTION they wrapped moved to three 1:1 reviewed
// grants with central liveness (`gates/css-family-direct-client-mechanism.ts`), which restores the staleness
// half a count was doing.
//
// THIS PARAGRAPH ITSELF CLAIMED A DERIVATION FOR ONE LEG TOO LONG (#2305,
// `v-css-family-2026-09-13.md` ledger row 4). It said the three surviving seams were derived from declared
// vocabularies and stated "written exactly once"; only `density` was a genuine
// `DECLARED_SET.size * DECLARED_SET.size`, while `blur` and `colorization` multiplied a declared set by a
// LITERAL naming no vocabulary — so a third legitimate `:root` carrier, changing nothing declared anywhere,
// reddened five rows. The arm now asks PRESENCE: every member of a seam's declared vocabulary must be
// written AT LEAST ONCE, occurrences are never counted, ADDITIONAL legitimate carriers are silent, and the
// finding names the member nothing writes. The additional-carrier mustPass carries THREE `:root`
// blur carriers deliberately — six declarations, against the retired `CLIENT_BLUR_FILL.size * 2` = four — so
// that it discriminates rather than merely illustrating; at two carriers it sat exactly ON the retired
// expectation and proved nothing. `mustFlag[3]`, `mustFlag[4]` and `mustFlag[5]` are the missing members of
// the three seams, one row each, because a sweep that pins two of three vocabularies and generalises is a
// sample rather than a measurement.
//
// #2230 ARM B: generated theme byte identity is held by ledgers:fresh through the same emitter as
// tokens:build. The copied declaration count and its coupled fixtures are retired.
//
// POPULATION PORT: `{ of: "none" }`. Unlike its twin this policy reads no TypeScript — the census, the
// namespace and seam completeness are all questions about the five-home CSS identity. Legacy sha
// `1692583d6`; the legacy `existsSync(package.json)` real-tree anchor retires with the walk it guarded.
//
// WHERE A BROKEN RESOURCE REFUSES — not here (`mustRefuse[0]`).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `css-family-ownership` descriptor at 5545f9ccf12c19cdeafe81d41378ce7eb511e6ee, the parent of the conversion
// `9104f718f`; this module did not exist there, so it is measured against the module it was carved from,
// `css-family-ownership` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `1692583d6` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,567 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness — no `scanRoot` — dispatched 7,567, and the final
// `population` admits 0; the subject is the declared `product-css`. legacy − final = all 7,567 harness candidates —
// dispatched to the legacy `run`, which read none of them (its subject came off disk through `readCensus(ctx.root)`
// (`existsSync`/`readFileSync` of the CSS homes)); retired with that read. final − legacy = ∅. Controls: the legacy
// side is non-empty and the final side is empty by declaration, so equality cannot pass vacuously; outside
// `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import { CLIENT_GLOBALS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
import { defineGate } from "../contract/policy.ts";
import { reportCssFamilyHealth } from "../lib/css-family-policy.ts";
import { BLUR_SEAM_COMPLETE, CLIENT_SEAMS_COMPLETE, COLORIZATION_SEAM_COMPLETE, HEALTHY_HOMES, THEME_FAMILIES } from "../lib/css-family-proof-fixtures.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MESSAGE =
  "the six-home CSS census is BLIND, or a runtime writer seam is incomplete — every ownership verdict resting on it is vacuous (tooling/src/verify/gates/css-family-ownership-health.ts)";

export const gate = defineGate({
  id: "css-family-ownership-health",
  family: "css-hook-provenance",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the five-home product CSS identity is a closed ResourceHost fact; this policy judges no TypeScript source" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "product-css" }],
  message: MESSAGE,
  create: (ctx) => ({
    evaluate: () => {
      const inventory = readyResourceValue(ctx.resources.cssInventory("product"));
      const sheets = reportCssFamilyHealth({
        inventory,
        report: (file, details) => {
          ctx.report.file(file, details);
        },
      });
      // The denominator is the SHEET COUNT, never the declaration census: `receiptFailures` reds on
      // `members === 0`, so receipting a census this policy exists to report as EMPTY would turn its own
      // finding into a tool error (§12.3, one layer out from the fact-provider rule).
      ctx.receipt({ kind: "population", source: `css-family-ownership-health [declarations=${String(inventory.declarations.length)}]`, members: sheets });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [SHELL]: "/* a sheet the parser reads as empty */\n" },
      expect: { count: 1, line: 1, messageIncludes: "ZERO declaration census" },
      why: "THE BLINDNESS ARM the §5b audit measured UNREACHED (cut f02, throw probe, 0 rows died against a 49/49 positive control). A present sheet the parser resolves to no declaration makes every ownership verdict about that home vacuous, and this is the first row that reaches the branch",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [THEME]: ":root { color-scheme: dark; }\n" },
      expect: { count: 1, messageIncludes: "ZERO direct declarations" },
      why: "THE SECOND UNREACHED ARM (cut f03). A theme.css with no `@theme` block at all resolves no generated namespace, so token-family ownership cannot be derived.",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [THEME]: "@theme { color-scheme: dark; }\n:root { --color-probe: black; }\n" },
      expect: { count: 1, messageIncludes: "ZERO direct declarations" },
      why: "neither a non-custom declaration inside @theme nor a custom property outside it mints a generated namespace; both parser fences must hold before seam coverage is meaningful",
    },
    {
      mode: "resource",
      files: {
        ...HEALTHY_HOMES,
        [TIERS]:
          '[data-surface-tier="base"] { color: red; }\n[data-density="compact"] { --spacing-field: 0.25rem; --spacing-row: 0.375rem; --spacing-block: 0.5rem; --spacing-section: 1rem; }\n',
      },
      expect: { count: 4, messageIncludes: 'runtime writer seam density never writes [data-density="comfortable"]' },
      why: "THE THIRD UNREACHED ARM (cut f07: `reportClosedSeamDrift` was reached by zero rows; cut f08: moving a count killed nothing). One density arm without its symmetric counterpart leaves FOUR of the eight declared `(selector, intent)` pairs unwritten, and the arm names each one — a coverage claim over `DENSITY_SELECTORS × DENSITY_SPACING`, which is the cross-product of two declared sets and the only one of the three seams whose old cardinality was honestly derived",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [CLIENT_GLOBALS]: `:root { --blur-fill-chrome: 1px; }\n${COLORIZATION_SEAM_COMPLETE}` },
      expect: { count: 1, messageIncludes: "runtime writer seam blur never writes --blur-fill-dense" },
      why: "the reduced-transparency seam is incomplete on its own axis while density is whole — two seams, two independent verdicts, and the arm names the MEMBER rather than a total, which is what makes a per-member message the discriminator",
    },
    {
      mode: "resource",
      files: {
        ...HEALTHY_HOMES,
        [CLIENT_GLOBALS]: `${BLUR_SEAM_COMPLETE}[data-theme-colorization] { --color-border: color-mix(in oklab, black, white); }\n`,
      },
      expect: { count: 1, messageIncludes: "runtime writer seam colorization never writes --color-sidebar-border" },
      why:
        "THE THIRD SEAM'S MEMBER SET, and it had NO ROW AT ALL until #2305 " +
        "(`v-css-unit-2-2026-09-13.md` ledger row 1). Density is held by `mustFlag[3]` and blur by " +
        "`mustFlag[4]`; colorization was held by nothing, so EMPTYING its declared vocabulary — silently " +
        "disabling that seam's entire catch — was invisible to every declared row: cut b06 killed ZERO rows " +
        "before this one existed and kills exactly THIS ONE now, while a BOGUS EXTRA member (cut b07) reds " +
        "ELEVEN — five mustFlag by one finding each and all six mustPass — which is how we know the arm ran " +
        "all along. The blur seam measures identically (b04: 1 row, b05: 11), which is what makes the pair a " +
        "measurement rather than a coincidence. " +
        "That is the §4.1 class the whole leg existed to close, one seam short of closed: a sweep that cuts " +
        "two of three member sets and generalises is a sample, not a measurement. Here the carrier writes " +
        "`--color-border` and not `--color-sidebar-border`, so exactly one declared member is uncovered and " +
        "the arm names it",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [THEME]: "@theme { --color-probe: black; --blur-probe: 1px; --spacing-probe: 1px; }\n" },
      why: "all runtime seam namespaces are measurable without matching a current token count; generator byte identity is enforced by baseline theme-css --check and ledgers:fresh",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES },
      why: "the complete healthy shape: five non-empty homes, a `@theme` block minting the runtime seam namespaces, and every declared runtime-writer seam written in full. The instrument says nothing",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [CLIENT_GLOBALS]: `${CLIENT_SEAMS_COMPLETE}.scroll-fade-x { --fade-start-stop: 0%; }\n` },
      why: "THE RETIRED COUNT'S SURVIVING HALF: a local fade stop is still a sanctioned runtime writer and still acquits. What died with `fade: 12` is the CARDINALITY, so a corpus with one fade stop rather than twelve is silent where the legacy ratchet reddened",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [UI_GLOBALS]: "@media (min-width: 40rem) {\n  :root { --probe: 1; }\n}\n" },
      why: "A DECLARED CORRECTION, pinned. The retired reader counted at-rule-body declarations for theme.css ALONE, so a home whose only declarations sit inside a `@media` block counted ZERO and would have tripped the blindness arm. The shared parser counts them everywhere; this row is the fixture that would have been a false positive",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [THEME]: `${THEME_FAMILIES}:root {\n  --extra-probe: 0;\n}\n` },
      why: "a custom property outside @theme leaves the existing generated namespace measurable; the empty-namespace mustFlag row independently holds the at-rule fence",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [THEME]: THEME_FAMILIES.replace("\n}\n", "\n  color-scheme: dark;\n}\n") },
      why: "a non-custom declaration inside @theme leaves its existing custom-property namespace measurable; the empty-namespace mustFlag row independently holds the custom-property fence",
    },
    {
      mode: "resource",
      files: {
        ...HEALTHY_HOMES,
        [CLIENT_GLOBALS]:
          `${CLIENT_SEAMS_COMPLETE}:root { --blur-fill-chrome: 2px; --blur-fill-dense: 2px; }\n` +
          ":root { --blur-fill-chrome: 3px; --blur-fill-dense: 3px; }\n",
      },
      why:
        "THE COUNT-RATCHET DISCRIMINATOR, and its ARITHMETIC IS THE POINT (#2305, " +
        "`v-css-unit-2-2026-09-13.md` ledger row 2). `CLIENT_BLUR_FILL.size` is 2, so the retired " +
        "expectation was `size * 2` = FOUR DECLARATIONS, and the retired arm was " +
        "`if (actual !== expected) report(…)`. `BLUR_SEAM_COMPLETE` ships ONE carrier writing 2 " +
        "declarations, so this row must reach THREE carriers / SIX declarations to sit on the wrong side of " +
        "that comparison — TWO carriers is exactly 4 and `4 !== 4` is false, which is why the earlier " +
        "version of this row was SILENT under the very ratchet its `why` said it stopped. MEASURED, by " +
        "re-introducing that arm beside the coverage loop in a scratch copy: this row reds with `matched 6 " +
        "… requires exactly 4` while every other mustPass reds with `matched 2` (the healthy fixtures ship " +
        "one carrier), so at two carriers this would be the ONE row the returning ratchet left silent. " +
        "(The transplanted " +
        "control had reddened five rows only because `BLUR_SEAM_COMPLETE` then carried two carriers; the " +
        "same commit shrank it to one and took the discrimination with it.) At six declarations the retired " +
        "arm reports `matched 6 … requires exactly 4`, and under COVERAGE this row is SILENT because every " +
        "declared member is still written and occurrences are never counted. A `SET.size * <literal>` " +
        "expectation is a current-population count however it is spelled, and THIS shape is what stops one " +
        "coming back",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { [THEME]: THEME_FAMILIES, [UI_GLOBALS]: ":root { --probe: 0; }\n" },
      expect: { messageIncludes: "product-css" },
      why: "three of the five homes absent: the identity REFUSES at the population phase and withholds this owner, rather than the completeness fence quietly skipping every arm — which is what `fullHomeSet` did when the walk could not find a sheet",
    },
  ],
});
