// Policy: surface-in-a-container (UI-Architecture-and-Layout.md §4) — a SURFACE is the containment CONSUMER
// (pure content querying `@container` variants); it must sit inside a `<Container>` / `<Section container>`
// that owns `container-type`. Flags a `surfaces/*.tsx` that renders structural JSX but references no
// `@orb/ui/layout` container, either in the surface itself or in any file under its feature's `anchors/` dir
// — §4's realized shape is anchor-wraps-surface. Per-FEATURE match, not per-surface-to-specific-anchor
// tracing; `message-thread-anchor.tsx` is the first real instance of the cross-file shape.
//
// FAMILY `surface-composition` — the shared reader is `lib/surface-composition.ts`
// (`rendersStructuralRoot` + `rendersLayoutContainer` + `exportedComponentAnchor`), with `surface-a11y-focus`
// and this policy's own `-health` sibling as the other members. This one and `surface-a11y-focus` report the
// SAME position deliberately: a surface-level verdict has no natural node, and two policies that agree on one
// coordinate let ONE `@orb-waive` line carry each by id instead of each inventing a position the other cannot
// see (guide §2.1, the `caught-failure.ts` shared-anchor payoff).
//
// POPULATION PORT: `@client` under `packages/client/src/features/*/surfaces/**` and
// `packages/client/src/features/*/anchors/**`, `tsx` only, MINUS the app-shell feature. LEGACY at 854c81c80:
// `scopeSafety: "whole-project"` with no `scanRoot`, filtered inside `run` by
// `FEATURE_FILE_RE = /^packages\/client\/src\/features\/([^/]+)\/(surfaces|anchors)\/[^/]+\.tsx$/u`, then
// `if (SHELL_EXEMPT.has(feature)) continue;` with `SHELL_EXEMPT = new Set(["app-shell"])`. The two `under`
// globs are the regex's two alternations and `ext: ["tsx"]` is its suffix, so the admitted set is
// byte-identical. The ANCHORS half is EVIDENCE, not a subject — an anchors file is never reported — and
// `execution: "entire-population"` is what makes that honest (below). Pinned by `mustPass[3]`/`mustPass[5]`.
//
// THE SHELL EXEMPTION IS PORTED FAITHFULLY, AS A POPULATION EXCLUSION PLUS A `hard` RATCHET, AND THE SHAPE IS
// A RULING WITH RECEIPTS RATHER THAN A PREFERENCE (owner, 2026-09-13: *"i liked the gate how it did i think it
// worked well? So lets just get it over faithfully."*).
//   WHY NOT A REVIEWED GRANT, which is what the 2026-09-06 ruling normally requires (*sanctioned homes convert
//   as exact reviewed grants with liveness, never population subtraction*): a grant is STRUCTURALLY IMPOSSIBLE
//   here, measured twice. The legacy skip at `:109` runs BEFORE `:112`'s `containedByAnchor` and `:114`'s flag
//   condition — and `packages/client/src/features/app-shell/anchors/region-anchor.tsx` imports (`:8`) and
//   renders (`:24`) `<Container name={region}>`, so removing the skip still leaves the anchor check acquitting.
//   No finding is ever produced, so a grant would be consumed zero times and go STALE the day it landed.
//   WHY THE EXEMPTION IS NOT DEAD DECORATION, which is what that same measurement first looked like: the
//   containment direction is INVERTED for the shell. `app-shell.tsx:16` RENDERS `RegionAnchor`, and
//   `RegionAnchor` provides containers for OTHER features' surfaces (`SHELL_REGIONS`), so `app-shell.tsx` is
//   not inside that `<Container>` — it contains it. The anchor rule acquits it for a COINCIDENCE of directory
//   shape. §4's role table is the actual reason: SHELL establishes top-level named containers, ANCHOR wraps a
//   surface in `container-type`, SURFACE consumes. The shell is not a containment consumer, so the exclusion
//   encodes the law while the anchor rule merely happens to agree today.
//   WHY THE RULING'S INTENT SURVIVES: what it protects is LIVENESS — an exemption must not silently un-scan a
//   name someone later reuses. That is preserved by `surface-in-a-container-health`, which is `hard` and reds
//   when the excluded feature directory no longer exists. Exclusion + liveness sibling, rather than grant +
//   liveness, because the grant half cannot be made to fire at all.
//
// CATCH DELTA (§4.6): NONE in either direction. The admitted set, the acquittal rule and the shell's exemption
// are byte-identical to the legacy descriptor, and the stale arm MOVED rather than retired — the sibling's
// header carries its own successor statement.
//
// `execution: "entire-population"`: one surface's verdict depends on its FEATURE'S SIBLING FILES (does any
// anchor render a container?), so it cannot compose over an arbitrary selected subset — a scoped run that
// selected the surface without its anchor would report a defect that does not exist. Legacy said the same
// thing with `scopeSafety: "whole-project"`.
//
// ANCHOR MOVE (§4.6 category 6): legacy reported `{ file: rel, line: 0 }` — a FILE finding with no token,
// which under this contract has NO WAIVER DOOR at all (`locateFinding` needs authored text at the exact
// line/column; guide §2.1's authored-coordinate rule). The position is now the surface's exported component name.
// Zero live markers named this gate in either grammar, so no translation is owed.
//
// COMMENT POSTURE: comment-SAFE — structural/container evidence is exact JSX tag identity, and container
// IDENTITY is resolved through the `@orb/ui/layout` named import rather than the tag spelling.
//
// DECLARED LIMITS, each with the row that holds it: a surface returning only a single composed child needs no
// container of its own (`mustPass[1]`); ANY anchor container in the feature is the feature-level wrapper proof
// (`mustPass[2]`); a surfaces file exporting no component has no authored position and is therefore silent
// (`mustPass[4]`).
import type { SourceFile } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { exportedComponentAnchor, rendersLayoutContainer, rendersStructuralRoot } from "../lib/surface-composition.ts";

const FEATURES = "packages/client/src/features";
const SURFACE_RE = /^packages\/client\/src\/features\/([^/]+)\/surfaces\/[^/]+\.tsx$/u;
const ANCHOR_RE = /^packages\/client\/src\/features\/([^/]+)\/anchors\/[^/]+\.tsx$/u;

const MESSAGE =
  "surface establishes raw structural layout but sits in no <Container>/<Section container> — a surface is " +
  "the containment CONSUMER (pure content querying `@container` variants), never the provider. Wrap it in an " +
  "@orb/ui/layout container (its own, or its feature's anchor), never raw container-type " +
  "(UI-Architecture-and-Layout.md §4).";

const FIX =
  "wrap the surface in an @orb/ui/layout `<Container>` / `<Section container>` — its own, or its feature's " +
  "`anchors/` wrapper (the realized anchor-wraps-surface shape) — never raw container-type. A deliberate " +
  "occurrence waives with `@orb-waive surface-in-a-container(<ExportedComponentName>): <reason + end " +
  "condition>` on the line above the surface's exported component; the position is the same node " +
  "`surface-a11y-focus` reports, so one line carries both when both apply.";

interface SurfaceSubject {
  readonly feature: string;
  readonly sourceFile: SourceFile;
}

export const gate = defineGate({
  id: "surface-in-a-container",
  family: "surface-composition",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@client"],
    under: [`${FEATURES}/*/surfaces/**`, `${FEATURES}/*/anchors/**`],
    notUnder: [`${FEATURES}/app-shell/**`],
    ext: ["tsx"],
  },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const surfaces: SurfaceSubject[] = [];
    const featuresWithContainedAnchor = new Set<string>();
    return {
      visitFile: (sourceFile: SourceFile): void => {
        const relative = ctx.relativePath(sourceFile);
        const anchorFeature = ANCHOR_RE.exec(relative)?.[1];
        if (anchorFeature !== undefined) {
          if (rendersLayoutContainer(sourceFile)) {
            featuresWithContainedAnchor.add(anchorFeature);
          }
          return;
        }
        const feature = SURFACE_RE.exec(relative)?.[1];
        if (feature !== undefined && rendersStructuralRoot(sourceFile) && !rendersLayoutContainer(sourceFile)) {
          surfaces.push({ feature, sourceFile });
        }
      },
      evaluate: (): void => {
        for (const subject of surfaces) {
          if (featuresWithContainedAnchor.has(subject.feature)) {
            continue;
          }
          const anchor = exportedComponentAnchor(subject.sourceFile);
          if (anchor === undefined) {
            // DECLARED LIMIT (`mustPass[4]`): no exported component means no authored position, and an
            // ordinary finding without one has no waiver door — it raises a central binding failure on the
            // author's first real waiver instead of naming a defect.
            continue;
          }
          ctx.report.node(anchor, { token: anchor.getText(), offset: 0, message: MESSAGE, fix: FIX });
        }
      },
    };
  },

  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/surfaces/pane.tsx": "export const Pane = () => <div><ul><li>row</li></ul></div>;\n" },
      expect: { count: 1, token: "Pane" },
      why: "the founding shape: a surface with a raw structural `<div>`/`<ul>` root and no Container, its own or its anchor's (§4). The token is the exported component NAME, which is the §4.2 waiver position",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/commented-container.tsx":
          "// Containment: wrap this in <Container> when the pane gets its own scroll area.\nexport const Pane = () => <div><ul><li>row</li></ul></div>;\n",
      },
      expect: { count: 1, token: "Pane" },
      why: "COMMENT POSTURE (issue #117/#132) in the PERMISSIVE direction: a surface whose COMMENT names `<Container>` establishes no containing block — a file-text scan reads the plan as the deed and the surface ships uncontained",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/surfaces/string-container.tsx": 'export const Pane = () => <div>{"wrap with <Container> later"}</div>;\n' },
      expect: { count: 1, token: "Pane" },
      why: "the STRING spelling of the same blindness, carried from `tests/tooling/ui-gate-structural-regressions.int.test.ts` at this conversion: a string literal naming a Container tag is JSX text, survives comment blanking, and establishes no containing block",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/anchors/x-anchor.tsx":
          'export const XAnchor = ({ children }: { children?: unknown }) => <div className="a">{children}</div>;\n',
        "packages/client/src/features/x/surfaces/pane.tsx": "export const Pane = () => <div><ul><li>row</li></ul></div>;\n",
      },
      expect: { count: 1, token: "Pane" },
      why: "THE ANCHOR RULE IS IDENTITY, NOT PRESENCE: the feature HAS an anchors file and it renders no `@orb/ui/layout` container, so nothing establishes the containing block. An anchors-dir-exists check would acquit this",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/local.tsx":
          "const Container = ({ children }: { children?: unknown }) => <div>{children}</div>;\nexport const Pane = () => <Container><main>content</main></Container>;\n",
      },
      expect: { count: 1, token: "Pane" },
      why: "THE IMPORT-IDENTITY FENCE, and the row that dies when `rendersLayoutContainer` stops checking the module specifier: a LOCAL component spelled `Container` owns no `container-type`. Judging by tag spelling alone acquits the one shape the rule exists to catch",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/section.tsx":
          'import { Section } from "@orb/ui/layout";\nexport const Pane = () => <Section><main>content</main></Section>;\n',
      },
      expect: { count: 1, token: "Pane" },
      why: "`<Section>` is a container only when its `container` prop opts into `container-type`. Drop the attribute test in `rendersLayoutContainer` and this row goes green — which is what makes that clause enforced rather than decoration",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/ok.tsx":
          'import { Container } from "@orb/ui/layout";\nexport const Ok = () => <Container><ul><li>row</li></ul></Container>;\n',
      },
      why: "the surface renders its own `<Container>` around its structural content — the sanctioned shape, passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/surfaces/name-surface.tsx": "export const N = () => <Name />;\n" },
      why: "a DECLARED LIMIT: a surface returning only a single composed child establishes no layout of its own and needs no container. Cut `rendersStructuralRoot` and this is the row that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/anchors/x-anchor.tsx":
          'import { Section } from "@orb/ui/layout";\nexport const XAnchor = ({ children }: { children?: unknown }) => <Section container>{children}</Section>;\n',
        "packages/client/src/features/x/surfaces/pane.tsx": "export const Pane = () => <div><ul><li>row</li></ul></div>;\n",
      },
      why: "THE CROSS-FILE ARM, and the `<Section container>` spelling of the provider: the feature's ANCHOR owns the containing block, which is §4's realized anchor-wraps-surface shape. Delete the anchors half of the population and this is the only row that dies — which is also what makes `entire-population` correct rather than cautious",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/anchor.tsx":
          'import { Container } from "@orb/ui/layout";\nexport const Anchor = () => <Container><ul><li>row</li></ul></Container>;\n',
        "packages/ui/src/primitives/pane/pane.tsx": "export const Pane = () => <div><ul><li>row</li></ul></div>;\n",
      },
      why: "THE POPULATION FENCE, pinned with an in-population anchor beside it (a falsifier admitting nothing tool-errors instead of passing): the identical founding shape under `@ui` is a PRIMITIVE, not a feature surface — primitives provide containment, they do not consume it. Widen past `@client`/`surfaces` and this is the only row that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/anchor.tsx":
          'import { Container } from "@orb/ui/layout";\nexport const Anchor = () => <Container><ul><li>row</li></ul></Container>;\n',
        "packages/client/src/features/x/surfaces/constants.tsx": 'export const PANE_TITLE = "Corpus";\n',
      },
      why: "THE DECLARED LIMIT the anchor creates: a surfaces file exporting no COMPONENT has no authored position, and an ordinary finding without one has no waiver door. It also renders no structural root, so the honest outcome is silence twice over — stated rather than hidden",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/anchor.tsx":
          'import { Container } from "@orb/ui/layout";\nexport const Anchor = () => <Container><ul><li>row</li></ul></Container>;\n',
        "packages/client/src/features/app-shell/surfaces/app-shell.tsx": "export const AppShell = () => <div><main>content</main></div>;\n",
      },
      why: "THE SHELL EXEMPTION, ported and pinned with an in-population anchor beside it: the shell tier is the container PROVIDER (§4's role table), not a consumer, so the identical founding shape under `features/app-shell/` is not this policy's finding. Delete the `notUnder` and this is the only row that dies — and note it flags here with NO anchors file present, which is exactly what separates the LAW from the coincidence that the real `region-anchor.tsx` happens to render a Container",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/aliased.tsx":
          'import { Container as LayoutContainer } from "@orb/ui/layout";\nexport const Pane = () => <LayoutContainer><main>content</main></LayoutContainer>;\n',
      },
      why: "the imported symbol IDENTITY survives a local alias — carried from `ui-gate-structural-regressions.int.test.ts`. This is the row that dies if `layoutBindings` keys on the exported name rather than the local one",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/surfaces/waived.tsx":
          "// @orb-waive surface-in-a-container(Waived): the proof's stand-in reason; ends when this fixture stops flagging.\nexport const Waived = () => <div><ul><li>row</li></ul></div>;\n",
      },
      why: "§4.2 POSITIONAL IDENTITY: the position is the surface's exported component name — the SAME node `surface-a11y-focus` reports, which is the family's whole reason for a shared anchor. The fixture is mustFlag[0] plus the marker line, so exactly ONE occurrence exists for the one marker to consume; the arm ends if that row changes",
    },
  ],
});
