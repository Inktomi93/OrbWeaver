// Gate: baseui-portal-container-seam — a @orb/ui seal that portals its popup must let the CALLER choose the
// portal target, and must actually pass the choice on. A Base UI `*.Portal` defaults to `document.body`,
// which is outside every `<ThemeScope>` in the tree: a popup that lands there resolves `var(--color-*)`
// against the ROOT theme, so a menu opened from inside a themed card renders in the wrong palette — and it
// also escapes the dialog's focus scope, which is the accessibility half of the same bug.
// COMMENT POSTURE: comment-SAFE — portal tags, props members, and JSX attributes are AST nodes.
//
// TWO ARMS, because either half alone is a dead seam:
//   A the callable owning an actual imported Base UI `*.Portal` accepts no `container` prop — the caller
//     has no way to say where the popup goes;
//   B the actual Portal target does not consume that owning callable's prop — ignored props, omitted/
//     undefined targets, and `document.body` read like a seam while behaving as the unsafe default.
//
// MEASURED AT LANDING: zero live sites — all ten portal-bearing seals (popover, menu, tooltip, dialog,
// alert-dialog, drawer, select, combobox, autocomplete, toast) already declare `container?:
// BasePortalProps["container"]` and thread it through `container={container ?? portalContainer}`. An honest
// zero, held as a ratchet: the eleventh seal is the one that would have forgotten.
import type { JsxOpeningElement, JsxSelfClosingElement, ParameterDeclaration, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { baseUiBindings, repoRelative, UI_SRC } from "../lib/baseui-read.ts";

const CONTAINER = "container";

// THE ONE REASON, carrying BOTH arms by token (the per-arm overrides died with the Finding overload).
const MESSAGE =
  "a sealed Base UI portal does not expose its `container`. Base UI portals to `document.body` by default, " +
  "which sits outside every `<ThemeScope>`: the popup then resolves its theme variables against the ROOT " +
  "palette instead of the scope it was opened from, and it leaves the surrounding focus scope at the same " +
  "time. Every portal-bearing seal in @orb/ui takes a `container` prop and defaults it to the themed portal " +
  "root (`usePortalContainer()`), so the caller can override it per call site. `no-container-prop`: the owning " +
  "callable accepts no `container`, so no caller can place the popup at all. `container-not-wired`: this " +
  "actual Base UI Portal target does not consume that callable's prop — the prop exists but never " +
  "reaches Base UI, which reads like a seam while behaving exactly like the default (a dead wire is worse " +
  "than a missing one). packages/ui/src/primitives/dialog/dialog.tsx is the reference for both halves.";

const FIX =
  'declare `container?: BasePortalProps["container"]` on the seal\'s exported props interface (derive it — ' +
  "do not hand-spell the union), and pass it through: `<X.Portal container={container ?? portalContainer}>`. " +
  "packages/ui/src/primitives/dialog/dialog.tsx is the reference shape.";

/** The ARM tokens — each finding's `token`, and the position an `@orb-gate-ignore` names. */
const ARM_TOKENS = { noProp: "no-container-prop", notWired: "container-not-wired" } as const;

function owningCallable(node: TsNode): TsNode | undefined {
  return node.getFirstAncestor(
    (ancestor) =>
      Node.isFunctionDeclaration(ancestor) || Node.isArrowFunction(ancestor) || Node.isFunctionExpression(ancestor) || Node.isMethodDeclaration(ancestor),
  );
}

function callableParameters(callable: TsNode | undefined): readonly ParameterDeclaration[] {
  if (
    callable === undefined ||
    !(Node.isFunctionDeclaration(callable) || Node.isArrowFunction(callable) || Node.isFunctionExpression(callable) || Node.isMethodDeclaration(callable))
  ) {
    return [];
  }
  return callable.getParameters();
}

function declaresContainer(callable: TsNode | undefined): boolean {
  return callableParameters(callable).some((parameter) => parameter.getType().getProperty(CONTAINER) !== undefined);
}

function isParameterReference(node: TsNode, parameters: readonly ParameterDeclaration[]): boolean {
  return Node.isIdentifier(node) && node.getDefinitionNodes().some((definition) => parameters.includes(definition as ParameterDeclaration));
}

function bindingComesFromParameter(binding: TsNode, parameters: readonly ParameterDeclaration[]): boolean {
  const parameter = binding.getFirstAncestorByKind(SyntaxKind.Parameter);
  if (parameter !== undefined) {
    return parameters.includes(parameter);
  }
  const variable = binding.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const initializer = variable?.getInitializer();
  return initializer !== undefined && isParameterReference(unwrapExpression(initializer), parameters);
}

function usesOwningContainer(expression: TsNode, callable: TsNode | undefined): boolean {
  const parameters = callableParameters(callable);
  for (const access of [expression, ...expression.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)]) {
    if (
      Node.isPropertyAccessExpression(access) &&
      access.getName() === CONTAINER &&
      isParameterReference(unwrapExpression(access.getExpression()), parameters)
    ) {
      return true;
    }
  }
  for (const id of [expression, ...expression.getDescendantsOfKind(SyntaxKind.Identifier)]) {
    if (
      Node.isIdentifier(id) &&
      id.getText() === CONTAINER &&
      id.getDefinitionNodes().some((definition) => Node.isBindingElement(definition) && bindingComesFromParameter(definition, parameters))
    ) {
      return true;
    }
  }
  return false;
}

function usesDocumentBody(expression: TsNode): boolean {
  return [expression, ...expression.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)].some(
    (node) => Node.isPropertyAccessExpression(node) && node.getName() === "body" && node.getExpression().getText() === "document",
  );
}

/** Presence is not wiring: the actual Base UI target must consume THIS callable's caller prop. */
function hasLiveContainer(el: JsxOpeningElement | JsxSelfClosingElement, callable: TsNode | undefined): boolean {
  return el.getAttributes().some((attribute) => {
    if (!Node.isJsxAttribute(attribute) || attribute.getNameNode().getText() !== CONTAINER) {
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
    if ((Node.isIdentifier(value) && value.getText() === "undefined") || value.isKind(SyntaxKind.NullKeyword) || usesDocumentBody(value)) {
      return false;
    }
    return usesOwningContainer(value, callable);
  });
}

function run(ctx: GateRunCtx): void {
  for (const sf of ctx.files) {
    const rel = repoRelative(sf.getFilePath());
    if (!rel.includes(UI_SRC)) {
      continue;
    }
    const portalTags = new Set(
      baseUiBindings(sf)
        .filter((binding) => !binding.typeOnly)
        .map((binding) => `${binding.local}.Portal`),
    );
    const portals = [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)].filter((el) =>
      portalTags.has(el.getTagNameNode().getText()),
    );
    if (portals.length === 0) {
      continue;
    }
    for (const el of portals) {
      const callable = owningCallable(el);
      if (!declaresContainer(callable)) {
        ctx.report(el, { token: ARM_TOKENS.noProp, offset: 0 });
      }
      if (!hasLiveContainer(el, callable)) {
        ctx.report(el, { token: ARM_TOKENS.notWired, offset: 0 });
      }
    }
  }
}

const AT = "packages/ui/src/primitives/dialog/probe-dialog.tsx";

export const gate: GateDescriptor = {
  name: "baseui-portal-container-seam",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // Per-file: the portal, the props interface, and the wiring are all in the seal.
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes(UI_SRC),
  run,

  mustFlag: [
    {
      files:
        'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  className?: string;\n}\nexport const P = (_props: DialogPopupProps) => (\n  <BaseDialog.Portal>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      at: AT,
      expect: { token: "no-container-prop" },
      why: "ARM A — the seal portals but offers the caller no way to place it, so every popup lands on document.body outside the ThemeScope",
    },
    {
      files:
        'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: unknown;\n}\nexport const P = (_props: DialogPopupProps) => (\n  <BaseDialog.Portal>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      at: AT,
      expect: { token: "container-not-wired" },
      why: "ARM B, the dead-wire half: the prop is declared but not threaded — an affordance that looks live and does nothing, which no type error can catch because the seal simply never reads it",
    },
    {
      files:
        'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: unknown;\n}\nexport const P = ({ container }: DialogPopupProps) => <BaseDialog.Portal container={container} />;\nexport const Q = (_props: DialogPopupProps) => <BaseDialog.Portal />;\n',
      at: AT,
      expect: { count: 1, token: "container-not-wired" },
      why: "the SELF-CLOSING spelling, and per-OCCURRENCE granularity: one wired portal and one unwired portal in the same file must yield exactly one finding, on the unwired one",
    },
  ],
  mustPass: [
    {
      files:
        'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nimport type { DialogPortalProps as BasePortalProps } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  container?: BasePortalProps["container"];\n}\nexport const P = ({ container }: DialogPopupProps) => (\n  <BaseDialog.Portal container={container}>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
      at: AT,
      why: "the reference shape all ten portal-bearing seals already have: a DERIVED container prop, threaded through to Base UI",
    },
    {
      files: 'export interface CardProps {\n  className?: string;\n}\nexport const C = () => <div className="x" />;\n',
      at: "packages/ui/src/primitives/card/probe-card.tsx",
      why: "a seal with no portal at all owes nothing — the gate keys on the rendered `*.Portal`, not on the package",
    },
  ],
};
