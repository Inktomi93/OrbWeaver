// Policy: density-tier-slot-map — the two halves of "the tier map keys on slots the PRIMITIVES emit"
// (UI-Density-Law.md §4.2/§5.1 arm A6, the S2 sweep), split out of the legacy `density-tier` descriptor at
// its 2026-09-13 conversion because they differ on AUTHORITY from the occurrence policy: this arm is `hard`
// and born sealed, where `density-tier` is `reviewed-grant`.
//
//   A6a ROGUE STAMP — a tier-MAPPED `data-slot` name stamped outside `packages/ui/src/`. The element would
//      silently inherit tier padding and type without going through the primitive that owns the slot.
//   A6b MAPPED-BUT-DEAD — a slot `tiers.css` maps that NO file under `packages/ui/src/` emits. A stylesheet
//      that reads as load-bearing while it paints nothing.
//
// WHY THE VOCABULARY IS READ AND NEVER LISTED. The mapped-slot set is parsed out of `tiers.css` itself, so
// this policy can never police a stale copy of the map. The legacy descriptor did that with its own
// `existsSync`/`readFileSync` plus a hand-rolled `[data-slot="…"]` regex over comment-blanked text; the
// conversion moves the read to the declared `product-css` resource, whose `CssFacts.selectorHooks` publishes
// the same `data-slot` identities with positions — and whose parser blanks comments BEFORE parsing, so the
// header's illustrative `[data-slot="…"]` selectors are still not rules. The comment fence is therefore
// preserved by the shared reader rather than by a private blanker, and the `mustPass` row below pins it.
// `product-css` is the SMALLEST CLOSED resource id carrying `tiers.css`: it is `TIERS` in
// `contract/css-family.ts`, one of the five product stylesheets, which is why this conversion needed no new
// ResourceHost kind (standing law §4 — the vocabulary stays closed).
//
// FAMILY `density-tier` — the shared canonical CALLABLE is `lib/density-tier.ts#jsxAttributeLiterals`,
// reached from this policy's `evaluate` for the `data-slot` stamps and from `density-tier`'s `visitFile` for
// the `data-surface-tier` stamps; the shared canonical DECLARATION is `UI_SOURCE_ROOT`, the primitive tier
// both this policy and the occurrence twin reach. The mapped-slot reader itself
// (`mappedSlots`) is this policy's alone and does not establish the family.
//
// EXECUTION is `entire-population` and it is not a convenience: A6b asks whether ANY ui file emits a slot,
// which a selected-files subset answers wrongly by construction — the emitter routinely sits in a file the
// narrowed run never loaded. A6a rides the same mode rather than being split a third time, because the
// mapped vocabulary both arms judge is one read and the verdict is one question about the map.
//
// LEGACY SHA: the conversion parent is `4791ef15dc813861a7aa5362a6311e36b2671272`, where both arms lived in
// `gates/density-tier.ts` (A6a in `visitFile`, A6b in `finalize` guarded on `scope.kind === "project"`).
// That guard IS this policy's `entire-population` declaration, now made by the runtime rather than by hand.
//
// ONE CLASSIFIED ANCHOR MOVE. Legacy A6b reported `{ file: tiers.css, line, column: 0 }` — deliberately 0,
// because a stylesheet line from a text scan has no intra-line token. The final runtime refuses a column
// below 1 (`lib/gate-authority.ts` `invalid-finding-coordinate`), so the coordinate is `column: 1` and the
// message still states that the rule, not a token, is the subject. No other finding moved.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standing law §2.1, 2026-09-13, lane p-convert-density-tier).
// INHERITED from the occurrence twin rather than ported: this half had no population of its own. Legacy
// `scanRoot: (p) => p.includes("packages/client/src/") || p.includes("packages/ui/src/")` becomes
// `["@client", "@ui"]`. Over the SAME 7,704 harness candidates at `4791ef15d`, legacy admits 1,687 and final
// admits 1,687; legacy − final = ∅, final − legacy = ∅. Controls: inside
// `packages/client/src/features/__dtlane_in/probe.tsx` (virtual) admitted by both; outside
// `packages/contracts/src/__dtlane_out/probe.ts` (virtual) rejected by both. The CSS side is not a source
// population at all: `tiers.css` arrives through the declared resource, which is exactly the read the legacy
// module performed with `node:fs` behind the descriptor's back.
import type { Node, SourceFile } from "ts-morph";
import { TIERS } from "../contract/css-family.ts";
import { defineGate } from "../contract/policy.ts";
import { CLEAN_PRODUCT_CSS } from "../lib/css-family-proof-fixtures.ts";
import { jsxAttributeLiterals, mappedSlots, UI_SOURCE_ROOT } from "../lib/density-tier.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MESSAGE =
  "the tier SLOT MAP and the primitives that emit its slots disagree (docs/law/UI-Density-Law.md " +
  "§4.2/§5.1 arm A6): either a tier-mapped `data-slot` name is stamped outside packages/ui/src/ — it would " +
  "inherit tier padding and type without the primitive that owns the slot — or packages/ui/src/styles/tiers.css " +
  "maps a slot no file under packages/ui/src/ emits, a mapped-but-dead rule that paints nothing while the " +
  "stylesheet reads as load-bearing.";

const FIX =
  "compose the @orb/ui primitive that owns a mapped slot instead of hand-stamping its data-slot name; or, for " +
  "a mapped-but-dead rule, emit the slot from the primitive that owns it or drop the rule from tiers.css. " +
  "Born sealed: there is no waiver and no grant — two writers of one slot name are two disagreeing density maps.";

const SLOT_ATTRIBUTE = "data-slot";
/** The CLEAN fixture's tier sheet maps nothing, so a row that wants an arm to fire overrides this one home. */
const MAPPED_CARD_ROOT = '[data-surface-tier] [data-slot="card-root"] {\n  padding: var(--spacing-row);\n}\n';
const CARD_PRIMITIVE = "packages/ui/src/primitives/card/card.tsx";
const CARD_EMITTER = 'export const Card = (): unknown => <div data-slot="card-root" />;\n';

/** One admitted file's `data-slot` stamps, partitioned by the ONE thing that decides their meaning: a stamp
 *  inside `packages/ui/src/` EMITS the slot (the primitive owns it); a stamp anywhere else CONSUMES a name
 *  it does not own. Extracted from `evaluate` so the hook stays one readable loop over two collections. */
function slotStamps(
  sourceFile: SourceFile,
  rel: string,
  mappedNames: ReadonlySet<string>,
): { readonly emitted: readonly string[]; readonly rogue: readonly { readonly value: string; readonly node: Node }[] } {
  const stamps = jsxAttributeLiterals(sourceFile, SLOT_ATTRIBUTE);
  if (rel.startsWith(UI_SOURCE_ROOT)) {
    return { emitted: stamps.map(({ value }) => value), rogue: [] };
  }
  return { emitted: [], rogue: stamps.filter(({ value }) => mappedNames.has(value)) };
}

export const gate = defineGate({
  id: "density-tier-slot-map",
  family: "density-tier",
  authority: "hard",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "product-css" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const css = readyResourceValue(ctx.resources.cssInventory("product"));
      const mapped = mappedSlots(css);
      const mappedNames = new Set(mapped.map(({ slot }) => slot));
      const emitted = new Set<string>();
      for (const sourceFile of ctx.files) {
        const rel = ctx.relativePath(sourceFile);
        const stamps = slotStamps(sourceFile, rel, mappedNames);
        for (const value of stamps.emitted) {
          emitted.add(value);
        }
        for (const { value, node } of stamps.rogue) {
          // A6a. NODE-anchored: the finding sits on the attribute that stamps the mapped name.
          ctx.report.node(node, {
            message: `${MESSAGE} ROGUE STAMP: \`${SLOT_ATTRIBUTE}="${value}"\` is mapped by ${TIERS} but stamped at ${rel}, outside ${UI_SOURCE_ROOT}.`,
          });
        }
      }
      for (const { slot, file, line } of mapped) {
        if (emitted.has(slot)) {
          continue;
        }
        // A6b. The anchor is the mapped RULE's own coordinate in the declared resource. `column: 1` rather
        // than the legacy `0` — see the header's classified anchor move; there is no intra-line token here.
        ctx.report.file(file, {
          line,
          column: 1,
          message: `${MESSAGE} MAPPED-BUT-DEAD: ${file} maps [${SLOT_ATTRIBUTE}="${slot}"] but no file under ${UI_SOURCE_ROOT} emits that slot.`,
        });
      }
      ctx.receipt({ kind: "population", source: `density-tier-slot-map [mapped=${String(mapped.length)}]`, members: ctx.files.length + css.files.length });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        ...CLEAN_PRODUCT_CSS,
        [TIERS]: MAPPED_CARD_ROOT,
        [CARD_PRIMITIVE]: CARD_EMITTER,
        "packages/client/src/features/x/rogue-slot.tsx": 'export const G = <div data-slot="card-root" />;\n',
      },
      expect: { count: 1, messageIncludes: "ROGUE STAMP" },
      why: "A6a, carried from the legacy descriptor: a FEATURE stamping a MAPPED slot name. The ui primitive emits the same slot in this fixture, so the mapped-but-dead arm is silent and the count is exactly this arm's",
    },
    {
      mode: "resource",
      files: {
        ...CLEAN_PRODUCT_CSS,
        [TIERS]: `/* [data-slot="card-root"] in a comment is NOT a mapping */\n[data-surface-tier] [data-slot="ghost-slot"] {\n  padding: var(--spacing-row);\n}\n`,
        [CARD_PRIMITIVE]: CARD_EMITTER,
      },
      expect: { count: 1, messageIncludes: "MAPPED-BUT-DEAD" },
      why: "A6b, carried from the legacy descriptor: the map keys on a slot no primitive emits. THE COMMENTED `card-root` IS THE OTHER HALF OF THIS ROW — it proves comments are not rules, because a parser that read it would find `card-root` mapped AND emitted and the count would still be 1 while the fence was gone. The ui file emitting `card-root` is what makes the commented mapping's absence observable: two findings would mean the comment was parsed",
    },
    {
      mode: "resource",
      files: {
        ...CLEAN_PRODUCT_CSS,
        [TIERS]: MAPPED_CARD_ROOT,
        "packages/client/src/features/x/rogue-slot.tsx": 'export const G = <div data-slot="card-root" />;\n',
      },
      expect: { count: 2, messageIncludes: "MAPPED-BUT-DEAD" },
      why: "THE INVENTED ROW for the arms' INDEPENDENCE: a feature stamp does NOT count as an emitter. With no ui file emitting `card-root`, the same fixture fires BOTH arms — rogue stamp and mapped-but-dead — which is the property the `inUi` fence carries. Delete that fence and this row drops to one finding. Planted-break receipt in the family test",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...CLEAN_PRODUCT_CSS,
        [TIERS]: MAPPED_CARD_ROOT,
        [CARD_PRIMITIVE]: CARD_EMITTER,
        "packages/client/src/features/x/uses-card.tsx": 'export const G = <div data-slot="feature-own-slot" />;\n',
      },
      why: "A6 both ways, carried from legacy: the mapped slot IS emitted by its ui primitive, and a FEATURE's own UNMAPPED slot name is none of the map's business",
    },
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, "packages/client/src/features/x/probe.tsx": 'export const G = <div data-slot="anything" />;\n' },
      why: "the clean tier sheet maps NO slot at all — an empty mapped vocabulary accuses nothing in either direction, which is the null case the two arms must not invent findings from",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { "packages/client/src/features/x/probe.tsx": "export const G = null;\n" },
      expect: { messageIncludes: "product-css" },
      why: "the declared resource is absent, so the mapped vocabulary is unknown: the owner is WITHHELD rather than reporting a clean tree. A missing map that read as zero mapped slots would silently acquit every rogue stamp on the tree",
    },
  ],
});
