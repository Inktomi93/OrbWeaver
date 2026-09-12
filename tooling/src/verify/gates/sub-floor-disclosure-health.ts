// Policy: sub-floor-disclosure-health — the §4.6 VOCABULARY TRIPWIRE for `sub-floor-disclosure`: the
// collapsible variants home must still DECLARE both size arms (`text`, the sub-floor opt-out the occurrence
// policy judges, and `control`, the default #884 C2 inverted to). A home that stops declaring an arm leaves
// the occurrence policy judging a dead vocabulary; this policy reds it instead of letting that read as clean.
// Split from the legacy descriptor (guide §12.6, #1950) because this is a whole-tree HARD verdict about ONE
// file, while the occurrence arm is a per-file ordinary one — one authority per policy.
//
// FAMILY `sub-floor-disclosure` — the shared reader is `lib/collapsible-size-vocabulary.ts` (`SUB_FLOOR_ARM`,
// `FLOOR_ARM`, `COLLAPSIBLE_VARIANTS_HOME`): the arms this policy proves declared are exactly the arms the
// occurrence policy judges.
//
// THE POPULATION IS THE HOME, EXACTLY (`under` names the one file): an ABSENT home admits nothing and the
// runtime refuses at the population phase — louder than the legacy's silent skip — and `entire-population`
// defers a narrowed request that does not carry it (pinned in the family test). The arms are read as
// PROPERTY ASSIGNMENTS through the kind-indexed walk, so a comment listing the deleted arms cannot keep the
// home healthy by construction; the legacy blanked comments out of a text scan to get the same answer.
//
// THE ANCHOR MOVE (§4.6): the legacy reported on line 1 of the GATE MODULE ITSELF; the finding now anchors
// on the variants home, which is the subject and the only file in the population.
//
// Legacy descriptor: `4e1bdb87e` (`tooling/src/verify/gates/sub-floor-disclosure.ts`, arm C).
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { COLLAPSIBLE_VARIANTS_HOME, FLOOR_ARM, SUB_FLOOR_ARM } from "../lib/collapsible-size-vocabulary.ts";

const ARMS: readonly string[] = [SUB_FLOOR_ARM, FLOOR_ARM];

const MESSAGE =
  `a collapsible size arm is no longer declared in ${COLLAPSIBLE_VARIANTS_HOME} — the vocabulary sub-floor-disclosure judges ` +
  "(`text` the sub-floor opt-out, `control` the floor default) rotted; re-derive it in lib/collapsible-size-vocabulary.ts or restore the arm.";

export const gate = defineGate({
  id: "sub-floor-disclosure-health",
  family: "sub-floor-disclosure",
  authority: "hard",
  severity: "error",
  population: { in: ["@ui"], under: [COLLAPSIBLE_VARIANTS_HOME] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "Restore the missing size arm in packages/ui/src/primitives/collapsible/variants.ts, or re-derive the vocabulary in lib/collapsible-size-vocabulary.ts if the arms were deliberately renamed.",
  create: (ctx) => {
    const declared = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment],
          visit: (node) => {
            if (Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) {
              declared.add(node.getName());
            }
          },
        },
      ],
      evaluate: () => {
        for (const arm of ARMS) {
          if (!declared.has(arm)) {
            ctx.report.file(COLLAPSIBLE_VARIANTS_HOME, {
              line: 1,
              column: 1,
              message: `collapsible size arm \`${arm}\` is no longer declared in ${COLLAPSIBLE_VARIANTS_HOME} — ${MESSAGE}`,
            });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        [COLLAPSIBLE_VARIANTS_HOME]: "// the text and control size arms used to be spelled here\nexport const collapsibleVariants = { size: { big: {} } };\n",
      },
      expect: { count: 2, line: 1 },
      why: "arm C as carried (§4.6): the declaring variants file lost BOTH size keys — two reds, never silent green; a comment listing the deleted arms cannot keep it healthy because a comment is not a property assignment",
    },
    {
      mode: "source",
      files: { [COLLAPSIBLE_VARIANTS_HOME]: "export const collapsibleVariants = { size: { text: {} } };\n" },
      expect: { count: 1, messageIncludes: "arm `control`" },
      why: "ONE arm gone is one red naming that arm — the floor default missing while the opt-out survives is the shape that would silently make every trigger sub-floor",
    },
    {
      mode: "source",
      files: { [COLLAPSIBLE_VARIANTS_HOME]: 'const text = "text";\nexport const collapsibleVariants = { size: { [text]: {}, control: {} } };\n' },
      expect: { count: 1, messageIncludes: "arm `text`" },
      why: "a COMPUTED key is not a declared arm: the vocabulary reader accepts the two authored property spellings (`text: …`, shorthand `text`) and nothing dynamic — the same literal-shape limit the occurrence policy carries",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { [COLLAPSIBLE_VARIANTS_HOME]: 'export const collapsibleVariants = { size: { text: {}, control: { trigger: "min-h-control-sm" } } };\n' },
      why: "both arms declared as property assignments — the live home's shape — keeps the tripwire quiet",
    },
    {
      mode: "source",
      files: { [COLLAPSIBLE_VARIANTS_HOME]: "const text = {};\nconst control = {};\nexport const collapsibleVariants = { size: { text, control } };\n" },
      why: "the SHORTHAND spelling declares the same arms — the reader admits both authored property shapes. Dropping ShorthandPropertyAssignment from the visitor reds this row",
    },
  ],
});
