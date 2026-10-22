import { relative } from "node:path";
import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { isValueWrapper } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { restrictionRule } from "./syntax.ts";

const PRINCIPAL_MINT_HOME = "packages/server/src/entry/auth/principal-mint.ts";

const AUTH_SEAM = "packages/server/src/entry/auth/seam.ts";

const HOST_BRIDGE = "packages/server/src/entry/compose/chat.ts";

const PRINCIPAL_MINT_NAME = "mintPrincipal";

const PRINCIPAL_CONSTRUCTOR = { path: PRINCIPAL_MINT_HOME, name: PRINCIPAL_MINT_NAME };

const ROW_MAPPER = { path: AUTH_SEAM, name: "principalFromRow" };

const HOST_FLOOR = { path: HOST_BRIDGE, name: "hostPrincipal" };

const PRINCIPAL_RETURN_SITES = [PRINCIPAL_CONSTRUCTOR, ROW_MAPPER, HOST_FLOOR];

const PRINCIPAL_MINT_CALLERS = [
  PRINCIPAL_CONSTRUCTOR,
  { path: AUTH_SEAM, name: "resolveCookiePrincipal" },
  { path: AUTH_SEAM, name: "resolveHeaderOrFallbackPrincipal" },
  ROW_MAPPER,
  HOST_FLOOR,
];

const PRINCIPAL_TYPE_REFERENCE = "TSTypeReference:matches([typeName.name='Principal'], [typeName.right.name='Principal'])";

const isPrincipalFunction = (node: TSESTree.Node): node is TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression =>
  node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";

const PRINCIPAL_CASTS = new Set(["TSAsExpression", "TSTypeAssertion"]);

const PRINCIPAL_LITERAL_MESSAGE =
  "D1/D40: an object literal in a Principal position is a hand-built identity; tsc accepts it only when the literal is any-typed or asserted past the brand. Receive the caller's Principal or resolve one through the entry mint.";

const isPrincipalType = (type: TSESTree.Node | undefined): boolean =>
  type?.type === "TSTypeReference" &&
  ((type.typeName.type === "Identifier" && type.typeName.name === "Principal") ||
    (type.typeName.type === "TSQualifiedName" && type.typeName.right.name === "Principal"));

function principalFunctionName(fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression): string | null {
  if (fn.type !== "ArrowFunctionExpression" && fn.id?.type === "Identifier") {
    return fn.id.name;
  }
  const { parent } = fn;
  if (parent.type === "VariableDeclarator") {
    return parent.id.type === "Identifier" ? parent.id.name : null;
  }
  const keyed = parent.type === "Property" || parent.type === "MethodDefinition" || parent.type === "PropertyDefinition";
  return keyed && parent.key.type === "Identifier" ? parent.key.name : null;
}

function inPrincipalSite(context: OrbRuleContext, node: TSESTree.Node, sites: readonly { path: string; name: string }[]): boolean {
  const path = relative(context.cwd, context.filename).replaceAll("\\", "/");
  const fn = isPrincipalFunction(node) ? node : context.sourceCode.getAncestors(node).findLast(isPrincipalFunction);
  const name = fn === undefined ? null : principalFunctionName(fn);
  return sites.some((site) => site.path === path && site.name === name);
}

function principalLiterals(expression: TSESTree.Node | null | undefined): TSESTree.ObjectExpression[] {
  if (expression === null || expression === undefined) {
    return [];
  }
  if (expression.type === "ObjectExpression") {
    return [expression];
  }
  if (expression.type === "SequenceExpression") {
    return [...principalLiterals(expression.expressions[0]), ...principalLiterals(expression.expressions.at(-1))];
  }
  switch (expression.type) {
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSTypeAssertion":
    case "TSNonNullExpression":
    case "TSInstantiationExpression":
    case "ChainExpression":
      return principalLiterals(expression.expression);
    case "AwaitExpression":
      return principalLiterals(expression.argument);
    case "AssignmentExpression":
      return principalLiterals(expression.right);
    case "ConditionalExpression":
      return [expression.test, expression.consequent, expression.alternate].flatMap(principalLiterals);
    case "LogicalExpression":
      return [expression.left, expression.right].flatMap(principalLiterals);
    case "BinaryExpression":
      return principalLiterals(expression.left);
    case "MemberExpression":
      return principalLiterals(expression.object);
    case "CallExpression":
      return principalLiterals(expression.callee);
    case "TaggedTemplateExpression":
      return principalLiterals(expression.tag);
    default:
      return [];
  }
}

const principalAssertionRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      // Any Principal inside the asserted type counts: `as Principal[]`, `as Principal | null` and `satisfies` launder alike.
      [`:matches(TSAsExpression, TSTypeAssertion, TSSatisfiesExpression) > .typeAnnotation:matches(${PRINCIPAL_TYPE_REFERENCE}, :has(${PRINCIPAL_TYPE_REFERENCE}))`](
        node: TSESTree.TypeNode,
      ): void {
        if (!inPrincipalSite(context, node, [PRINCIPAL_CONSTRUCTOR])) {
          context.report({
            node,
            message: "D1/D40: an asserted Principal skips the entry mint. Receive the caller's Principal or resolve one with createHostPrincipalResolver.",
          });
        }
      },
    };
  },
};

const principalReturnSiteRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction)"(
        fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | TSESTree.TSDeclareFunction,
      ): void {
        const type = fn.returnType?.typeAnnotation;
        if (isPrincipalType(type) && !(isPrincipalFunction(fn) && inPrincipalSite(context, fn, PRINCIPAL_RETURN_SITES))) {
          context.report({
            node: type as TSESTree.TSTypeReference,
            message:
              "D1/D40: a function returning a bare Principal is a mint site. Receive the caller's Principal or resolve one with createHostPrincipalResolver.",
          });
        }
      },
    };
  },
};

const principalMintSiteRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const report = (node: TSESTree.Node) => {
      if (!inPrincipalSite(context, node, PRINCIPAL_MINT_CALLERS)) {
        context.report({
          node,
          message: `D1/D40: only the registered entry mint sites (PRINCIPAL_MINT_CALLERS in @orb/tooling/eslint) name ${PRINCIPAL_MINT_NAME}. Receive the caller's Principal or resolve one with createHostPrincipalResolver.`,
        });
      }
    };
    return {
      [`Identifier[name='${PRINCIPAL_MINT_NAME}']`](node: TSESTree.Identifier): void {
        // A plain import is the edge dependency-cruiser's principal-mint-owners judges; an alias hides later calls.
        const plainImport =
          node.parent.type === "ImportSpecifier" &&
          node.parent.imported.type === "Identifier" &&
          node.parent.imported.name === PRINCIPAL_MINT_NAME &&
          node.parent.local.name === PRINCIPAL_MINT_NAME;
        if (!plainImport) {
          report(node);
        }
      },
      // A computed member or a string import name spells the constructor without an identifier.
      [`:matches(MemberExpression[computed=true] > Literal.property, ImportSpecifier > Literal.imported, ExportSpecifier > Literal.local)[value='${PRINCIPAL_MINT_NAME}']`]:
        report,
      [`MemberExpression[computed=true] > TemplateLiteral.property[expressions.length=0][quasis.0.value.cooked='${PRINCIPAL_MINT_NAME}']`]: report,
    };
  },
};

const principalLiteralRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const judge = (type: TSESTree.Node | undefined, value: TSESTree.Node | null | undefined) => {
      if (isPrincipalType(type)) {
        for (const node of principalLiterals(value)) {
          context.report({ node, message: PRINCIPAL_LITERAL_MESSAGE });
        }
      }
    };
    const enclosingReturnType = (node: TSESTree.Node) => context.sourceCode.getAncestors(node).findLast(isPrincipalFunction)?.returnType?.typeAnnotation;
    return {
      "VariableDeclarator[init]"(node: TSESTree.VariableDeclarator): void {
        judge(node.id.typeAnnotation?.typeAnnotation, node.init);
      },
      "AssignmentPattern[right]"(node: TSESTree.AssignmentPattern): void {
        judge(node.left.typeAnnotation?.typeAnnotation, node.right);
      },
      // An `accessor` field is its own node type; abstract fields cannot carry an initializer (TS1267).
      ":matches(PropertyDefinition, AccessorProperty, TSAbstractPropertyDefinition, TSAbstractAccessorProperty)"(
        node: TSESTree.PropertyDefinition | TSESTree.AccessorProperty | TSESTree.TSAbstractPropertyDefinition | TSESTree.TSAbstractAccessorProperty,
      ): void {
        judge(node.typeAnnotation?.typeAnnotation, node.value);
      },
      "ReturnStatement[argument]"(node: TSESTree.ReturnStatement): void {
        judge(enclosingReturnType(node), node.argument);
      },
      "ArrowFunctionExpression[expression=true]"(node: TSESTree.ArrowFunctionExpression): void {
        judge(node.returnType?.typeAnnotation, node.body);
      },
      "CallExpression:matches([callee.property.name='assign'], [callee.property.value='assign'])[callee.object.name='Object']"(
        node: TSESTree.CallExpression,
      ): void {
        context.report({
          node,
          message:
            "D1/D40: Object.assign returns an intersection, so it can graft a new userId or role onto a minted Principal past the brand. Use an object spread, which the brand type-checks.",
        });
      },
    };
  },
};

const principalBrandLaunderRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      ":matches(TSAsExpression, TSTypeAssertion) > TSNeverKeyword.typeAnnotation"(node: TSESTree.TSNeverKeyword): void {
        context.report({
          node,
          message:
            "D1/D40: `never` is assignable to every type, so this assertion would let a hand-built value pass for a Principal past the entry mint. Narrow the value to its real type instead.",
        });
      },
      ":matches(TSAsExpression, TSSatisfiesExpression, TSTypeAssertion, TSNonNullExpression) > ObjectExpression.expression"(
        node: TSESTree.ObjectExpression,
      ): void {
        let casts = 0;
        for (let child: TSESTree.Node = node; isValueWrapper(child.parent) && child.parent.expression === child; child = child.parent) {
          casts += PRINCIPAL_CASTS.has(child.parent.type) ? 1 : 0;
        }
        if (casts >= 2) {
          context.report({
            node,
            message:
              "D1/D40: an object literal asserted through a second assertion can pass for any type, the Principal brand included. Build the value with its real type, or receive the caller's Principal.",
          });
        }
      },
    };
  },
};

const PRINCIPAL_NAME = "Principal";

const PRINCIPAL_ALIAS_MESSAGE =
  "D1/D40: every Principal rule keys on the name `Principal`, so a renamed spelling would walk past all of them. Name the type `Principal` where it is used.";

const isPrincipalName = (node: TSESTree.Node | undefined): boolean =>
  (node?.type === "Identifier" && node.name === PRINCIPAL_NAME) || (node?.type === "Literal" && node.value === PRINCIPAL_NAME);

const isPrincipalExpression = (node: TSESTree.Node | undefined): boolean =>
  isPrincipalName(node) || (node?.type === "MemberExpression" && isPrincipalName(node.property));

function namesPrincipal(type: TSESTree.Node | undefined): boolean {
  switch (type?.type) {
    case "TSTypeReference":
      return isPrincipalType(type) || (type.typeArguments?.params ?? []).some(namesPrincipal);
    case "TSUnionType":
    case "TSIntersectionType":
      return type.types.some(namesPrincipal);
    case "TSTupleType":
      return type.elementTypes.some(namesPrincipal);
    case "TSArrayType":
    case "TSNamedTupleMember":
    case "TSOptionalType":
    case "TSRestType":
      return namesPrincipal(type.type === "TSOptionalType" || type.type === "TSRestType" ? type.typeAnnotation : type.elementType);
    case "TSTypeOperator":
      return namesPrincipal(type.typeAnnotation);
    case "TSIndexedAccessType":
      return namesPrincipal(type.objectType);
    default:
      return false;
  }
}

function principalTypedBinding(context: OrbRuleContext, identifier: TSESTree.Identifier): boolean {
  for (let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable.defs.some((def) => namesPrincipal(def.name.type === "Literal" ? undefined : def.name.typeAnnotation?.typeAnnotation));
    }
  }
  return false;
}

const principalAliasRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const report = (node: TSESTree.Node) => context.report({ node, message: PRINCIPAL_ALIAS_MESSAGE });
    return {
      "ImportSpecifier[imported]"(node: TSESTree.ImportSpecifier): void {
        if (isPrincipalName(node.imported) && node.local.name !== PRINCIPAL_NAME) {
          report(node);
        }
      },
      "ExportSpecifier[local]"(node: TSESTree.ExportSpecifier): void {
        if (isPrincipalName(node.local) && !isPrincipalName(node.exported)) {
          report(node);
        }
      },
      "TSTypeAliasDeclaration[typeAnnotation]"(node: TSESTree.TSTypeAliasDeclaration): void {
        if (namesPrincipal(node.typeAnnotation)) {
          report(node.id);
        }
      },
      ":matches(TSInterfaceHeritage, TSClassImplements)"(node: TSESTree.TSInterfaceHeritage | TSESTree.TSClassImplements): void {
        if (isPrincipalExpression(node.expression)) {
          report(node);
        }
      },
      "TSTypeParameter[constraint]"(node: TSESTree.TSTypeParameter): void {
        if (namesPrincipal(node.constraint)) {
          report(node);
        }
      },
      // `typeof caller` in any type position, an assertion included, is a Principal spelled through its binding.
      "TSTypeQuery > Identifier.exprName"(node: TSESTree.Identifier): void {
        if (principalTypedBinding(context, node)) {
          report(node.parent);
        }
      },
    };
  },
};

export const PRINCIPAL_RULES = [
  { id: "principal-alias", rule: principalAliasRule },
  { id: "principal-assertion", rule: principalAssertionRule },
  { id: "principal-return-site", rule: principalReturnSiteRule },
  { id: "principal-mint-site", rule: principalMintSiteRule },
  { id: "principal-literal", rule: principalLiteralRule },
  { id: "principal-brand-launder", rule: principalBrandLaunderRule },
  {
    id: "principal-synthetic-role",
    rule: restrictionRule({
      selectors: [
        {
          selector:
            "ObjectExpression:has(> Property:matches([key.name='externalId'], [key.value='externalId'])):has(> Property:matches([key.name='via'], [key.value='via'])) > Property:matches([key.name='role'], [key.value='role'])[value.value='user']",
          message: 'D1: a Principal-shaped literal with a hardcoded role: "user" belongs only in the entry layer; receive the Principal from the caller.',
        },
      ],
    }),
  },
];
