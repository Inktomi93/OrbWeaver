// Shared AST primitives for the caught-failure classifier siblings: literal-member/string reads, binding
// identity (`referencesBinding`/`directlyCarriesBinding`), import provenance, and the intervening-write
// guard every ownership predicate needs before trusting an identifier's declaration. No ownership verdicts
// live here — every function is a pure syntactic reader with no domain vocabulary.
import type { BindingElement, CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { unwrapExpression } from "./ast-read.ts";

const NOOP_TEXT: ReadonlySet<string> = new Set(["undefined", "null", "false", "true", "0", "-1", '""', "''", "void 0"]);
export const FUNCTION_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.MethodDeclaration,
]);
/** The two chat/observability doors shared by more than one classification cluster. */
export const OBSERVABILITY_MODULES: ReadonlySet<string> = new Set(["#foundation/observability", "#foundation/observability/logging"]);
/** Chain PLUMBING — walked through to reach the work that actually produced the promise. */
export const PROMISE_CHAIN_LINKS: ReadonlySet<string> = new Set(["catch", "finally", "then"]);
export const REJECTION_HANDLER_INDEX: ReadonlyMap<string, number> = new Map([
  ["catch", 0],
  ["then", 1],
]);

export function literalMember(node: Node): { readonly name: string; readonly receiver: Node } | undefined {
  const member = unwrapExpression(node);
  if (member.isKind(SyntaxKind.PropertyAccessExpression)) {
    return { name: member.getName(), receiver: unwrapExpression(member.getExpression()) };
  }
  if (!member.isKind(SyntaxKind.ElementAccessExpression)) {
    return;
  }
  const key = member.getArgumentExpression();
  const name = key === undefined ? undefined : staticStringValue(key);
  return name === undefined ? undefined : { name, receiver: unwrapExpression(member.getExpression()) };
}

export function staticStringValue(node: Node): string | undefined {
  const typedLiteral = node.getType().getLiteralValue();
  if (typeof typedLiteral === "string") {
    return typedLiteral;
  }
  const value = unwrapExpression(node);
  if (value.isKind(SyntaxKind.StringLiteral) || value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return value.getLiteralValue();
  }
  if (value.isKind(SyntaxKind.BinaryExpression) && value.getOperatorToken().getText() === "+") {
    const left = staticStringValue(value.getLeft());
    const right = staticStringValue(value.getRight());
    return left === undefined || right === undefined ? undefined : left + right;
  }
  const literal = value.getType().getLiteralValue();
  if (typeof literal === "string") {
    return literal;
  }
  if (!value.isKind(SyntaxKind.Identifier)) {
    return;
  }
  const declaration = value.getSymbol()?.getDeclarations()[0];
  if (declaration?.isKind(SyntaxKind.VariableDeclaration) !== true || declaration.getVariableStatement()?.getDeclarationKind() !== "const") {
    return;
  }
  const initializer = declaration.getInitializer();
  return initializer === undefined ? undefined : staticStringValue(initializer);
}

export function calleeName(call: CallExpression): string | undefined {
  const callee = unwrapExpression(call.getExpression());
  const member = literalMember(callee);
  if (member !== undefined) {
    return member.name;
  }
  return callee.isKind(SyntaxKind.Identifier) ? callee.getText() : undefined;
}

export function isFallback(node: Node): boolean {
  const value = unwrapExpression(node);
  if (NOOP_TEXT.has(value.getText())) {
    return true;
  }
  if (value.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return value.getElements().length === 0;
  }
  return value.isKind(SyntaxKind.ObjectLiteralExpression) && value.getProperties().length === 0;
}

export function referencesBinding(node: Node, binding: Node): boolean {
  const symbol = binding.getSymbol();
  if (symbol === undefined) {
    return false;
  }
  const declaration = binding.getParent();
  if (declaration === undefined) {
    return false;
  }
  const matches = (candidate: Node): boolean =>
    candidate.getSourceFile().getFilePath() === declaration.getSourceFile().getFilePath() &&
    candidate.getStart() === declaration.getStart() &&
    candidate.getKind() === declaration.getKind();
  const identifierMatches = (identifier: Node): boolean =>
    identifier.isKind(SyntaxKind.Identifier) &&
    identifier.getDefinitions().some((definition) => {
      const candidate = definition.getDeclarationNode();
      return candidate !== undefined && matches(candidate);
    });
  return (node.isKind(SyntaxKind.Identifier) && identifierMatches(node)) || node.getDescendantsOfKind(SyntaxKind.Identifier).some(identifierMatches);
}

export function directlyCarriesBinding(node: Node, binding: Node): boolean {
  const value = unwrapExpression(node);
  return value.isKind(SyntaxKind.Identifier) && referencesBinding(value, binding);
}

export function ambientIdentifier(node: Node, name: string, importModules: ReadonlySet<string>): boolean {
  if (!node.isKind(SyntaxKind.Identifier) || node.getText() !== name) {
    return false;
  }
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  return declarations.every((declaration) => {
    if (declaration.getSourceFile() !== node.getSourceFile() || declaration.getSourceFile().isDeclarationFile()) {
      return true;
    }
    const module = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.getModuleSpecifierValue();
    return module !== undefined && importModules.has(module);
  });
}

export function importedName(node: Node, modules: ReadonlySet<string>): string | undefined {
  const value = unwrapExpression(node);
  if (!value.isKind(SyntaxKind.Identifier)) {
    return;
  }
  let imported: string | undefined;
  const declarations = value.getSymbol()?.getDeclarations() ?? [];
  for (const declaration of value.getSourceFile().getImportDeclarations()) {
    if (!modules.has(declaration.getModuleSpecifierValue())) {
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
      if (declarations.some((definition) => definition.getSourceFile() === specifier.getSourceFile() && definition.getStart() === specifier.getStart())) {
        imported = specifier.getName();
      }
    }
  }
  return imported;
}

export function declarationsOf(node: Node): readonly Node[] {
  const value = unwrapExpression(node);
  if (!value.isKind(SyntaxKind.Identifier)) {
    return [];
  }
  const symbol = value.getSymbol();
  return symbol?.getAliasedSymbol()?.getDeclarations() ?? symbol?.getDeclarations() ?? [];
}

export function hasInterveningWrite(use: Node, declaration: Node): boolean {
  const source = use.getSourceFile();
  const assignmentOperators = new Set(["=", "&&=", "||=", "??=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^="]);
  const writesDeclaration = (target: Node): boolean => {
    const left = unwrapExpression(target);
    const identifiers = left.isKind(SyntaxKind.Identifier) ? [left] : left.getDescendantsOfKind(SyntaxKind.Identifier);
    return identifiers.some((identifier) =>
      identifier.getDefinitions().some((definition) => {
        const candidate = definition.getDeclarationNode();
        return candidate !== undefined && candidate.getSourceFile() === declaration.getSourceFile() && candidate.getStart() === declaration.getStart();
      }),
    );
  };
  const binaryWrite = source.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((assignment) => {
    // Function declarations are hoisted, so a write may precede the declaration text while still replacing
    // the binding used below. Initializers are not BinaryExpression assignments; the only safe temporal
    // boundary is the use itself.
    if (assignment.getStart() >= use.getStart() || !assignmentOperators.has(assignment.getOperatorToken().getText())) {
      return false;
    }
    return writesDeclaration(assignment.getLeft());
  });
  if (binaryWrite) {
    return true;
  }
  return [...source.getDescendantsOfKind(SyntaxKind.ForOfStatement), ...source.getDescendantsOfKind(SyntaxKind.ForInStatement)].some(
    (statement) => statement.getStart() < use.getStart() && writesDeclaration(statement.getInitializer()),
  );
}

/** The VALUE node of an object property, either spelling (`{ errorToast: x }` / `{ errorToast }`). */
export function propertyValueNode(property: Node | undefined): Node | undefined {
  if (property?.isKind(SyntaxKind.PropertyAssignment) === true) {
    return property.getInitializer();
  }
  return property?.isKind(SyntaxKind.ShorthandPropertyAssignment) === true ? property.getNameNode() : undefined;
}

/** The function a call resolves to — a declaration, or a `const f = (…) => …` initializer. */
export function resolvedFunction(declaration: Node): Node | undefined {
  if (declaration.isKind(SyntaxKind.FunctionDeclaration)) {
    return declaration;
  }
  return declaration.isKind(SyntaxKind.VariableDeclaration) ? declaration.getInitializer() : undefined;
}

function declaresName(name: Node, text: string): boolean {
  if (name.isKind(SyntaxKind.Identifier)) {
    return name.getText() === text;
  }
  return name.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === text);
}

/** The LAST declaration of this name textually before `value`, walking outward through enclosing function
 *  scopes. The fallback for a name the symbol table could not resolve — deliberately positional, so a later
 *  redeclaration cannot lend its provenance backwards. */
function nearestPrecedingInitializer(value: Node): Node | undefined {
  let boundary: Node | undefined = value.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind())) ?? value.getSourceFile();
  const text = value.getText();
  let found: Node | undefined;
  while (found === undefined && boundary !== undefined) {
    const declarations = boundary
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .filter((declaration) => declaration.getStart() < value.getStart() && declaresName(declaration.getNameNode(), text))
      .sort((left, right) => right.getStart() - left.getStart());
    found = declarations[0]?.getInitializer();
    boundary = boundary.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()) || ancestor.isKind(SyntaxKind.SourceFile));
  }
  return found;
}

/** React's tuple: only element [1] is the SETTER slot. A destructured value that merely LOOKS like a setter
 *  (`const [setError] = useState(...)`) is the state VALUE, and setting it observes nothing. */
function bindingElementIsSetterSlot(element: BindingElement, modules: ReadonlySet<string>, factories: ReadonlySet<string>): boolean {
  if (!(modules.has("react") && factories.has("useState"))) {
    return true;
  }
  const pattern = element.getParentIfKind(SyntaxKind.ArrayBindingPattern);
  return pattern !== undefined && pattern.getElements().indexOf(element) === 1;
}

/** Does this value trace back — through import provenance, intervening-write guards, and at most one
 *  destructure/reassignment hop — to a call of one of the named factories? Deliberately GENERIC (no
 *  failure-outcome vocabulary): both the governed-sink recognizers (`caught-failure-outcome.ts`, a React
 *  setter fed a failure) and the framework-ownership walk (`caught-failure-scope.ts`, a TanStack query/form
 *  hook) share this exact provenance shape, so it lives here rather than owing a choice between them. */
export function originatesFromFactory(node: Node, modules: ReadonlySet<string>, factories: ReadonlySet<string>, seen: ReadonlySet<Node> = new Set()): boolean {
  const value = unwrapExpression(node);
  if (seen.has(value)) {
    return false;
  }
  const nextSeen = new Set(seen).add(value);
  if (value.isKind(SyntaxKind.CallExpression)) {
    const callee = unwrapExpression(value.getExpression());
    const imported = importedName(callee, modules);
    return imported !== undefined && factories.has(imported);
  }
  if (!value.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const valueDeclaration = value.getSymbol()?.getDeclarations()[0];
  if (valueDeclaration !== undefined && hasInterveningWrite(value, valueDeclaration)) {
    return false;
  }
  if (valueDeclaration?.isKind(SyntaxKind.Parameter) === true) {
    return false;
  }
  if (valueDeclaration?.isKind(SyntaxKind.BindingElement) === true) {
    if (!bindingElementIsSetterSlot(valueDeclaration, modules, factories)) {
      return false;
    }
    const initializer = valueDeclaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
    return initializer !== undefined && originatesFromFactory(initializer, modules, factories, nextSeen);
  }
  if (valueDeclaration?.isKind(SyntaxKind.VariableDeclaration) === true) {
    const initializer = valueDeclaration.getInitializer();
    return initializer !== undefined && originatesFromFactory(initializer, modules, factories, nextSeen);
  }
  const initializer = nearestPrecedingInitializer(value);
  return initializer !== undefined && originatesFromFactory(initializer, modules, factories, nextSeen);
}
