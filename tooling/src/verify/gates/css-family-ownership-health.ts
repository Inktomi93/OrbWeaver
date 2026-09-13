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
// THE COUNT RATCHETS: FOUR RETIRED, THREE KEPT AND RE-READ. `EXPECTED_RUNTIME_WRITERS.fade = 12` and
// `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS`' three counts were bare current-population literals §12.5 bans and
// no row reached them (cut f08: `12 → 13` killed nothing); they are DELETED, and the direct-skin EXEMPTION
// they wrapped moved to three 1:1 reviewed grants with central liveness
// (`gates/css-family-direct-client-mechanism.ts`), which restores the staleness half a count was doing.
// The surviving three seams are DERIVED from the module's own declared vocabularies
// (`DENSITY_SPACING.size * DENSITY_SELECTORS.size` and its two siblings), so each states a COMPLETENESS
// property — "every declared seam × every declared selector is written exactly once" — that a legitimate
// vocabulary change updates on both sides at once. That is not a population count.
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
import { CLIENT_SEAMS_COMPLETE, COLORIZATION_SEAM_COMPLETE, HEALTHY_HOMES, THEME_AT_PARITY, THEME_ONE_SHORT } from "../lib/css-family-proof-fixtures.ts";
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
      expect: { count: 1, messageIncludes: "runtime writer seam density matched 4" },
      why: "THE THIRD UNREACHED ARM (cut f07: `reportClosedSeamDrift` was reached by zero rows; cut f08: moving a count killed nothing). One density arm without its symmetric counterpart writes 4 of the 8 declarations the DECLARED vocabulary requires — a completeness claim, not the population count that retired beside it",
    },
    {
      mode: "resource",
      files: { ...HEALTHY_HOMES, [CLIENT_GLOBALS]: `:root { --blur-fill-chrome: 1px; }\n${COLORIZATION_SEAM_COMPLETE}` },
      expect: { count: 1, messageIncludes: "runtime writer seam blur matched 1" },
      why: "the reduced-transparency seam is incomplete on its own axis while density is whole — two seams, two independent verdicts, which is what makes the per-seam message the discriminator rather than the count",
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
