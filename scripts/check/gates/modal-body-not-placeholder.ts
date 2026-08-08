// Gate: modal-body-not-placeholder (client-architecture-lockdown.md §6d / §16 G13) — a ModalDefinition
// (features/**/lib/*-modal.tsx) whose FUNCTION-arm `body` renders a `<SectionPlaceholder>` is RED. An
// unbuilt modal uses the DECLARED-PLANNED arm (`body: { planned: "<reason>" }`); a placeholder-rendering
// function body is the silent-sparkle anti-pattern, now unspellable. Walks every `**/lib/*-modal.tsx`.
//
// SUPPRESSION: the finding is NODE-anchored and carries the modal's own name as its token, so
// `// @orb-gate-ignore modal-body-not-placeholder("themeModal"): <reason>` works. It reported through the
// explicit-`Finding` overload until 2026-08-08, which bypasses `hasGateIgnore` by construction
// (GATE-AUTHORING §1) — every marker on this gate was inert and nothing said so.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const PLACEHOLDER_TAG = "SectionPlaceholder";
/** A co-located modal definition file: `features/<owner>/lib/<id>-modal.tsx`. */
const MODAL_FILE_RE = /\/lib\/[^/]+-modal\.tsx$/;

/** Does this subtree render a `<SectionPlaceholder …>` (open or self-closing) JSX element? */
function rendersPlaceholder(node: Node): boolean {
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    if (el.getTagNameNode().getText() === PLACEHOLDER_TAG) {
      return true;
    }
  }
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (el.getTagNameNode().getText() === PLACEHOLDER_TAG) {
      return true;
    }
  }
  return false;
}

export const gate: GateDescriptor = {
  name: "modal-body-not-placeholder",
  docRow: "client-architecture-lockdown.md §6d / §16 G13",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a ModalDefinition's function `body` renders <SectionPlaceholder> — an unbuilt modal is the " +
    'DECLARED-PLANNED arm (`body: { planned: "<reason>" }`), never a placeholder-rendering function ' +
    "body (client-architecture-lockdown.md §6d).",
  fix: 'use `body: { planned: "<reason>" }` for an unbuilt modal, or render a real body — a placeholder function body is unspellable.',
  scanRoot: (p) => MODAL_FILE_RE.test(p),
  kinds: [SyntaxKind.VariableDeclaration],
  visit: (node, _sf, ctx) => {
    if (!Node.isVariableDeclaration(node)) {
      return;
    }
    const typeNode = node.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("ModalDefinition")) {
      return;
    }
    const init = node.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      return;
    }
    const bodyProp = init.getProperty("body");
    if (bodyProp === undefined || !Node.isPropertyAssignment(bodyProp)) {
      return;
    }
    const body = bodyProp.getInitializer();
    // Only a FUNCTION body can render JSX; the `{ planned }` arm is an object literal (legal, skip).
    if (body === undefined || !(Node.isArrowFunction(body) || Node.isFunctionExpression(body))) {
      return;
    }
    if (!rendersPlaceholder(body)) {
      return;
    }
    ctx.report(node, { token: `"${node.getName()}"`, offset: 0 });
  },
  mustFlag: [
    {
      files: "export const themeModal: ModalDefinition = { id: 'theme', body: () => <SectionPlaceholder /> };\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      expect: { count: 1, token: '"themeModal"' },
      why: "a ModalDefinition function body rendering <SectionPlaceholder> — the silent-sparkle anti-pattern",
    },
  ],
  mustPass: [
    {
      files: "export const draftModal: ModalDefinition = { id: 'draft', body: { planned: 'build pending' } };\n",
      at: "packages/client/src/features/x/lib/draft-modal.tsx",
      why: "the DECLARED-PLANNED arm (object literal, not a function) — the sanctioned unbuilt state, passes",
    },
    {
      files: "export const themeModal: ModalDefinition = { id: 'theme', body: () => <ThemePanel /> };\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
      why: "a function body rendering a REAL body (no <SectionPlaceholder>) — the false branch, passes",
    },
  ],
};
