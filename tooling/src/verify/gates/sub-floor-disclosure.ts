// Policy: sub-floor-disclosure (#884 C2; docs/design/885-884-boundary-reservation-and-touch-floor.md §2).
// The collapsible trigger's default is `control` (the pointer-conditional `--spacing-control-sm` floor);
// `size="text"` is the SUB-FLOOR opt-out for a disclosure in running content, and every mount of it owes a
// reasoned waiver — the recurring defect this closes was the floor arm silently not taken (the this-chat
// 411×40 collapsible; #850's class).
//
// THE SPLIT (#1950): the legacy descriptor carried the per-file occurrence (arm A), a
// gate-owned two-sided marker grammar (`@sub-floor-ok`, arm B) and a whole-tree vocabulary tripwire (arm C).
// Arm A is this policy — ordinary, `selected-files`. Arm B RETIRES into the central `@orb-waive` engine:
// malformed, stale and over-broad markers are central reconciliation alarms, never a gate's own findings.
// Arm C is `sub-floor-disclosure-health` (hard, whole tree) in this family.
//
// FAMILY `sub-floor-disclosure` — the shared reader is `lib/collapsible-size-vocabulary.ts`
// (`subFloorSizeLiteral`, `SUB_FLOOR_ARM`, `FLOOR_ARM`, the variants home), so what counts as the opt-out
// here is exactly what the tripwire proves is still declared.
//
// THE REPORTED POSITION is the `"text"` STRING LITERAL of the `size` attribute — authored code, quotes
// included (the house convention), so the ordinary door is real: `@orb-waive sub-floor-disclosure("text")`.
// The legacy reported the attribute with a bare `text` token (§4.6 POSITION delta). The marker is a comment,
// but the FINDING is on the element, which is why this arm keeps ordinary authority (guide §2's third door
// class — a finding on comment TEXT — does not apply).
//
// POPULATION PORT: byte-identical — the legacy `scanRoot` admitted `packages/client/src/` and
// `packages/ui/src/`, which is `["@client", "@ui"]`. `tests/` was NEVER in the population (the retired
// roster row said otherwise; the code is the law): a story's `size="text"` is not judged.
//
// DECLARED LIMITS, each a `mustPass` row: a size reached through a VARIABLE is invisible (the literal-shape
// class every size gate shares); the tag is matched by NAME — a wrapped or re-exported trigger under another
// tag name is invisible, and the identity upgrade is deferred with its receipt: the tag resolves through the
// `@orb/ui` package door on the real tree and to nothing in the proof workspace, so an identity row would
// pass as `external-door` (guide §6.5) until an `@orb/ui` proof plant exists.
//
// MARKER CENSUS AT CONVERSION (§8.6): `@sub-floor-ok` had exactly 2 live marker-form sites —
// `packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx` (a `{/* */}` JSX carrier,
// translated in place: the engine binds a JSX comment to its one adjacent significant sibling) and
// `rpg-beat-row.tsx` (a `//` that sat in the element's leading trivia INSIDE `{open ? null : (…)}`, which the
// central engine judges AMBIGUOUS — any marker inside a JSX expression flanked by two authored siblings
// suppresses nothing — so it moved to the enclosing return statement's trivia, the nearest carrier that
// contains the finding). Both carry the legacy reason verbatim as
// `@orb-waive sub-floor-disclosure("text"): <reason>`; per file legacy 1 → current 1, total 2 = 2. Eight
// prose mentions of the retired spelling were re-worded in the same commit. The family test reads both real
// files off disk and proves 0 effective / 2 waived / 0 alarms.
//
// Legacy descriptor: `4e1bdb87e` (`tooling/src/verify/gates/sub-floor-disclosure.ts`).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `sub-floor-disclosure` descriptor at e2b183b809625973be3060bdca51755317d42f3c, the parent of the conversion
// `6563946a0` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `4e1bdb87e`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,450 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,685 and final `population` admits 1,685.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { subFloorSizeLiteral } from "../lib/collapsible-size-vocabulary.ts";

const MESSAGE =
  'a `size="text"` CollapsibleTrigger with no reasoned waiver — `text` is the SUB-FLOOR opt-out (no control ' +
  "box, no hit pseudo at all: pointer-variants.ts measured a 406×16 trigger whose centre elementFromPoint " +
  "could not resolve to it), and the defect class this policy closes is exactly the floor arm silently not " +
  "taken (#884 C2 inverted the default to `control`). A text-height disclosure is legitimate IN RUNNING " +
  "CONTENT — say so, at the site, in the waiver's reason.";
const FIX =
  "take the default (`control` — drop the size prop), or justify the sub-floor box with " +
  '`// @orb-waive sub-floor-disclosure("text"): <why this disclosure lives in running content>` in the ' +
  "trivia above the element (a `{/* … */}` immediately before it in JSX, or a `//` above the element or its " +
  '`size` attribute) — the position is the quoted literal `"text"`. One trigger is one finding.';

export const gate = defineGate({
  id: "sub-floor-disclosure",
  family: "sub-floor-disclosure",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
        visit: (node) => {
          if (!(Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node))) {
            return;
          }
          const literal = subFloorSizeLiteral(node);
          if (literal !== undefined) {
            ctx.report.node(literal);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/a/unmarked.tsx": 'export const G = <CollapsibleTrigger size="text">Advanced</CollapsibleTrigger>;\n' },
      expect: { count: 1, token: '"text"' },
      why: "the founding shape — a sub-floor disclosure with no reasoned waiver: the floor arm silently not taken. The position is the quoted literal",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/self-closing.tsx": 'export const G = <CollapsibleTrigger size="text" chevron={false} render={<span />} />;\n' },
      expect: { count: 1, token: '"text"' },
      why: "the SELF-CLOSING spelling (the live `rpg-beat-row.tsx` shape, a trigger rendered through a Button) is the same opt-out — both element kinds are visited",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/collapsible/story.tsx": 'export const G = <CollapsibleTrigger size="text">Advanced</CollapsibleTrigger>;\n' },
      expect: { count: 1, token: '"text"' },
      why: "the ui package is IN the population (the legacy scanRoot admitted both trees) — a primitive's own demo mount owes the same waiver",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/retired.tsx":
          '// @sub-floor-ok: the retired grammar\nexport const G = <CollapsibleTrigger size="text">Advanced</CollapsibleTrigger>;\n',
      },
      expect: { count: 1, token: '"text"' },
      why: "THE RETIRED GRAMMAR IS INERT TEXT: a legacy `@sub-floor-ok` marker exempts nothing any more — the finding stands. This is what makes same-commit translation load-bearing (guide §8): an untranslated marker is a silently lost suppression",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/a/default.tsx": "export const G = <CollapsibleTrigger>Advanced</CollapsibleTrigger>;\n" },
      why: "the inverted default — a bare trigger takes the control floor; nothing to justify",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/explicit.tsx": 'export const G = <CollapsibleTrigger size="control">Advanced</CollapsibleTrigger>;\n' },
      why: "an explicit control arm (now redundant with the default) is not sub-floor — passes. Replacing the arm comparison with any string literal reds this row",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/other-tag.tsx": 'export const G = <Trigger size="text">Advanced</Trigger>;\n' },
      why: 'DECLARED LIMIT, and the tag-name fence: a `size="text"` on ANY OTHER tag is not this policy\'s subject — a wrapped or re-exported trigger under another name is invisible (see the header for why the identity upgrade is deferred). Deleting the tag-name check reds this row',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/variable.tsx": 'const arm = "text";\nexport const G = <CollapsibleTrigger size={arm}>Advanced</CollapsibleTrigger>;\n',
      },
      why: "DECLARED LIMIT: a size reached through a variable is invisible to the literal-shape reader (the class every size gate shares)",
    },
    {
      mode: "source",
      files: {
        "tests/ui/primitives/collapsible/story.ct.tsx": 'export const G = <CollapsibleTrigger size="text">Running text</CollapsibleTrigger>;\n',
        "packages/client/src/features/a/clean.tsx": "export const clean = true;\n",
      },
      why: "THE POPULATION PORT: `tests/` was never in the legacy scanRoot and is not in the population — a CT story's sub-floor mount is not judged (the retired roster row's `tests/ is scope` claim was false on the code). The clean client file keeps the fixture admitted",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/marked.tsx":
          '// @orb-waive sub-floor-disclosure("text"): sits mid-paragraph in running prose — a control box would shear it off its copy.\nexport const G = <CollapsibleTrigger size="text">show more</CollapsibleTrigger>;\n',
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the reported position — the quoted literal — suppresses the twin of mustFlag[0]. One finding, one marker, zero effective findings and zero authority alarms",
    },
  ],
});
