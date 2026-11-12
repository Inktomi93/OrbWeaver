// A table with one owner is named only by its home. The row's import and export selectors hold the named doors; this
// rule adds the two doors that need no import of the table:
// - drizzle's relational door, `db.query.<table>`: every table rides on `db.query`, so a file reaches an owned table
//   through any db handle. A member or destructured key counts when the checker types it as drizzle's
//   `RelationalQueryBuilder`, which catches a read-only handle, an alias of `db.query` and every key spelling.
// - raw SQL text: a `sql` tagged template or `sql.raw(...)` string that names the table's SQL name as the target of
//   FROM, JOIN, INTO, UPDATE or TABLE. A table's SQL name is its binding in snake case;
//   tests/tooling/eslint-owned-table-doors.test.ts pins that for each owned table against its drizzle type.
// Type services are required only for syntax that can hold `db.query`, so an untyped run of the import doors still
// works, and a relational read with no type information fails loudly.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, TSESLint } from "@typescript-eslint/utils";
import type ts from "typescript";
import type { TypeServices } from "./checker.ts";
import { requireTypeServices } from "./checker.ts";
import { staticKeyName, staticMemberName } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { posixPath, restrictionRule } from "./syntax.ts";

/** A restriction row whose subject is a set of tables, each named by its `@orb/db` binding. */
export interface OwnedTableRow {
  readonly id: string;
  readonly tables: readonly string[];
  readonly message: string;
  readonly selectors: NonNullable<Parameters<typeof restrictionRule>[0]["selectors"]>;
}

const RELATIONAL_BUILDER = "RelationalQueryBuilder";
const DRIZZLE_RELATIONAL_QUERY = /\/node_modules\/drizzle-orm\/sqlite-core\/query-builders\/query\.d\.c?ts$/u;
const SQL_TAG = "sql";
const SQL_RAW = "raw";

/** The SQL name drizzle gives a table binding here: the binding in snake case. */
export const sqlTableName = (binding: string): string => binding.replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);

// The table as the target of a statement clause; a quoted name counts, a longer identifier (`user_settings`) does not.
const sqlTarget = (tables: readonly string[]): RegExp =>
  new RegExp(String.raw`\b(?:from|join|into|update|table)\s+["\x60]?(?:${tables.map(sqlTableName).join("|")})(?![\w])`, "iu");

function relationalBuilder(type: ts.Type): boolean {
  const symbol = type.getSymbol();
  return (
    symbol?.getName() === RELATIONAL_BUILDER &&
    (symbol.declarations ?? []).some((declaration) => DRIZZLE_RELATIONAL_QUERY.test(posixPath(declaration.getSourceFile().fileName)))
  );
}

const isSqlTag = (tag: TSESTree.Node): boolean => tag.type === AST_NODE_TYPES.Identifier && tag.name === SQL_TAG;

const staticText = (node: TSESTree.Node | undefined): string | undefined => {
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === "string") {
    return node.value;
  }
  return node?.type === AST_NODE_TYPES.TemplateLiteral ? node.quasis.map((quasi) => quasi.value.cooked ?? "").join(" ") : undefined;
};

const QUERY = "query";

// Whether a node can hold drizzle's `db.query` object, judged by syntax so only those reach the checker: a `query`
// member or binding, a parameter, or a local whose initializer is one of those. Every relational read passes through
// `db.query` (or a transaction's), so a table name read off anything else (`schema.users`, `(await import(...)).users`)
// is an import door the row's selectors judge.
function holdsQuery(context: OrbRuleContext, node: TSESTree.Node | null | undefined): boolean {
  switch (node?.type) {
    case AST_NODE_TYPES.MemberExpression:
      return staticMemberName(node) === QUERY;
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return holdsQuery(context, node.expression);
    case AST_NODE_TYPES.Identifier: {
      if (node.name === QUERY) {
        return true;
      }
      const definition = context.sourceCode.getScope(node).references.find((reference) => reference.identifier === node)?.resolved?.defs[0];
      if (definition?.type === TSESLint.Scope.DefinitionType.Parameter) {
        return true;
      }
      return definition?.type === TSESLint.Scope.DefinitionType.Variable && holdsQuery(context, definition.node.init);
    }
    default:
      return false;
  }
}

// The object a destructuring pattern unpacks: a declarator's init or an assignment's right side. A parameter's pattern
// unpacks an argument, which only the checker can type, so it counts as holding the door.
function patternHoldsQuery(context: OrbRuleContext, pattern: TSESTree.Node | undefined): boolean {
  const parent = pattern?.parent;
  switch (parent?.type) {
    case AST_NODE_TYPES.VariableDeclarator:
      return holdsQuery(context, parent.init);
    case AST_NODE_TYPES.AssignmentExpression:
      return holdsQuery(context, parent.right);
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionDeclaration:
    case AST_NODE_TYPES.FunctionExpression:
      return true;
    default:
      return false;
  }
}

/** The row's import and export doors, plus the relational and raw SQL doors to its tables. */
export function ownedTableRule(row: OwnedTableRow): OrbRule {
  const base = restrictionRule(row);
  const owned = new Set(row.tables);
  const target = sqlTarget(row.tables);
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      let services: TypeServices | undefined;
      const typed = (node: TSESTree.Node): boolean => {
        services ??= requireTypeServices(context);
        // An optional chain (`db?.query.users`) types the member as the builder or `undefined`.
        const { checker } = services;
        return relationalBuilder(checker.getNonNullableType(checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node))));
      };
      const report = (node: TSESTree.Node): void => context.report({ node, message: row.message });
      const member = (node: TSESTree.MemberExpression): void => {
        const name = staticMemberName(node);
        if (typeof name === "string" && owned.has(name) && holdsQuery(context, node.object) && typed(node)) {
          report(node);
        }
      };
      const destructured = (node: TSESTree.Property): void => {
        const name = staticKeyName(context, node);
        if (typeof name === "string" && owned.has(name) && patternHoldsQuery(context, node.parent) && typed(node.value)) {
          report(node);
        }
      };
      const tagged = (node: TSESTree.TaggedTemplateExpression): void => {
        if (isSqlTag(node.tag) && target.test(node.quasi.quasis.map((quasi) => quasi.value.cooked ?? "").join(" "))) {
          report(node);
        }
      };
      const rawCall = (node: TSESTree.CallExpression): void => {
        const callee = node.callee;
        const raw = callee.type === AST_NODE_TYPES.MemberExpression && isSqlTag(callee.object) && staticMemberName(callee) === SQL_RAW;
        const text = raw ? staticText(node.arguments[0]) : undefined;
        if (text !== undefined && target.test(text)) {
          report(node);
        }
      };
      // A row's selectors are compound (`ImportSpecifier:matches(...)`), so none shares a bare node-type key below.
      return {
        ...base.create(context),
        MemberExpression: member,
        "ObjectPattern > Property": destructured,
        TaggedTemplateExpression: tagged,
        CallExpression: rawCall,
      };
    },
  };
}
