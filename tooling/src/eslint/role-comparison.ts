// What a privilege role means is decided once, in `@orb/contracts/identity` (Spine-Identity-and-Auth.md invariant 6). The
// rule refuses, by the checker's type and never by the operand's name, a comparison, switch, membership test or keyed
// lookup whose operand is a role: a `UserRole` or a `ParticipantRole`, an alias, a branded, optional or nullable form, or
// the same closed union inferred from the role schema.
//
// A role is recognised by its literal set, read from each role type's one home in the linted program: the union equals
// one role tuple exactly, or carries that tuple's alias. A subset such as `GlobalAction` (`admin | owner`) is a different
// vocabulary and is not a role. A narrowed reference (`"user"` after a refused comparison) is still a role through the
// declared type of the variable or field it reads.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import ts from "typescript";
import { requireTypeServices } from "./checker.ts";
import { staticMemberName } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const MESSAGE =
  "Ask @orb/contracts/identity what a role means (isHostRole, userRoleSatisfies or a named predicate there); a role compared, switched on or used as a key here restates it (Spine-Identity-and-Auth.md invariant 6).";
// Each role type at the one file that declares it; a second export of the same type is a defect, not a home.
const ROLE_HOMES = [
  { file: "/packages/contracts/src/identity/index.ts", name: "UserRole" },
  { file: "/packages/kit/src/message-author/index.ts", name: "ParticipantRole" },
] as const;
const EQUALITY = new Set(["===", "!==", "==", "!="]);
// The collection reads whose argument is the probed value: an array or set membership, a position, a map key.
const MEMBERSHIP_READS = new Set(["includes", "indexOf", "lastIndexOf", "has", "get"]);

interface RoleAxis {
  readonly alias: ts.Symbol;
  readonly literals: ReadonlySet<string>;
}

const axesByProgram = new WeakMap<ts.Program, readonly RoleAxis[]>();

function isNullish(type: ts.Type): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  return (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0;
}

// The string literals a type admits once null, undefined and brand intersections are set aside; undefined when any
// member is not a string literal.
function stringLiterals(type: ts.Type): ReadonlySet<string> | undefined {
  const literals = new Set<string>();
  for (const member of type.isUnion() ? type.types : [type]) {
    if (isNullish(member)) {
      continue;
    }
    const literal = member.isIntersection() ? member.types.find((part) => part.isStringLiteral()) : member;
    if (literal === undefined || !literal.isStringLiteral()) {
      return undefined;
    }
    literals.add(literal.value);
  }
  return literals.size === 0 ? undefined : literals;
}

// The role tuples as the program declares them; a program that never loads a role's home holds no value of that role.
function roleAxes(program: ts.Program, checker: ts.TypeChecker): readonly RoleAxis[] {
  const held = axesByProgram.get(program);
  if (held !== undefined) {
    return held;
  }
  const sources = program.getSourceFiles();
  const axes = ROLE_HOMES.flatMap(({ file, name }) => {
    const home = sources.find(({ fileName }) => fileName.replaceAll("\\", "/").endsWith(file));
    const module = home === undefined ? undefined : checker.getSymbolAtLocation(home);
    const alias = module === undefined ? undefined : checker.getExportsOfModule(module).find((symbol) => symbol.name === name);
    const literals = alias === undefined ? undefined : stringLiterals(checker.getDeclaredTypeOfSymbol(alias));
    return alias === undefined || literals === undefined ? [] : [{ alias, literals }];
  });
  axesByProgram.set(program, axes);
  return axes;
}

// The name a variable or field read resolves through, so its declared type can be asked after flow narrowing.
function readName(node: ts.Node): ts.Node | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name;
  }
  return ts.isIdentifier(node) ? node : undefined;
}

/** Refuses a comparison, switch, membership test or keyed lookup on a role-typed operand outside the identity contracts. */
export const roleComparisonRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { program, checker, esTreeNodeToTSNodeMap: toTs } = requireTypeServices(context);
    const axes = roleAxes(program, checker);
    if (axes.length === 0) {
      return {};
    }
    const roleType = (type: ts.Type): boolean => {
      const resolved = type.isTypeParameter() ? (checker.getBaseConstraintOfType(type) ?? type) : type;
      if (axes.some(({ alias }) => resolved.aliasSymbol === alias)) {
        return true;
      }
      const literals = stringLiterals(resolved);
      return (
        literals !== undefined && axes.some((axis) => literals.size === axis.literals.size && [...literals].every((literal) => axis.literals.has(literal)))
      );
    };
    const isRole = (node: TSESTree.Node): boolean => {
      const tsNode = toTs.get(node);
      if (roleType(checker.getTypeAtLocation(tsNode))) {
        return true;
      }
      const name = readName(tsNode);
      const symbol = name === undefined ? undefined : checker.getSymbolAtLocation(name);
      return symbol !== undefined && roleType(checker.getTypeOfSymbol(symbol));
    };
    const nullish = (node: TSESTree.Node): boolean => isNullish(checker.getTypeAtLocation(toTs.get(node)));
    const report = (node: TSESTree.Node): void => context.report({ node, message: MESSAGE });
    return {
      BinaryExpression: (node: TSESTree.BinaryExpression): void => {
        if (node.operator === "in") {
          if (isRole(node.left)) {
            report(node);
          }
          return;
        }
        if (EQUALITY.has(node.operator) && !nullish(node.left) && !nullish(node.right) && (isRole(node.left) || isRole(node.right))) {
          report(node);
        }
      },
      SwitchStatement: (node: TSESTree.SwitchStatement): void => {
        if (isRole(node.discriminant)) {
          report(node.discriminant);
          return;
        }
        for (const { test } of node.cases) {
          if (test !== null && isRole(test)) {
            report(test);
          }
        }
      },
      CallExpression: (node: TSESTree.CallExpression): void => {
        const [probe] = node.arguments;
        const name = staticMemberName(node.callee);
        if (probe !== undefined && probe.type !== AST_NODE_TYPES.SpreadElement && typeof name === "string" && MEMBERSHIP_READS.has(name) && isRole(probe)) {
          report(node);
        }
      },
      MemberExpression: (node: TSESTree.MemberExpression): void => {
        if (node.computed && isRole(node.property)) {
          report(node);
        }
      },
    };
  },
};
