// The reads a zod parse makes: it copies each key its output names out of the value handed in, so a Drizzle row handed to
// one, whole or spread into the argument, is read at the parse for exactly those columns. The reference graph credits
// those reads (graph/build.ts).
import type { CallExpression, Expression, Node } from "@typescript/native/ast";
import {
  isCallExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all, TypeFlags } from "@typescript/native/sync";
import { rowColumns } from "./drizzle-rows.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, hasFlag } from "./native.ts";

/** The schema methods that copy a value's keys into their output, and the library that declares them. */
const PARSE_METHODS: ReadonlySet<string> = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
const SAFE_PARSE_DATA = "data";
const SCHEMA_LIBRARY = "/zod/";

const isObjectLike = (type: Type): boolean => hasFlag(type.flags, TypeFlags.Object) || hasFlag(type.flags, TypeFlags.Intersection);

function* objectMembers(world: NativeWorld, type: Type): APIRequestGenerator<readonly Type[]> {
  return (yield* constituents(yield* world.checker.getNonNullableType.gen(type))).filter(isObjectLike);
}

/** A call of a schema parse method, by its syntax: {@link schemaParses} confirms zod declares it. */
export const isParseCall = (node: Node): node is CallExpression =>
  isCallExpression(node) && isPropertyAccessExpression(node.expression) && PARSE_METHODS.has(node.expression.name.text);

// The types a parse answers with: the parsed value, or a safe parse's `data`.
function* parsedTypes(world: NativeWorld, call: CallExpression, safe: boolean): APIRequestGenerator<readonly Type[]> {
  const { checker } = world;
  const answer = yield* checker.getTypeAtLocation.gen(call);
  const settled = (yield* checker.getAwaitedType.gen(answer)) ?? answer;
  if (!safe) {
    return [settled];
  }
  const data = (yield* all(...(yield* constituents(settled)).map((member) => checker.getPropertyOfType.gen(member, SAFE_PARSE_DATA)))).filter(
    (symbol) => symbol !== undefined,
  );
  return data.length === 0 ? [] : yield* checker.getTypeOfSymbol.gen(data);
}

// The values a parse argument hands in: the argument, or each spread of an object literal argument with the keys a later
// property of the literal sets over it.
function parsedValues(argument: Node): readonly { readonly node: Node; readonly overridden: ReadonlySet<string> }[] {
  if (!isObjectLiteralExpression(argument)) {
    return [{ node: argument, overridden: new Set() }];
  }
  const { properties } = argument;
  return properties.flatMap((property, at) =>
    isSpreadAssignment(property)
      ? [
          {
            node: property.expression,
            overridden: new Set(
              properties
                .slice(at + 1)
                .flatMap((later) =>
                  (isPropertyAssignment(later) || isShorthandPropertyAssignment(later)) && isIdentifier(later.name) ? [later.name.text] : [],
                ),
            ),
          },
        ]
      : [],
  );
}

/** The columns a zod parse reads: each row member, of the argument or of a spread inside an object literal argument,
 *  whose name the parsed output carries. A key the schema strips, or one the literal sets over the spread, is no read. */
export function* parsedColumns(world: NativeWorld, call: CallExpression): APIRequestGenerator<readonly NativeSymbol[]> {
  const { checker } = world;
  const [argument] = call.arguments;
  if (argument === undefined || !isPropertyAccessExpression(call.expression)) {
    return [];
  }
  const outputs = yield* parsedTypes(world, call, call.expression.name.text.startsWith("safe"));
  const shapes = (yield* all(...outputs.map((output) => objectMembers(world, output)))).flat();
  const named = new Set((yield* all(...shapes.map((shape) => checker.getPropertiesOfType.gen(shape)))).flat().map((property) => property.name));
  const columns: NativeSymbol[] = [];
  for (const { node, overridden } of parsedValues(argument)) {
    const type = yield* checker.getTypeAtLocation.gen(node);
    for (const holder of yield* objectMembers(world, type)) {
      const members = (yield* checker.getPropertiesOfType.gen(holder)).filter(
        (member) => member.declarations.length === 0 && named.has(member.name) && !overridden.has(member.name),
      );
      columns.push(...(yield* all(...members.map((member) => rowColumns(world, holder, member.name)))).flat());
    }
  }
  return columns;
}

/** The parse calls a zod schema answers. */
export function schemaParses(world: NativeWorld, calls: readonly Node[]): readonly CallExpression[] {
  const parses = calls.filter(isParseCall);
  const symbols = world.symbolsAt(parses.map((call) => (call.expression as Expression & { readonly name: Node }).name));
  return parses.filter((_, at) => (symbols[at]?.declarations ?? []).some((handle) => handle.path.includes(SCHEMA_LIBRARY)));
}
