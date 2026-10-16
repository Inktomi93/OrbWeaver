// The reader behind `json-column-read-parsed`: which member reads take a typed JSON column off a SELECT row, and
// whether the value reaches a parse before anything consumes it. A row and a write are judged by the drizzle column facts
// `pnpm ast columns` shares (`floor/code-facts/drizzle-columns.ts`), never by a receiver's name, and a parse by the
// parser's declaration (zod, or the versioned-config codec that wraps a zod schema), never by a callee name.
import type { CallExpression, Node, ts } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { readCallTarget } from "../../floor/code-facts/call-returns.ts";
import { drizzleWriteOf } from "../../floor/code-facts/drizzle-columns.ts";
import { helperOfWith, isModelType } from "../../floor/code-facts/drizzle-row.ts";
import type { ColumnRead, RowModels } from "../../floor/code-facts/drizzle-row-contract.ts";
import type { CallReturnObservations, ReferenceFact, ReturnedValueSource } from "../../floor/code-facts/reference-fact-contract.ts";
import { matchesDeclaredCallTerminal, readCallMemberDeclarationOrigin } from "../../floor/code-facts/type-member-origin.ts";
import type { DeclaredCallTerminalSelection } from "../../floor/code-facts/type-member-origin-contract.ts";
import { argumentIndex, carryingLiterals, readReturnedValue, referencesOf, valueSite } from "../../floor/code-facts/value-carrier.ts";
import type { JsonColumnParseReaders, JsonColumnReadReaders } from "../contract/json-column-origin.ts";
import type { SchemaQuery } from "../contract/schema-fact.ts";

export const JSON_COLUMN_READ_TERMINALS = {
  packageName: "zod",
  packageMethods: ["parse", "safeParse", "parseAsync", "safeParseAsync"],
  projectHome: "/packages/contracts/src/versioned-config/",
  projectMethods: ["parse", "parseOutcome"],
} as const satisfies DeclaredCallTerminalSelection;
const EQUALITY_OPERATORS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
]);

export type { ColumnRead, RowModels } from "../../floor/code-facts/drizzle-row-contract.ts";

// `schema.parse(v)` whose method zod declares, or the codec's `parse`/`parseOutcome`. A helper merely HANDED a schema is
// not a parse; it is judged one hop in, by what its body does with the value.
export function isDirectParse(call: CallExpression): boolean {
  if (!N.isPropertyAccessExpression(call.getExpression())) {
    return false;
  }
  return isDirectParseWith(call, readCallMemberDeclarationOrigin(call).origin);
}

/** Native delivery supplies the same declared-member fact without consulting the syntax checker. */
export function isDirectParseWith(call: CallExpression, origin: ReferenceFact<readonly Node[]>): boolean {
  return matchesDeclaredCallTerminal(call, origin, JSON_COLUMN_READ_TERMINALS);
}

const NATIVE_PARSE_READERS: JsonColumnParseReaders = { parse: isDirectParse, target: readCallTarget, references: referencesOf };

function parsedDirectly(node: Node, readers: JsonColumnParseReaders): boolean {
  const site = valueSite(node);
  const parent = site.getParent();
  if (parent === undefined || !N.isCallExpression(parent)) {
    return false;
  }
  const index = argumentIndex(parent, site);
  return index >= 0 && (readers.parse(parent) || parsedAsArgumentOfParse(parent, readers));
}

// `schema.parse(heal(row.col))`: the value's only way out of the inner call is into the parse.
function parsedAsArgumentOfParse(call: CallExpression, readers: JsonColumnParseReaders): boolean {
  const site = valueSite(call);
  const parent = site.getParent();
  if (parent === undefined || !N.isCallExpression(parent)) {
    return false;
  }
  const index = argumentIndex(parent, site);
  return index >= 0 && readers.parse(parent);
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
function parsedThroughHelper(node: Node, readers: JsonColumnParseReaders): boolean {
  const site = valueSite(node);
  const call = site.getParent();
  if (call === undefined || !N.isCallExpression(call)) {
    return false;
  }
  const index = argumentIndex(call, site);
  const helper = index < 0 ? undefined : helperOfWith(call.getExpression(), readers.target);
  if (helper === undefined) {
    return false;
  }
  const param = helper.getParameters()[index];
  const body = helper.getBody();
  if (param === undefined || body === undefined || !N.isIdentifier(param.getNameNode())) {
    return false;
  }
  const uses = readers.references(param.getNameNode(), body);
  return uses.length > 0 && uses.every((use) => parsedDirectly(use, readers) || isPresenceTest(use));
}

/** Does the value reach a parse: a zod or codec parse directly, or one hop into a helper whose body parses it? */
export function isParsedValue(node: Node): boolean {
  return isParsedValueWith(node, NATIVE_PARSE_READERS);
}

/** The same parse-use grammar consumes declared parser, actual target and exact lexical-use facts. */
export function isParsedValueWith(node: Node, readers: JsonColumnParseReaders): boolean {
  return parsedDirectly(node, readers) || parsedThroughHelper(node, readers);
}

/** A returned projection is parsed only on every complete authored exit, after actual object overrides. */
export function isReturnedParsedValue(node: Node, observations: CallReturnObservations, parsers: ReadonlySet<ts.CallExpression>): boolean {
  return isReturnedParsedValueFact(readReturnedValue(node, [], observations, parsers), parsers);
}

/** Canonical raw alternatives retain every present leaf and the original frozen parser membership. */
export function isReturnedParsedValueFact(fact: ReferenceFact<readonly ReturnedValueSource[]>, parsers: ReadonlySet<ts.CallExpression>): boolean {
  return (
    fact.kind === "resolved" &&
    fact.value.length > 0 &&
    fact.value.every(({ value, present }) => present && N.isCallExpression(value) && parsers.has(value.compilerNode))
  );
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
  return isWriteSinkWith(node, column, nativeReadReaders(models, query));
}

function nativeReadReaders(models: RowModels, query: SchemaQuery): JsonColumnReadReaders {
  return {
    ...NATIVE_PARSE_READERS,
    writeColumn: (site, column) => writesColumn(site, column, query),
    insertModel: (literal): boolean => {
      const contextual = literal.getContextualType();
      return contextual !== undefined && isModelType(contextual, models.insert);
    },
  };
}

/** Native identity observations do not broaden the existing assignment, own-column and batch sink grammar. */
export function isWriteSinkWith(node: Node, column: string, readers: JsonColumnReadReaders): boolean {
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
    const insert = readers.insertModel(literal);
    return readers.writeColumn(row, column) || insert;
  });
}

/** Is every use of a destructured column binding a parse, a presence test or a write? */
export function bindingUsesJudged(read: ColumnRead, models: RowModels, query: SchemaQuery): boolean {
  return bindingUsesJudgedWith(read, nativeReadReaders(models, query));
}

/** Every exact native binding use must satisfy the same consumer parse/presence/sink judgment. */
export function bindingUsesJudgedWith(read: ColumnRead, readers: JsonColumnReadReaders): boolean {
  const scope = read.value.getFirstAncestor((ancestor) => N.isFunctionLikeDeclaration(ancestor) || N.isSourceFile(ancestor)) ?? read.value.getSourceFile();
  const uses = readers.references(read.value, scope);
  return uses.length > 0 && uses.every((use) => isParsedValueWith(use, readers) || isPresenceTest(use) || isWriteSinkWith(use, read.column, readers));
}
