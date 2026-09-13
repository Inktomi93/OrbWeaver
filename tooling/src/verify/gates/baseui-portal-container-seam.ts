// Policy: baseui-portal-container-seam — a @orb/ui seal that portals its popup must let the CALLER choose
// the portal target, and must actually pass the choice on. A Base UI `*.Portal` defaults to `document.body`,
// which is outside every `<ThemeScope>` in the tree: a popup that lands there resolves `var(--color-*)`
// against the ROOT theme, so a menu opened from inside a themed card renders in the wrong palette — and it
// also escapes the dialog's focus scope, which is the accessibility half of the same bug.
//
// TWO ARMS, because either half alone is a dead seam:
//   A the callable owning an actual imported Base UI `*.Portal` accepts no `container` prop — the caller
//     has no way to say where the popup goes;
//   B the actual Portal target does not consume that owning callable's prop — ignored props, omitted/
//     undefined targets, and `document.body` read like a seam while behaving as the unsafe default.
//
// MEASURED AT LANDING (legacy): zero live sites — all ten portal-bearing seals (popover, menu, tooltip,
// dialog, alert-dialog, drawer, select, combobox, autocomplete, toast) already declare `container?:
// BasePortalProps["container"]` and thread it through `container={container ?? portalContainer}`. An honest
// zero, held as a ratchet: the eleventh seal is the one that would have forgotten.
//
// FAMILY `baseui-read` — the shared reader is `lib/baseui-read.ts#baseUiBindings` (which `@base-ui/react/*`
// named bindings a file imports, value and type alike). `baseui-anatomy-completeness`,
// `baseui-derives-not-respells`, `baseui-state-data-attributes` and `baseui-surface-manifest` are the other
// members; this one is the only member that consumes NO committed manifest, which is why it declares
// `resources: []` while its siblings declare the `json:baseui-manifest` door.
//
// POPULATION PORT: `@ui` (= `packages/ui/src/`), whole, both extensions. LEGACY at 854c81c80 (this module
// last changed at 2b95e9adb): `scanRoot: (p) => p.includes(UI_SRC)` with `UI_SRC = "packages/ui/src/"`, plus
// an in-`run` re-test of the same predicate through `repoRelative`. On repo-relative authored paths
// `includes("packages/ui/src/")` and the `@ui` root prefix admit the identical set — no path can carry that
// segment anywhere but at its head — so the port is byte-identical and BOTH spellings of the fence are gone.
// The population is pinned by `mustPass[2]`, the only row that dies without it.
//
// ANCHOR MOVE (§4.6 category 6) — THE LEGACY POSITIONS WERE SYNTHETIC AND HAD NO WAIVER DOOR. Legacy passed
// `{ token: "no-container-prop", offset: 0 }` / `{ token: "container-not-wired", offset: 0 }`: DISCRIMINATOR
// LABELS under `lib/gate-ignore.ts:180`'s plain string equality, which appear in no source file. Under this
// contract `report.node` validates the token against the node's own text and THROWS, and `locateFinding`
// requires authored text at the exact line/column — so those positions do not merely fail to bind, they
// abort the run. Both arms are re-anchored on AUTHORED text: arm A on the JSX tag name (`BaseDialog.Portal`),
// arm B on the `container` attribute's own name when one is authored, else on the tag name. Zero live
// markers named this gate in either grammar, so no translation is owed (measured: `rg -F
// 'baseui-portal-container-seam'` over `packages/**` + `tests/**` returns nothing outside this module).
//
// FINDING GRANULARITY NOW MATCHES WAIVER GRANULARITY, AND THAT IS THE ONE DELIBERATE CATCH DELTA (§4.2).
// Legacy fired BOTH arms on a portal whose callable declares no `container` at all — two findings on one
// JSX element, and under the central engine two findings sharing a carrier AND a token are `over-broad` for
// every marker, so the site would be unwaivable. The arms are now mutually exclusive: with no declared
// prop there is nothing for the target to consume, so arm A alone speaks. The SET of flagged portals is
// unchanged; only the double count on that one shape drops 2 -> 1. See the §4.6 differential below.
//
// COMMENT POSTURE: comment-SAFE — portal tags, props members, and JSX attributes are AST nodes.
//
// §6.4 DIFFERENTIAL (run 2026-09-13; THIS PARAGRAPH IS THE RECORD — guide §6.4 admits either a committed
// test or a statement of what the run FOUND, and this conversion took the second arm. The citation here
// read `tests/tooling/verify/gates/baseui-family.test.ts` "portal seam: legacy and final agree on the
// flagged portals" until 2026-09-13; neither the file nor a test of that title has ever existed on the tree,
// so the numbers below were the only evidence and the citation was pointing away from it — corrected under
// board #2297, and NOT by minting a test after the fact, which would be a receipt nobody ran):
// legacy descriptor loaded from
// 2b95e9adb, replayed over the policy's OWN declared population on the real workspace and over each proof's
// file map. Real-tree: legacy 0 findings, final 0 findings, populations identical (360 `@ui` files), zero
// tool errors on either side — a BOTH-SIDES-ZERO receipt (§4.6 vacuity shape 1), stated as such and NOT as
// catch parity. Fixture-level: the five proof file maps replay to the same flagged ELEMENT set on both
// sides; the only delta is `mustFlag[0]`'s count (legacy 2, final 1), which is the granularity fix above.
import type { JsxAttributeLike, JsxOpeningElement, JsxSelfClosingElement, Node as MorphNode, ParameterDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { baseUiBindings, consumesContainerProp, readsDocumentBody } from "../lib/baseui-read.ts";
import { firstAnchor } from "../lib/caught-failure.ts";

type JsxElement = JsxOpeningElement | JsxSelfClosingElement;

const CONTAINER = "container";

const MESSAGE =
  "a sealed Base UI portal does not expose its `container`. Base UI portals to `document.body` by default, " +
  "which sits outside every `<ThemeScope>`: the popup then resolves its theme variables against the ROOT " +
  "palette instead of the scope it was opened from, and it leaves the surrounding focus scope at the same " +
  "time. Every portal-bearing seal in @orb/ui takes a `container` prop and defaults it to the themed portal " +
  "root (`usePortalContainer()`), so the caller can override it per call site. " +
  "packages/ui/src/primitives/dialog/dialog.tsx is the reference for both halves.";

const NO_PROP = `${MESSAGE} THIS SITE: the owning callable accepts no \`container\` prop at all, so no caller can place the popup.`;
const NOT_WIRED = `${MESSAGE} THIS SITE: the prop exists but this Base UI Portal target does not consume it — the prop never reaches Base UI, which reads like a seam while behaving exactly like the default (a dead wire is worse than a missing one).`;

const FIX =
  'declare `container?: BasePortalProps["container"]` on the seal\'s exported props interface (derive it — ' +
  "do not hand-spell the union), and pass it through: `<X.Portal container={container ?? portalContainer}>`. " +
  "packages/ui/src/primitives/dialog/dialog.tsx is the reference shape. A deliberate occurrence waives with " +
  "`@orb-waive baseui-portal-container-seam(<position>): <reason + end condition>`, where <position> is the " +
  "portal's own JSX TAG NAME exactly as written (`BaseDialog.Portal`) when the seal declares no `container` " +
  "prop or passes none, and the literal text `container` when an unwired `container=` attribute is authored " +
  "on the Portal.";

function owningCallable(node: MorphNode): MorphNode | undefined {
  return node.getFirstAncestor(
    (ancestor) =>
      Node.isFunctionDeclaration(ancestor) || Node.isArrowFunction(ancestor) || Node.isFunctionExpression(ancestor) || Node.isMethodDeclaration(ancestor),
  );
}

function callableParameters(callable: MorphNode | undefined): readonly ParameterDeclaration[] {
  if (
    callable === undefined ||
    !(Node.isFunctionDeclaration(callable) || Node.isArrowFunction(callable) || Node.isFunctionExpression(callable) || Node.isMethodDeclaration(callable))
  ) {
    return [];
  }
  return callable.getParameters();
}

function declaresContainer(callable: MorphNode | undefined): boolean {
  return callableParameters(callable).some((parameter) => parameter.getType().getProperty(CONTAINER) !== undefined);
}

/** The authored `container=` attribute on this element, if the seal wrote one. It is arm B's anchor: a
 *  DEAD wire is named at the wire, which is the thing the author has to look at. */
function containerAttribute(el: JsxElement): JsxAttributeLike | undefined {
  return el.getAttributes().find((attribute) => Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === CONTAINER);
}

/** Presence is not wiring: the actual Base UI target must consume THIS callable's caller prop. */
function hasLiveContainer(el: JsxElement, callable: MorphNode | undefined): boolean {
  const attribute = containerAttribute(el);
  if (attribute === undefined || !Node.isJsxAttribute(attribute)) {
    return false;
  }
  const initializer = attribute.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return false;
  }
  const expression = initializer.getExpression();
  if (expression === undefined) {
    return false;
  }
  const value = unwrapExpression(expression);
  if ((Node.isIdentifier(value) && value.getText() === "undefined") || value.isKind(SyntaxKind.NullKeyword) || readsDocumentBody(value)) {
    return false;
  }
  return consumesContainerProp(value, callableParameters(callable));
}

/** `Local.Portal` for every VALUE binding of a `@base-ui/react/*` component in this file. */
function portalTags(sf: SourceFile): ReadonlySet<string> {
  return new Set(
    baseUiBindings(sf)
      .filter((binding) => !binding.typeOnly)
      .map((binding) => `${binding.local}.Portal`),
  );
}

export const gate = defineGate({
  id: "baseui-portal-container-seam",
  family: "baseui-read",
  authority: "ordinary",
  severity: "error",
  population: "@ui",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const tagsByFile = new Map<SourceFile, ReadonlySet<string>>();
    const tagsFor = (sf: SourceFile): ReadonlySet<string> => {
      const hit = tagsByFile.get(sf);
      if (hit !== undefined) {
        return hit;
      }
      const computed = portalTags(sf);
      tagsByFile.set(sf, computed);
      return computed;
    };
    const judge = (el: JsxElement): void => {
      const tagNode = el.getTagNameNode();
      if (!tagsFor(el.getSourceFile()).has(tagNode.getText())) {
        return;
      }
      const callable = owningCallable(el);
      // The arms are MUTUALLY EXCLUSIVE by construction (see the header): with no declared prop there is
      // nothing for the target to consume, so arm A alone speaks and one marker can waive the site.
      if (!declaresContainer(callable)) {
        const anchor = firstAnchor(el, [tagNode]);
        ctx.report.node(el, { ...anchor, message: NO_PROP, fix: FIX });
        return;
      }
      if (hasLiveContainer(el, callable)) {
        return;
      }
      const attribute = containerAttribute(el);
      const anchor = firstAnchor(el, attribute !== undefined && Node.isJsxAttribute(attribute) ? [attribute.getNameNode(), tagNode] : [tagNode]);
      ctx.report.node(el, { ...anchor, message: NOT_WIRED, fix: FIX });
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
          visit: (node): void => {
            if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
              judge(node);
            }
          },
        },
      ],
    };
  },

  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  className?: string;\n}\nexport const P = (_props: DialogPopupProps) => (\n  <BaseDialog.Portal>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      },
      expect: { count: 1, token: "BaseDialog.Portal", messageIncludes: "accepts no `container` prop at all" },
      why: "ARM A — the seal portals but offers the caller no way to place it, so every popup lands on document.body outside the ThemeScope. `count: 1` IS the §4.2 granularity fix: the legacy descriptor fired both arms here for two findings sharing one carrier and one token, which no marker could ever waive",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: unknown;\n}\nexport const P = (_props: DialogPopupProps) => (\n  <BaseDialog.Portal>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      },
      expect: { count: 1, token: "BaseDialog.Portal", messageIncludes: "does not consume it" },
      why: "ARM B, the OMITTED-target flavour: the prop is declared but the Portal authors no `container=` at all — an affordance that looks live and does nothing, which no type error can catch because the seal simply never reads it. With no attribute to name, the position falls back to the tag name",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: unknown;\n}\nexport const P = (_props: DialogPopupProps) => <BaseDialog.Portal container={document.body} />;\n',
      },
      expect: { count: 1, token: CONTAINER, messageIncludes: "does not consume it" },
      why: "ARM B, the DEAD-WIRE flavour, and the row that pins the attribute anchor: an authored `container=` that hard-codes `document.body` is named AT THE WIRE (`container`), not at the tag — so this site and an omitted-target site in the same statement stay separately waivable",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: unknown;\n}\nexport const P = ({ container }: DialogPopupProps) => <BaseDialog.Portal container={container} />;\nexport const Q = (_props: DialogPopupProps) => <BaseDialog.Portal />;\n',
      },
      expect: { count: 1, token: "BaseDialog.Portal", messageIncludes: "does not consume it" },
      why: "the SELF-CLOSING spelling, and per-OCCURRENCE granularity: one wired portal and one unwired portal in the same file must yield exactly one finding, on the unwired one",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: unknown;\n}\nexport const P = ({ container }: DialogPopupProps) => {\n  void container;\n  return <BaseDialog.Portal container={undefined} />;\n};\n',
      },
      expect: { count: 1, token: CONTAINER, messageIncludes: "does not consume it" },
      why: "the EXPLICIT-`undefined` target: a value is authored, so presence alone would acquit — cutting the `undefined`/`null`/`document.body` rejection in `hasLiveContainer` turns this row GREEN, which is what makes that clause enforced rather than decoration",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nconst portalContainer = null;\nexport interface DialogPopupProps {\n  container?: unknown;\n}\nexport const P = (_props: DialogPopupProps) => <BaseDialog.Portal container={portalContainer} />;\n',
      },
      expect: { count: 1, token: CONTAINER, messageIncludes: "does not consume it" },
      why: "the IGNORED-PROP flavour, carried from `tests/tooling/ui-gate-structural-regressions.int.test.ts` at this conversion: the target is a real authored value that is NOT the owning callable's prop, so a declared `container` never contributes to the actual Portal — a dead caller seam that a presence check or a not-`undefined` check both acquit",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nimport type { DialogPortalProps as BasePortalProps } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: BasePortalProps["container"];\n}\nexport const P = ({ container }: DialogPopupProps) => (\n  <BaseDialog.Portal container={container}>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      },
      why: "the reference shape all ten portal-bearing seals already have: a DERIVED container prop, threaded through to Base UI",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/card/probe-card.tsx":
          'export interface CardProps {\n  className?: string;\n}\nexport const C = () => <div className="x" />;\n',
      },
      why: "a seal with no portal at all owes nothing — the gate keys on the rendered `*.Portal`, not on the package",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/clean.tsx": "export const Clean = true;\n",
        "packages/client/src/features/x/surfaces/pane.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface PaneProps {\n  className?: string;\n}\nexport const Pane = (_props: PaneProps) => (\n  <BaseDialog.Portal>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      },
      why: "THE POPULATION FENCE, pinned: the seam law is a @orb/ui SEAL rule — features compose sealed primitives and never portal Base UI directly, so the byte-identical arm-A shape under `@client` is not this policy's finding. Widen the population past `@ui` and this is the only row that dies",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  className?: string;\n}\n// @orb-waive baseui-portal-container-seam(BaseDialog.Portal): the proof\'s stand-in reason; ends when this fixture stops flagging.\nexport const P = (_props: DialogPopupProps) => <BaseDialog.Portal />;\n',
      },
      why: "§4.2 POSITIONAL IDENTITY: the arm-A position is the portal's own JSX tag name exactly as authored, so an author waives THAT PORTAL rather than the file or the component. The fixture is mustFlag[0] reduced to one self-closing portal (count 1) plus the marker, so exactly ONE occurrence exists for the one marker to consume; the arm ends if that row changes",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nimport type { DialogPortalProps as BasePortalProps } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: BasePortalProps["container"];\n}\nexport const P = (props: DialogPopupProps) => <BaseDialog.Portal container={props.container} />;\n',
      },
      why: "the PROPERTY-ACCESS spelling of the same wiring (`props.container` rather than a destructured binding) — the two readers in `usesOwningContainer` are separate code paths and both are the house shape",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/dialog/probe-dialog.tsx":
          'import type { DialogPortalProps as BasePortalProps } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: BasePortalProps["container"];\n}\nexport const BaseDialog = { Portal: (_p: { children?: unknown }) => null };\nexport const P = (_props: DialogPopupProps) => <BaseDialog.Portal />;\n',
      },
      why: "a DECLARED LIMIT and the type-only fence: a LOCAL `BaseDialog.Portal` that merely shares the spelling is not a Base UI portal, and a file importing only TYPES from Base UI has no value binding at all. Delete the `!binding.typeOnly` filter in `portalTags` and this row reds",
    },
  ],
});
