import { Node } from "ts-morph";

/** A symbol mention inside a JSDoc link is documentation, distinct from JSDoc type annotations and code references. */
export function isDocumentationLinkReference(node: Node): boolean {
  return [node, ...node.getAncestors()].some((part) => Node.isJSDocLink(part) || Node.isJSDocLinkCode(part) || Node.isJSDocLinkPlain(part));
}
