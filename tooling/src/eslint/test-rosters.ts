// A test derives its roster from the production tuple (Spine-Testing §9): a hand-listed copy keeps passing when the
// tuple gains a member, so the new member goes untested. A roster is a list the test walks as its cases: a loop, a case
// table or an iterating method. A list a test passes as one input or expects as one output fails by itself when the
// tuple changes, so it is left alone. A walked list that restates a tuple is refused. A walked part of a tuple is
// refused until it names the tuple's member type, which states the selection and breaks on a renamed member.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import ts from "typescript";
import type { ProductionModule } from "./production-modules.ts";
import { lazy, productionModules } from "./production-modules.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// Two members are a pair a test names on purpose; from three on, a list reads as the vocabulary.
const MIN_ROSTER_MEMBERS = 3;
const CASE_TABLE_METHODS = new Set(["each", "for"]);
const ITERATING_METHODS = new Set(["forEach", "map", "flatMap"]);

/** One exported production tuple of string literals. */
export interface ProductionRoster {
  readonly module: string;
  readonly exportName: string;
  readonly members: ReadonlySet<string>;
}

function unwrappedTs(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function tupleMembers(initializer: ts.Expression): ReadonlySet<string> | undefined {
  const array = unwrappedTs(initializer);
  if (!ts.isArrayLiteralExpression(array)) {
    return undefined;
  }
  const members = new Set<string>();
  for (const element of array.elements) {
    if (!ts.isStringLiteralLike(element)) {
      return undefined;
    }
    members.add(element.text);
  }
  return members.size >= MIN_ROSTER_MEMBERS ? members : undefined;
}

const isExported = (statement: ts.VariableStatement): boolean =>
  ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;

function moduleRosters(module: string, source: ts.SourceFile): ProductionRoster[] {
  return source.statements
    .filter((statement) => ts.isVariableStatement(statement) && isExported(statement))
    .flatMap((statement) => (ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []))
    .flatMap(({ name, initializer }) => {
      const members = initializer === undefined || !ts.isIdentifier(name) ? undefined : tupleMembers(initializer);
      return members === undefined || !ts.isIdentifier(name) ? [] : [{ module, exportName: name.text, members }];
    });
}

/** Every string-literal tuple a production module exports by name, in module order. */
export function exportedRosters(root: string, modules: readonly ProductionModule[] = productionModules(root)): readonly ProductionRoster[] {
  return modules.filter(({ text }) => text.includes("export const")).flatMap(({ module, source }) => moduleRosters(module, source()));
}

function wrapperOf(node: TSESTree.Node): TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression | undefined {
  const { parent } = node;
  return (parent?.type === AST_NODE_TYPES.TSAsExpression || parent?.type === AST_NODE_TYPES.TSSatisfiesExpression) && parent.expression === node
    ? parent
    : undefined;
}

// The value a wrapped expression stands for sits where its outermost wrapper sits.
function site(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  for (let wrapper = wrapperOf(current); wrapper !== undefined; wrapper = wrapperOf(current)) {
    current = wrapper;
  }
  return current;
}

function calledMethod(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

/** Whether the value at this position is walked member by member: a loop, a case table or an iterating method. */
function isIterated(node: TSESTree.Node): boolean {
  const value = site(node);
  const { parent } = value;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.ForOfStatement) {
    return parent.right === value;
  }
  if (parent.type === AST_NODE_TYPES.CallExpression) {
    const method = calledMethod(parent);
    return method !== undefined && CASE_TABLE_METHODS.has(method) && parent.arguments.some((argument) => argument === value);
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === value && !parent.computed && parent.property.type === AST_NODE_TYPES.Identifier) {
    const call = parent.parent;
    // A list mapped inside JSX renders its members; it is no case table.
    return (
      ITERATING_METHODS.has(parent.property.name) &&
      call.type === AST_NODE_TYPES.CallExpression &&
      call.callee === parent &&
      call.parent.type !== AST_NODE_TYPES.JSXExpressionContainer
    );
  }
  return false;
}

const isConstAssertion = (type: TSESTree.TypeNode): boolean =>
  type.type === AST_NODE_TYPES.TSTypeReference && type.typeName.type === AST_NODE_TYPES.Identifier && type.typeName.name === "const";

/** Whether the list names a type: `satisfies T`, `as T` other than `as const`, or an annotated `const`. */
function isTyped(node: TSESTree.ArrayExpression): boolean {
  let current: TSESTree.Node = node;
  for (let wrapper = wrapperOf(current); wrapper !== undefined; wrapper = wrapperOf(current)) {
    if (wrapper.type === AST_NODE_TYPES.TSSatisfiesExpression || !isConstAssertion(wrapper.typeAnnotation)) {
      return true;
    }
    current = wrapper;
  }
  const declarator = current.parent;
  return declarator.type === AST_NODE_TYPES.VariableDeclarator && declarator.id.typeAnnotation !== undefined;
}

function literalMembers(node: TSESTree.ArrayExpression): ReadonlySet<string> | undefined {
  const members = new Set<string>();
  for (const element of node.elements) {
    if (element?.type !== AST_NODE_TYPES.Literal || typeof element.value !== "string") {
      return undefined;
    }
    members.add(element.value);
  }
  // A repeated member is a sequence the test spells out, not a vocabulary.
  return members.size === node.elements.length && members.size >= MIN_ROSTER_MEMBERS ? members : undefined;
}

const named = (rosters: readonly ProductionRoster[]): string => rosters.map(({ exportName, module }) => `${exportName} (${module})`).join(" or ");

/** Refuse a test array that restates an exported production tuple, or that iterates a hand-picked part of one. */
export function restatedRosterRule(rosters: () => readonly ProductionRoster[]): OrbRule {
  const membersIndex = lazy(() => {
    const index = new Map<string, ProductionRoster[]>();
    for (const roster of rosters()) {
      for (const member of roster.members) {
        index.set(member, [...(index.get(member) ?? []), roster]);
      }
    }
    return index;
  });
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const byMember = membersIndex();
      const iteratedThroughBinding = (node: TSESTree.ArrayExpression): boolean => {
        const declarator = site(node).parent;
        if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator || declarator.id.type !== AST_NODE_TYPES.Identifier) {
          return false;
        }
        return context.sourceCode
          .getDeclaredVariables(declarator)
          .some((variable) => variable.references.some((reference) => reference.init !== true && isIterated(reference.identifier)));
      };
      const judge = (node: TSESTree.ArrayExpression, members: ReadonlySet<string>, owners: readonly ProductionRoster[]): void => {
        const whole = owners.filter((roster) => roster.members.size === members.size);
        if (whole.length > 0) {
          context.report({ node, message: `These cases restate ${named(whole)}. Import the tuple so a new member gets a case.` });
        } else if (!isTyped(node)) {
          context.report({
            node,
            message: `These cases are a hand-picked part of ${named(owners)}. Derive them from the tuple, or name its member type with \`satisfies\` so the selection is stated.`,
          });
        }
      };
      const visit = (node: TSESTree.ArrayExpression): void => {
        const members = literalMembers(node);
        const [first] = members ?? [];
        if (members === undefined || first === undefined) {
          return;
        }
        const owners = (byMember.get(first) ?? []).filter((roster) => members.isSubsetOf(roster.members));
        if (owners.length > 0 && (isIterated(node) || iteratedThroughBinding(node))) {
          judge(node, members, owners);
        }
      };
      return { [AST_NODE_TYPES.ArrayExpression]: visit };
    },
  };
}
