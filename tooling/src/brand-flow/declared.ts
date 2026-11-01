// What a slot's own declaration says it is. A zod field built from a brand schema takes `string` on its input side by
// design (`z.input` of `typeIdSchema` is `string`), so a brand handed to it is no widening of the field. A field built
// from `z.string()`, or a type-position declaration of `string`, is a plain string slot. Anything else is unknown.
import type { Node } from "@typescript/native/ast";
import {
  isCallExpression,
  isIdentifier,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator } from "@typescript/native/sync";
import type { NativeWorld } from "../unwired/index.ts";
import type { DeclInfo } from "./decl.ts";
import { declInfo, symbolInfo } from "./decl.ts";
import { calleeName, PARSE_MINTS, peel, rootNames } from "./syntax.ts";
import type { Declared } from "./types.ts";

// Schema methods that wrap the schema they are handed or called on, so the brand underneath still decides.
const WRAPPERS: ReadonlySet<string> = new Set(["array", "set", "nullable", "optional", "nullish"]);
// Named schemas followed before the scan gives up; a longer chain is a schema nobody reads.
const MAX_HOPS = 4;

function* schemaDeclared(world: NativeWorld, expression: Node, hops: number): APIRequestGenerator<Declared> {
  const read = peel(expression);
  if (isCallExpression(read)) {
    return yield* callDeclared(world, read, hops);
  }
  const [name] = rootNames(read);
  if (name === undefined || hops >= MAX_HOPS) {
    return "unknown";
  }
  return yield* nodeDeclared((yield* symbolInfo(world, name)).node, world, hops + 1);
}

function* callDeclared(
  world: NativeWorld,
  call: Node & { readonly expression: Node; readonly arguments: readonly Node[] },
  hops: number,
): APIRequestGenerator<Declared> {
  const name = calleeName(call) ?? "";
  const callee = call.expression;
  if (PARSE_MINTS.has(name)) {
    return "brand-schema";
  }
  if (!isPropertyAccessExpression(callee)) {
    return "unknown";
  }
  if (name === "string" && isIdentifier(callee.expression)) {
    return "plain";
  }
  const [wrapped] = call.arguments;
  if (WRAPPERS.has(name) && isIdentifier(callee.expression) && wrapped !== undefined) {
    return yield* schemaDeclared(world, wrapped, hops);
  }
  return yield* schemaDeclared(world, callee.expression, hops);
}

function* nodeDeclared(node: Node | undefined, world: NativeWorld, hops: number): APIRequestGenerator<Declared> {
  if (node === undefined) {
    return "unknown";
  }
  if (isPropertyAssignment(node) || isVariableDeclaration(node)) {
    return node.initializer === undefined ? "unknown" : yield* schemaDeclared(world, node.initializer, hops);
  }
  if (!isShorthandPropertyAssignment(node) || hops >= MAX_HOPS) {
    return "unknown";
  }
  // The symbol at a shorthand's name is the property itself; the value it reads is the variable of the same name.
  const value = yield* world.checker.getShorthandAssignmentValueSymbol.gen(node);
  return yield* nodeDeclared((yield* declInfo(world, value)).node, world, hops + 1);
}

/** What a schema field built in an object literal is: a brand schema, `z.string()`, or something else. */
export const fieldDeclared = (world: NativeWorld, field: Node): APIRequestGenerator<Declared> => nodeDeclared(field, world, 0);

/** What the declaration behind a slot is: the schema field's builder, or a type-position `string`. */
export function* declaredAs(world: NativeWorld, info: DeclInfo): APIRequestGenerator<Declared> {
  const { node } = info;
  if (info.lib) {
    return "plain";
  }
  if (node === undefined) {
    return "unknown";
  }
  return isPropertyAssignment(node) || isShorthandPropertyAssignment(node) ? yield* nodeDeclared(node, world, 0) : "plain";
}
