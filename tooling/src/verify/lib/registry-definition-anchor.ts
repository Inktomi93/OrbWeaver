// How a registry-definition policy names and anchors one definition's declaration.
//
// The runtime derives a finding's position token from the first identifier-or-KEYWORD in the reported
// node's text, which for `export function makeChatsSection(...)` is `export` — a position every factory
// finding in the family would then share. Anchoring on the declared NAME keeps the waiver position stable
// and the diagnostic legible, and it is the same identity across both authoring shapes.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";

const ANONYMOUS = "<anonymous>";

/** The declared name of a definition's declaration, across both sanctioned authoring shapes. */
export function definitionName(declaration: MorphNode): string {
  return Node.isVariableDeclaration(declaration) || Node.isFunctionDeclaration(declaration) ? (declaration.getName() ?? ANONYMOUS) : ANONYMOUS;
}

/** The token/offset pair that anchors a finding on the declared name, or undefined when it has none. */
export function definitionAnchor(declaration: MorphNode): { readonly token: string; readonly offset: number } | undefined {
  const name = definitionName(declaration);
  if (name === ANONYMOUS) {
    return;
  }
  const offset = declaration.getText().indexOf(name);
  return offset < 0 ? undefined : { token: name, offset };
}
