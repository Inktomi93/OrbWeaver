// `orb/no-raw-id` checks raw Zod id fields, string declarations with a matching brand, and branded values
// widened into a generic id field or React state. Only the Zod builder check is syntax-only.
import { relative } from "node:path";
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import type { NameMatch } from "./brand-names.ts";
import { BrandTable } from "./brand-names.ts";
import { requireTypeServices } from "./checker.ts";
import { lexicalVariable, singleInitializer } from "./general.ts";
import { staticMemberName } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { homes, posixPath } from "./syntax.ts";
import { brandedString } from "./unsafe-cast.ts";

const ZOD_MODULE = /^zod(?:\/|$)/u;

const ZOD_STRING_BUILDER = "string";

const ZOD_COERCE = "coerce";

const ZOD_OBJECT_NAMES = new Set(["z", "*", "default"]);

function zodImportName(context: OrbRuleContext, identifier: TSESTree.Identifier): string | undefined {
  const definition = lexicalVariable(context, identifier)?.defs[0];
  if (definition?.type !== TSESLint.Scope.DefinitionType.ImportBinding || !ZOD_MODULE.test((definition.parent as TSESTree.ImportDeclaration).source.value)) {
    return;
  }
  const specifier = definition.node;
  if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
    return "*";
  }
  if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
    return specifier.imported.type === AST_NODE_TYPES.Identifier ? specifier.imported.name : specifier.imported.value;
  }
  return "default";
}

function isZodObject(context: OrbRuleContext, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return ZOD_OBJECT_NAMES.has(zodImportName(context, node) as string);
  }
  return (
    staticMemberName(node) === "z" &&
    (node as TSESTree.MemberExpression).object.type === AST_NODE_TYPES.Identifier &&
    ZOD_OBJECT_NAMES.has(zodImportName(context, (node as TSESTree.MemberExpression).object as TSESTree.Identifier) as string)
  );
}

function isZodCoerce(context: OrbRuleContext, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return zodImportName(context, node) === ZOD_COERCE;
  }
  return staticMemberName(node) === ZOD_COERCE && isZodObject(context, (node as TSESTree.MemberExpression).object);
}

const ZOD_ALIAS_HOPS = 4;

function isZodStringBuilder(context: OrbRuleContext, node: TSESTree.Node, hops: number = ZOD_ALIAS_HOPS): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    if (zodImportName(context, node) === ZOD_STRING_BUILDER) {
      return true;
    }
    const initializer = hops > 0 ? singleInitializer(context, node) : undefined;
    return initializer !== undefined && isZodStringBuilder(context, initializer, hops - 1);
  }
  return (
    staticMemberName(node) === ZOD_STRING_BUILDER &&
    (isZodObject(context, (node as TSESTree.MemberExpression).object) || isZodCoerce(context, (node as TSESTree.MemberExpression).object))
  );
}

function builderRoot(node: TSESTree.Node): TSESTree.CallExpression | undefined {
  let current = node;
  while (current.type === AST_NODE_TYPES.CallExpression) {
    const receiver = current.callee.type === AST_NODE_TYPES.MemberExpression ? current.callee.object : undefined;
    if (receiver?.type !== AST_NODE_TYPES.CallExpression) {
      break;
    }
    current = receiver;
  }
  return current.type === AST_NODE_TYPES.CallExpression ? current : undefined;
}

function staticPropertyKey(property: TSESTree.Property | TSESTree.TSPropertySignature | TSESTree.PropertyDefinition): string {
  if (property.computed) {
    return "";
  }
  if (property.key.type === AST_NODE_TYPES.Identifier) {
    return property.key.name;
  }
  return property.key.type === AST_NODE_TYPES.Literal && typeof property.key.value === "string" ? property.key.value : "";
}

const ZOD_MESSAGE = "An id-named Zod field is a raw string; use typeIdSchema(ID_PREFIX.x) or brandedId(label) so the validated output preserves identity.";

const declaredMessage = (name: string, brand: string): string =>
  `\`${name}\` names a ${brand} but is declared \`string\`; declare it as ${brand} so the brand flows, and parse a raw string with the brand's schema at its boundary.`;

const stateMessage = (brands: string): string =>
  `A plain-string useState is fed a ${brands}; declare the state as that brand so the value read back needs no cast.`;

const NOTHING_TYPES = new Set<string>([AST_NODE_TYPES.TSNullKeyword, AST_NODE_TYPES.TSUndefinedKeyword]);

const COLLECTIONS = new Set(["Array", "ReadonlyArray", "Set", "ReadonlySet"]);

// `string`, `string[]`, `readonly string[]`, `Array<string>` or `ReadonlySet<string>`, optionally with null or undefined,
// where `string` may also be an alias the caller resolves to a bare `string` (`type Raw = string`).
function plainStringAnnotation(type: TSESTree.TypeNode, isPlainAlias: (reference: TSESTree.TSTypeReference) => boolean): boolean {
  const members = type.type === AST_NODE_TYPES.TSUnionType ? type.types.filter((each) => !NOTHING_TYPES.has(each.type)) : [type];
  if (members.length !== 1) {
    return false;
  }
  let [member] = members as [TSESTree.TypeNode];
  if (member.type === AST_NODE_TYPES.TSTypeOperator && member.operator === "readonly" && member.typeAnnotation !== undefined) {
    member = member.typeAnnotation;
  }
  if (member.type === AST_NODE_TYPES.TSArrayType) {
    member = member.elementType;
  } else if (
    member.type === AST_NODE_TYPES.TSTypeReference &&
    member.typeName.type === AST_NODE_TYPES.Identifier &&
    COLLECTIONS.has(member.typeName.name) &&
    member.typeArguments?.params.length === 1
  ) {
    member = member.typeArguments.params[0] as TSESTree.TypeNode;
  }
  return member.type === AST_NODE_TYPES.TSStringKeyword || (member.type === AST_NODE_TYPES.TSTypeReference && isPlainAlias(member));
}

function resolvedSymbol(checker: ts.TypeChecker, name: ts.Node): ts.Symbol | undefined {
  const symbol = checker.getSymbolAtLocation(name);
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

// Generic aliases such as SandboxWireId describe a wire boundary.
function plainAliasOf(checker: ts.TypeChecker, name: ts.Node): boolean {
  const declaration = resolvedSymbol(checker, name)?.declarations?.[0];
  return (
    declaration !== undefined &&
    ts.isTypeAliasDeclaration(declaration) &&
    declaration.typeParameters === undefined &&
    declaration.type.kind === ts.SyntaxKind.StringKeyword
  );
}

// A trailing-word match guesses (a foreign `providerMessageId` is no `MessageId`), so pnpm brand-flow reports it and the rule does not.
const ENFORCED_MATCHES: ReadonlySet<NameMatch["match"]> = new Set<NameMatch["match"]>(["exact", "qualified", "alias"]);

const BRAND_ALIAS = /^[A-Z]\w*Id$/u;

// `any` and `never` are assignable to every brand, so neither counts as one.
const isBrandType = (checker: ts.TypeChecker, brand: ts.Type, type: ts.Type): boolean =>
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)) === 0 && checker.isTypeAssignableTo(type, brand);

function brandReference(node: ts.Node): ts.Node | undefined {
  if (ts.isImportSpecifier(node) || ts.isTypeAliasDeclaration(node)) {
    return node.name;
  }
  return ts.isTypeReferenceNode(node) ? node.typeName : undefined;
}

function collectBrand(seen: Set<string>, checker: ts.TypeChecker, brand: ts.Type, name: ts.Node): void {
  const symbol = resolvedSymbol(checker, name);
  if (symbol === undefined) {
    return;
  }
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  if (isBrandType(checker, brand, type)) {
    for (const candidate of [symbol.name, type.aliasSymbol?.name]) {
      if (candidate !== undefined && BRAND_ALIAS.test(candidate)) {
        seen.add(candidate);
      }
    }
  }
}

// A brand elsewhere in the program says nothing about an identically named field here.
function localBrands(source: ts.SourceFile, checker: ts.TypeChecker, brand: ts.Type): Set<string> {
  const seen = new Set<string>();
  function visit(node: ts.Node): void {
    const name = brandReference(node);
    if (name !== undefined) {
      collectBrand(seen, checker, brand, name);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return seen;
}

// Resolve a destructured parameter back to its annotated property. Two local fields named messageId
// may carry different identities, even when they share a module and a brand import.
function sourceOfField(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Declaration | undefined {
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  if (declaration !== undefined && ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent)) {
    const key = declaration.propertyName ?? declaration.name;
    if (ts.isIdentifier(key) || ts.isStringLiteral(key)) {
      return checker.getTypeAtLocation(declaration.parent).getProperty(key.text)?.declarations?.[0];
    }
  }
  return declaration;
}

function libraryFieldSource(program: ts.Program, checker: ts.TypeChecker, node: ts.Node, name: string): ts.Declaration | undefined {
  if (!((ts.isShorthandPropertyAssignment(node) || ts.isPropertyAssignment(node)) && ts.isObjectLiteralExpression(node.parent))) {
    return;
  }
  if (!(ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) || node.name.text !== name) {
    return;
  }
  const field = checker.getContextualType(node.parent)?.getProperty(name);
  if (field?.declarations?.some((origin) => program.isSourceFileFromExternalLibrary(origin.getSourceFile())) !== true) {
    return;
  }
  if (ts.isShorthandPropertyAssignment(node)) {
    return sourceOfField(checker, checker.getShorthandAssignmentValueSymbol(node));
  }
  const value = ts.isPropertyAccessExpression(node.initializer) ? node.initializer.name : node.initializer;
  return sourceOfField(checker, checker.getSymbolAtLocation(value));
}

// A value forwarded to a field of an imported library type has a known owner. Look up the actual
// contextual property, so mapped projections such as Pick retain the original field declaration.
function forwardsLibraryField(program: ts.Program, checker: ts.TypeChecker, declaration: ts.Node, name: string): boolean {
  const visit = (node: ts.Node): boolean => libraryFieldSource(program, checker, node, name) === declaration || ts.forEachChild(node, visit) === true;
  return visit(declaration.getSourceFile());
}

const STATE_HOOK = "useState";

// The brand names a type carries, a union read member by member.
function brandsOf(checker: ts.TypeChecker, brand: ts.Type, type: ts.Type): string[] {
  const members = type.isUnion() ? type.types : [type];
  return members.filter((member) => member.isIntersection() && isBrandType(checker, brand, member)).map((member) => checker.typeToString(member));
}

// A slot of only `string`, with null or undefined: the slot takes any string and names no brand.
function plainStringSlot(type: ts.Type): boolean {
  const members = type.isUnion() ? type.types : [type];
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  const kept = members.filter((member) => (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0);
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  return kept.length > 0 && kept.every((member) => (member.flags & ts.TypeFlags.String) !== 0);
}

const ID_KEY = "id";
const GHOST_ROW_HOMES = homes("packages/client/src/features/chat/hooks/use-message-items.ts");

interface IdRuleScope {
  readonly checker: ts.TypeChecker;
  readonly brand: ts.Type;
  readonly cwd: string;
}

// Law 4 permits the virtualizer's key. The ghost arm receives the target MessageId on swipe and a literal key on append.
function ghostKey(scope: IdRuleScope, literal: ts.ObjectLiteralExpression, value: ts.Type, kit: ts.SourceFile): boolean {
  const { checker, cwd } = scope;
  const owner = checker.getContextualType(literal)?.aliasSymbol;
  if (
    owner?.name !== "ChatRowItem" ||
    owner.declarations?.some((site) => GHOST_ROW_HOMES.includes(posixPath(relative(cwd, site.getSourceFile().fileName)))) !== true
  ) {
    return false;
  }
  const message = checker.getSymbolAtLocation(kit)?.exports?.get(ts.escapeLeadingUnderscores("MessageId"));
  const kind = checker.getTypeAtLocation(literal).getProperty("kind");
  if (message === undefined || kind === undefined || !checker.isTypeAssignableTo(value, checker.getDeclaredTypeOfSymbol(message))) {
    return false;
  }
  const tag = checker.getTypeOfSymbolAtLocation(kind, literal);
  return tag.isStringLiteral() && tag.value === "ghost";
}

function sandboxType(checker: ts.TypeChecker, declaration: ts.Declaration, kit: ts.SourceFile): ts.Type | undefined {
  if (ts.isPropertyAssignment(declaration) && ts.isCallExpression(declaration.initializer)) {
    const call = declaration.initializer;
    const owner = checker.getResolvedSignature(call)?.declaration;
    const arg = call.typeArguments?.[0];
    if (
      owner !== undefined &&
      ts.isFunctionDeclaration(owner) &&
      owner.name?.text === "sandboxWireIdSchema" &&
      owner.getSourceFile() === kit &&
      arg !== undefined
    ) {
      return checker.getTypeFromTypeNode(arg);
    }
  }
  if (!ts.isPropertySignature(declaration) || declaration.type === undefined) {
    return;
  }
  const nodes: readonly ts.TypeNode[] = ts.isUnionTypeNode(declaration.type) ? declaration.type.types : [declaration.type];
  return nodes
    .filter(ts.isTypeReferenceNode)
    .map((node) => sandboxWireArgument(checker, node, kit))
    .find((type) => type !== undefined);
}

function sandboxWireArgument(checker: ts.TypeChecker, node: ts.TypeReferenceNode, kit: ts.SourceFile): ts.Type | undefined {
  const owner = checker.getSymbolAtLocation(node.typeName);
  if (owner === undefined) {
    return;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  const target = (owner.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(owner) : owner;
  const arg = node.typeArguments?.[0];
  if (target.name === "SandboxWireId" && target.declarations?.some((site) => site.getSourceFile() === kit) === true && arg !== undefined) {
    return checker.getTypeFromTypeNode(arg);
  }
  return undefined;
}

function ruledIdSlot(scope: IdRuleScope, literal: ts.ObjectLiteralExpression, value: ts.Type): boolean {
  const { checker, brand } = scope;
  const kit = brand.aliasSymbol?.declarations?.[0]?.getSourceFile();
  const context = checker.getContextualType(literal);
  if (kit === undefined || context === undefined) {
    return false;
  }
  if (ghostKey(scope, literal, value, kit)) {
    return true;
  }
  const field = checker.getNonNullableType(context).getProperty(ID_KEY);
  const origins = field === undefined ? [] : checker.getRootSymbols(field).flatMap((symbol) => symbol.declarations ?? []);
  return (
    origins.length > 0 &&
    origins.every((origin) => {
      const expected = sandboxType(checker, origin, kit);
      return expected !== undefined && checker.isTypeAssignableTo(value, expected);
    })
  );
}

const isStateHook = (callee: TSESTree.Node): boolean =>
  (callee.type === AST_NODE_TYPES.Identifier && callee.name === STATE_HOOK) || staticMemberName(callee) === STATE_HOOK;

// The first argument of every call of a state setter in this file.
function setterArguments(context: OrbRuleContext, setter: TSESTree.Identifier): TSESTree.CallExpressionArgument[] {
  return (lexicalVariable(context, setter)?.references ?? []).flatMap(({ identifier }) => {
    const parent = identifier.parent;
    return parent.type === AST_NODE_TYPES.CallExpression && parent.callee === identifier && parent.arguments[0] !== undefined ? [parent.arguments[0]] : [];
  });
}

export const rawIdRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const zodField = (property: TSESTree.Property): void => {
      const root = staticPropertyKey(property).endsWith("Id") ? builderRoot(property.value) : undefined;
      if (root !== undefined && isZodStringBuilder(context, root.callee)) {
        context.report({ node: property.key, message: ZOD_MESSAGE });
      }
    };
    const { program, checker, esTreeNodeToTSNodeMap: toTs } = requireTypeServices(context);
    const brand = brandedString(program, checker);
    if (brand === null) {
      return { "ObjectExpression > Property": zodField };
    }
    const visible = localBrands(toTs.get(context.sourceCode.ast).getSourceFile(), checker, brand);
    const table = new BrandTable(visible);
    const judgeDeclared = (node: TSESTree.Node, name: string, annotation: TSESTree.TSTypeAnnotation | undefined): void => {
      const plain =
        annotation !== undefined &&
        plainStringAnnotation(
          annotation.typeAnnotation,
          (reference) => reference.typeArguments === undefined && plainAliasOf(checker, toTs.get(reference.typeName)),
        );
      const match = plain ? table.brandOf(name) : null;
      if (
        match !== null &&
        visible.has(match.brand) &&
        ENFORCED_MATCHES.has(match.match) &&
        !forwardsLibraryField(program, checker, toTs.get(node).parent, name)
      ) {
        context.report({ node, message: declaredMessage(name, match.brand) });
      }
    };
    const scope = { checker, brand, cwd: context.cwd };
    const typeOf = (node: TSESTree.Node): ts.Type => checker.getTypeAtLocation(toTs.get(node));
    return {
      "ObjectExpression > Property"(property: TSESTree.Property): void {
        zodField(property);
        if (staticPropertyKey(property) !== ID_KEY) {
          return;
        }
        const value = toTs.get(property.value);
        const literal = toTs.get(property.parent);
        if (!(ts.isExpression(value) && ts.isObjectLiteralExpression(literal))) {
          return;
        }
        const slot = checker.getContextualType(value);
        if (slot === undefined || !plainStringSlot(slot)) {
          return;
        }
        const received = typeOf(property.value);
        const brands = brandsOf(checker, brand, received);
        if (brands.length > 0 && !ruledIdSlot(scope, literal, received)) {
          context.report({ node: property.key, message: declaredMessage(ID_KEY, brands.join(" | ")) });
        }
      },
      "TSPropertySignature[typeAnnotation]"(signature: TSESTree.TSPropertySignature): void {
        judgeDeclared(signature.key, staticPropertyKey(signature), signature.typeAnnotation);
      },
      "PropertyDefinition[typeAnnotation]"(definition: TSESTree.PropertyDefinition): void {
        judgeDeclared(definition.key, staticPropertyKey(definition), definition.typeAnnotation);
      },
      "Identifier[typeAnnotation]"(identifier: TSESTree.Identifier): void {
        judgeDeclared(identifier, identifier.name, identifier.typeAnnotation);
      },
      "VariableDeclarator[init.type='CallExpression'][id.type='ArrayPattern']"(declarator: TSESTree.VariableDeclarator): void {
        const call = declarator.init as TSESTree.CallExpression;
        const [state, setter] = (declarator.id as TSESTree.ArrayPattern).elements;
        if (!isStateHook(call.callee) || state?.type !== AST_NODE_TYPES.Identifier || !plainStringSlot(typeOf(state))) {
          return;
        }
        const fed = [...call.arguments, ...(setter?.type === AST_NODE_TYPES.Identifier ? setterArguments(context, setter) : [])];
        const brands = new Set(fed.flatMap((argument) => brandsOf(checker, brand, typeOf(argument))));
        if (brands.size > 0) {
          context.report({ node: state, message: stateMessage([...brands].sort().join(" | ")) });
        }
      },
    };
  },
};
