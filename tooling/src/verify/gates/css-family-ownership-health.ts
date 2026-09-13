// Gate: css-family-ownership-health — the INSTRUMENT half of the six-home declaration wall. Every ownership
// verdict its twin reports rests on a census, and a census that read nothing is not a clean tree.
//
// FAMILY `css-hook-provenance`, identical to `css-family-ownership`'s. THE SPLIT IS AUTHORITY (guide §3): a
// blind sheet, a `@theme` block that resolved no direct declaration, a generated-output parity break and an
// incomplete runtime-writer seam are verdicts about the MEASUREMENT and the GENERATOR. No author absolves
// one, and none has an authored coordinate a marker could bind to.
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
// finding names the member nothing writes. `mustPass[5]` is the carrier row and it carries THREE `:root`
// blur carriers deliberately — six declarations, against the retired `CLIENT_BLUR_FILL.size * 2` = four — so
// that it discriminates rather than merely illustrating; at two carriers it sat exactly ON the retired
// expectation and proved nothing. `mustFlag[3]`, `mustFlag[4]` and `mustFlag[5]` are the missing members of
// the three seams, one row each, because a sweep that pins two of three vocabularies and generalises is a
// sample rather than a measurement.
//
// `EXPECTED_DIRECT_THEME_DECLARATIONS` IS READ, NEVER MOVED. Its disposition is owner-pending (#2230); the
// audit measured it DERIVABLE from `tokens.build.ts#renderThemeCss` and escalated whether a hand-copied
// literal earns the name "generated-output parity". What this conversion DOES close is the coupled site
// (audit ledger row 13): the two fixture spellings now DERIVE from the constant, so the number has one home.
//
// POPULATION PORT: `{ of: "none" }`. Unlike its twin this policy reads no TypeScript — the census, the
// parity arm and the seam completeness are all questions about the five-home CSS identity. Legacy sha
// `1692583d6`; the legacy `existsSync(package.json)` real-tree anchor retires with the walk it guarded.
//
// WHERE A BROKEN RESOURCE REFUSES — not here (`mustRefuse[0]`).
import { CLIENT_GLOBALS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
import { defineGate } from "../contract/policy.ts";
import { reportCssFamilyHealth } from "../lib/css-family-policy.ts";
import {
  BLUR_SEAM_COMPLETE,
  CLIENT_SEAMS_COMPLETE,
  COLORIZATION_SEAM_COMPLETE,
  HEALTHY_HOMES,
  THEME_AT_PARITY,
  THEME_ONE_SHORT,
} from "../lib/css-family-proof-fixtures.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MESSAGE =
  "the six-home CSS census is BLIND, or the generated output no longer matches its manifest — every ownership verdict resting on it is vacuous (tooling/src/verify/gates/css-family-ownership-health.ts)";

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
      expect: { count: 2, messageIncludes: "ZERO direct declarations" },
      why: "THE SECOND UNREACHED ARM (cut f03). A theme.css with no `@theme` block at all resolves no generated namespace, so token-family ownership cannot be derived. The count is 2 because the parity arm speaks about the same sheet in the same breath — which is exactly why both messages are disjoint",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [THEME]: THEME_ONE_SHORT },
      expect: { count: 1, messageIncludes: "the generated-output manifest expects" },
      why: "THE PARITY ARM, and its fixture is DERIVED from the constant rather than spelling it (audit ledger row 13, three homes for one number). One declaration short of the manifest reds; the row proves the arm BITES without becoming a fourth place the number is written",
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
      files: { ...HEALTHY_HOMES },
      why: "the complete healthy shape: five non-empty homes, a `@theme` block at exactly the manifest count, and every declared runtime-writer seam written in full. The instrument says nothing",
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
      files: { ...HEALTHY_HOMES, [THEME]: `${THEME_AT_PARITY}:root {\n  --extra-probe: 0;\n}\n` },
      why: "CUT f25: only declarations authored DIRECTLY in the `@theme` block count toward parity. A custom property in an ordinary style rule of the same sheet is not generated output, and without the at-rule fence this row reports 204 against a manifest of 203",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [THEME]: THEME_AT_PARITY.replace("\n}\n", "\n  color-scheme: dark;\n}\n") },
      why: "CUT f26: parity counts CUSTOM PROPERTIES, which is the predicate the retired hand parser implemented (`^\\s*(--[\\w-]+)\\s*:`) and the one the generator emits. A plain declaration inside the same block is not a token, and without the fence this row reports 204",
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
      files: { [THEME]: THEME_AT_PARITY, [UI_GLOBALS]: ":root { --probe: 0; }\n" },
      expect: { messageIncludes: "product-css" },
      why: "three of the five homes absent: the identity REFUSES at the population phase and withholds this owner, rather than the completeness fence quietly skipping every arm — which is what `fullHomeSet` did when the walk could not find a sheet",
    },
  ],
});
