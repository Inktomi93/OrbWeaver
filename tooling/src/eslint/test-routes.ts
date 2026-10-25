import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// Route-map factories whose object argument is judged: the call name and the argument index of the map.
const ROUTE_MAP_ARGUMENT = new Map([
  ["routeTrpc", 1],
  ["defineTrpcRoutes", 0],
]);

// The marker types a route value may be: a held, failed, forward-wire or ended response is scripted by the kit, not a data guess.
const MARKER_TYPES = new Set(["TrpcHoldMarker", "TrpcErrorMarker", "TrpcWireEscapeMarker", "TrpcSubscriptionEndMarker"]);

const FIXED_MESSAGE =
  "A fixed responder never reads this procedure's input: answer from `serveCorpusProcedures`, `createShellAmbientReads(corpus)` or `createCorpusReadResponder`, or read the input in a responder function.";
const ERROR_MESSAGE =
  "An unconditional trpcError fabricates a refusal the server never sent: drive the real refusal through `serveCorpusProcedures`, or make the failure depend on the request.";

type Responder = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

const isResponder = (node: TSESTree.Node): node is Responder => node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

const calleeName = (call: TSESTree.CallExpression): string | undefined => (call.callee.type === "Identifier" ? call.callee.name : undefined);

function unwrap(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSTypeAssertion"
  ) {
    current = current.expression;
  }
  return current;
}

function isTrpcErrorCall(node: TSESTree.Node): boolean {
  const value = unwrap(node);
  return value.type === "CallExpression" && calleeName(value) === "trpcError";
}

// The value a responder always returns, when it has exactly one return and no branching.
function soleReturned(fn: Responder): TSESTree.Node | undefined {
  if (fn.body.type !== "BlockStatement") {
    return fn.body;
  }
  const [only, ...rest] = fn.body.body;
  return rest.length === 0 && only?.type === "ReturnStatement" && only.argument !== null ? only.argument : undefined;
}

function readsParameter(context: OrbRuleContext, fn: Responder): boolean {
  return (
    fn.params.length > 0 &&
    context.sourceCode
      .getDeclaredVariables(fn)
      .some(
        (variable: TSESLint.Scope.Variable) =>
          variable.defs.some((def) => def.type === "Parameter") && variable.references.some((reference) => reference.isRead()),
      )
  );
}

interface Checker {
  readonly checker: ts.TypeChecker;
  readonly toTs: (node: TSESTree.Node) => ts.Node;
}

function checkerOf(context: OrbRuleContext): Checker {
  const services = context.sourceCode.parserServices;
  if (services?.program === undefined || services.program === null || services.esTreeNodeToTSNodeMap === undefined) {
    throw new Error("ct-responder-reads-input needs the parser's TypeScript Program");
  }
  const nodeMap = services.esTreeNodeToTSNodeMap;
  return { checker: services.program.getTypeChecker(), toTs: (node) => nodeMap.get(node) as ts.Node };
}

const constituents = (type: ts.Type): readonly ts.Type[] => (type.isUnion() ? type.types : [type]);

function isVoidLike(type: ts.Type): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  return (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)) !== 0;
}

// A procedure with no input types its responder parameter as undefined or void; any other input is a wire request to read.
function inputIsVoid(context: OrbRuleContext, property: TSESTree.Property): boolean {
  const { checker, toTs } = checkerOf(context);
  const contextual = checker.getContextualType(toTs(property.value) as ts.Expression);
  if (contextual === undefined) {
    return false;
  }
  const first = constituents(contextual)
    .flatMap((member) => member.getCallSignatures())
    .flatMap((signature) => signature.getParameters())
    .at(0);
  if (first === undefined) {
    return true;
  }
  const type = checker.getTypeOfSymbolAtLocation(first, first.valueDeclaration ?? toTs(property));
  return constituents(type).every(isVoidLike);
}

// A route value that is not a literal responder is a typed value: a kit marker, or a function taking the request.
function valueAnswersRequests(context: OrbRuleContext, value: TSESTree.Node): boolean {
  const { checker, toTs } = checkerOf(context);
  return constituents(checker.getTypeAtLocation(toTs(value))).every(
    (type) => MARKER_TYPES.has(type.getSymbol()?.name ?? "") || type.getCallSignatures().some((signature) => signature.getParameters().length > 0),
  );
}

function propertyPath(property: TSESTree.Property): string | undefined {
  if (property.computed) {
    return undefined;
  }
  if (property.key.type === "Literal" && typeof property.key.value === "string") {
    return property.key.value;
  }
  return property.key.type === "Identifier" ? property.key.name : undefined;
}

export const ctResponderReadsInputRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const reportFixed = (node: TSESTree.Node): void => context.report({ node, message: FIXED_MESSAGE });
    const judgeFunction = (property: TSESTree.Property, fn: Responder): void => {
      const returned = soleReturned(fn);
      if (returned !== undefined && isTrpcErrorCall(returned)) {
        context.report({ node: returned, message: ERROR_MESSAGE });
      } else if (!(readsParameter(context, fn) || inputIsVoid(context, property))) {
        reportFixed(property.value);
      }
    };
    const judge = (property: TSESTree.Property): void => {
      if (propertyPath(property) === undefined) {
        return;
      }
      const value = unwrap(property.value);
      if (isTrpcErrorCall(value)) {
        context.report({ node: property.value, message: ERROR_MESSAGE });
      } else if (isResponder(value)) {
        judgeFunction(property, value);
      } else if (!(inputIsVoid(context, property) || valueAnswersRequests(context, value))) {
        reportFixed(property.value);
      }
    };
    return {
      "CallExpression[callee.type='Identifier']"(call: TSESTree.CallExpression): void {
        const index = ROUTE_MAP_ARGUMENT.get(calleeName(call) ?? "");
        const map = index === undefined ? undefined : call.arguments[index];
        const routes = map === undefined ? undefined : unwrap(map);
        if (routes?.type !== "ObjectExpression") {
          return;
        }
        for (const property of routes.properties) {
          if (property.type === "Property") {
            judge(property);
          }
        }
      },
    };
  },
};
