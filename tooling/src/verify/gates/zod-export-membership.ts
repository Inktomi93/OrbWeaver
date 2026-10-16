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
// FAMILY: both ownership and bidirectional output parity use the canonical output-twin reader.
import type {
  ExportAssignment,
  Expression,
  FunctionDeclaration,
  Node as MorphNode,
  PropertyDeclaration,
  TypeReferenceNode,
  VariableDeclaration,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { observedSymbolDeclarations, observedSymbolIdentity, observedSymbolOriginKey, observedUltimateSymbol } from "../../floor/code-facts/symbol-identity.ts";
import type { ObservedReference, TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { ZOD_OUTPUT_PROPERTY } from "../../floor/code-facts/type-observations-contract.ts";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector, typeArgumentSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { ownReturnExpressions, unwrapTypeExpression as unwrapSchemaExpression } from "../../floor/code-facts/type-slot-syntax.ts";
import { defineGate } from "../contract/policy.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { typeObservationPlan, typeObservationReaders } from "../lib/type-observation-context.ts";
import {
  readAnnotatedZodOutputTwinWith as readAnnotatedZodOutputTwin,
  readContextualZodOutputTwinWith as readContextualZodOutputTwin,
  readExpressionZodOutputTwinWith as readExpressionZodOutputTwin,
  typeNodeIdentifierSymbols,
  zodTypeReferenceIdentityWith as zodTypeReferenceIdentity,
} from "../lib/zod-output-twin.ts";

const OPERATION_PREFIX = "schema-only-export:";
const ZOD_PACKAGE_SEGMENT = "/node_modules/zod/";
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
  "an exported Zod schema has no semantic output owner. Derive its public output with z.infer/z.output, bind an intentional authored ZodType<T> twin (checked by zod-output-twin-parity), expose it through a parameterized schema factory, or record an evidence-backed schema-only boundary in the central reviewed-grant table. (tooling/src/verify/gates/zod-output-twin-parity.ts)";
const UNREADABLE =
  "an exported Zod schema candidate could not be resolved to a readable canonical declaration or output type. The ownership census refuses unreadable exports rather than treating them as absent. (tooling/src/verify/gates/zod-export-membership.ts)";
const FIX =
  "add a semantic output owner; for a deliberately schema-only public boundary add one central reviewed grant whose subject is this canonical declaration path and whose operation is the reported schema-only-export key.";

type NativeSymbol = ObservedReference<"symbol"> | null;
type SchemaDeclaration = VariableDeclaration | PropertyDeclaration | ExportAssignment;

interface SchemaCandidate {
  readonly readers: TypeObservationReader;
  /** The module export whose reach makes this schema public. */
  readonly declaration: SchemaDeclaration;
  readonly anchor: MorphNode;
  readonly initializer: Expression;
  readonly ownSymbol: NativeSymbol | undefined;
  readonly twinDeclaration?: VariableDeclaration | PropertyDeclaration;
  readonly name: string;
  readonly unreadable: boolean;
  readonly aggregate: boolean;
  readonly interpretations?: readonly SchemaCandidate[];
}

interface DerivedTarget {
  readonly identity: object;
}
interface DerivedTargets {
  readonly identities: ReadonlySet<object>;
}

interface FactoryCandidate {
  readonly readers: TypeObservationReader;
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

interface TwinTargets {
  readonly pairs: ReadonlySet<object>;
  readonly unresolved: ReadonlySet<object>;
}
interface SchemaClassification {
  readonly derived: number;
  readonly twins: number;
  readonly unresolved: number;
  readonly candidates: readonly ReviewedGrantCandidate[];
}
interface MembershipSemantics {
  readonly schemaOwnershipWitnesses: (candidate: SchemaCandidate, selected: ReadonlySet<string>) => readonly SchemaCandidate[];
  readonly schemaCandidate: (declaration: SchemaDeclaration) => SchemaCandidate | null;
  readonly factoryCandidate: (declaration: FunctionDeclaration | VariableDeclaration) => FactoryCandidate | null;
  readonly zodDerivedTarget: (node: TypeReferenceNode) => DerivedTarget | undefined;
  readonly isExported: (node: SchemaDeclaration | FunctionDeclaration | VariableDeclaration, exported: ReadonlySet<object>) => boolean;
  readonly aggregateSchemaCandidates: (node: SchemaDeclaration) => readonly SchemaCandidate[];
  readonly uniqueSchemas: (schemas: readonly SchemaCandidate[]) => readonly SchemaCandidate[];
  readonly uniqueFactories: (factories: readonly FactoryCandidate[]) => readonly FactoryCandidate[];
  readonly classifySchemas: (
    schemas: readonly SchemaCandidate[],
    derived: DerivedTargets,
    twins: TwinTargets,
    relative: (source: import("ts-morph").SourceFile) => string,
  ) => SchemaClassification;
  readonly twinTargetSets: (schemas: readonly SchemaCandidate[]) => TwinTargets;
  readonly factoryGrantCandidate: (factory: FactoryCandidate, relative: (source: import("ts-morph").SourceFile) => string) => ReviewedGrantCandidate;
  readonly exportedSymbolIdentities: (sources: readonly import("ts-morph").SourceFile[]) => ReadonlySet<object>;
}
function membershipSemantics(readers: TypeObservationReader): MembershipSemantics {
  const symbolDeclarations = (symbol: NativeSymbol | undefined): readonly MorphNode[] => observedSymbolDeclarations(symbol, readers);
  const symbolIdentity = (symbol: NativeSymbol | undefined): object | undefined => observedSymbolIdentity(symbol, readers);
  const ultimateSymbol = (symbol: NativeSymbol | undefined): ObservedReference<"symbol"> | undefined => observedUltimateSymbol(symbol, readers);
  const info = (selector: NativeTypeSelector): ReturnType<TypeObservationReader["type"]> | undefined => {
    const value = readers.select(selector);
    return value === null ? undefined : readers.type(value);
  };
  function declaredByZod(type: NativeTypeSelector): boolean {
    const declarations = symbolDeclarations(info(type)?.symbol);
    return declarations.some((declaration) => normalizedPath(declaration).includes(ZOD_PACKAGE_SEGMENT));
  }

  function readableZodSchema(type: NativeTypeSelector): boolean {
    if (type.base.kind === "schema-column") {
      throw new Error("Zod membership cannot borrow catalog Types");
    }
    const output = readers.select({ ...type, steps: [...type.steps, { kind: "property", name: ZOD_OUTPUT_PROPERTY, at: type.base.node }] });
    return output !== null && declaredByZod(type);
  }

  function addExportIdentity(identities: Set<object>, symbol: NativeSymbol | undefined): void {
    const target = ultimateSymbol(symbol);
    if (target !== undefined) {
      identities.add(readers.symbolData(target).key);
    }
  }

  function exportedSymbolIdentities(files: readonly import("ts-morph").SourceFile[]): ReadonlySet<object> {
    const identities = new Set<object>();
    for (const sourceFile of files) {
      for (const exported of readers.exports(sourceFile)) {
        addExportIdentity(identities, exported);
        for (const declaration of symbolDeclarations(exported)) {
          if (Node.isExportSpecifier(declaration)) {
            addExportIdentity(identities, readers.localTarget(declaration));
          }
        }
      }
    }
    return identities;
  }

  function exportOwnerSymbol(declaration: SchemaDeclaration | FunctionDeclaration | VariableDeclaration, selected = readers): NativeSymbol | undefined {
    if (Node.isExportAssignment(declaration)) {
      return selected.defaultExport(declaration.getSourceFile());
    }
    if (Node.isPropertyDeclaration(declaration)) {
      const owner = declaration.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
      return owner === undefined ? undefined : selected.symbol(owner);
    }
    return selected.symbol(declaration);
  }

  function schemaInitializer(declaration: SchemaDeclaration): Expression | undefined {
    return Node.isExportAssignment(declaration) ? declaration.getExpression() : declaration.getInitializer();
  }

  function schemaCandidate(declaration: SchemaDeclaration): SchemaCandidate | null {
    const initializer = schemaInitializer(declaration);
    if (initializer === undefined) {
      return null;
    }
    const exportedType = Node.isExportAssignment(declaration) ? nodeTypeSelector(initializer) : nodeTypeSelector(declaration);
    const readableExport = readableZodSchema(exportedType);
    const readableRaw = readableZodSchema(nodeTypeSelector(unwrapSchemaExpression(initializer)));
    if (!(readableExport || readableRaw)) {
      return null;
    }
    if (Node.isExportAssignment(declaration)) {
      return {
        readers,
        declaration,
        anchor: declaration,
        initializer,
        ownSymbol: readers.defaultExport(declaration.getSourceFile()),
        name: "default",
        unreadable: !readableExport,
        aggregate: false,
      };
    }
    const owner = Node.isPropertyDeclaration(declaration) ? declaration.getFirstAncestorByKind(SyntaxKind.ClassDeclaration)?.getName() : undefined;
    return {
      readers,
      declaration,
      anchor: declaration.getNameNode(),
      initializer,
      ownSymbol: readers.symbol(declaration),
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

  function declaredAliasInitializer(symbol: NativeSymbol | undefined): Expression | undefined {
    let resolved: Expression | undefined;
    for (const declaration of symbolDeclarations(ultimateSymbol(symbol))) {
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
    const identity = symbolIdentity(readers.symbol(value));
    if (identity !== undefined && resolving.has(identity)) {
      return;
    }
    if (identity !== undefined) {
      resolving.add(identity);
    }
    try {
      const declared = declaredAliasInitializer(readers.symbol(value));
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

  function typeMayContainSchema(type: NativeTypeSelector, location: MorphNode): boolean {
    const visit = (current: NativeTypeSelector, ancestors: ReadonlySet<object>): boolean => {
      const data = info(current);
      if (data === undefined) {
        throw new Error("native aggregate Type is unavailable");
      }
      if (readableZodSchema(current) || data.any || data.unknown) {
        return true;
      }
      if (ancestors.has(data.key)) {
        return false;
      }
      const next = new Set(ancestors);
      next.add(data.key);
      return (
        readers.unions(current).some((part) => visit(part, next)) || readers.properties(current, location).some((property) => visit(property.selector, next))
      );
    };
    return visit(type, new Set());
  }

  function aggregateCoordinate(anchor: MorphNode): MorphNode {
    return Node.isCallExpression(anchor) || Node.isComputedPropertyName(anchor) ? anchor.getExpression() : anchor;
  }

  function aggregateAmbiguityCandidate(declaration: SchemaDeclaration, expression: Expression, anchor: MorphNode, name: string): SchemaCandidate {
    return {
      readers,
      declaration,
      anchor: aggregateCoordinate(anchor),
      initializer: expression,
      ownSymbol: Node.isIdentifier(expression) || Node.isPropertyAccessExpression(expression) ? readers.symbol(expression) : undefined,
      name,
      unreadable: true,
      aggregate: true,
    };
  }

  interface AggregateVisit {
    readonly raw: Expression;
    readonly path: string;
    readonly anchor: MorphNode;
    readonly ownSymbol: NativeSymbol | undefined;
    readonly forcedUnreadable?: boolean;
  }

  function aggregateSchemaCandidates(declaration: SchemaDeclaration): readonly SchemaCandidate[] {
    const root = schemaInitializer(declaration);
    if (root === undefined) {
      return [];
    }
    if (readableZodSchema(nodeTypeSelector(root)) || readableZodSchema(nodeTypeSelector(unwrapSchemaExpression(root)))) {
      return [];
    }
    const candidates: SchemaCandidate[] = [];
    const resolving = new Set<object>();
    const rootName = aggregateRootName(declaration);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one exhaustive dispatcher keeps alias, object, spread, array, and ambiguity traversal on the same path/identity state.
    const visit = ({ raw, path, anchor, ownSymbol, forcedUnreadable = false }: AggregateVisit): void => {
      const expression = unwrapSchemaExpression(raw);
      const readableExport = readableZodSchema(nodeTypeSelector(raw));
      const readableRaw = readableZodSchema(nodeTypeSelector(expression));
      if (readableExport || readableRaw) {
        candidates.push({
          readers,
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
        const identity = symbolIdentity(readers.symbol(expression));
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
              ownSymbol: readers.symbol(property),
              forcedUnreadable: forcedUnreadable ? true : computed,
            });
          } else if (Node.isShorthandPropertyAssignment(property)) {
            visit({
              raw: property.getNameNode(),
              path: `${path}.${property.getName()}`,
              anchor: property.getNameNode(),
              ownSymbol: readers.symbol(property),
              forcedUnreadable,
            });
          } else if (Node.isSpreadAssignment(property)) {
            const spread = property.getExpression();
            const before = candidates.length;
            visit({ raw: spread, path, anchor: spread, ownSymbol: readers.symbol(spread), forcedUnreadable });
            if (candidates.length === before && typeMayContainSchema(nodeTypeSelector(spread), spread)) {
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
            visit({ raw: spread, path: `${path}[$spread${String(outputIndex)}]`, anchor: spread, ownSymbol: readers.symbol(spread), forcedUnreadable });
            if (candidates.length === before && typeMayContainSchema(nodeTypeSelector(spread), spread)) {
              candidates.push(aggregateAmbiguityCandidate(declaration, spread, spread, `${rootName}${path}[$spread${String(outputIndex)}]`));
            }
          } else if (Node.isExpression(element)) {
            visit({
              raw: element,
              path: `${path}[${String(outputIndex)}]`,
              anchor: element,
              ownSymbol: Node.isIdentifier(element) || Node.isPropertyAccessExpression(element) ? readers.symbol(element) : undefined,
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

  function callableReturnType(declaration: FunctionDeclaration | VariableDeclaration): NativeTypeSelector | undefined {
    if (Node.isFunctionDeclaration(declaration)) {
      const symbol = readers.symbol(declaration);
      const signatures = symbol === null ? [declaration] : symbolDeclarations(symbol).filter(Node.isFunctionDeclaration);
      for (const signature of signatures) {
        const type = nodeTypeSelector(signature, "return");
        if (readableZodSchema(type)) {
          return type;
        }
      }
      return nodeTypeSelector(declaration, "return");
    }
    return readers.callReturns(declaration).find(readableZodSchema);
  }

  function factoryDeclarations(declaration: FunctionDeclaration | VariableDeclaration): readonly MorphNode[] {
    if (Node.isFunctionDeclaration(declaration)) {
      const symbol = readers.symbol(declaration);
      return symbol === null ? [declaration] : symbolDeclarations(symbol).filter(Node.isFunctionDeclaration);
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
    if (returnType === undefined || !readableZodSchema(nodeTypeSelector(returnType))) {
      return false;
    }
    const owned = new Set<object>();
    for (const parameter of [...node.getParameters(), ...node.getTypeParameters()]) {
      const identity = symbolIdentity(readers.symbol(parameter));
      if (identity !== undefined) {
        owned.add(identity);
      }
    }
    return typeNodeIdentifierSymbols(returnType, readers).some((symbol) => {
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
      if (zodTypeReferenceIdentity(target, readers) === "unresolved") {
        return true;
      }
      const output = info(typeArgumentSelector(nodeTypeSelector(target)));
      const targetInfo = info(nodeTypeSelector(target));
      return targetInfo?.any === true || targetInfo?.unknown === true || output?.any === true || output?.unknown === true;
    });
  }

  function hasConcreteAuthoredReturn(declaration: FunctionDeclaration | VariableDeclaration): boolean {
    return factoryDeclarations(declaration).some((signature) => {
      if (!Node.isFunctionLikeDeclaration(signature)) {
        return false;
      }
      const target = signature.getReturnTypeNode();
      if (target === undefined || zodTypeReferenceIdentity(target, readers) !== "canonical") {
        return false;
      }
      const output = info(typeArgumentSelector(nodeTypeSelector(target)));
      return output !== undefined && !output.any && !output.unknown;
    });
  }

  function factoryOwnership(declaration: FunctionDeclaration | VariableDeclaration): FactoryCandidate["ownership"] {
    if (factoryOutputOwned(declaration)) {
      return "generated";
    }
    if (hasGenericOverloadLaundering(declaration)) {
      return "unresolved";
    }
    return factoryReturnOwnership(declaration);
  }

  function factoryReturnOwnership(declaration: FunctionDeclaration | VariableDeclaration): FactoryCandidate["ownership"] {
    let unresolved = false;
    for (const expression of factoryReturnExpressions(declaration)) {
      const read = readContextualZodOutputTwin(expression, expression, readers);
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
    const returnsSchema = factoryReturnExpressions(declaration).some((expression) => readableZodSchema(nodeTypeSelector(unwrapSchemaExpression(expression))));
    if ((returnType === undefined || !readableZodSchema(returnType)) && !returnsSchema) {
      return null;
    }
    const anchor = declaration.getNameNode();
    const name = declaration.getName();
    return anchor === undefined || name === undefined ? null : { readers, declaration, anchor, name, ownership: factoryOwnership(declaration) };
  }

  function zodDerivedTarget(typeNode: TypeReferenceNode): DerivedTarget | undefined {
    const utility = ultimateSymbol(readers.symbol(typeNode.getTypeName()));
    if (utility === undefined || !["infer", "output"].includes(readers.symbolData(utility).name)) {
      return;
    }
    if (!symbolDeclarations(utility).some((declaration) => normalizedPath(declaration).includes(ZOD_PACKAGE_SEGMENT))) {
      return;
    }
    const argument = typeNode.getTypeArguments()[0];
    if (argument === undefined || !Node.isTypeQuery(argument)) {
      return;
    }
    const symbol = readers.symbol(argument.getExprName());
    const identity = symbolIdentity(symbol);
    return symbol === null || identity === undefined ? undefined : { identity };
  }

  function schemaOwnershipWitnesses(candidate: SchemaCandidate, selected: ReadonlySet<string>): readonly SchemaCandidate[] {
    const value = unwrapSchemaExpression(candidate.initializer);
    const symbol = Node.isIdentifier(value) || Node.isPropertyAccessExpression(value) ? readers.symbol(value) : candidate.ownSymbol;
    return symbolDeclarations(ultimateSymbol(symbol)).flatMap((declaration) => {
      if (!((Node.isVariableDeclaration(declaration) || Node.isPropertyDeclaration(declaration)) && selected.has(normalizedPath(declaration)))) {
        return [];
      }
      const witness = schemaCandidate(declaration);
      return witness === null ? [] : [witness];
    });
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
      const target = observedSymbolIdentity(candidate.readers.symbol(initializer), candidate.readers);
      if (target !== undefined) {
        return target;
      }
    }
    return observedSymbolIdentity(candidate.ownSymbol, candidate.readers);
  }

  function schemaIdentities(candidate: SchemaCandidate): ReadonlySet<object> {
    const identities = new Set<object>();
    const own = observedSymbolIdentity(candidate.ownSymbol, candidate.readers);
    const value = schemaValueIdentity(candidate);
    if (own !== undefined) {
      identities.add(own);
    }
    if (value !== undefined) {
      identities.add(value);
    }
    return identities;
  }

  function schemaValueOrigin(candidate: SchemaCandidate): string | undefined {
    const value = unwrapSchemaExpression(candidate.initializer);
    const binding = Node.isIdentifier(value) || Node.isPropertyAccessExpression(value) ? candidate.readers.symbol(value) : candidate.ownSymbol;
    return observedSymbolOriginKey(binding, candidate.readers);
  }

  function nativeSchemaRepresentatives(schemas: readonly SchemaCandidate[]): readonly SchemaCandidate[] {
    const captures = new Map<TypeObservationReader, Map<object, SchemaCandidate>>();
    const ordered: SchemaCandidate[] = [];
    const captureOf = (context: TypeObservationReader): Map<object, SchemaCandidate> => {
      let capture = captures.get(context);
      if (capture === undefined) {
        capture = new Map();
        captures.set(context, capture);
      }
      return capture;
    };
    const retain = (schema: SchemaCandidate): void => {
      const identity = schemaValueIdentity(schema);
      if (identity === undefined) {
        ordered.push(schema);
        return;
      }
      const capture = captureOf(schema.readers);
      const previous = capture.get(identity);
      if (previous === undefined) {
        capture.set(identity, schema);
        ordered.push(schema);
      } else if (previous.aggregate && !schema.aggregate) {
        capture.set(identity, schema);
        const index = ordered.indexOf(previous);
        if (index < 0) {
          throw new Error("schema representative order is missing");
        }
        ordered[index] = schema;
      }
    };
    for (const schema of schemas) {
      retain(schema);
    }
    return ordered;
  }
  function uniqueSchemas(schemas: readonly SchemaCandidate[]): readonly SchemaCandidate[] {
    const ordered = nativeSchemaRepresentatives(schemas);
    const groups = new Map<string | SchemaCandidate, { representative: SchemaCandidate; interpretations: SchemaCandidate[] }>();
    for (const schema of ordered) {
      const key = schemaValueOrigin(schema) ?? schema;
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, { representative: schema, interpretations: [schema] });
        continue;
      }
      group.interpretations.push(schema);
      if (group.representative.aggregate && !schema.aggregate) {
        group.representative = schema;
      }
    }
    return [...groups.values()].map(({ representative, interpretations }) => ({ ...representative, interpretations }));
  }

  function explicitTwin(candidate: SchemaCandidate): "pair" | "unresolved" | "none" {
    if (candidate.twinDeclaration !== undefined) {
      const declarationRead = readAnnotatedZodOutputTwin(candidate.twinDeclaration, candidate.readers);
      if (declarationRead.kind !== "none") {
        return declarationRead.kind;
      }
    }
    const contextual = readContextualZodOutputTwin(candidate.initializer, candidate.anchor, candidate.readers);
    if (contextual.kind !== "none") {
      return contextual.kind;
    }
    return expressionTwin(candidate);
  }

  function expressionTwin(candidate: SchemaCandidate): "pair" | "unresolved" | "none" {
    let current: Expression = candidate.initializer;
    while (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isTypeAssertion(current) || Node.isSatisfiesExpression(current)) {
      if (Node.isAsExpression(current) || Node.isTypeAssertion(current) || Node.isSatisfiesExpression(current)) {
        const read = readExpressionZodOutputTwin(current, candidate.readers);
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

  function twinTargetSets(schemas: readonly SchemaCandidate[]): TwinTargets {
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

  function schemaJudgment(
    interpretation: SchemaCandidate,
    derivedTargets: DerivedTargets,
    twinTargets: TwinTargets,
  ): "derived" | "twin" | "unowned" | "unresolved" {
    const identities = schemaIdentities(interpretation);
    if (interpretation.unreadable) {
      return "unresolved";
    }
    if ([...identities].some((identity) => derivedTargets.identities.has(identity))) {
      return "derived";
    }
    if ([...identities].some((identity) => twinTargets.pairs.has(identity))) {
      return "twin";
    }
    return [...identities].some((identity) => twinTargets.unresolved.has(identity)) ? "unresolved" : "unowned";
  }
  function classifySchemas(
    schemas: readonly SchemaCandidate[],
    derivedTargets: DerivedTargets,
    twinTargets: TwinTargets,
    relativePath: (sourceFile: import("ts-morph").SourceFile) => string,
  ): SchemaClassification {
    let derived = 0;
    let twins = 0;
    let unresolved = 0;
    const candidates: ReviewedGrantCandidate[] = [];
    for (const candidate of schemas) {
      const judgments = (candidate.interpretations ?? [candidate]).map((interpretation) => schemaJudgment(interpretation, derivedTargets, twinTargets));
      const unreadable = judgments.includes("unresolved");
      if (unreadable || judgments.includes("unowned")) {
        candidates.push(grantCandidate(candidate, unreadable, relativePath));
        if (unreadable) {
          unresolved += 1;
        }
      } else if (judgments[0] === "derived") {
        derived += 1;
      } else {
        twins += 1;
      }
    }
    return { derived, twins, unresolved, candidates };
  }

  function uniqueFactories(factories: readonly FactoryCandidate[]): readonly FactoryCandidate[] {
    const unique = new Map<object, FactoryCandidate>();
    for (const factory of factories) {
      const identity = observedSymbolIdentity(exportOwnerSymbol(factory.declaration, factory.readers), factory.readers);
      if (identity !== undefined && !unique.has(identity)) {
        unique.set(identity, factory);
      }
    }
    const groups = new Map<string | FactoryCandidate, FactoryCandidate[]>();
    for (const factory of unique.values()) {
      const key = observedSymbolOriginKey(exportOwnerSymbol(factory.declaration, factory.readers), factory.readers) ?? factory;
      const group = groups.get(key) ?? [];
      group.push(factory);
      groups.set(key, group);
    }
    return [...groups.values()].map((group) => {
      const first = group[0];
      if (first === undefined) {
        throw new Error("native factory interpretation group is empty");
      }
      if (group.some((item) => item.ownership === "unresolved")) {
        return { ...first, ownership: "unresolved" };
      }
      if (group.some((item) => item.ownership === "unowned")) {
        return { ...first, ownership: "unowned" };
      }
      return first;
    });
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

  return {
    schemaOwnershipWitnesses,
    schemaCandidate,
    factoryCandidate,
    zodDerivedTarget,
    isExported,
    aggregateSchemaCandidates,
    uniqueSchemas,
    uniqueFactories,
    classifySchemas,
    twinTargetSets,
    factoryGrantCandidate,
    exportedSymbolIdentities,
  };
}

function membershipPopulation(derived: number, twins: number, factories: number, schemaOnly: number): string {
  return `zod-export-membership [derived=${String(derived)}, twins=${String(twins)}, factories=${String(factories)}, schema-only=${String(schemaOnly)}]`;
}

export const gate = defineGate({
  id: "zod-export-membership",
  family: "zod-output-twin-parity",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@product", "@tests"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const nominees: MorphNode[] = [];
    let plan: InventoryInvocationPlan | undefined;
    const native = ctx.nativeTypes;
    if (native === undefined) {
      throw new Error("native Zod ownership facts are unavailable");
    }
    return {
      visitors: [
        {
          kinds: [
            SyntaxKind.VariableDeclaration,
            SyntaxKind.PropertyDeclaration,
            SyntaxKind.ExportAssignment,
            SyntaxKind.FunctionDeclaration,
            SyntaxKind.TypeReference,
          ],
          visit: (node): void => {
            nominees.push(node);
          },
        },
      ],
      prepare: (): void => {
        plan = typeObservationPlan(ctx.files, nominees);
        native.request({ kind: "invocation-evidence", nodes: ctx.files, plan });
      },
      evaluate: (): void => {
        if (plan === undefined) {
          throw new Error("native Zod ownership request was not prepared");
        }
        if (ctx.files.length === 0) {
          ctx.receipt({ kind: "population", source: membershipPopulation(0, 0, 0, 0), members: 0 });
          return;
        }
        const contexts = typeObservationReaders(native.invocationEvidence(ctx.files, plan));
        const contextOf = (node: MorphNode): TypeObservationReader => {
          const value = contexts.get(node.getSourceFile());
          if (value === undefined) {
            throw new Error("Zod ownership source has no native importing owner");
          }
          return value;
        };
        const semanticByContext = new Map<TypeObservationReader, ReturnType<typeof membershipSemantics>>();
        const semantics = (readers: TypeObservationReader): ReturnType<typeof membershipSemantics> => {
          let value = semanticByContext.get(readers);
          if (value === undefined) {
            value = membershipSemantics(readers);
            semanticByContext.set(readers, value);
          }
          return value;
        };
        const first = contexts.values().next().value;
        if (first === undefined) {
          throw new Error("Zod ownership cohort has no source anchor");
        }
        const { uniqueSchemas, uniqueFactories, classifySchemas, twinTargetSets, factoryGrantCandidate } = semantics(first);
        const schemas: SchemaCandidate[] = [];
        const aggregateRoots: SchemaDeclaration[] = [];
        const factories: FactoryCandidate[] = [];
        const derivedIdentities = new Set<object>();
        const discoverSchema = (node: MorphNode): void => {
          const { schemaCandidate } = semantics(contextOf(node));
          if (Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node) || Node.isExportAssignment(node)) {
            aggregateRoots.push(node);
            const schema = schemaCandidate(node);
            if (schema !== null) {
              schemas.push(schema);
            }
          }
        };
        const discoverFactory = (node: MorphNode): void => {
          const { factoryCandidate } = semantics(contextOf(node));
          if (Node.isVariableDeclaration(node) || Node.isFunctionDeclaration(node)) {
            const factory = factoryCandidate(node);
            if (factory !== null) {
              factories.push(factory);
            }
          }
        };
        const discoverDerived = (node: MorphNode): void => {
          const { zodDerivedTarget } = semantics(contextOf(node));
          if (Node.isTypeReference(node)) {
            const target = zodDerivedTarget(node);
            if (target !== undefined) {
              derivedIdentities.add(target.identity);
            }
          }
        };
        for (const node of nominees) {
          discoverSchema(node);
          discoverFactory(node);
          discoverDerived(node);
        }
        const collectExported = (): ReadonlySet<object> => {
          const exported = new Set<object>();
          for (const source of ctx.files) {
            for (const identity of semantics(contextOf(source)).exportedSymbolIdentities([source])) {
              exported.add(identity);
            }
          }
          return exported;
        };
        const exported = collectExported();
        for (const declaration of aggregateRoots) {
          const { isExported, aggregateSchemaCandidates } = semantics(contextOf(declaration));
          if (isExported(declaration, exported)) {
            schemas.push(...aggregateSchemaCandidates(declaration));
          }
        }
        const exportedSchemas = uniqueSchemas(schemas.filter((candidate) => semantics(candidate.readers).isExported(candidate.declaration, exported)));
        const exportedFactories = uniqueFactories(factories.filter((candidate) => semantics(candidate.readers).isExported(candidate.declaration, exported)));
        const collectOwnershipEvidence = (): readonly SchemaCandidate[] => {
          const selectedSources = new Set(ctx.files.map((source) => normalizedPath(source)));
          const ownershipEvidence = [...schemas];
          const relatedSources = new Map<TypeObservationReader, Set<import("ts-morph").SourceFile>>();
          const add = (candidate: SchemaCandidate): void => {
            const witnesses = semantics(candidate.readers).schemaOwnershipWitnesses(candidate, selectedSources);
            ownershipEvidence.push(...witnesses);
            let sources = relatedSources.get(candidate.readers);
            if (sources === undefined) {
              sources = new Set();
              relatedSources.set(candidate.readers, sources);
            }
            for (const witness of witnesses) {
              sources.add(witness.declaration.getSourceFile());
            }
          };
          for (const candidate of schemas) {
            add(candidate);
          }
          const addDerived = (readers: TypeObservationReader, source: import("ts-morph").SourceFile): void => {
            for (const reference of source.getDescendantsOfKind(SyntaxKind.TypeReference)) {
              const target = semantics(readers).zodDerivedTarget(reference);
              if (target !== undefined) {
                derivedIdentities.add(target.identity);
              }
            }
          };
          for (const [readers, sources] of relatedSources) {
            for (const source of sources) {
              addDerived(readers, source);
            }
          }
          return ownershipEvidence;
        };
        const ownershipEvidence = collectOwnershipEvidence();
        const classified = classifySchemas(exportedSchemas, { identities: derivedIdentities }, twinTargetSets(ownershipEvidence), (sourceFile) =>
          ctx.relativePath(sourceFile),
        );
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
          source: membershipPopulation(
            classified.derived,
            classified.twins + factoryTwins.length,
            ownedFactories.length,
            findings.length - classified.unresolved - unresolvedFactories,
          ),
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
    {
      mode: "types",
      files: proofFiles({
        "tests/support/schemas.ts": 'import * as z from "zod";\nexport const wire = z.object({ value: z.string() });\n',
      }),
      expect: { count: 1, token: "wire", messageIncludes: "no semantic output owner" },
      grant: { subject: "tests/support/schemas.ts", operation: "schema-only-export:wire" },
      why: "THE TEST-PATH ARM: an exported schema with no output owner under `tests/**` is judged like a product export, so a test helper cannot mint a wire shape production does not own",
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
    {
      mode: "types",
      files: proofFiles({
        "tests/support/schemas.ts":
          'import * as z from "zod";\ntype PublicWire = { value: string };\nexport const wire: z.ZodType<PublicWire> = z.object({ value: z.string() });\n',
      }),
      why: "the pass control of the test-path arm: an explicit concrete ZodType<T> pair under `tests/**` is owned, so the arm flags the unowned schema and not the directory",
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
