// Gate: settings-section-anchored. A
// heading-bearing `<Section>` in a contributed config section is a nav target: the config host's scroll-spy
// + the search jump to it by its `configAnchorId(group, sub)` DOM id (the settings-era `settingsAnchorId`,
// re-keyed by the config revamp #866 S1). A heading-bearing Section with NO `id` attribute is INVISIBLE to
// the LIST and search — you can't deep-link it, the scroll-spy skips it, and search can't surface it. RED it
// so every anchored section is reachable.
//
// The rule keys on `heading`-bearing Sections only (a bare `<Section>` used for pure layout is not a nav
// target — the persona roster stamps its anchor on a `<Stack id=…>`, not a Section). A spread attribute
// (`{...props}`) that MIGHT carry `id` is given the benefit of the doubt (empty-state-has-action precedent).
// The complement to config-group-completeness (whose anchor-outside-registry arm polices the OTHER
// direction: an anchor stamped by a file no contribution renders).
//
// FAMILY: declared SINGLETON (`settings-section-anchored`). The one shared `lib/` reader it consumes is
// `lib/comment-spans.ts` `codeIncludes` — a generic comment-blindness primitive used across unrelated
// policies, not a shared SUBJECT reader — and no sibling policy judges the config-section/anchor subject.
// The named complement (`config-group-completeness`, which polices the opposite direction) resolves a
// different subject through a different reader, so a merge would join two verdicts that share no computation.
//
// THE REPORTED POSITION is the literal `<Section` opening-tag slice, supplied with offset 0 on the element
// node; `fix` states the spelling. The population is a byte-identical port of the legacy predicate
// `/packages\/client\/src\/.*\.tsx$/` as `{ in: ["@client"], ext: ["tsx"] }`.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `settings-section-anchored` descriptor at 073520068d3305dfedbb481153cadfef6b30f847, the parent of the conversion
// `45743d76d` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,006 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 677 and final `population` admits 677. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/components/__cbbhr_in_background-source-field.tsx` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { JsxAttributeLike, JsxOpeningElement, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { codeIncludes } from "../lib/comment-spans.ts";

const TAG_NAME = "Section";
const ANCHOR_FN = "configAnchorId";
// `*-settings-surface.tsx` was the WHOLE scanned set while every anchored section lived in a pane surface.
// Under SET-SEAMS a section is a contributed FRAGMENT in its owning feature's `components/` dir, so the
// scanRoot must follow it there or the gate goes silently GREEN on exactly the files it exists to police
// (the `gate-scanroot-vs-getfilepath` class; SET-SEAMS §7.5, a REQUIRED edit).
//
// Path alone is too blunt: `components/*-section.tsx` is also how the character editor, the persona context
// panel and the preset editor name their fragments, and those are not nav targets. So the gate keys on
// CONTENT — a file that calls `configAnchorId` IS a config section, wherever it lives and whatever it is
// named (rename-proof, unlike a path list). The old path-keyed `*-settings-surface.tsx` arm is GONE with the
// config revamp's §6.8 (every group is a skimmer; the four surface files were deleted) — an arm over an
// empty file set is a vacuous pass, and a vacuous pass is not a port (owner note 1, 2026-08-30).
/** Is this file a config section by CONTENT — does it stamp config anchors at all? Read from CODE, not
 *  file text: a component whose comment MENTIONS `configAnchorId` (explaining why it is not one, the most
 *  likely sentence to write) would otherwise be conscripted into the fragment arm and every heading Section
 *  in it reported — the comment-blindness class of #117/#132, here in the false-POSITIVE direction. */
function stampsSettingsAnchors(sf: SourceFile): boolean {
  return codeIncludes(sf, ANCHOR_FN);
}

/** Does this `<Section …>` carry a JSX attribute named `name`, or a spread that MIGHT (a conditional
 *  prop the gate can't statically resolve, so it's given the benefit of the doubt)? */
function hasAttr(el: JsxOpeningElement | JsxSelfClosingElement, name: string): boolean {
  return el.getAttributes().some((attr: JsxAttributeLike) => {
    if (attr.getKind() === SyntaxKind.JsxSpreadAttribute) {
      return true;
    }
    return attr.getKind() === SyntaxKind.JsxAttribute && attr.getFirstChild()?.getText() === name;
  });
}

const MESSAGE =
  "heading-bearing <Section> in a contributed config section with no `id` — an anchored section must " +
  "stamp `id={configAnchorId(group, sub)}` (the sub is its contribution's `nav.id`) or it is " +
  "invisible to the config scroll-spy + search.";

export const gate = defineGate({
  id: "settings-section-anchored",
  family: "settings-section-anchored",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], ext: ["tsx"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "stamp `id={configAnchorId(group, sub)}` on the heading-bearing <Section>, where `sub` is the owning " +
    "ConfigSectionContribution's `nav.id`, so the LIST + search can reach it. A section that is deliberately " +
    "unreachable is waived with `// @orb-waive settings-section-anchored(<Section): <reason>` on a line above " +
    "the offending element — the position is the literal opening-tag slice `<Section`, angle bracket included, " +
    "and it is the SAME for every finding in a file, so two unanchored Sections under one statement cannot " +
    "both be waived; split them or anchor one.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
        visit: (node, sf) => {
          if (!stampsSettingsAnchors(sf)) {
            return;
          }
          const el = node.asKind(SyntaxKind.JsxOpeningElement) ?? node.asKind(SyntaxKind.JsxSelfClosingElement);
          if (el === undefined || el.getTagNameNode().getText() !== TAG_NAME) {
            return;
          }
          // Only a heading-bearing Section is a nav target; a bare layout Section needs no anchor.
          if (!hasAttr(el, "heading") || hasAttr(el, "id")) {
            return;
          }
          ctx.report.node(node, { token: `<${TAG_NAME}`, offset: 0 });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/credentials/components/connections-keys-section.tsx":
          'import { configAnchorId } from "#state";\nexport const G = <Section heading="Host Claude" id={configAnchorId("connections", "host-claude")} />;\nexport const H = <Section heading="Saved keys"><Text>x</Text></Section>;\n',
      },
      expect: { count: 1, line: 3, token: "<Section" },
      why: "a heading-bearing <Section> with no id in a contributed section body (the decomposed connections surface's shape, §6.8) — invisible to the LIST/search. `count` proves the ANCHORED sibling on line 2 is not also flagged, and `line` names which of the two Sections bit (the derived token cannot: both spell `<Section`)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/user-admin/components/rate-limits-section.tsx":
          'import { configAnchorId } from "#state";\nexport const A = <Section heading="A" id={configAnchorId("admin", "a")} />;\nexport const G = <Section heading="B"><Text>x</Text></Section>;\n',
      },
      expect: { count: 1, line: 3, token: "<Section" },
      why: "the SET-SEAMS fragment arm: a contributed SECTION file (it stamps configAnchorId) with a second, unanchored heading Section — the exact file class the old *-settings-surface-only scanRoot went silently GREEN on. `count` + `line` name the unanchored one; the anchored Section on line 2 must not flag",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/self-closing-section.tsx":
          'import { configAnchorId } from "#state";\nexport const A = configAnchorId("x", "a");\nexport const G = <Section heading="A" />;\n',
      },
      expect: { count: 1, token: "<Section" },
      why: "the self-closing Section form is the same unanchored nav target as the paired form",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/credentials/components/connections-host-claude-section.tsx":
          'import { configAnchorId } from "#state";\nexport const G = <Section heading="Host Claude" id={configAnchorId("connections", "host-claude")}><Text>x</Text></Section>;\n',
      },
      why: "a heading-bearing <Section> WITH an id anchor — reachable, passes",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/components/persona-roster-section.tsx":
          'import { configAnchorId } from "#state";\nexport const A = <Stack id={configAnchorId("personas", "your-personas")} />;\nexport const G = <Section><Text>x</Text></Section>;\n',
      },
      why: "a bare layout <Section> (no heading) in an anchor-stamping file is not a nav target — needs no anchor, passes",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/x-section.tsx":
          'import { configAnchorId } from "#state";\nexport const A = <Stack id={configAnchorId("x", "a")} />;\nexport const G = <Section heading="Host Claude" {...rest}><Text>x</Text></Section>;\n',
      },
      why: "a spread attribute might carry id (a conditional prop the gate can't statically resolve) — treated as present",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/credentials/components/role-slot-row.tsx": 'export const G = <Section heading="Host Claude"><Text>x</Text></Section>;\n',
      },
      why: "scope: a component that stamps NO settings anchor is not a settings section (the character-editor / persona-panel / preset-editor `*-section.tsx` class) — passes",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/persona/components/context-panel.tsx":
          '// This panel is NOT a config section and never calls configAnchorId — it is the persona context panel.\nexport const G = <Section heading="Host Claude"><Text>x</Text></Section>;\n',
      },
      why: "COMMENT POSTURE (issue #117/#132): the fragment arm reads CODE, so a comment naming `configAnchorId` — the most natural sentence for a file explaining it is not a config section — does not conscript the file. Reading prose as code reddened two lanes before this was law",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/aliased-section.tsx":
          'import { configAnchorId } from "#state";\nexport const A = configAnchorId("x", "a");\nexport const G = <SectionAlias heading="A" />;\nexport const H = <UI.Section heading="B" />;\n',
      },
      why: "aliased and member component names are declared near-misses of the exact Section tag convention",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/components/waived-section.tsx":
          'import { configAnchorId } from "#state";\nexport const A = configAnchorId("x", "a");\n// @orb-waive settings-section-anchored(<Section): a stand-in reason and its end condition.\nexport const G = <Section heading="A" />;\n',
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the SUPPLIED position (the literal `<Section` opening-tag slice) suppresses the twin of mustFlag[2] — one finding, one marker, zero effective findings and zero authority alarms. A wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`. The fixture carries ONE unanchored Section deliberately: two would share this policy's position token and every marker would be over-broad",
    },
  ],
});
