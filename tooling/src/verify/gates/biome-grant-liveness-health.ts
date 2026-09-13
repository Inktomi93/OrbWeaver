// Policy: biome-grant-liveness-health — the §4.6 BLINDNESS TRIPWIRE for the biome half of the
// `grant-liveness` family. `biome.json` parsed, its overrides were read, and the exact/glob classifier
// derived ZERO file-exact grant rows from an anchor-sized config: either the overrides array is gone or the
// classifier has rotted past every row, so `biome-grant-liveness`'s ✓ means nothing and must not be printed
// as a clean result.
//
// WHY IT IS A SEPARATE POLICY, AND WHY IT IS `hard` (#2021). Its sibling is `authority: "reviewed-grant"`:
// its findings are licensable by an exact central row. This one's finding is a REFUSAL — "I could not
// measure" — and a refusal that can itself be suppressed is the accuser silenced by the thing it accuses.
// One authority per descriptor (§12.1), so the arms that differ on that axis are two policies under the
// IDENTICAL family. §12.3's "do not invent a `-health` sibling for a resource policy" is about a BROKEN
// resource, which no policy can observe because `resolveRuns` withholds its owner one phase earlier; this
// policy reports a condition derived from a fully READY resource, which it observes normally.
//
// THE OTHER THREE LEGACY TRIPWIRE ARMS ARE NOT HERE, and that is the runtime being stricter rather than the
// conversion dropping them: MISSING-CONFIG and UNPARSEABLE-CONFIG are a non-ready `json` resource and an
// empty tracked corpus is a non-ready `tracked-files` resource, and `resolveResourceDeclarations` throws on
// any of them — a population-phase TOOL ERROR (exit 2, "not a verdict"), which is louder than the finding
// each used to be. Pinned in `tests/tooling/verify/gates/biome-grant-liveness.int.test.ts`, because §4.5b's
// proof runtime has no "expect a tool error" arm.
//
// POPULATION PORT + LEGACY SHA (#2123). This module is NOT a port of its own descriptor — it has none. It
// is an ARM carved out of `biome-grant-liveness`'s legacy descriptor at
// `git show c97de9d2f:tooling/src/verify/gates/biome-grant-liveness.ts` (the parent of the conversion
// commit `97e68be91`), where the same condition was that descriptor's `MSG_NO_ROWS` arm. Its population is
// the sibling's minus the two declarations this arm does not read: `{ of: "none" }` plus `json:biome`, and
// nothing else, because counting rows needs neither the tracked corpus nor the config's line positions.
//
// FAMILY: `grant-liveness`. Reader: `lib/config-grant-rows.ts` `biomeGrantRows` — the SAME classifier its
// sibling reports through, which is the whole point: a tripwire that re-implemented the classifier would be
// measuring its own copy rather than the one that produced the ✓.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `biome-grant-liveness` descriptor at c97de9d2faeebb319b6195017905c1ccd91a8de0, the parent of the conversion
// `97e68be91`; this module did not exist there, so it is measured against the module it was carved from,
// `biome-grant-liveness` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over
// the 7,495 harness candidates at that tree the legacy `scanRoot: () => false` admits 0 and the final
// `population: { of: "none" }` admits 0, both by declaration: legacy − final = ∅, final − legacy = ∅. That equality
// is VACUOUS BY CONSTRUCTION — neither side ever had a TypeScript subject — and the subject comparison is the
// resource paragraph above (`json:biome`); no inside control exists to plant.
import { defineGate } from "../contract/policy.ts";
import { biomeGrantRows } from "../lib/config-grant-rows.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CONFIG_REL = "biome.json";

/** §4.5 real-tree ANCHOR in its rename-proof COUNT form: a real `biome.json` carries dozens of override
 *  include entries (68 at mint), a proof fixture plants a handful. Counted over ALL includes, never over the
 *  exact ones, so it can guard the very arm that judges the exact/glob classifier. */
const REAL_CONFIG_MIN_INCLUDES = 30;

const MESSAGE =
  "biome.json parsed but ZERO file-exact grant rows were derived from its overrides on an anchor-sized " +
  "config — either the overrides array is gone or the glob/exact classifier has rotted past every row, so " +
  "biome-grant-liveness is BLIND and its ✓ means nothing (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). " +
  "Re-derive the classifier in tooling/src/verify/lib/config-grant-rows.ts.";

/** `count` distinct glob entries — filler that clears the anchor while deriving zero exact rows. */
function globFiller(count: number): string {
  return Array.from({ length: count }, (_, index) => `"packages/p${String(index)}/**"`).join(", ");
}

/** A minimal one-override config carrying exactly the given raw `includes` entries. */
function overridesJson(entries: string): string {
  return `{\n  "overrides": [{ "includes": [${entries}], "linter": { "rules": {} } }]\n}\n`;
}

export const gate = defineGate({
  id: "biome-grant-liveness-health",
  family: "grant-liveness",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the lint config is a closed ResourceHost fact; this policy judges no TypeScript source" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "json", id: "biome" }],
  message: MESSAGE,
  create: (ctx) => ({
    evaluate: () => {
      const config = readyResourceValue(ctx.resources.json("biome"));
      // Line identity is the sibling's concern; this arm counts rows, so the position reader is inert here
      // rather than dragging a second resource declaration into a policy that does not anchor at a line.
      const rows = biomeGrantRows(config.value, () => 0, CONFIG_REL);
      if (rows.candidates >= REAL_CONFIG_MIN_INCLUDES && rows.exact.length === 0) {
        ctx.report.file(CONFIG_REL, { line: 1, column: 1 });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { "biome.json": overridesJson(globFiller(REAL_CONFIG_MIN_INCLUDES)) },
      // `count` alone, deliberately: this policy carries exactly ONE message, so a `messageIncludes` here
      // discriminates nothing and `policy-proof-expectations` reports it as debt (#1968).
      expect: { count: 1 },
      why: "zero derived rows on an anchor-sized config is 'I could not measure', never 'clean' — the classifier-rot tripwire, carried verbatim from the legacy descriptor's fifth arm",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { "biome.json": overridesJson(globFiller(REAL_CONFIG_MIN_INCLUDES - 1)) },
      why: "§4.1 NARROWING — the ANCHOR. A config BELOW the real-tree size derives zero exact rows too, and judging it would red every small fixture in the corpus; drop the `>= REAL_CONFIG_MIN_INCLUDES` test and this row reds.",
    },
    {
      mode: "resource",
      files: {
        "biome.json": overridesJson(`${globFiller(REAL_CONFIG_MIN_INCLUDES - 1)}, "packages/client/src/live.ts"`),
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      why: "the other direction — an anchor-sized config that DOES derive an exact row is silent, so the arm discriminates on the classifier's output rather than on the config's size",
    },
  ],
});
