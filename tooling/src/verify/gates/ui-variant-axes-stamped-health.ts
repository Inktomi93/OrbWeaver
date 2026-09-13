// Policy: ui-variant-axes-stamped-health — the §4.6 AXIS-VOCABULARY BLINDNESS TRIPWIRE for
// `ui-variant-axes-stamped` (arm A5 of the legacy mixed-hook descriptor). The recipe policy DERIVES its
// whole subject from the emitter's own `STAMPED_VARIANT_AXES` tuple and credits a recipe only when it
// reaches a `variantProps`/`variantAttrs` door. If that home stops yielding a readable tuple, or stops
// exporting the door, the derivation is empty and the recipe policy reports OK over every unstamped recipe
// on the tree. This policy reds that instead.
//
// Split from the legacy descriptor (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments", #1950). The ruled row says "hard recipe/duplicate/
// blindness policies"; A1/A2/A3 differ on no axis and stayed together, while THIS arm differs on
// POPULATION — its subject is exactly one file, and the others need the whole `@ui` corpus — which is the
// axis §3 says a split is owed on.
//
// FAMILY `ui-variant-axes-stamped` — the shared reader is `lib/variant-axis-stamp.ts` (`readStampedAxes`,
// `stampDoorPresent`): the vocabulary this policy proves READABLE is byte-for-byte the vocabulary its
// sibling judges against, so the tripwire cannot report healthy about a shape the recipe policy cannot read.
//
// POPULATION PORT: an INTENTIONAL correction, and it is the arm's mechanism. The legacy descriptor shared
// the recipe `scanRoot` (`packages/ui/src/`) and opted this arm into real runs only by testing
// `fileLoaded(ctx, "packages/ui/src/lib/class-merge.ts")` — a real-tree ANCHOR deliberately NOT the axis
// home, because the arm that reds when the axis home stops resolving could not be guarded on the axis home
// resolving. The final population IS the axis home, so an ABSENT home admits zero paths and the runtime
// REFUSES at the population phase (louder than the legacy's silent skip, pinned in the family test) and a
// narrowed request DEFERS the policy. `AXIS_ANCHOR_REL` and its `fileLoaded` call therefore RETIRE.
//
// THE ANCHOR MOVE (§4.6): the legacy finding was already a file finding on `variant-attrs.ts` at line 1,
// column 0; the final contract requires positive coordinates (`policy-pass-context.ts` `assertCoordinate`),
// so it is line 1, column 1 of the same file. No marker ever bound to it — the arm was non-suppressible by
// construction and the census measured ZERO live markers for this id.
//
// Legacy descriptor: `da01f7eb9` (`tooling/src/verify/gates/ui-variant-axes-stamped.ts`, arm A5).
import { defineGate } from "../contract/policy.ts";
import { AXIS_HOME_REL, AXIS_TUPLE_NAME, readStampedAxes, STAMP_DOOR, stampDoorPresent } from "../lib/variant-axis-stamp.ts";

const MESSAGE =
  `${AXIS_HOME_REL} no longer yields a readable \`${AXIS_TUPLE_NAME}\` tuple and a \`${STAMP_DOOR}\` function — ` +
  "`ui-variant-axes-stamped`'s whole subject derivation is empty, so it would report OK over every unstamped " +
  "recipe on the tree (#1080 F8: two authored arms of one primitive collapsing into ONE ui-audit decision).";
const TUPLE_ARM = "the axis tuple";
const DOOR_ARM = "the stamp door";

export const gate = defineGate({
  id: "ui-variant-axes-stamped-health",
  family: "ui-variant-axes-stamped",
  authority: "hard",
  severity: "error",
  population: { in: ["@ui"], under: [AXIS_HOME_REL] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: `Restore \`export const ${AXIS_TUPLE_NAME} = [...] as const;\` and \`export function ${STAMP_DOOR}(…)\` in ${AXIS_HOME_REL}, or re-point AXIS_HOME_REL / AXIS_TUPLE_NAME / STAMP_DOOR in tooling/src/verify/lib/variant-axis-stamp.ts at the seam's new home.`,
  create: (ctx) => ({
    evaluate: () => {
      // A CONSTANT denominator, never the census (§12.3): a receipt of the axis COUNT would make an emptied
      // tuple a receipt TOOL ERROR and the finding below could never be reached — the accuser silenced by
      // the very thing it accuses.
      ctx.receipt({ kind: "population", source: "variant-axis-home", members: 1, unresolved: 0 });
      const home = ctx.sourceFile(AXIS_HOME_REL);
      if (readStampedAxes(home).length === 0) {
        ctx.report.file(AXIS_HOME_REL, { line: 1, column: 1, message: `${MESSAGE} Missing: ${TUPLE_ARM}.` });
      }
      if (!stampDoorPresent(home)) {
        ctx.report.file(AXIS_HOME_REL, { line: 1, column: 1, message: `${MESSAGE} Missing: ${DOOR_ARM}.` });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { [AXIS_HOME_REL]: 'export const AXES = ["variant", "size"] as const;\nexport function variantProps(): string {\n  return "";\n}\n' },
      expect: { count: 1, line: 1, messageIncludes: "Missing: the axis tuple" },
      why: "arm A5 as carried, half one: the tuple is RENAMED, so the recipe policy's vocabulary derivation is empty and it would credit every unstamped recipe on the tree. Opening the tuple-name fence (accept any array const) turns this row GREEN — a tripwire's fences ACQUIT, so its falsifier is a mustFlag going green, not a mustPass going red (guide §6.1)",
    },
    {
      mode: "source",
      files: { [AXIS_HOME_REL]: 'export const STAMPED_VARIANT_AXES = [] as const;\nexport function variantProps(): string {\n  return "";\n}\n' },
      expect: { count: 1, line: 1, messageIncludes: "Missing: the axis tuple" },
      why: "half one again, through EMPTINESS rather than rename: an emptied tuple reads identically to an unreadable one, and both mean the same thing — nothing is judged. This is the shape a name-only check would call healthy",
    },
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]: 'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport const variantProps = attrsFactory();\n',
      },
      expect: { count: 1, line: 1, messageIncludes: "Missing: the stamp door" },
      why: "half TWO, and it is a SEPARATE finding with its own message: the vocabulary still reads but the home no longer declares the seam function, so no recipe can be credited and every one of them would flag. Deleting the `stampDoorPresent` call turns this row GREEN, and no other row discriminates it — the two halves are what make `count: 1` here meaningful rather than accidental",
    },
    {
      mode: "source",
      files: { [AXIS_HOME_REL]: "export const other = 1;\n" },
      expect: { count: 2, line: 1 },
      why: "BOTH halves gone — two findings, never one and never silence. This is the row that dies if the two arms are folded into a single early-returning branch",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\nexport function variantAttrs(): string {\n  return "";\n}\n',
      },
      why: "the live shape — the four-axis `as const` tuple plus the seam's own exported function — keeps the tripwire quiet",
    },
    {
      mode: "source",
      files: { [AXIS_HOME_REL]: 'export const STAMPED_VARIANT_AXES = ["variant"] as const;\nexport function variantProps(): string {\n  return "";\n}\n' },
      why: "ONE axis is still a readable vocabulary: this policy judges whether the derivation RESOLVES, never how many axes the owner chose — narrowing it to a fixed arity would make an owner ruling a gate verdict",
    },
  ],
});
