// Runs the literal arguments of `host.ui.register`, `registerFrame` and `registerCommand` through the
// contracts' own registration schemas. The host applies the same schemas at activation, where a refusal is
// silent: the surface or command is absent and the plugin logs one line.
// A value the checker cannot resolve to a literal is open and is never reported.
import { pluginCommandRegistrationMetaSchema, pluginFrameBodySchema, pluginSurfaceRegistrationMetaSchema } from "@orb/contracts/plugin";
import ts from "typescript";
import type { z } from "zod";
import type { SourceProblem } from "./contract/index.ts";
import type { HostCall } from "./host-calls.ts";
import { propertyName } from "./host-calls.ts";

interface FieldSchema {
  readonly safeParse: (value: unknown) => z.ZodSafeParseResult<unknown>;
}

interface ObjectSchema extends FieldSchema {
  readonly shape: Readonly<Record<string, FieldSchema>>;
}

// The statically known part of an object literal. `complete` is false when a spread or computed key may hold
// properties the literal does not name.
interface StaticProperties {
  readonly known: Readonly<Record<string, unknown>>;
  readonly open: ReadonlySet<string>;
  readonly complete: boolean;
}

const SURFACE_REGISTER = "ui.register";
const FRAME_REGISTER = "ui.registerFrame";
const COMMAND_REGISTER = "ui.registerCommand";
const FRAME_META_KEYS = ["id", "anchor", "title"] as const;
const FRAME_BODY_KEYS = ["html", "css"] as const;

function hasNodeFlag(flags: ts.NodeFlags, flag: ts.NodeFlags): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript NodeFlags is a compiler-owned bitfield.
  return (flags & flag) !== 0;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

// A `const` binding is the only identifier whose value the literal fixes for the whole program.
function constInitializer(checker: ts.TypeChecker, identifier: ts.Identifier): ts.Expression | undefined {
  const declaration = checker.getSymbolAtLocation(identifier)?.valueDeclaration;
  return declaration !== undefined && ts.isVariableDeclaration(declaration) && hasNodeFlag(ts.getCombinedNodeFlags(declaration), ts.NodeFlags.Const)
    ? declaration.initializer
    : undefined;
}

const KEYWORD_VALUES = new Map<ts.SyntaxKind, boolean | null>([
  [ts.SyntaxKind.TrueKeyword, true],
  [ts.SyntaxKind.FalseKeyword, false],
  [ts.SyntaxKind.NullKeyword, null],
]);

function scalarValue(node: ts.Expression): string | number | boolean | null | undefined {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return -Number(node.operand.text);
  }
  return KEYWORD_VALUES.get(node.kind);
}

// `undefined` means the expression is not a static value; a JSON value is never `undefined`.
function staticValue(checker: ts.TypeChecker, expression: ts.Expression, seen: ReadonlySet<ts.Node>): unknown {
  const node = unwrap(expression);
  const scalar = scalarValue(node);
  if (scalar !== undefined) {
    return scalar;
  }
  if (ts.isArrayLiteralExpression(node)) {
    const items = node.elements.map((element) =>
      ts.isSpreadElement(element) || ts.isOmittedExpression(element) ? undefined : staticValue(checker, element, seen),
    );
    return items.includes(undefined) ? undefined : items;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const properties = staticProperties(checker, node, seen);
    return properties.complete && properties.open.size === 0 ? properties.known : undefined;
  }
  const initializer = ts.isIdentifier(node) ? constInitializer(checker, node) : undefined;
  return initializer === undefined || seen.has(initializer) ? undefined : staticValue(checker, initializer, new Set([...seen, initializer]));
}

// A handler (`onAction`, `onRun`) is a guest function the schemas strip, not part of the registration data.
function isHandlerProperty(checker: ts.TypeChecker, property: ts.ObjectLiteralElementLike): boolean {
  if (ts.isMethodDeclaration(property)) {
    return true;
  }
  return (
    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && checker.getTypeAtLocation(property.name).getCallSignatures().length > 0
  );
}

function propertyValue(checker: ts.TypeChecker, property: ts.ObjectLiteralElementLike, seen: ReadonlySet<ts.Node>): unknown {
  if (ts.isPropertyAssignment(property)) {
    return staticValue(checker, property.initializer, seen);
  }
  return ts.isShorthandPropertyAssignment(property) ? staticValue(checker, property.name, seen) : undefined;
}

function staticProperties(checker: ts.TypeChecker, literal: ts.ObjectLiteralExpression, seen: ReadonlySet<ts.Node>): StaticProperties {
  const known: Record<string, unknown> = {};
  const open = new Set<string>();
  let complete = true;
  for (const property of literal.properties) {
    const name = property.name === undefined ? undefined : propertyName(property.name);
    if (name === undefined) {
      complete = false;
    } else if (!isHandlerProperty(checker, property)) {
      const value = propertyValue(checker, property, seen);
      if (value === undefined) {
        open.add(name);
      } else {
        known[name] = value;
      }
    }
  }
  return { known, open, complete };
}

function restrict(properties: StaticProperties, keys: readonly string[], extra: Readonly<Record<string, unknown>> = {}): StaticProperties {
  return {
    known: { ...Object.fromEntries(Object.entries(properties.known).filter(([key]) => keys.includes(key))), ...extra },
    open: new Set([...properties.open].filter((key) => keys.includes(key))),
    complete: properties.complete,
  };
}

function formatIssues(parent: string | undefined, issues: readonly z.core.$ZodIssue[]): readonly string[] {
  return issues.map((issue) => `${[...(parent === undefined ? [] : [parent]), ...issue.path].join(".")}: ${issue.message}`);
}

// The whole schema runs only when every property is a known literal, because a missing or open key would
// read as a refusal the host never gives. Otherwise each known property meets its own field schema.
function schemaIssues(schema: ObjectSchema, properties: StaticProperties, fieldwise = false): readonly string[] {
  if (!fieldwise && properties.complete && properties.open.size === 0) {
    const result = schema.safeParse(properties.known);
    return result.success ? [] : formatIssues(undefined, result.error.issues);
  }
  return Object.entries(properties.known).flatMap(([key, value]) => {
    const result = schema.shape[key]?.safeParse(value);
    return result === undefined || result.success ? [] : formatIssues(key, result.error.issues);
  });
}

function registrationIssues(path: string, properties: StaticProperties): readonly string[] {
  switch (path) {
    case SURFACE_REGISTER:
      return schemaIssues(pluginSurfaceRegistrationMetaSchema, properties);
    case COMMAND_REGISTER:
      return schemaIssues(pluginCommandRegistrationMetaSchema, properties);
    case FRAME_REGISTER:
      // A frame names no `toolName` and has no spec, so the surface schema's cross-field rules do not apply to it.
      return [
        ...schemaIssues(pluginSurfaceRegistrationMetaSchema, restrict(properties, FRAME_META_KEYS), true),
        ...schemaIssues(pluginFrameBodySchema, restrict(properties, FRAME_BODY_KEYS)),
      ];
    default:
      return [];
  }
}

function definitionLiteral(checker: ts.TypeChecker, argument: ts.Expression): ts.ObjectLiteralExpression | undefined {
  const node = unwrap(argument);
  if (ts.isObjectLiteralExpression(node)) {
    return node;
  }
  const initializer = ts.isIdentifier(node) ? constInitializer(checker, node) : undefined;
  return initializer === undefined ? undefined : definitionLiteral(checker, initializer);
}

/** Report registration definitions the contracts' registration schemas refuse. */
export function registrationProblems(checker: ts.TypeChecker, hostCalls: readonly HostCall[]): readonly SourceProblem[] {
  return hostCalls.flatMap(({ path, call }) => {
    const [argument] = call.arguments;
    const literal = argument === undefined ? undefined : definitionLiteral(checker, argument);
    if (literal === undefined) {
      return [];
    }
    return registrationIssues(path, staticProperties(checker, literal, new Set())).map((issue) => ({
      node: call,
      message: `${path} definition is refused: ${issue}`,
    }));
  });
}
