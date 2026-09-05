import type { Expression, Identifier, Node, ObjectLiteralExpression, SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind, Node as TsNode, VariableDeclarationKind } from "ts-morph";
import type { GateContractCode, GateContractFinding, GateContractReport } from "../contract/gate-contract.ts";
import { readExpressionString } from "./config-static-read.ts";

const LEGACY_FIELDS: ReadonlySet<string> = new Set(["scanRoot", "scopeSafety", "begin", "finalize", "run"]);
const DIRECT_WALK_METHODS: ReadonlySet<string> = new Set([
  "forEachDescendant",
  "getDescendants",
  "getDescendantsOfKind",
  "getFirstDescendant",
  "getFirstDescendantByKind",
  "getSourceFile",
  "getSourceFiles",
]);
const MUTATOR_METHODS: ReadonlySet<string> = new Set([
  "add",
  "clear",
  "copyWithin",
  "delete",
  "fill",
  "pop",
  "push",
  "reverse",
  "set",
  "shift",
  "sort",
  "splice",
  "unshift",
]);
const ASSIGNMENT_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsToken,
  SyntaxKind.PlusEqualsToken,
  SyntaxKind.MinusEqualsToken,
  SyntaxKind.AsteriskEqualsToken,
  SyntaxKind.AsteriskAsteriskEqualsToken,
  SyntaxKind.SlashEqualsToken,
  SyntaxKind.PercentEqualsToken,
  SyntaxKind.LessThanLessThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  SyntaxKind.AmpersandEqualsToken,
  SyntaxKind.BarEqualsToken,
  SyntaxKind.CaretEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
]);
const BASELINE_SUFFIX = ".baseline.json";
const PROBE_GATE_RE = /(^|\/)__(?:g|dc)_/u;

function repoRel(root: string, path: string): string {
  const withoutRoot = path.startsWith(root) ? path.slice(root.length) : path;
  return withoutRoot.startsWith("/") ? withoutRoot.slice(1) : withoutRoot;
}

function location(root: string, node: Node, code: GateContractCode, detail: string): GateContractFinding {
  const at = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return { file: repoRel(root, node.getSourceFile().getFilePath()), line: at.line, column: at.column, code, detail };
}

function staticName(node: Node | undefined): string | undefined {
  if (node === undefined) {
    return;
  }
  if (TsNode.isIdentifier(node) || TsNode.isStringLiteral(node) || TsNode.isNoSubstitutionTemplateLiteral(node)) {
    return TsNode.isIdentifier(node) ? node.getText() : node.getLiteralText();
  }
  return TsNode.isComputedPropertyName(node) ? staticName(node.getExpression()) : undefined;
}

function memberName(expression: Expression): string | undefined {
  if (TsNode.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }
  return TsNode.isElementAccessExpression(expression) ? staticName(expression.getArgumentExpression()) : undefined;
}

function unwrap(expression: Expression): Expression {
  let current = expression;
  while (TsNode.isAsExpression(current) || TsNode.isSatisfiesExpression(current) || TsNode.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

function receiverOf(expression: Expression): Expression | undefined {
  return TsNode.isPropertyAccessExpression(expression) || TsNode.isElementAccessExpression(expression) ? expression.getExpression() : undefined;
}

function rootIdentifier(expression: Expression): Identifier | undefined {
  let current = unwrap(expression);
  while (TsNode.isPropertyAccessExpression(current) || TsNode.isElementAccessExpression(current)) {
    current = unwrap(current.getExpression());
  }
  return TsNode.isIdentifier(current) ? current : undefined;
}

function symbolDeclares(identifier: Identifier, declaration: VariableDeclaration): boolean {
  return (
    identifier
      .getSymbol()
      ?.getDeclarations()
      .some((candidate) => candidate === declaration) === true
  );
}

function moduleVariables(sf: SourceFile): readonly VariableDeclaration[] {
  return sf
    .getVariableStatements()
    .flatMap((statement) => statement.getDeclarations())
    .filter((declaration) => TsNode.isIdentifier(declaration.getNameNode()));
}

function resolveObjectLiteral(expression: Expression, seen: Set<VariableDeclaration> = new Set()): Node | undefined {
  const value = unwrap(expression);
  if (TsNode.isObjectLiteralExpression(value)) {
    return value;
  }
  if (!TsNode.isIdentifier(value)) {
    return;
  }
  const declaration = value
    .getSymbol()
    ?.getDeclarations()
    .find((candidate): candidate is VariableDeclaration => TsNode.isVariableDeclaration(candidate));
  if (declaration === undefined || seen.has(declaration)) {
    return;
  }
  seen.add(declaration);
  const initializer = declaration.getInitializer();
  return initializer === undefined ? undefined : resolveObjectLiteral(initializer, seen);
}

function usesDefineGate(sf: SourceFile): boolean {
  const declaration = sf.getVariableDeclaration("gate");
  const initializer = declaration?.getInitializer();
  if (initializer === undefined) {
    return false;
  }
  const value = unwrap(initializer);
  if (!(TsNode.isCallExpression(value) && TsNode.isIdentifier(value.getExpression()))) {
    return false;
  }
  const local = value.getExpression().getText();
  return sf.getImportDeclarations().some((importDeclaration) => {
    if (!importDeclaration.getModuleSpecifierValue().endsWith("/contract/gate.ts")) {
      return false;
    }
    return importDeclaration
      .getNamedImports()
      .some((namedImport) => namedImport.getName() === "defineGate" && (namedImport.getAliasNode()?.getText() ?? "defineGate") === local);
  });
}

function descriptorPropertyName(property: Node): string | undefined {
  if (
    TsNode.isPropertyAssignment(property) ||
    TsNode.isMethodDeclaration(property) ||
    TsNode.isGetAccessorDeclaration(property) ||
    TsNode.isSetAccessorDeclaration(property)
  ) {
    const name = property.getNameNode();
    if (TsNode.isComputedPropertyName(name)) {
      const read = readExpressionString(name.getExpression());
      return read.unresolved.length === 0 && read.values.length === 1 ? read.values[0] : undefined;
    }
    return staticName(name);
  }
  return TsNode.isShorthandPropertyAssignment(property) ? property.getName() : undefined;
}

function projectBindings(sf: SourceFile): { readonly named: ReadonlySet<string>; readonly namespaces: ReadonlySet<string> } {
  const named = new Set<string>();
  const namespaces = new Set<string>();
  for (const importDeclaration of sf.getImportDeclarations()) {
    if (importDeclaration.getModuleSpecifierValue() !== "ts-morph") {
      continue;
    }
    const namespace = importDeclaration.getNamespaceImport();
    if (namespace !== undefined) {
      namespaces.add(namespace.getText());
    }
    for (const binding of importDeclaration.getNamedImports()) {
      if (binding.getName() === "Project") {
        named.add(binding.getAliasNode()?.getText() ?? "Project");
      }
    }
  }
  return { named, namespaces };
}

function isProjectConstructor(expression: Expression, bindings: ReturnType<typeof projectBindings>): boolean {
  const value = unwrap(expression);
  if (TsNode.isIdentifier(value)) {
    return bindings.named.has(value.getText());
  }
  if (TsNode.isPropertyAccessExpression(value)) {
    return value.getName() === "Project" && TsNode.isIdentifier(value.getExpression()) && bindings.namespaces.has(value.getExpression().getText());
  }
  if (TsNode.isElementAccessExpression(value)) {
    return (
      staticName(value.getArgumentExpression()) === "Project" &&
      TsNode.isIdentifier(value.getExpression()) &&
      bindings.namespaces.has(value.getExpression().getText())
    );
  }
  return false;
}

function descriptorNameNode(property: Node): Node | undefined {
  return TsNode.isPropertyAssignment(property) ||
    TsNode.isMethodDeclaration(property) ||
    TsNode.isGetAccessorDeclaration(property) ||
    TsNode.isSetAccessorDeclaration(property)
    ? property.getNameNode()
    : undefined;
}

function inspectDescriptorFields(object: ObjectLiteralExpression, root: string, out: GateContractFinding[]): void {
  for (const property of object.getProperties()) {
    if (TsNode.isSpreadAssignment(property)) {
      out.push(location(root, property, "descriptor-wrapper", "descriptor spreads are forbidden; every field must be visible in the `defineGate` object"));
      continue;
    }
    const nameNode = descriptorNameNode(property);
    const name = descriptorPropertyName(property);
    if (nameNode !== undefined && TsNode.isComputedPropertyName(nameNode)) {
      out.push(location(root, nameNode, "descriptor-wrapper", "computed descriptor keys are forbidden; spell the required field directly"));
    }
    if (name !== undefined && LEGACY_FIELDS.has(name)) {
      out.push(location(root, property, "legacy-field", `legacy descriptor field \`${name}\` is forbidden`));
    }
  }
}

function inspectDescriptor(sf: SourceFile, root: string, out: GateContractFinding[]): void {
  const declaration = sf.getVariableDeclaration("gate");
  if (declaration === undefined) {
    out.push(location(root, sf, "descriptor-wrapper", "gate module exports no `gate` declaration"));
    return;
  }
  const wrapped = usesDefineGate(sf);
  if (!wrapped) {
    out.push(location(root, declaration, "descriptor-wrapper", "export `gate` through an imported `defineGate({ ... })` call"));
  }
  const initializer = declaration.getInitializer();
  if (initializer === undefined) {
    return;
  }
  const value = unwrap(initializer);
  const argument = wrapped && TsNode.isCallExpression(value) ? value.getArguments()[0] : value;
  if (argument === undefined) {
    return;
  }
  if (wrapped && !TsNode.isObjectLiteralExpression(argument)) {
    out.push(location(root, argument, "descriptor-wrapper", "the `defineGate` argument must be an object literal"));
  }
  if (!TsNode.isExpression(argument)) {
    return;
  }
  const object = resolveObjectLiteral(argument);
  if (object === undefined || !TsNode.isObjectLiteralExpression(object)) {
    return;
  }
  inspectDescriptorFields(object, root, out);
}

function inspectWalksAndProjects(sf: SourceFile, root: string, out: GateContractFinding[]): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const name = memberName(call.getExpression());
    if (name !== undefined && DIRECT_WALK_METHODS.has(name)) {
      out.push(location(root, call.getExpression(), "direct-walk", `gate modules cannot call \`${name}\`; use visitors, ctx.files, or a shared reader`));
    }
  }
  const bindings = projectBindings(sf);
  for (const creation of sf.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    if (isProjectConstructor(creation.getExpression(), bindings)) {
      out.push(location(root, creation, "gate-owned-project", "gate modules cannot construct a ts-morph Project"));
    }
  }
}

function inspectModuleState(sf: SourceFile, root: string, out: GateContractFinding[]): void {
  const declarations = moduleVariables(sf);
  const reported = new Set<VariableDeclaration>();
  for (const statement of sf.getVariableStatements()) {
    if (statement.getDeclarationKind() !== VariableDeclarationKind.Const) {
      out.push(location(root, statement, "module-let", "module-scope let/var state is forbidden; allocate invocation state inside `create`"));
    }
  }
  const reportMutation = (receiver: Expression, detail: string): void => {
    const identifier = rootIdentifier(receiver);
    const declaration = identifier === undefined ? undefined : declarations.find((candidate) => symbolDeclares(identifier, candidate));
    if (declaration !== undefined && !reported.has(declaration)) {
      reported.add(declaration);
      out.push(
        location(root, declaration, "module-mutation", `module-scope \`${declaration.getName()}\` is mutated via ${detail}; allocate it inside \`create\``),
      );
    }
  };
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const method = memberName(callee);
    const receiver = receiverOf(callee);
    if (method !== undefined && receiver !== undefined && MUTATOR_METHODS.has(method)) {
      reportMutation(receiver, `\`${method}()\``);
    }
  }
  for (const binary of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (ASSIGNMENT_KINDS.has(binary.getOperatorToken().getKind())) {
      reportMutation(binary.getLeft(), "assignment");
    }
  }
  for (const update of [...sf.getDescendantsOfKind(SyntaxKind.PrefixUnaryExpression), ...sf.getDescendantsOfKind(SyntaxKind.PostfixUnaryExpression)]) {
    if (update.getOperatorToken() === SyntaxKind.PlusPlusToken || update.getOperatorToken() === SyntaxKind.MinusMinusToken) {
      reportMutation(update.getOperand(), "update");
    }
  }
}

function inspectBaselines(sf: SourceFile, root: string, out: GateContractFinding[]): void {
  const candidates: Node[] = [
    ...sf.getDescendantsOfKind(SyntaxKind.StringLiteral),
    ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
    ...sf.getDescendantsOfKind(SyntaxKind.TemplateExpression),
    ...sf.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((binary) => binary.getOperatorToken().getKind() === SyntaxKind.PlusToken),
  ];
  for (const candidate of candidates) {
    const parent = candidate.getParent();
    if (
      (TsNode.isBinaryExpression(parent) && parent.getOperatorToken().getKind() === SyntaxKind.PlusToken) ||
      TsNode.isTemplateExpression(parent) ||
      TsNode.isTemplateSpan(parent)
    ) {
      continue;
    }
    const read = readExpressionString(candidate);
    if (read.unresolved.length === 0 && read.values.some((value) => value.endsWith(BASELINE_SUFFIX))) {
      out.push(location(root, candidate, "baseline-ledger", "gate-owned baseline ledgers are forbidden; use exact grants or warning debt"));
    }
  }
}

function compareFindings(a: GateContractFinding, b: GateContractFinding): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code) || a.detail.localeCompare(b.detail);
}

/** Inspect gate modules without importing them. This is intentionally mechanical: semantic quality belongs
 * to `mustFlag`/`mustPass`, differential runs, and review rather than a second policy interpreter. */
export function inspectGateContract(sourceFiles: readonly SourceFile[], root: string): GateContractReport {
  const files = sourceFiles.filter((sf) => !PROBE_GATE_RE.test(repoRel(root, sf.getFilePath())));
  const findings: GateContractFinding[] = [];
  for (const sf of files) {
    inspectDescriptor(sf, root, findings);
    inspectWalksAndProjects(sf, root, findings);
    inspectModuleState(sf, root, findings);
    inspectBaselines(sf, root, findings);
  }
  return { files: files.length, findings: findings.sort(compareFindings) };
}
