// Finite public declaration syntax for the placement reader; no instantiated type traversal.
import ts from "typescript";

const DECLARATION_MEANINGS = ["type", "value"] as const;
export type DeclarationMeaning = (typeof DECLARATION_MEANINGS)[number];
const FORMAL_CONTRIBUTIONS = ["unused", "direct", "unsupported"] as const;
type FormalContribution = (typeof FORMAL_CONTRIBUTIONS)[number];

export interface GenericFormal {
  readonly owner: ts.Declaration;
  readonly parameter: ts.TypeParameterDeclaration;
}

export function genericFormals(declarations: readonly ts.Declaration[], index: number): readonly GenericFormal[] {
  return declarations.flatMap((owner) => {
    const parameter = genericDeclaration(owner) ? owner.typeParameters?.[index] : undefined;
    return parameter === undefined ? [] : [{ owner, parameter }];
  });
}

export function shapeDeclaration(node: ts.Node): node is ts.InterfaceDeclaration | ts.TypeAliasDeclaration {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

export function valueDeclaration(node: ts.Node): node is ts.VariableDeclaration | ts.PropertyDeclaration | ts.PropertySignature {
  return ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node);
}

export function namedDeclaration(node: ts.Declaration): node is ts.NamedDeclaration {
  return shapeDeclaration(node) || valueDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || isPublicSignature(node);
}

export function typeApplication(node: ts.Node): node is ts.TypeReferenceNode | ts.ExpressionWithTypeArguments {
  return ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node);
}

export function terminalDeclaration(node: ts.Node): boolean {
  return ts.isTypeParameterDeclaration(node) || ts.isEnumDeclaration(node) || ts.isEnumMember(node);
}

/** Every operand a conditional, mapped or indexed annotation names; walking all of them can only add findings. */
export function reflectedOperands(node: ts.Node): readonly ts.Node[] | undefined {
  if (ts.isConditionalTypeNode(node)) {
    return [node.checkType, node.extendsType, node.trueType, node.falseType];
  }
  if (ts.isMappedTypeNode(node)) {
    return [node.typeParameter.constraint, node.nameType, node.type].filter((child) => child !== undefined);
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return [node.objectType, node.indexType];
  }
  return undefined;
}

export function declarationHasMeaning(declaration: ts.Declaration, meaning: DeclarationMeaning): boolean {
  if (ts.isClassDeclaration(declaration) || ts.isEnumDeclaration(declaration)) {
    return true;
  }
  return meaning === "type"
    ? ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration) || ts.isTypeParameterDeclaration(declaration)
    : valueDeclaration(declaration) ||
        isPublicSignature(declaration) ||
        ts.isModuleDeclaration(declaration) ||
        ts.isEnumMember(declaration) ||
        ts.isParameter(declaration) ||
        ts.isBindingElement(declaration) ||
        ts.isSourceFile(declaration);
}

export function genericDeclaration(node: ts.Node): node is ts.TypeAliasDeclaration | ts.InterfaceDeclaration | ts.ClassDeclaration {
  return ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node);
}

function reflectedAnnotation(node: ts.Node): boolean {
  return ts.isTypeQueryNode(node) || ts.isConditionalTypeNode(node) || ts.isMappedTypeNode(node) || ts.isIndexedAccessTypeNode(node);
}

export function primitiveLiteral(node: ts.Node | undefined): boolean {
  return (
    node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword)
  );
}

/** An expression whose type is a primitive or a literal, whatever it names. */
export function closedExpression(node: ts.Expression): boolean {
  return (
    primitiveLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    ts.isBigIntLiteral(node) ||
    ts.isRegularExpressionLiteral(node) ||
    ts.isOmittedExpression(node) ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    ts.isPrefixUnaryExpression(node) ||
    ts.isPostfixUnaryExpression(node) ||
    ts.isTypeOfExpression(node) ||
    ts.isVoidExpression(node) ||
    ts.isDeleteExpression(node)
  );
}

function objectLiteralOperands(node: ts.ObjectLiteralExpression): readonly ts.Node[] {
  return node.properties.map((property) => {
    if (ts.isPropertyAssignment(property)) {
      return property.initializer;
    }
    return ts.isSpreadAssignment(property) ? property.expression : property;
  });
}

function callOperands(node: ts.CallExpression | ts.NewExpression | ts.TaggedTemplateExpression): readonly ts.Node[] {
  const callee = ts.isTaggedTemplateExpression(node) ? node.tag : node.expression;
  const supplied = ts.isTaggedTemplateExpression(node) ? [] : (node.arguments ?? []);
  return [callee, ...(node.typeArguments ?? []), ...supplied];
}

/**
 * The syntax an inferred expression type derives from: wrapped operands, assertion types, callees with their
 * type and value arguments, and object or array members. Undefined for an expression kind with no qualified reading.
 */
export function inferredOperands(node: ts.Expression): readonly ts.Node[] | undefined {
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return [ts.isConstTypeReference(node.type) ? node.expression : node.type];
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isSpreadElement(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    return [node.expression];
  }
  if (ts.isIdentifier(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return [node];
  }
  if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) {
    return callOperands(node);
  }
  if (ts.isObjectLiteralExpression(node)) {
    return objectLiteralOperands(node);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements;
  }
  if (ts.isConditionalExpression(node)) {
    return [node.whenTrue, node.whenFalse];
  }
  return ts.isBinaryExpression(node) ? [node.left, node.right] : undefined;
}

/** The returned and yielded expressions of one function body, excluding nested functions and classes. */
export function returnedExpressions(body: ts.Block): readonly ts.Expression[] {
  const returned: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) {
      return;
    }
    if ((ts.isReturnStatement(node) || ts.isYieldExpression(node)) && node.expression !== undefined) {
      returned.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return returned;
}

export function publicClassMember(node: ts.Node, meaning: DeclarationMeaning): boolean {
  if (hardPrivateMember(node)) {
    return false;
  }
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword)) {
    return false;
  }
  return meaning !== "type" || !(ts.isConstructorDeclaration(node) || modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword));
}

function hardPrivateMember(node: ts.Node): boolean {
  return (
    (ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) &&
    ts.isPrivateIdentifier(node.name)
  );
}

export function publicParameterProperty(node: ts.ParameterDeclaration): boolean {
  const modifiers = ts.getModifiers(node) ?? [];
  return (
    publicClassMember(node, "type") &&
    modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PublicKeyword || modifier.kind === ts.SyntaxKind.ReadonlyKeyword)
  );
}

export function typeOnlyReference(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isImportTypeNode(parent) || (ts.isImportClause(parent) && parent.phaseModifier === ts.SyntaxKind.TypeKeyword)) {
    return true;
  }
  if (!ts.isImportSpecifier(parent)) {
    return false;
  }
  return (
    parent.isTypeOnly ||
    (ts.isNamedImports(parent.parent) && ts.isImportClause(parent.parent.parent) && parent.parent.parent.phaseModifier === ts.SyntaxKind.TypeKeyword)
  );
}

export function aliasTarget(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  // biome-ignore lint/suspicious/noBitwiseOperators: Alias is a native compiler flag.
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
}

export function isPublicSignature(node: ts.Node): node is ts.SignatureDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isFunctionTypeNode(node) ||
    ts.isConstructorTypeNode(node) ||
    ts.isCallSignatureDeclaration(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isIndexSignatureDeclaration(node)
  );
}

export function annotationChildren(node: ts.Node): readonly ts.Node[] {
  if (ts.isTypeParameterDeclaration(node)) {
    return [];
  }
  if (isPublicSignature(node)) {
    return [...node.parameters.flatMap((parameter) => (parameter.type === undefined ? [] : [parameter.type])), ...(node.type === undefined ? [] : [node.type])];
  }
  if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    return [...(node.heritageClauses ?? []).flatMap((clause) => clause.types), ...node.members];
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return [node.type];
  }
  if (ts.isConditionalTypeNode(node)) {
    return [node.trueType, node.falseType];
  }
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isVariableDeclaration(node)) {
    return node.type === undefined ? [] : [node.type];
  }
  const children: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

function formalChildren(node: ts.Node): readonly ts.Node[] {
  if (ts.isConditionalTypeNode(node)) {
    return [node.checkType, node.extendsType, node.trueType, node.falseType];
  }
  if (ts.isMappedTypeNode(node)) {
    return [node.typeParameter.constraint, node.nameType, node.type].filter((child) => child !== undefined);
  }
  if (ts.isClassDeclaration(node)) {
    return annotationChildren(node).filter((child) => publicClassMember(child, "type"));
  }
  return annotationChildren(node);
}

export function vocabularyChildren(node: ts.Node): readonly ts.Node[] {
  if (ts.isTypeParameterDeclaration(node)) {
    return [node.constraint, node.default].filter((child) => child !== undefined);
  }
  const children = ts.isClassDeclaration(node) ? [...annotationChildren(node)] : [...formalChildren(node)];
  if (genericDeclaration(node) || isPublicSignature(node)) {
    children.push(...(node.typeParameters ?? []));
  }
  return children;
}

function formalSlotBarrier(node: ts.Node, reference: ts.Identifier, callback: boolean): boolean {
  if (
    reflectedAnnotation(node) ||
    ts.isExpressionWithTypeArguments(node) ||
    ts.isTemplateLiteralTypeNode(node) ||
    ts.isIntersectionTypeNode(node) ||
    ts.isTypeParameterDeclaration(node)
  ) {
    return true;
  }
  if (ts.isTypeReferenceNode(node)) {
    return node.typeName !== reference;
  }
  if (ts.isTypeOperatorNode(node)) {
    return node.operator !== ts.SyntaxKind.ReadonlyKeyword;
  }
  return (
    ts.isUnionTypeNode(node) && (!callback || node.types.some((part) => part.kind === ts.SyntaxKind.AnyKeyword || part.kind === ts.SyntaxKind.UnknownKeyword))
  );
}

function directFormalSlot(reference: ts.Identifier, owner: ts.Declaration): boolean {
  let callback = false;
  let parent: ts.Node | undefined = reference.parent;
  for (; parent !== owner && !ts.isSourceFile(parent); parent = parent.parent) {
    if (formalSlotBarrier(parent, reference, callback)) {
      return false;
    }
    if (isPublicSignature(parent)) {
      callback = true;
    }
  }
  return parent === owner;
}

/** Only a native-bound public slot proves contribution; indirect syntax refuses rather than guessing substitution or erasure. */
export function formalContribution(parameter: ts.TypeParameterDeclaration, owner: ts.Declaration, checker: ts.TypeChecker): FormalContribution {
  let used = false;
  let direct = false;
  const pending = [...formalChildren(owner)];
  for (const node of pending) {
    if (ts.isIdentifier(node) && checker.getSymbolAtLocation(node)?.declarations?.includes(parameter) === true) {
      used = true;
      direct ||= directFormalSlot(node, owner);
    }
    pending.push(...formalChildren(node));
  }
  if (direct) {
    return "direct";
  }
  return used ? "unsupported" : "unused";
}

export function publicAnnotationDeclaration(
  node: ts.Node,
): node is ts.SignatureDeclaration | ts.VariableDeclaration | ts.PropertyDeclaration | ts.PropertySignature {
  return isPublicSignature(node) || valueDeclaration(node);
}

export function defaultNeedsBinding(node: ts.Node, checker: ts.TypeChecker): boolean {
  if (ts.isTypeReferenceNode(node) && checker.getSymbolAtLocation(node.typeName)?.declarations?.some(ts.isTypeParameterDeclaration) === true) {
    return true;
  }
  return ts.forEachChild(node, (child) => defaultNeedsBinding(child, checker) || undefined) === true;
}
