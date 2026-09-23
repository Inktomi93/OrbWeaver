// Product-wide ownership census for exported Zod schema values and schema factories.
//
// This is the companion to `zod-output-twin-parity`, not another parity predicate. Parity can judge an
// authored `ZodType<T>` pair once one exists; this policy asks the prior question: does every exported
// schema have an explicit output owner at all? The four admitted ownership classes are semantic:
//   1. a `z.infer` / `z.output` type query that resolves to the schema declaration;
//   2. a concrete `ZodType<T>` pair read by the parity family's canonical reader;
//   3. a parameterized/generic factory whose schema output is owned by its return contract and callers;
//   4. an exact central reviewed grant for a deliberately schema-only boundary.
// Names and shape similarity are never evidence. Module export symbols are followed to their canonical
// declarations, so local aliases, renamed exports and barrels cannot remove a schema from the census.
//
// FAMILY: `zod-output-twin-parity`. Both policies call `lib/zod-output-twin.ts` in production. This makes
// the parity module's older SINGLETON header stale, but that sibling is intentionally outside this lane's
// ownership; the shared reader and family value are the truthful final shape.
import type {
  ExportAssignment,
  Expression,
  FunctionDeclaration,
  Node as MorphNode,
  Symbol as MorphSymbol,
  PropertyDeclaration,
  Type,
  TypeReferenceNode,
  VariableDeclaration,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import {
  ownReturnExpressions,
  readAnnotatedZodOutputTwin,
  readContextualZodOutputTwin,
  readExpressionZodOutputTwin,
  typeNodeIdentifierSymbols,
  zodTypeReferenceIdentity,
} from "../lib/zod-output-twin.ts";

const OPERATION_PREFIX = "schema-only-export:";
const ZOD_PACKAGE_SEGMENT = "/node_modules/zod/";
const MAX_AGGREGATE_TYPE_DEPTH = 4;
const ZOD_PROOF_MODULE = `
export interface ZodType<Output = unknown, Input = unknown> {
  readonly _output: Output;
  readonly _input: Input;
  parse(input: unknown): Output;
}
export interface ZodObject<Output = Record<string, unknown>> extends ZodType<Output> {}
export type output<T extends ZodType> = T["_output"];
export type infer<T extends ZodType> = output<T>;
export declare function string(): ZodType<string>;
export declare function number(): ZodType<number>;
export declare function object<const Shape extends Readonly<Record<string, ZodType>>>(shape: Shape): ZodType<{ [Key in keyof Shape]: output<Shape[Key]> }>;
`;

const MESSAGE =
  "an exported Zod schema has no semantic output owner. Derive its public output with z.infer/z.output, bind an intentional authored ZodType<T> twin (checked by zod-output-twin-parity), expose it through a parameterized schema factory, or record an evidence-backed schema-only boundary in the central reviewed-grant table.";
const UNREADABLE =
  "an exported Zod schema candidate could not be resolved to a readable canonical declaration or output type. The ownership census refuses unreadable exports rather than treating them as absent.";
const FIX =
  "add a semantic output owner; for a deliberately schema-only public boundary add one central reviewed grant whose subject is this canonical declaration path and whose operation is the reported schema-only-export key.";

type SchemaDeclaration = VariableDeclaration | PropertyDeclaration | ExportAssignment;

interface SchemaCandidate {
  /** The module export whose reach makes this schema public. */
  readonly declaration: SchemaDeclaration;
  readonly anchor: MorphNode;
  readonly initializer: Expression;
  readonly ownSymbol: MorphSymbol | undefined;
  readonly twinDeclaration?: VariableDeclaration | PropertyDeclaration;
  readonly name: string;
  readonly unreadable: boolean;
  readonly aggregate: boolean;
}

interface FactoryCandidate {
  readonly declaration: FunctionDeclaration | VariableDeclaration;
  readonly anchor: MorphNode;
  readonly name: string;
  readonly ownership: "generated" | "twin" | "unowned" | "unresolved";
}

function proofFiles(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return { "node_modules/zod/index.d.ts": ZOD_PROOF_MODULE, ...files };
}

function normalizedPath(node: MorphNode): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}

function declaredByZod(type: Type): boolean {
  const declarations = type.getSymbol()?.getDeclarations() ?? [];
  return declarations.some((declaration) => normalizedPath(declaration).includes(ZOD_PACKAGE_SEGMENT));
}

function readableZodSchema(type: Type): boolean {
  const output = type.getProperty("_output");
  return output !== undefined && declaredByZod(type);
}

function ultimateSymbol(symbol: MorphSymbol | undefined): MorphSymbol | undefined {
  return symbol?.getAliasedSymbol() ?? symbol;
}

function symbolIdentity(symbol: MorphSymbol | undefined): object | undefined {
  return ultimateSymbol(symbol)?.compilerSymbol;
}

function addExportIdentity(identities: Set<object>, symbol: MorphSymbol | undefined): void {
  const target = ultimateSymbol(symbol);
  if (target !== undefined) {
    identities.add(target.compilerSymbol);
  }
}

function exportedSymbolIdentities(files: readonly import("ts-morph").SourceFile[]): ReadonlySet<object> {
  const identities = new Set<object>();
  for (const sourceFile of files) {
    for (const exported of sourceFile.getExportSymbols()) {
      addExportIdentity(identities, exported);
      for (const declaration of exported.getDeclarations()) {
        if (Node.isExportSpecifier(declaration)) {
          addExportIdentity(identities, declaration.getLocalTargetSymbol());
        }
      }
    }
  }
  return identities;
}

function exportOwnerSymbol(declaration: SchemaDeclaration | FunctionDeclaration | VariableDeclaration): MorphSymbol | undefined {
  if (Node.isExportAssignment(declaration)) {
    return declaration.getSourceFile().getDefaultExportSymbol();
  }
  if (Node.isPropertyDeclaration(declaration)) {
    return declaration.getFirstAncestorByKind(SyntaxKind.ClassDeclaration)?.getSymbol();
  }
  return declaration.getSymbol();
}

function schemaInitializer(declaration: SchemaDeclaration): Expression | undefined {
  return Node.isExportAssignment(declaration) ? declaration.getExpression() : declaration.getInitializer();
}

function unwrapSchemaExpression(expression: Expression): Expression {
  let current = expression;
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isTypeAssertion(current) ||
    Node.isSatisfiesExpression(current) ||
    Node.isNonNullExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

function schemaCandidate(declaration: SchemaDeclaration): SchemaCandidate | null {
  const initializer = schemaInitializer(declaration);
  if (initializer === undefined) {
    return null;
  }
  const exportedType = Node.isExportAssignment(declaration) ? initializer.getType() : declaration.getType();
  const readableExport = readableZodSchema(exportedType);
  const readableRaw = readableZodSchema(unwrapSchemaExpression(initializer).getType());
  if (!(readableExport || readableRaw)) {
    return null;
  }
  if (Node.isExportAssignment(declaration)) {
    return {
      declaration,
      anchor: declaration,
      initializer,
      ownSymbol: declaration.getSourceFile().getDefaultExportSymbol(),
      name: "default",
      unreadable: !readableExport,
      aggregate: false,
    };
  }
  const owner = Node.isPropertyDeclaration(declaration) ? declaration.getFirstAncestorByKind(SyntaxKind.ClassDeclaration)?.getName() : undefined;
  return {
    declaration,
    anchor: declaration.getNameNode(),
    initializer,
    ownSymbol: declaration.getSymbol(),
    twinDeclaration: declaration,
    name: owner === undefined ? declaration.getName() : `${owner}.${declaration.getName()}`,
    unreadable: !readableExport,
    aggregate: false,
  };
}

function aggregateRootName(declaration: SchemaDeclaration): string {
  if (Node.isExportAssignment(declaration)) {
    return "default";
  }
  if (Node.isPropertyDeclaration(declaration)) {
    const owner = declaration.getFirstAncestorByKind(SyntaxKind.ClassDeclaration)?.getName();
    return owner === undefined ? declaration.getName() : `${owner}.${declaration.getName()}`;
  }
  return declaration.getName();
}

function objectPropertyInitializer(expression: Expression, propertyName: string, resolving: Set<object>): Expression | undefined {
  const object = unwrapSchemaExpression(expression);
  if (!Node.isObjectLiteralExpression(object)) {
    const alias = aliasInitializer(object, resolving);
    return alias === undefined ? undefined : objectPropertyInitializer(alias, propertyName, resolving);
  }
  let resolved: Expression | undefined;
  for (const property of object.getProperties().toReversed()) {
    if (Node.isPropertyAssignment(property) && property.getName() === propertyName) {
      resolved = property.getInitializer();
      break;
    }
    if (Node.isShorthandPropertyAssignment(property) && property.getName() === propertyName) {
      resolved = property.getNameNode();
      break;
    }
  }
  return resolved;
}

function declaredAliasInitializer(symbol: MorphSymbol | undefined): Expression | undefined {
  let resolved: Expression | undefined;
  for (const declaration of ultimateSymbol(symbol)?.getDeclarations() ?? []) {
    if (Node.isVariableDeclaration(declaration) || (Node.isPropertyDeclaration(declaration) && declaration.isStatic())) {
      const initializer = declaration.getInitializer();
      if (initializer !== undefined) {
        resolved = initializer;
        break;
      }
    }
  }
  return resolved;
}

function aliasInitializer(expression: Expression, resolving = new Set<object>()): Expression | undefined {
  const value = unwrapSchemaExpression(expression);
  if (!(Node.isIdentifier(value) || Node.isPropertyAccessExpression(value))) {
    return;
  }
  const identity = symbolIdentity(value.getSymbol());
  if (identity !== undefined && resolving.has(identity)) {
    return;
  }
  if (identity !== undefined) {
    resolving.add(identity);
  }
  try {
    const declared = declaredAliasInitializer(value.getSymbol());
    if (declared !== undefined) {
      return declared;
    }
    return Node.isPropertyAccessExpression(value) ? objectPropertyInitializer(value.getExpression(), value.getName(), resolving) : undefined;
  } finally {
    if (identity !== undefined) {
      resolving.delete(identity);
    }
  }
}

function typeMayContainSchema(type: Type, location: MorphNode): boolean {
  const seen = new Set<object>();
  const visit = (current: Type, depth: number): boolean => {
    if (readableZodSchema(current) || current.isAny() || current.isUnknown()) {
      return true;
    }
    if (depth >= MAX_AGGREGATE_TYPE_DEPTH || seen.has(current.compilerType)) {
      return false;
    }
    seen.add(current.compilerType);
    return current.getProperties().some((property) => visit(property.getTypeAtLocation(location), depth + 1));
  };
  return visit(type, 0);
}

function aggregateCoordinate(anchor: MorphNode): MorphNode {
  return Node.isCallExpression(anchor) || Node.isComputedPropertyName(anchor) ? anchor.getExpression() : anchor;
}

function aggregateAmbiguityCandidate(declaration: SchemaDeclaration, expression: Expression, anchor: MorphNode, name: string): SchemaCandidate {
  return {
    declaration,
    anchor: aggregateCoordinate(anchor),
    initializer: expression,
    ownSymbol: Node.isIdentifier(expression) || Node.isPropertyAccessExpression(expression) ? expression.getSymbol() : undefined,
    name,
    unreadable: true,
    aggregate: true,
  };
}

interface AggregateVisit {
  readonly raw: Expression;
  readonly path: string;
  readonly anchor: MorphNode;
  readonly ownSymbol: MorphSymbol | undefined;
  readonly forcedUnreadable?: boolean;
}

function aggregateSchemaCandidates(declaration: SchemaDeclaration): readonly SchemaCandidate[] {
  const root = schemaInitializer(declaration);
  if (root === undefined) {
    return [];
  }
  if (readableZodSchema(root.getType()) || readableZodSchema(unwrapSchemaExpression(root).getType())) {
    return [];
  }
  const candidates: SchemaCandidate[] = [];
  const resolving = new Set<object>();
  const rootName = aggregateRootName(declaration);
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one exhaustive dispatcher keeps alias, object, spread, array, and ambiguity traversal on the same path/identity state.
  const visit = ({ raw, path, anchor, ownSymbol, forcedUnreadable = false }: AggregateVisit): void => {
    const expression = unwrapSchemaExpression(raw);
    const readableExport = readableZodSchema(raw.getType());
    const readableRaw = readableZodSchema(expression.getType());
    if (readableExport || readableRaw) {
      candidates.push({
        declaration,
        anchor: aggregateCoordinate(anchor),
        initializer: raw,
        ownSymbol,
        name: `${rootName}${path}`,
        unreadable: forcedUnreadable ? true : !readableExport,
        aggregate: true,
      });
      return;
    }

    const alias = aliasInitializer(expression);
    if (alias !== undefined) {
      const identity = symbolIdentity(expression.getSymbol());
      if (identity !== undefined && resolving.has(identity)) {
        candidates.push(aggregateAmbiguityCandidate(declaration, expression, anchor, `${rootName}${path}.$cycle`));
        return;
      }
      if (identity !== undefined) {
        resolving.add(identity);
      }
      visit({ raw: alias, path, anchor, ownSymbol, forcedUnreadable });
      if (identity !== undefined) {
        resolving.delete(identity);
      }
      return;
    }

    if (Node.isObjectLiteralExpression(expression)) {
      let computedIndex = 0;
      let spreadIndex = 0;
      for (const property of expression.getProperties()) {
        if (Node.isPropertyAssignment(property)) {
          const initializer = property.getInitializer();
          if (initializer === undefined) {
            continue;
          }
          const nameNode = property.getNameNode();
          const computed = Node.isComputedPropertyName(nameNode);
          const segment = computed ? `.$computed${String(computedIndex++)}` : `.${property.getName()}`;
          visit({
            raw: initializer,
            path: `${path}${segment}`,
            anchor: nameNode,
            ownSymbol: property.getSymbol(),
            forcedUnreadable: forcedUnreadable ? true : computed,
          });
        } else if (Node.isShorthandPropertyAssignment(property)) {
          visit({
            raw: property.getNameNode(),
            path: `${path}.${property.getName()}`,
            anchor: property.getNameNode(),
            ownSymbol: property.getSymbol(),
            forcedUnreadable,
          });
        } else if (Node.isSpreadAssignment(property)) {
          const spread = property.getExpression();
          const before = candidates.length;
          visit({ raw: spread, path, anchor: spread, ownSymbol: spread.getSymbol(), forcedUnreadable });
          if (candidates.length === before && typeMayContainSchema(spread.getType(), spread)) {
            candidates.push(aggregateAmbiguityCandidate(declaration, spread, spread, `${rootName}${path}.$spread${String(spreadIndex)}`));
          }
          spreadIndex += 1;
        }
      }
      return;
    }

    if (Node.isArrayLiteralExpression(expression)) {
      let outputIndex = 0;
      for (const element of expression.getElements()) {
        if (Node.isSpreadElement(element)) {
          const spread = element.getExpression();
          const before = candidates.length;
          visit({ raw: spread, path: `${path}[$spread${String(outputIndex)}]`, anchor: spread, ownSymbol: spread.getSymbol(), forcedUnreadable });
          if (candidates.length === before && typeMayContainSchema(spread.getType(), spread)) {
            candidates.push(aggregateAmbiguityCandidate(declaration, spread, spread, `${rootName}${path}[$spread${String(outputIndex)}]`));
          }
        } else if (Node.isExpression(element)) {
          visit({
            raw: element,
            path: `${path}[${String(outputIndex)}]`,
            anchor: element,
            ownSymbol: Node.isIdentifier(element) || Node.isPropertyAccessExpression(element) ? element.getSymbol() : undefined,
            forcedUnreadable,
          });
        }
        outputIndex += 1;
      }
    }
  };
  visit({ raw: root, path: "", anchor: declaration, ownSymbol: exportOwnerSymbol(declaration) });
  return candidates;
}

function callableReturnType(declaration: FunctionDeclaration | VariableDeclaration): Type | undefined {
  if (Node.isFunctionDeclaration(declaration)) {
    const signatures = declaration.getSymbol()?.getDeclarations().filter(Node.isFunctionDeclaration) ?? [declaration];
    for (const signature of signatures) {
      const returnType = signature.getReturnType();
      if (readableZodSchema(returnType)) {
        return returnType;
      }
    }
    return declaration.getReturnType();
  }
  const callable = declaration.getType().getCallSignatures();
  return callable.find((signature) => readableZodSchema(signature.getReturnType()))?.getReturnType();
}

function factoryDeclarations(declaration: FunctionDeclaration | VariableDeclaration): readonly MorphNode[] {
  if (Node.isFunctionDeclaration(declaration)) {
    return declaration.getSymbol()?.getDeclarations().filter(Node.isFunctionDeclaration) ?? [declaration];
  }
  const initializer = declaration.getInitializer();
  return initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) ? [initializer] : [];
}

function factoryReturnExpressions(declaration: FunctionDeclaration | VariableDeclaration): readonly Expression[] {
  return factoryDeclarations(declaration).flatMap(ownReturnExpressions);
}

function returnContractDependsOnOwnParameter(node: MorphNode): boolean {
  if (!Node.isFunctionLikeDeclaration(node)) {
    return false;
  }
  const returnType = node.getReturnTypeNode();
  if (returnType === undefined || !readableZodSchema(returnType.getType())) {
    return false;
  }
  const owned = new Set<object>();
  for (const parameter of [...node.getParameters(), ...node.getTypeParameters()]) {
    const identity = symbolIdentity(parameter.getSymbol());
    if (identity !== undefined) {
      owned.add(identity);
    }
  }
  return typeNodeIdentifierSymbols(returnType).some((symbol) => {
    const identity = symbolIdentity(symbol);
    return identity !== undefined && owned.has(identity);
  });
}

function factoryOutputOwned(declaration: FunctionDeclaration | VariableDeclaration): boolean {
  return factoryDeclarations(declaration).some((candidate) => ownReturnExpressions(candidate).length > 0 && returnContractDependsOnOwnParameter(candidate));
}

function hasGenericOverloadLaundering(declaration: FunctionDeclaration | VariableDeclaration): boolean {
  const declarations = factoryDeclarations(declaration);
  return (
    declarations.some((candidate) => ownReturnExpressions(candidate).length === 0 && returnContractDependsOnOwnParameter(candidate)) &&
    !declarations.some((candidate) => ownReturnExpressions(candidate).length > 0 && returnContractDependsOnOwnParameter(candidate))
  );
}

function hasErasedExplicitReturn(declaration: FunctionDeclaration | VariableDeclaration): boolean {
  return factoryDeclarations(declaration).some((signature) => {
    if (!Node.isFunctionLikeDeclaration(signature)) {
      return false;
    }
    const target = signature.getReturnTypeNode();
    if (target === undefined) {
      return false;
    }
    if (zodTypeReferenceIdentity(target) === "unresolved") {
      return true;
    }
    const output = target.getType().getTypeArguments()[0];
    return target.getType().isAny() || target.getType().isUnknown() || output?.isAny() === true || output?.isUnknown() === true;
  });
}

function hasConcreteAuthoredReturn(declaration: FunctionDeclaration | VariableDeclaration): boolean {
  return factoryDeclarations(declaration).some((signature) => {
    if (!Node.isFunctionLikeDeclaration(signature)) {
      return false;
    }
    const target = signature.getReturnTypeNode();
    if (target === undefined || zodTypeReferenceIdentity(target) !== "canonical") {
      return false;
    }
    const output = target.getType().getTypeArguments()[0];
    return output !== undefined && !output.isAny() && !output.isUnknown();
  });
}

function factoryOwnership(declaration: FunctionDeclaration | VariableDeclaration): FactoryCandidate["ownership"] {
  if (factoryOutputOwned(declaration)) {
    return "generated";
  }
  if (hasGenericOverloadLaundering(declaration)) {
    return "unresolved";
  }
  let unresolved = false;
  for (const expression of factoryReturnExpressions(declaration)) {
    const read = readContextualZodOutputTwin(expression);
    if (read.kind === "pair" && hasConcreteAuthoredReturn(declaration)) {
      return "twin";
    }
    if (read.kind === "unresolved") {
      unresolved = true;
    }
  }
  return unresolved || hasErasedExplicitReturn(declaration) ? "unresolved" : "unowned";
}

function factoryCandidate(declaration: FunctionDeclaration | VariableDeclaration): FactoryCandidate | null {
  const returnType = callableReturnType(declaration);
  const returnsSchema = factoryReturnExpressions(declaration).some((expression) => readableZodSchema(unwrapSchemaExpression(expression).getType()));
  if ((returnType === undefined || !readableZodSchema(returnType)) && !returnsSchema) {
    return null;
  }
  const anchor = declaration.getNameNode();
  const name = declaration.getName();
  return anchor === undefined || name === undefined ? null : { declaration, anchor, name, ownership: factoryOwnership(declaration) };
}

function zodDerivedTarget(typeNode: TypeReferenceNode): object | undefined {
  const utility = ultimateSymbol(typeNode.getTypeName().getSymbol());
  if (utility === undefined || !["infer", "output"].includes(utility.getName())) {
    return;
  }
  if (!utility.getDeclarations().some((declaration) => normalizedPath(declaration).includes(ZOD_PACKAGE_SEGMENT))) {
    return;
  }
  const argument = typeNode.getTypeArguments()[0];
  if (argument === undefined || !Node.isTypeQuery(argument)) {
    return;
  }
  return symbolIdentity(argument.getExprName().getSymbol());
}

function schemaValueIdentity(candidate: SchemaCandidate): object | undefined {
  let initializer = candidate.initializer;
  while (
    Node.isParenthesizedExpression(initializer) ||
    Node.isAsExpression(initializer) ||
    Node.isTypeAssertion(initializer) ||
    Node.isSatisfiesExpression(initializer) ||
    Node.isNonNullExpression(initializer)
  ) {
    initializer = initializer.getExpression();
  }
  if (Node.isIdentifier(initializer) || Node.isPropertyAccessExpression(initializer)) {
    const target = symbolIdentity(initializer.getSymbol());
    if (target !== undefined) {
      return target;
    }
  }
  return symbolIdentity(candidate.ownSymbol);
}

function schemaIdentities(candidate: SchemaCandidate): ReadonlySet<object> {
  const identities = new Set<object>();
  const own = symbolIdentity(candidate.ownSymbol);
  const value = schemaValueIdentity(candidate);
  if (own !== undefined) {
    identities.add(own);
  }
  if (value !== undefined) {
    identities.add(value);
  }
  return identities;
}

function uniqueSchemas(schemas: readonly SchemaCandidate[]): readonly SchemaCandidate[] {
  const unique = new Map<object, SchemaCandidate>();
  const withoutIdentity: SchemaCandidate[] = [];
  for (const schema of schemas) {
    const identity = schemaValueIdentity(schema);
    if (identity === undefined) {
      withoutIdentity.push(schema);
      continue;
    }
    const previous = unique.get(identity);
    if (previous === undefined || (previous.aggregate && !schema.aggregate)) {
      unique.set(identity, schema);
    }
  }
  return [...unique.values(), ...withoutIdentity];
}

function explicitTwin(candidate: SchemaCandidate): "pair" | "unresolved" | "none" {
  if (candidate.twinDeclaration !== undefined) {
    const declarationRead = readAnnotatedZodOutputTwin(candidate.twinDeclaration);
    if (declarationRead.kind !== "none") {
      return declarationRead.kind;
    }
  }
  const contextual = readContextualZodOutputTwin(candidate.initializer, candidate.anchor);
  if (contextual.kind !== "none") {
    return contextual.kind;
  }
  let current: Expression = candidate.initializer;
  while (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isTypeAssertion(current) || Node.isSatisfiesExpression(current)) {
    if (Node.isAsExpression(current) || Node.isTypeAssertion(current) || Node.isSatisfiesExpression(current)) {
      const read = readExpressionZodOutputTwin(current);
      if (read.kind !== "none") {
        return read.kind;
      }
    }
    current = current.getExpression();
  }
  return "none";
}

function isExported(declaration: SchemaDeclaration | FunctionDeclaration | VariableDeclaration, exported: ReadonlySet<object>): boolean {
  if (Node.isExportAssignment(declaration)) {
    return true;
  }
  const identity = symbolIdentity(exportOwnerSymbol(declaration));
  return identity !== undefined && exported.has(identity);
}

function twinTargetSets(schemas: readonly SchemaCandidate[]): {
  readonly pairs: ReadonlySet<object>;
  readonly unresolved: ReadonlySet<object>;
} {
  const pairs = new Set<object>();
  const unresolved = new Set<object>();
  for (const schema of schemas) {
    const twin = explicitTwin(schema);
    for (const identity of schemaIdentities(schema)) {
      if (twin === "pair") {
        pairs.add(identity);
      } else if (twin === "unresolved") {
        unresolved.add(identity);
      }
    }
  }
  return { pairs, unresolved };
}

function grantCandidate(
  candidate: SchemaCandidate,
  unreadable: boolean,
  relativePath: (sourceFile: import("ts-morph").SourceFile) => string,
): ReviewedGrantCandidate {
  const token = candidate.name === "default" ? "default" : candidate.anchor.getText();
  return {
    node: candidate.anchor,
    subject: relativePath(candidate.declaration.getSourceFile()),
    operation: `${OPERATION_PREFIX}${candidate.name}`,
    unreadable,
    token,
    offset: Math.max(candidate.anchor.getText().indexOf(token), 0),
  };
}

function classifySchemas(
  schemas: readonly SchemaCandidate[],
  derivedTargets: ReadonlySet<object>,
  twinTargets: ReturnType<typeof twinTargetSets>,
  relativePath: (sourceFile: import("ts-morph").SourceFile) => string,
): { readonly derived: number; readonly twins: number; readonly unresolved: number; readonly candidates: readonly ReviewedGrantCandidate[] } {
  let derived = 0;
  let twins = 0;
  let unresolved = 0;
  const candidates: ReviewedGrantCandidate[] = [];
  for (const candidate of schemas) {
    const identities = schemaIdentities(candidate);
    if (candidate.unreadable) {
      candidates.push(grantCandidate(candidate, true, relativePath));
      unresolved += 1;
      continue;
    }
    if ([...identities].some((identity) => derivedTargets.has(identity))) {
      derived += 1;
      continue;
    }
    if ([...identities].some((identity) => twinTargets.pairs.has(identity))) {
      twins += 1;
      continue;
    }
    const unreadable = [...identities].some((identity) => twinTargets.unresolved.has(identity));
    candidates.push(grantCandidate(candidate, unreadable, relativePath));
    if (unreadable) {
      unresolved += 1;
    }
  }
  return { derived, twins, unresolved, candidates };
}

function uniqueFactories(factories: readonly FactoryCandidate[]): readonly FactoryCandidate[] {
  const unique = new Map<object, FactoryCandidate>();
  for (const factory of factories) {
    const identity = symbolIdentity(exportOwnerSymbol(factory.declaration));
    if (identity !== undefined && !unique.has(identity)) {
      unique.set(identity, factory);
    }
  }
  return [...unique.values()];
}

function factoryGrantCandidate(factory: FactoryCandidate, relativePath: (sourceFile: import("ts-morph").SourceFile) => string): ReviewedGrantCandidate {
  return {
    node: factory.anchor,
    subject: relativePath(factory.declaration.getSourceFile()),
    operation: `${OPERATION_PREFIX}${factory.name}`,
    token: factory.anchor.getText(),
    offset: 0,
    unreadable: factory.ownership === "unresolved",
  };
}

export const gate = defineGate({
  id: "zod-export-membership",
  family: "zod-output-twin-parity",
  authority: "reviewed-grant",
  severity: "error",
  population: "@product",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const schemas: SchemaCandidate[] = [];
    const aggregateRoots: SchemaDeclaration[] = [];
    const factories: FactoryCandidate[] = [];
    const derivedTargets = new Set<object>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration, SyntaxKind.PropertyDeclaration],
          visit: (node): void => {
            if (Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node)) {
              aggregateRoots.push(node);
              const schema = schemaCandidate(node);
              if (schema !== null) {
                schemas.push(schema);
              }
              if (Node.isVariableDeclaration(node)) {
                const factory = factoryCandidate(node);
                if (factory !== null) {
                  factories.push(factory);
                }
              }
            }
          },
        },
        {
          kinds: [SyntaxKind.ExportAssignment],
          visit: (node): void => {
            if (Node.isExportAssignment(node)) {
              aggregateRoots.push(node);
              const schema = schemaCandidate(node);
              if (schema !== null) {
                schemas.push(schema);
              }
            }
          },
        },
        {
          kinds: [SyntaxKind.FunctionDeclaration],
          visit: (node): void => {
            if (Node.isFunctionDeclaration(node)) {
              const factory = factoryCandidate(node);
              if (factory !== null) {
                factories.push(factory);
              }
            }
          },
        },
        {
          kinds: [SyntaxKind.TypeReference],
          visit: (node): void => {
            if (Node.isTypeReference(node)) {
              const target = zodDerivedTarget(node);
              if (target !== undefined) {
                derivedTargets.add(target);
              }
            }
          },
        },
      ],
      evaluate: (): void => {
        const exported = exportedSymbolIdentities(ctx.files);
        for (const declaration of aggregateRoots) {
          if (isExported(declaration, exported)) {
            schemas.push(...aggregateSchemaCandidates(declaration));
          }
        }
        const exportedSchemas = uniqueSchemas(schemas.filter((candidate) => isExported(candidate.declaration, exported)));
        const exportedFactories = uniqueFactories(factories.filter((candidate) => isExported(candidate.declaration, exported)));
        const classified = classifySchemas(exportedSchemas, derivedTargets, twinTargetSets(schemas), (sourceFile) => ctx.relativePath(sourceFile));
        const ownedFactories = exportedFactories.filter((factory) => factory.ownership === "generated");
        const factoryTwins = exportedFactories.filter((factory) => factory.ownership === "twin");
        const factoryCandidates = exportedFactories
          .filter((factory) => factory.ownership === "unowned" || factory.ownership === "unresolved")
          .map((factory) => factoryGrantCandidate(factory, (sourceFile) => ctx.relativePath(sourceFile)));
        const unresolvedFactories = factoryCandidates.filter((candidate) => candidate.unreadable === true).length;
        const findings = [...classified.candidates, ...factoryCandidates];
        reportReviewedGrantCandidates(ctx.report, findings, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
        ctx.receipt({
          kind: "population",
          source: `zod-export-membership [derived=${String(classified.derived)}, twins=${String(classified.twins + factoryTwins.length)}, factories=${String(ownedFactories.length)}, schema-only=${String(findings.length - classified.unresolved - unresolvedFactories)}]`,
          members: exportedSchemas.length + exportedFactories.length,
          unresolved: classified.unresolved + unresolvedFactories,
        });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: proofFiles({
        "packages/inference/src/unrelated/deep/schema.tsx":
          'import * as z from "zod";\nexport interface SameShape { readonly value: string }\nexport const wire = z.object({ value: z.string() });\n',
      }),
      expect: { count: 1, token: "wire", messageIncludes: "no semantic output owner" },
      grant: { subject: "packages/inference/src/unrelated/deep/schema.tsx", operation: "schema-only-export:wire" },
      why: "a TSX-path exported schema in an unrelated product home has no ownership evidence; a same-shaped authored interface is only a candidate, never proof, while the authored grant identity proves the schema-only class through central reconciliation",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/leaf.ts": 'import * as z from "zod";\nconst internal = z.object({ value: z.string() });\nexport { internal as renamed };\n',
        "packages/contracts/src/index.ts": 'export { renamed as publicWire } from "./leaf";\n',
      }),
      expect: { count: 1, token: "internal", messageIncludes: "schema-only-export:internal" },
      grant: { subject: "packages/contracts/src/leaf.ts", operation: "schema-only-export:internal" },
      why: "renamed local exports and a second barrel rename still resolve to the canonical schema declaration and cannot launder it out of the census",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts": 'import * as z from "zod";\nexport default z.object({ value: z.string() });\n',
      }),
      expect: { count: 1, token: "default", messageIncludes: "schema-only-export:default" },
      grant: { subject: "packages/contracts/src/x.ts", operation: "schema-only-export:default" },
      why: "an anonymous default-exported concrete schema is still a module export and cannot evade the ownership census by omitting a declaration name",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts": 'import * as z from "zod";\nexport default { nested: { wire: z.object({ value: z.string() }) } };\n',
      }),
      expect: { count: 1, token: "wire", messageIncludes: "schema-only-export:default.nested.wire" },
      grant: { subject: "packages/contracts/src/x.ts", operation: "schema-only-export:default.nested.wire" },
      why: "a schema nested inside a default-exported object is a public schema value with a stable property-path identity, while the inner fields of its z.object shape are not separate export members",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nexport function makeWire(unused: string) { void unused; return z.object({ value: z.string() }); }\n',
      }),
      expect: { count: 1, token: "makeWire", messageIncludes: "schema-only-export:makeWire" },
      grant: { subject: "packages/contracts/src/x.ts", operation: "schema-only-export:makeWire" },
      why: "an unused parameter cannot launder an inferred fixed concrete schema as generated: its output contract does not depend on any parameter or type parameter owned by the factory",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nexport const wire = z.object({ value: z.string() });\nexport const registry = { wireAlias: wire };\n',
      }),
      expect: { count: 1, token: "wire", messageIncludes: "schema-only-export:wire" },
      grant: { subject: "packages/contracts/src/x.ts", operation: "schema-only-export:wire" },
      why: "a directly exported schema remains one semantic value when an exported aggregate aliases it, so the aggregate path cannot inflate the closed denominator",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts": 'import * as z from "zod";\nconst hidden = z.object({ value: z.string() });\nexport default { hidden };\n',
      }),
      expect: { count: 1, token: "hidden", messageIncludes: "schema-only-export:default.hidden" },
      grant: { subject: "packages/contracts/src/x.ts", operation: "schema-only-export:default.hidden" },
      why: "an exported aggregate shorthand exposes the canonical private schema value at a stable public property path",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts": 'import * as z from "zod";\nconst hidden = { wire: z.object({ value: z.string() }) };\nexport default { ...hidden };\n',
      }),
      expect: { count: 1, token: "wire", messageIncludes: "schema-only-export:default.wire" },
      grant: { subject: "packages/contracts/src/x.ts", operation: "schema-only-export:default.wire" },
      why: "a resolvable aggregate spread preserves the exported root path while retaining the nested schema canonical identity",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts": 'import * as z from "zod";\nexport default [z.string()];\n',
      }),
      expect: { count: 1, token: "z.string", messageIncludes: "schema-only-export:default[0]" },
      grant: { subject: "packages/contracts/src/x.ts", operation: "schema-only-export:default[0]" },
      why: "schemas exported through arrays enter the denominator at stable element paths",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nexport function lift(schema: Record<string, unknown>): z.ZodObject { void schema; return z.object({ value: z.string() }) as z.ZodObject; }\n',
      }),
      expect: { count: 1, token: "lift", messageIncludes: "schema-only-export:lift" },
      grant: { subject: "packages/contracts/src/x.ts", operation: "schema-only-export:lift" },
      why: "a bare concrete Zod subclass return describes the schema runtime class without claiming a concrete output twin, so the dynamic builder remains an explicit schema-only boundary",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nconst holder = { wire: z.object({ value: z.string() }) };\nexport const publicSchemas = { wire: holder.wire };\n',
      }),
      expect: { count: 1, token: "wire", messageIncludes: "schema-only-export:publicSchemas.wire" },
      why: "a property access into a concrete object value still exposes the actual schema initializer through its exported aggregate path",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nclass Registry { static readonly wire = z.object({ value: z.string() }); }\nexport const publicSchemas = { wire: Registry.wire };\n',
      }),
      expect: { count: 1, token: "wire", messageIncludes: "schema-only-export:publicSchemas.wire" },
      why: "a property access to a concrete static schema declaration remains export-reachable through an aggregate alias",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/leaf.ts": 'import * as z from "zod";\nconst internal = z.object({ value: z.string() });\nexport { internal as renamed };\n',
        "packages/contracts/src/index.ts":
          'import * as z from "zod";\nimport { renamed as publicWire } from "./leaf";\nexport { publicWire };\nexport type PublicWire = z.output<typeof publicWire>;\n',
      }),
      why: "a z.output face semantically tied to the renamed exported declaration owns its output without a spelling convention",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\ntype PublicWire = { value: string };\nexport const wire: z.ZodType<PublicWire> = z.object({ value: z.string() });\n',
      }),
      why: "an explicit concrete ZodType<T> pair is owned by the parity policy's canonical reader",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nexport function schemaFor<Key extends string>(key: Key): z.ZodType<Record<Key, string>> { return z.object({ [key]: z.string() }) as z.ZodType<Record<Key, string>>; }\n',
      }),
      why: "a generic parameterized factory owns its generated schema output at the return contract and caller",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nconst inner = z.object({ value: z.string() });\nexport const publicWire = inner;\nexport type State = z.output<typeof publicWire>;\n',
      }),
      why: "a schema value alias retains both the canonical value identity and its exported alias identity, so a type derived from the public alias owns that exact export without acquitting unrelated aliases",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nexport class Registry { static readonly schema = z.object({ value: z.string() }); }\nexport type State = z.output<typeof Registry.schema>;\n',
      }),
      why: "a static schema property remains export-reachable through its class while derivation binds to the property symbol rather than the class symbol",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\ntype Wire = { value: string };\nexport function makeWire(): z.ZodType<Wire> { return z.object({ value: z.string() }); }\n',
      }),
      why: "a fixed-return function with a readable concrete ZodType<T> contract is an authored twin whose return expression is governed by the shared parity reader",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\ntype Face = { readonly name: string; readonly age: number };\nexport const shape = { name: z.string(), age: z.number() } satisfies { [Key in keyof Face]: z.ZodType<Face[Key]> };\n',
      }),
      why: "an exported aggregate-level mapped contract contextually owns each schema property through the shared parity reader without one alias per property",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nexport const settingsSchema = z.object({ fontScale: z.number() });\nexport type Settings = z.output<typeof settingsSchema>;\nconst defaults: Settings = settingsSchema.parse({});\nexport const publicDefaults = { fontScale: defaults.fontScale };\n',
      }),
      why: "an ordinary property-access value in an exported aggregate stays a value even when its mapped output property resolves back to the schema-bearing shape declaration",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: { "packages/contracts/src/x.ts": "export const value = 1;\n" },
      expect: { messageIncludes: "zod-export-membership" },
      why: "a product corpus with no exported schemas or factories is not evidence of complete ownership and must refuse its zero-member receipt",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts": 'import * as z from "zod";\nexport const wire = z.object({ value: z.string() }) as unknown;\n',
      }),
      expect: { messageIncludes: "zod-export-membership" },
      why: "an exported schema whose public type is erased increments the unresolved denominator and withholds instead of disappearing from the census",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts": 'import * as z from "zod";\nexport function makeWire(): unknown { return z.object({ value: z.string() }); }\n',
      }),
      expect: { messageIncludes: "zod-export-membership" },
      why: "a fixed schema returned through an explicit unknown contract remains an unreadable member and withholds instead of disappearing or masquerading as a generated factory",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts": 'import * as z from "zod";\nconst key = "wire";\nexport default { [key]: z.string() };\n',
      }),
      expect: { messageIncludes: "zod-export-membership" },
      why: "a dynamically computed aggregate key cannot supply a stable reviewed-grant identity and must remain an unreadable member instead of silently disappearing",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts":
          'import * as z from "zod";\nexport function schemaFor<Key extends string>(key: Key): z.ZodType<Record<Key, string>>;\nexport function schemaFor(_key: string): z.ZodType<{ fixed: string }> { return z.object({ fixed: z.string() }); }\n',
      }),
      expect: { messageIncludes: "zod-export-membership" },
      why: "a generic overload cannot launder a fixed implementation schema: the body-bearing implementation must carry or prove the parameter-dependent output contract",
    },
    {
      mode: "types",
      files: proofFiles({
        "packages/contracts/src/x.ts": 'import * as z from "zod";\ndeclare function hidden(): { wire: z.ZodType<string> };\nexport default { ...hidden() };\n',
      }),
      expect: { messageIncludes: "zod-export-membership" },
      why: "a dynamic spread whose readable type contains schemas remains an unreadable aggregate member rather than silently escaping the denominator",
    },
  ],
});
