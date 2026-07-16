// Gate: modal-body-not-placeholder (client-architecture-lockdown.md §6d / §16 G13) — a ModalDefinition
// (features/**/lib/*-modal.tsx) whose FUNCTION-arm `body` renders a `<SectionPlaceholder>` is RED. An
// unbuilt modal uses the DECLARED-PLANNED arm (`body: { planned: "<reason>" }`); a placeholder-rendering
// function body is the silent-sparkle anti-pattern, now unspellable. Walks every `**/lib/*-modal.tsx`.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const PLACEHOLDER_TAG = "SectionPlaceholder";
/** A co-located modal definition file: `features/<owner>/lib/<id>-modal.tsx`. */
const MODAL_FILE_RE = /\/lib\/[^/]+-modal\.tsx$/;

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

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
  visit: (node, sf, ctx) => {
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
    ctx.report({
      file: rel(sf.getFilePath()),
      line: node.getStartLineNumber(),
      column: node.getSourceFile().getLineAndColumnAtPos(node.getStart()).column,
      token: `"${node.getName()}"`,
    });
  },
  mustFlag: [
    {
      files: "export const themeModal: ModalDefinition = { id: 'theme', body: () => <SectionPlaceholder /> };\n",
      at: "packages/client/src/features/settings/lib/theme-modal.tsx",
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
