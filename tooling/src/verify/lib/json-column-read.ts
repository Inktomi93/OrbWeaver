// The reader behind `json-column-read-parsed`: which member reads take a typed JSON column off a SELECT row, and
// whether the value reaches a parse before anything consumes it. A row and a write are judged by the drizzle column facts
// `pnpm ast columns` shares (`floor/code-facts/drizzle-columns.ts`), never by a receiver's name, and a parse by the
// parser's declaration (zod, or the versioned-config codec that wraps a zod schema), never by a callee name.
import type { CallExpression, Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { drizzleWriteOf } from "../../floor/code-facts/drizzle-columns.ts";
import { helperOf, isModelType } from "../../floor/code-facts/drizzle-row.ts";
import type { ColumnRead, RowModels } from "../../floor/code-facts/drizzle-row-contract.ts";
import { argumentIndex, carryingLiterals, referencesOf, valueSite } from "../../floor/code-facts/value-carrier.ts";
import type { SchemaQuery } from "../contract/schema-fact.ts";
import { declaredByPackage, resolveTypeMemberOrigin } from "./type-member-origin.ts";

const ZOD_PACKAGE = "zod";
const ZOD_PARSE_METHODS: ReadonlySet<string> = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
// The versioned-config codec (Spine-Config-and-Serialization) owns a zod schema plus its lifts; its two read doors parse.
const VERSIONED_CONFIG_HOME = "/packages/contracts/src/versioned-config/";
const VERSIONED_CONFIG_PARSE_METHODS: ReadonlySet<string> = new Set(["parse", "parseOutcome"]);
const EQUALITY_OPERATORS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
]);

export type { ColumnRead, RowModels } from "../../floor/code-facts/drizzle-row-contract.ts";

// `schema.parse(v)` whose method zod declares, or the codec's `parse`/`parseOutcome`. A helper merely HANDED a schema is
// not a parse; it is judged one hop in, by what its body does with the value.
function isDirectParse(call: CallExpression): boolean {
  const callee = call.getExpression();
  if (N.isPropertyAccessExpression(callee)) {
    const method = resolveTypeMemberOrigin(callee);
    const declarations = method.kind === "resolved" ? method.value.declarations : [];
    if (ZOD_PARSE_METHODS.has(callee.getName()) && declaredByPackage(declarations, ZOD_PACKAGE)) {
      return true;
    }
    if (
      VERSIONED_CONFIG_PARSE_METHODS.has(callee.getName()) &&
      declarations.length > 0 &&
      declarations.every((d) => d.getSourceFile().getFilePath().replaceAll("\\", "/").includes(VERSIONED_CONFIG_HOME))
    ) {
      return true;
    }
  }
  return false;
}

function parsedDirectly(node: Node): boolean {
  const site = valueSite(node);
  const parent = site.getParent();
  if (parent === undefined || !N.isCallExpression(parent)) {
    return false;
  }
  const index = argumentIndex(parent, site);
  return index >= 0 && (isDirectParse(parent) || parsedAsArgumentOfParse(parent));
}

// `schema.parse(heal(row.col))`: the value's only way out of the inner call is into the parse.
function parsedAsArgumentOfParse(call: CallExpression): boolean {
  const site = valueSite(call);
  const parent = site.getParent();
  if (parent === undefined || !N.isCallExpression(parent)) {
    return false;
  }
  const index = argumentIndex(parent, site);
  return index >= 0 && isDirectParse(parent);
}

/** A presence test (`=== null`, `!== undefined`, `typeof`) reads no field of the value. */
export function isPresenceTest(node: Node): boolean {
  const site = valueSite(node);
  const parent = site.getParent();
  if (parent !== undefined && N.isTypeOfExpression(parent)) {
    return true;
  }
  if (parent === undefined || !N.isBinaryExpression(parent) || !EQUALITY_OPERATORS.has(parent.getOperatorToken().getKind())) {
    return false;
  }
  const other = parent.getLeft() === site ? parent.getRight() : parent.getLeft();
  return other.getKind() === SyntaxKind.NullKeyword || (N.isIdentifier(other) && other.getText() === "undefined");
}

// One hop into a local or imported helper: every use of the receiving parameter in its body is parsed or a presence test.
function parsedThroughHelper(node: Node): boolean {
  const site = valueSite(node);
  const call = site.getParent();
  if (call === undefined || !N.isCallExpression(call)) {
    return false;
  }
  const index = argumentIndex(call, site);
  const helper = index < 0 ? undefined : helperOf(call.getExpression());
  if (helper === undefined) {
    return false;
  }
  const param = helper.getParameters()[index];
  const body = helper.getBody();
  if (param === undefined || body === undefined || !N.isIdentifier(param.getNameNode())) {
    return false;
  }
  const uses = referencesOf(param.getNameNode(), body);
  return uses.length > 0 && uses.every((use) => parsedDirectly(use) || isPresenceTest(use));
}

/** Does the value reach a parse: a zod or codec parse directly, or one hop into a helper whose body parses it? */
export function isParsedValue(node: Node): boolean {
  return parsedDirectly(node) || parsedThroughHelper(node);
}

// The drizzle write whose argument is `site`, judged by the shared write detector, when its chain names a schema
// table that owns `column`.
function writesColumn(site: Node, column: string, query: SchemaQuery): boolean {
  const call = site.getFirstAncestorByKind(SyntaxKind.CallExpression);
  const write = call === undefined ? undefined : drizzleWriteOf(call);
  const table = write === undefined || write.arg !== site ? undefined : query.table(write.target);
  return table?.kind === "resolved" && table.value.columns.some((candidate) => candidate.identity.propertyName === column);
}

/** Does the value go straight back into the same column: an assignment target, the column's own key in a drizzle
 *  write builder's row, or that key in an insert-model literal? A value written under another key is still read. */
export function isWriteSink(node: Node, column: string, models: RowModels, query: SchemaQuery): boolean {
  const parent = node.getParent();
  if (N.isBinaryExpression(parent) && parent.getLeft() === node && parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
    return true;
  }
  return carryingLiterals(node).some(({ literal, key }) => {
    if (key !== column) {
      return false;
    }
    const batch = literal.getParent();
    const row = N.isArrayLiteralExpression(batch) ? batch : literal;
    const contextual = literal.getContextualType();
    return writesColumn(row, column, query) || (contextual !== undefined && isModelType(contextual, models.insert));
  });
}

/** Is every use of a destructured column binding a parse, a presence test or a write? */
export function bindingUsesJudged(read: ColumnRead, models: RowModels, query: SchemaQuery): boolean {
  const scope = read.value.getFirstAncestor((ancestor) => N.isFunctionLikeDeclaration(ancestor) || N.isSourceFile(ancestor)) ?? read.value.getSourceFile();
  const uses = referencesOf(read.value, scope);
  return uses.length > 0 && uses.every((use) => isParsedValue(use) || isPresenceTest(use) || isWriteSink(use, read.column, models, query));
}
