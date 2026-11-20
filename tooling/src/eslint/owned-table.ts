// A table with one owner is named only by its home. The row's import and export selectors hold the named doors; this
// rule adds the doors that need no import of the table:
// - drizzle's relational door, `db.query.<table>`: every table rides on `db.query`, so a file reaches an owned table
//   through any db handle. A member or destructured key named for an owned table (a literal, or a const the name
//   resolves through) counts when the checker types it as drizzle's `RelationalQueryBuilder`. The type, not the
//   syntax, decides, so a read-only handle, an alias, a helper that returns `db.query`, a spread copy and a nested
//   destructure all count.
// - the table object off the db handle (`db._.fullSchema.<table>`): a member or key the checker types as a drizzle
//   `SQLiteTable` counts unless it is read off a namespace or dynamic import, which the row's selectors judge.
// - raw SQL text: a `sql` tagged template or `sql.raw(...)` that names the table's SQL name as the target of FROM (a
//   comma join included), JOIN, INTO, UPDATE or TABLE, and a `sql.identifier(...)` of that name. The tag counts under
//   any local name its `sql` import takes. A table's SQL name is its binding in snake case;
//   tests/tooling/eslint-owned-table-doors.test.ts pins that for each owned table against its drizzle type.
// Out of reach: `Reflect.get` on the query object, a table name split across template parts or held in an imported
// string const, and the raw client (`db.$client.execute`), which takes plain strings.
// The type doors need the parser's program, which the composed config gives every server file. An untyped run judges
// the import doors alone, except that a table read straight off a `query` member (`db.query.users`) still demands the
// program, so a config that loses type information fails loudly instead of passing the commonest relational read.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, TSESLint } from "@typescript-eslint/utils";
import type ts from "typescript";
import type { TypeServices } from "./checker.ts";
import { requireTypeServices } from "./checker.ts";
import { accessedName, staticKeyName, staticMemberName, staticTextValue, unwrapTsValue } from "./static-values.ts";
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
const SQLITE_TABLE = "SQLiteTable";
const DRIZZLE_SQLITE_TABLE = /\/node_modules\/drizzle-orm\/sqlite-core\/table\.d\.c?ts$/u;
const SQL_TAG = "sql";
// The `sql` members that take SQL text: `raw` a statement fragment, `identifier` one quoted name.
const SQL_RAW = "raw";
const SQL_IDENTIFIER = "identifier";

/** The SQL name drizzle gives a table binding here: the binding in snake case. */
export const sqlTableName = (binding: string): string => binding.replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);

// The table as the target of a statement clause, or a later member of a FROM comma join (`from chats c, users`); a
// quoted name counts, a longer identifier (`user_settings`) does not.
const sqlTarget = (tables: readonly string[]): RegExp =>
  new RegExp(
    String.raw`\b(?:from|join|into|update|table)\s+(?:[\w."\x60]+(?:\s+(?:as\s+)?\w+)?\s*,\s*)*["\x60]?(?:${tables.map(sqlTableName).join("|")})(?![\w])`,
    "iu",
  );

// Whether `type`, or a member of the intersection it is, is drizzle's class `name` from a file `declaredIn` matches.
function drizzleClass(type: ts.Type, name: string, declaredIn: RegExp): boolean {
  const parts = type.isIntersection() ? type.types : [type];
  return parts.some((part) => {
    const symbol = part.getSymbol();
    return symbol?.getName() === name && (symbol.declarations ?? []).some((declaration) => declaredIn.test(posixPath(declaration.getSourceFile().fileName)));
  });
}

const resolvedDefinition = (context: OrbRuleContext, node: TSESTree.Identifier): TSESLint.Scope.Definition | undefined =>
  context.sourceCode.getScope(node).references.find((reference) => reference.identifier === node)?.resolved?.defs[0];

// The `sql` tag under its own name or any local name an `import { sql as q }` gives it.
function isSqlTag(context: OrbRuleContext, tag: TSESTree.Node): boolean {
  if (tag.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = resolvedDefinition(context, tag);
  if (definition?.type === TSESLint.Scope.DefinitionType.ImportBinding && definition.node.type === AST_NODE_TYPES.ImportSpecifier) {
    const { imported } = definition.node;
    return (imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value) === SQL_TAG;
  }
  return tag.name === SQL_TAG;
}

// The SQL text of a `sql.raw` or `sql.identifier` argument: its static value through consts, or else a template's
// fixed parts.
function argumentText(context: OrbRuleContext, node: TSESTree.CallExpressionArgument | undefined): string | undefined {
  if (node === undefined || node.type === AST_NODE_TYPES.SpreadElement) {
    return undefined;
  }
  const value = staticTextValue(context, node);
  if (typeof value === "string") {
    return value;
  }
  return node.type === AST_NODE_TYPES.TemplateLiteral ? node.quasis.map((quasi) => quasi.value.cooked ?? "").join(" ") : undefined;
}

// Whether a `sql.raw` call targets an owned table or a `sql.identifier` call is one's SQL name.
function sqlCallNames(context: OrbRuleContext, node: TSESTree.CallExpression, target: RegExp, sqlNames: ReadonlySet<string>): boolean {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || !isSqlTag(context, callee.object)) {
    return false;
  }
  const method = staticMemberName(callee);
  const text = method === SQL_RAW || method === SQL_IDENTIFIER ? argumentText(context, node.arguments[0]) : undefined;
  return text !== undefined && (method === SQL_RAW ? target.test(text) : sqlNames.has(text));
}

// A namespace import or a dynamic import: a table read off one is an import door the row's selectors judge.
function isModuleImport(context: OrbRuleContext, node: TSESTree.Node): boolean {
  const object = unwrapTsValue(node);
  if (object.type === AST_NODE_TYPES.AwaitExpression) {
    return unwrapTsValue(object.argument).type === AST_NODE_TYPES.ImportExpression;
  }
  return object.type === AST_NODE_TYPES.Identifier && resolvedDefinition(context, object)?.node.type === AST_NODE_TYPES.ImportNamespaceSpecifier;
}

const QUERY = "query";

// A member read straight off a `query` member (`db.query.users`, `db?.query["users"]`).
function readOffQuery(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const object = unwrapTsValue(node.object);
  return object.type === AST_NODE_TYPES.MemberExpression && staticMemberName(object) === QUERY;
}

// The object a destructuring pattern unpacks, through the patterns it nests in; undefined for a parameter's pattern.
function patternSource(pattern: TSESTree.Node | undefined): TSESTree.Node | undefined {
  const parent = pattern?.parent;
  switch (parent?.type) {
    case AST_NODE_TYPES.VariableDeclarator:
      return parent.init ?? undefined;
    case AST_NODE_TYPES.AssignmentExpression:
      return parent.right;
    case AST_NODE_TYPES.Property:
      return patternSource(parent.parent);
    default:
      return undefined;
  }
}

/** The row's import and export doors, plus the relational, table-object and raw SQL doors to its tables. */
export function ownedTableRule(row: OwnedTableRow): OrbRule {
  const base = restrictionRule(row);
  const owned = new Set(row.tables);
  const target = sqlTarget(row.tables);
  const sqlNames = new Set(row.tables.map(sqlTableName));
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const program = context.sourceCode.parserServices?.program;
      const typedRun = program !== undefined && program !== null;
      let services: TypeServices | undefined;
      // An optional chain (`db?.query.users`) types the member as the door or `undefined`.
      const ownedDoor = (node: TSESTree.Node): boolean => {
        if (!(typedRun || readOffQuery(node))) {
          return false;
        }
        services ??= requireTypeServices(context);
        const { checker } = services;
        const type = checker.getNonNullableType(checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node)));
        return drizzleClass(type, RELATIONAL_BUILDER, DRIZZLE_RELATIONAL_QUERY) || drizzleClass(type, SQLITE_TABLE, DRIZZLE_SQLITE_TABLE);
      };
      const report = (node: TSESTree.Node): void => context.report({ node, message: row.message });
      const member = (node: TSESTree.MemberExpression): void => {
        const name = accessedName(context, node);
        if (name !== undefined && owned.has(name) && !isModuleImport(context, node.object) && ownedDoor(node)) {
          report(node);
        }
      };
      const destructured = (node: TSESTree.Property): void => {
        const name = staticKeyName(context, node);
        const source = patternSource(node.parent);
        if (name !== undefined && owned.has(name) && (source === undefined || !isModuleImport(context, source)) && ownedDoor(node.value)) {
          report(node);
        }
      };
      const tagged = (node: TSESTree.TaggedTemplateExpression): void => {
        if (isSqlTag(context, node.tag) && target.test(node.quasi.quasis.map((quasi) => quasi.value.cooked ?? "").join(" "))) {
          report(node);
        }
      };
      const sqlCall = (node: TSESTree.CallExpression): void => {
        if (sqlCallNames(context, node, target, sqlNames)) {
          report(node);
        }
      };
      // A row's selectors are compound (`ImportSpecifier:matches(...)`), so none shares a bare node-type key below.
      return {
        ...base.create(context),
        MemberExpression: member,
        "ObjectPattern > Property": destructured,
        TaggedTemplateExpression: tagged,
        CallExpression: sqlCall,
      };
    },
  };
}
