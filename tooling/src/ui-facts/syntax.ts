// Small syntax readers the composition scans share.
import ts from "typescript";

export function enclosingFunction(node: ts.Node): ts.Node {
  for (let at: ts.Node = node.parent; !ts.isSourceFile(at); at = at.parent) {
    if (ts.isFunctionLike(at)) {
      return at;
    }
  }
  return node.getSourceFile();
}

/** Some node at or under `root` satisfies the test. */
export function anyNode(root: ts.Node, test: (node: ts.Node) => boolean): boolean {
  return test(root) || ts.forEachChild(root, (child) => (anyNode(child, test) ? true : undefined)) === true;
}

/** The argument is an object literal that names the property, written out or as a shorthand. */
export function hasProperty(argument: ts.Node | undefined, name: string): boolean {
  return (
    argument !== undefined &&
    ts.isObjectLiteralExpression(argument) &&
    argument.properties.some(
      (property) => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && property.name.getText() === name,
    )
  );
}

/** The identifier a call's result is bound to, or the names destructured from it. */
export function resultBinding(call: ts.CallExpression): { readonly name: string | null; readonly destructured: readonly string[] } {
  const parent = call.parent;
  if (!ts.isVariableDeclaration(parent)) {
    return { name: null, destructured: [] };
  }
  if (ts.isObjectBindingPattern(parent.name)) {
    return { name: null, destructured: parent.name.elements.map((element) => (element.propertyName ?? element.name).getText()) };
  }
  return { name: parent.name.getText(), destructured: [] };
}
