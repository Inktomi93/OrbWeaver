import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import { constantInitializer, staticKeyName, unwrapTsValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// Route-map factories whose map argument is judged: the call name and the argument index of the map.
const ROUTE_MAP_ARGUMENT = new Map([
  ["routeTrpc", 1],
  ["defineTrpcRoutes", 0],
]);

// The marker types a route value may be: a held, failed, forward-wire or ended response is scripted by the kit, not a data guess.
const MARKER_TYPES = new Set(["TrpcHoldMarker", "TrpcErrorMarker", "TrpcWireEscapeMarker", "TrpcSubscriptionEndMarker", "ServedHold"]);
const ROUTER_RECORD_ALIAS = "AppRouterRecord";
const BINDING_HOPS = 4;

const FIXED_MESSAGE =
  "A fixed responder never reads this procedure's input: answer from `serveCorpusProcedures`, `createShellAmbientReads(corpus)` or `createCorpusReadResponder`, or read the input in a responder function.";
const ERROR_MESSAGE =
  "An unconditional trpcError fabricates a refusal the server never sent: drive the real refusal through `serveCorpusProcedures`, or make the failure depend on the request.";

type Responder = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
/** What a route value answers with: a refusal on every path, a request-aware answer, or a fixed guess. */
const VERDICT = { error: "error", answers: "answers", fixed: "fixed" } as const;
type Verdict = (typeof VERDICT)[keyof typeof VERDICT];

const isResponder = (node: TSESTree.Node): node is Responder =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression" || node.type === "FunctionDeclaration";

const isTrpcErrorCall = (node: TSESTree.Node): boolean =>
  node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "trpcError";

interface Native {
  readonly checker: ts.TypeChecker;
  readonly program: ts.Program;
  readonly toTs: (node: TSESTree.Node) => ts.Node;
  readonly toEs: (node: ts.Node) => TSESTree.Node | undefined;
}

// A file outside every type-aware program (a declaration file) has no route map to judge.
function nativeOf(context: OrbRuleContext): Native | undefined {
  const services = context.sourceCode.parserServices;
  if (
    services?.program === undefined ||
    services.program === null ||
    services.esTreeNodeToTSNodeMap === undefined ||
    services.tsNodeToESTreeNodeMap === undefined
  ) {
    return undefined;
  }
  const toTsMap = services.esTreeNodeToTSNodeMap;
  const toEsMap = services.tsNodeToESTreeNodeMap;
  return {
    checker: services.program.getTypeChecker(),
    program: services.program,
    toTs: (node) => toTsMap.get(node) as ts.Node,
    toEs: (node) => toEsMap.get(node as never) as TSESTree.Node | undefined,
  };
}

const constituents = (type: ts.Type): readonly ts.Type[] => (type.isUnion() ? type.types : [type]);

function isVoidLike(type: ts.Type): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  return (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)) !== 0;
}

const routerRecords = new WeakMap<ts.Program, { readonly type: ts.Type; readonly at: ts.Node } | null>();

// The router's record type, declared as `AppRouterRecord` beside the route helper, found once per program.
function routerRecord(native: Native, current: ts.SourceFile): { readonly type: ts.Type; readonly at: ts.Node } | null {
  const known = routerRecords.get(native.program);
  if (known !== undefined) {
    return known;
  }
  const files = [current, ...native.program.getSourceFiles().filter((file) => /route-trpc\.ts$/u.test(file.fileName))];
  for (const file of files) {
    for (const statement of file.statements) {
      if (ts.isTypeAliasDeclaration(statement) && statement.name.text === ROUTER_RECORD_ALIAS) {
        const found = { type: native.checker.getTypeAtLocation(statement.name), at: statement.name };
        routerRecords.set(native.program, found);
        return found;
      }
    }
  }
  routerRecords.set(native.program, null);
  return null;
}

// A procedure with no input types its input as undefined or void; any other input is a wire request to read.
function inputIsVoid(native: Native, current: ts.SourceFile, path: string): boolean {
  const record = routerRecord(native, current);
  if (record === null) {
    return false;
  }
  let type: ts.Type | undefined = record.type;
  for (const segment of [...path.split("."), "_def", "$types", "input"]) {
    const symbol: ts.Symbol | undefined = type === undefined ? undefined : native.checker.getPropertyOfType(type, segment);
    type = symbol === undefined ? undefined : native.checker.getTypeOfSymbolAtLocation(symbol, record.at);
  }
  return type !== undefined && constituents(type).every(isVoidLike);
}

// A route value that is not a literal responder is a typed value: a kit marker, or a function taking the request.
function typeAnswersRequests(native: Native, value: TSESTree.Node): boolean {
  return constituents(native.checker.getTypeAtLocation(native.toTs(value))).every(
    (type) => MARKER_TYPES.has(type.getSymbol()?.name ?? "") || type.getCallSignatures().some((signature) => signature.getParameters().length > 0),
  );
}

const isNode = (value: unknown): value is TSESTree.Node => typeof value === "object" && value !== null && "type" in value;

function childNodes(context: OrbRuleContext, node: TSESTree.Node): readonly TSESTree.Node[] {
  const record = node as unknown as Record<string, unknown>;
  return (context.sourceCode.visitorKeys?.[node.type] ?? []).flatMap((key) => [record[key]].flat().filter(isNode));
}

// The expressions a responder function returns on any path, not entering nested functions.
function returnedValues(context: OrbRuleContext, fn: Responder): readonly TSESTree.Node[] {
  const visit = (node: TSESTree.Node): readonly TSESTree.Node[] => {
    if (node.type === "ReturnStatement") {
      return node.argument === null ? [] : [node.argument];
    }
    return isResponder(node) ? [] : childNodes(context, node).flatMap(visit);
  };
  return fn.body.type === "BlockStatement" ? visit(fn.body) : [fn.body];
}

// Follow aliases only while their value reaches an observation; discarded expressions are not request reads.
function meaningfulRead(context: OrbRuleContext, node: TSESTree.Node, seen: Set<TSESTree.Node>): boolean {
  if (seen.has(node)) {
    return false;
  }
  seen.add(node);
  const parent = node.parent;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === "ExpressionStatement" || (parent.type === "UnaryExpression" && parent.operator === "void")) {
    return false;
  }
  if (parent.type === "SequenceExpression") {
    return parent.expressions.at(-1) === node && meaningfulRead(context, parent, seen);
  }
  if (parent.type === "VariableDeclarator") {
    return context.sourceCode
      .getDeclaredVariables(parent)
      .some((variable) => variable.references.some((reference) => reference.isRead() && meaningfulRead(context, reference.identifier, seen)));
  }
  if (parent.type === "MemberExpression" || parent.type === "TSAsExpression" || parent.type === "TSNonNullExpression") {
    return meaningfulRead(context, parent, seen);
  }
  return true;
}

function readsParameter(context: OrbRuleContext, fn: Responder): boolean {
  return context.sourceCode
    .getDeclaredVariables(fn)
    .some(
      (variable: TSESLint.Scope.Variable) =>
        variable.defs.some((def) => def.type === "Parameter") &&
        variable.references.some((reference) => reference.isRead() && meaningfulRead(context, reference.identifier, new Set())),
    );
}

interface Env {
  readonly context: OrbRuleContext;
  readonly native: Native;
  readonly sourceFile: ts.SourceFile;
}

// A refusal beside an answer is a script (fail then serve); two refusals are one refusal.
function combine(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.every((verdict) => verdict === VERDICT.error)) {
    return VERDICT.error;
  }
  return verdicts.every((verdict) => verdict !== VERDICT.fixed) ? VERDICT.answers : VERDICT.fixed;
}

function responderVerdict(env: Env, fn: Responder, depth: number): Verdict {
  const returned = combine(returnedValues(env.context, fn).map((value) => verdictOf(env, value, depth + 1)));
  if (returned === VERDICT.error) {
    return VERDICT.error;
  }
  return readsParameter(env.context, fn) ? VERDICT.answers : returned;
}

function localCallableVerdict(env: Env, value: TSESTree.Node, depth: number): Verdict | undefined {
  if (value.type === "Identifier") {
    const declaration = env.native.checker.getSymbolAtLocation(env.native.toTs(value))?.valueDeclaration;
    const fn = declaration === undefined ? undefined : env.native.toEs(declaration);
    if (fn !== undefined && isResponder(fn)) {
      return responderVerdict(env, fn, depth + 1);
    }
  }
  if (value.type === "CallExpression") {
    const declaration = env.native.checker.getSymbolAtLocation(env.native.toTs(value.callee))?.valueDeclaration;
    const declared = declaration === undefined ? undefined : env.native.toEs(declaration);
    const fn = declared?.type === "VariableDeclarator" ? declared.init : declared;
    if (fn !== undefined && fn !== null && isResponder(fn)) {
      return combine(returnedValues(env.context, fn).map((returned) => verdictOf(env, returned, depth + 1)));
    }
  }
  return undefined;
}

function verdictOf(env: Env, node: TSESTree.Node, depth = 0): Verdict {
  const value = unwrapTsValue(node);
  if (value.type === "Identifier" && depth < BINDING_HOPS) {
    const bound = constantInitializer(env.context, value);
    if (bound !== undefined) {
      return verdictOf(env, bound, depth + 1);
    }
  }
  const local = depth < BINDING_HOPS ? localCallableVerdict(env, value, depth) : undefined;
  if (local !== undefined) {
    return local;
  }
  if (isTrpcErrorCall(value)) {
    return VERDICT.error;
  }
  if (value.type === "ConditionalExpression") {
    return combine([verdictOf(env, value.consequent, depth + 1), verdictOf(env, value.alternate, depth + 1)]);
  }
  if (isResponder(value)) {
    return responderVerdict(env, value, depth);
  }
  return typeAnswersRequests(env.native, value) ? VERDICT.answers : VERDICT.fixed;
}

// A literal is a route map when its contextual type holds a responder (one that can be a kit marker) for a dotted key it writes.
function isTypedRouteMap(context: OrbRuleContext, native: Native, object: TSESTree.ObjectExpression): boolean {
  const contextual = native.checker.getContextualType(native.toTs(object) as ts.Expression);
  if (contextual === undefined) {
    return false;
  }
  return object.properties.some((property) => {
    const key = property.type === "Property" ? staticKeyName(context, property) : undefined;
    if (key === undefined || !key.includes(".")) {
      return false;
    }
    const symbol = native.checker.getPropertyOfType(contextual, key);
    const slot = symbol === undefined ? undefined : native.checker.getTypeOfSymbolAtLocation(symbol, native.toTs(object));
    return slot !== undefined && constituents(slot).some((type) => MARKER_TYPES.has(type.getSymbol()?.name ?? ""));
  });
}

export const ctResponderReadsInputRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = nativeOf(context);
    if (native === undefined) {
      return {};
    }
    const env: Env = { context, native, sourceFile: native.toTs(context.sourceCode.ast).getSourceFile() };
    const judged = new Set<TSESTree.Node>();

    const judge = (path: string, property: TSESTree.Property): void => {
      if (judged.has(property)) {
        return;
      }
      judged.add(property);
      const verdict = verdictOf(env, property.value);
      if (verdict === VERDICT.error) {
        context.report({ node: property.value, message: ERROR_MESSAGE });
      } else if (verdict === VERDICT.fixed && !inputIsVoid(native, env.sourceFile, path)) {
        context.report({ node: property.value, message: FIXED_MESSAGE });
      }
    };

    // Every property the map's type holds that this file declares, whether written in the literal, spread in from a
    // binding of this file, or typed on a variable: each is a `PropertyAssignment` the checker names.
    const judgeMap = (map: TSESTree.Node): void => {
      const type = native.checker.getTypeAtLocation(native.toTs(map));
      for (const symbol of native.checker.getPropertiesOfType(type)) {
        const declaration = symbol.valueDeclaration;
        const property = declaration !== undefined && ts.isPropertyAssignment(declaration) ? native.toEs(declaration) : undefined;
        if (property?.type === "Property") {
          judge(symbol.getName(), property);
        }
      }
    };

    return {
      "CallExpression[callee.type='Identifier']"(call: TSESTree.CallExpression): void {
        const index = ROUTE_MAP_ARGUMENT.get(call.callee.type === "Identifier" ? call.callee.name : "");
        const map = index === undefined ? undefined : call.arguments[index];
        if (map !== undefined) {
          judgeMap(map);
        }
      },
      "CallExpression[arguments.length>0]"(call: TSESTree.CallExpression): void {
        const signature = native.checker.getResolvedSignature(native.toTs(call) as ts.CallExpression);
        signature?.getParameters().forEach((parameter, index) => {
          const type = native.checker.getTypeOfSymbolAtLocation(parameter, native.toTs(call));
          const routeMap = native.checker
            .getPropertiesOfType(type)
            .some(
              (slot) =>
                slot.getName().includes(".") &&
                constituents(native.checker.getTypeOfSymbolAtLocation(slot, native.toTs(call))).some((member) =>
                  MARKER_TYPES.has(member.getSymbol()?.name ?? ""),
                ),
            );
          const argument = call.arguments[index];
          if (routeMap && argument !== undefined) {
            judgeMap(argument);
          }
        });
      },
      // A literal typed as a route map where it is written (a return type, a variable, a `satisfies`) is judged without a call.
      "ObjectExpression[properties.length>0]"(object: TSESTree.ObjectExpression): void {
        if (isTypedRouteMap(context, native, object)) {
          judgeMap(object);
        }
      },
    };
  },
};
