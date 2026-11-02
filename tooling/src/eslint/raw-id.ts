// `orb/no-raw-id`: a branded id never travels as a plain string. Three arms: a zod field named `*Id` built from
// `z.string()`, a declared field, parameter or variable whose id name stands for a brand but is typed `string`, and a
// `useState` of a plain string that is fed a brand. The second and third need the program; the first is syntax alone.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import { BrandTable } from "../brand-names/index.ts";
import { lexicalVariable, singleInitializer } from "./general.ts";
import { staticMemberName } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
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

// `string`, `string[]`, `readonly string[]`, `Array<string>` or `ReadonlySet<string>`, optionally with null or undefined.
function plainStringAnnotation(type: TSESTree.TypeNode): boolean {
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
  return member.type === AST_NODE_TYPES.TSStringKeyword;
}

const BRAND_ALIAS = /^[A-Z]\w*Id$/u;

const tables = new WeakMap<ts.Program, BrandTable>();

// `any` and `never` are assignable to every brand, so neither counts as one.
const isBrandType = (checker: ts.TypeChecker, brand: ts.Type, type: ts.Type): boolean =>
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)) === 0 && checker.isTypeAssignableTo(type, brand);

// Every top-level `*Id` alias of the program that is a brand: the ids module's own and any a package declares beside its
// schema (`ProviderId`, `AgentSdkSessionId`), so the table needs no list kept by hand.
function brandTable(program: ts.Program, checker: ts.TypeChecker, brand: ts.Type): BrandTable {
  const cached = tables.get(program);
  if (cached !== undefined) {
    return cached;
  }
  const aliases = program
    .getSourceFiles()
    .filter((source) => !(program.isSourceFileFromExternalLibrary(source) || program.isSourceFileDefaultLibrary(source)))
    .flatMap((source) => source.statements.filter(ts.isTypeAliasDeclaration))
    .filter((alias) => BRAND_ALIAS.test(alias.name.text));
  const table = new BrandTable(aliases.filter((alias) => isBrandType(checker, brand, checker.getTypeAtLocation(alias.name))).map((alias) => alias.name.text));
  tables.set(program, table);
  return table;
}

const STATE_HOOK = "useState";

// The brand names a type carries, a union read member by member.
function brandsOf(checker: ts.TypeChecker, brand: ts.Type, type: ts.Type): string[] {
  const members = type.isUnion() ? type.types : [type];
  return members.filter((member) => member.isIntersection() && isBrandType(checker, brand, member)).map((member) => checker.typeToString(member));
}

// A state type of only `string`, with null or undefined: the slot takes any string and names no brand.
function plainStringState(type: ts.Type): boolean {
  const members = type.isUnion() ? type.types : [type];
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  const kept = members.filter((member) => (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0);
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  return kept.length > 0 && kept.every((member) => (member.flags & ts.TypeFlags.String) !== 0);
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
    const services = context.sourceCode.parserServices;
    const program = services?.program ?? null;
    const toTs = services?.esTreeNodeToTSNodeMap;
    const checker = program?.getTypeChecker();
    const brand = program === null || checker === undefined ? null : brandedString(program, checker);
    if (program === null || checker === undefined || brand === null || toTs === undefined) {
      return { "ObjectExpression > Property": zodField };
    }
    const table = brandTable(program, checker, brand);
    const judgeDeclared = (node: TSESTree.Node, name: string, annotation: TSESTree.TSTypeAnnotation | undefined): void => {
      const match = annotation !== undefined && plainStringAnnotation(annotation.typeAnnotation) ? table.brandOf(name) : null;
      if (match !== null) {
        context.report({ node, message: declaredMessage(name, match.brand) });
      }
    };
    const typeOf = (node: TSESTree.Node): ts.Type => checker.getTypeAtLocation(toTs.get(node));
    return {
      "ObjectExpression > Property": zodField,
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
        if (!isStateHook(call.callee) || state?.type !== AST_NODE_TYPES.Identifier || !plainStringState(typeOf(state))) {
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
