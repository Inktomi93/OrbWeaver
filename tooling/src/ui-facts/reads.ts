// Read shape: each `useQuery` and `useQueries` call as a loading ladder, a gated read that wants skipToken, or a background read.
// Law: a suspending read is `useGatedQuery` or `useSuspenseQuery` inside `QueryBoundary`, never a bare `useQuery` state ladder.
import ts from "typescript";
import type { Source } from "../eslint/index.ts";
import { lineOf, visit } from "../eslint/index.ts";
import type { Cohort, Member } from "../floor/verdict/cohort-compare.ts";
import { anyNode, enclosingFunction, hasProperty, resultBinding } from "./syntax.ts";

const STATE_FLAGS = new Set(["isPending", "isLoading", "isError", "isLoadingError", "status"]);
const COUNTED = ["useQuery", "useQueries", "useGatedQuery", "useSuspenseQuery"] as const;
type Counted = (typeof COUNTED)[number];
const CLASSIFIED: ReadonlySet<Counted> = new Set<Counted>(["useQuery", "useQueries"]);
const QUERY_MODULE = "@tanstack/react-query";

export interface ReadScan {
  readonly counts: Readonly<Record<Counted, number>>;
  readonly files: number;
}

const isCounted = (name: string): name is Counted => (COUNTED as readonly string[]).includes(name);

/** The hook a callee names: a bare name, `useQ` imported as `useQuery as useQ`, or `rq.useQuery` on a namespace import of the query module. */
function calleeResolver(sf: ts.SourceFile): (callee: ts.Expression) => Counted | null {
  const aliases = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const statement of sf.statements) {
    const clause =
      ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === QUERY_MODULE
        ? statement.importClause
        : undefined;
    const bindings = clause?.namedBindings;
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    }
    for (const specifier of bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : []) {
      aliases.set(specifier.name.text, (specifier.propertyName ?? specifier.name).text);
    }
  }
  const nameOf = (callee: ts.Expression): string | null => {
    if (ts.isIdentifier(callee)) {
      return aliases.get(callee.text) ?? callee.text;
    }
    return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text) ? callee.name.text : null;
  };
  return (callee) => {
    const name = nameOf(callee);
    return name !== null && isCounted(name) ? name : null;
  };
}

function functionName(fn: ts.Node, sf: ts.SourceFile): string {
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name !== undefined) {
    return fn.name.text;
  }
  return ts.isVariableDeclaration(fn.parent) ? fn.parent.name.getText(sf) : "?";
}

const isFlagRead = (node: ts.Node, names: ReadonlySet<string>): boolean =>
  ts.isPropertyAccessExpression(node) && STATE_FLAGS.has(node.name.text) && readsResult(node.expression, names);

/** The expression is a result: a bound name, `rows[0]`, or a parameter of a callback handed to a method of a bound name (`rows.some((row) => row.isPending)`). */
function readsResult(expression: ts.Expression, names: ReadonlySet<string>): boolean {
  if (ts.isElementAccessExpression(expression)) {
    return readsResult(expression.expression, names);
  }
  if (!ts.isIdentifier(expression)) {
    return false;
  }
  if (names.has(expression.text)) {
    return true;
  }
  return anyNode(enclosingFunction(expression), (node) => {
    const callback = ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === expression.text ? node.parent : undefined;
    const call = callback?.parent;
    return (
      call !== undefined &&
      ts.isCallExpression(call) &&
      ts.isPropertyAccessExpression(call.expression) &&
      ts.isIdentifier(call.expression.expression) &&
      names.has(call.expression.expression.text)
    );
  });
}

/** The names a `useQueries` result is held under: the whole array, each element of an array pattern, and the flags destructured from one. */
function queriesBinding(call: ts.CallExpression): { readonly names: ReadonlySet<string>; readonly destructured: readonly string[] } {
  const parent = call.parent;
  if (!ts.isVariableDeclaration(parent)) {
    return { names: new Set(), destructured: [] };
  }
  if (ts.isIdentifier(parent.name)) {
    return { names: new Set([parent.name.text]), destructured: [] };
  }
  const names = new Set<string>();
  const destructured: string[] = [];
  for (const element of ts.isArrayBindingPattern(parent.name) ? parent.name.elements : []) {
    if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
      names.add(element.name.text);
    } else if (ts.isBindingElement(element) && ts.isObjectBindingPattern(element.name)) {
      destructured.push(...element.name.elements.map((inner) => (inner.propertyName ?? inner.name).getText()));
    }
  }
  return { names, destructured };
}

/** Reads the call's result through a state flag: `const { isPending } = useQuery()`, `q.isError` on `const q = useQuery()`, or a flag on a `useQueries` element or its `combine`. */
function readsState(call: ts.CallExpression, hook: Counted): boolean {
  if (hook === "useQueries") {
    const { names, destructured } = queriesBinding(call);
    const combined = call.arguments.some((argument) => anyNode(argument, (node) => ts.isPropertyAccessExpression(node) && STATE_FLAGS.has(node.name.text)));
    return combined || destructured.some((name) => STATE_FLAGS.has(name)) || anyNode(enclosingFunction(call), (node) => isFlagRead(node, names));
  }
  const binding = resultBinding(call);
  const bound = binding.name;
  return (
    binding.destructured.some((name) => STATE_FLAGS.has(name)) ||
    (bound !== null &&
      anyNode(
        enclosingFunction(call),
        (node) => ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === bound && STATE_FLAGS.has(node.name.text),
      ))
  );
}

function mentionsSkipToken(call: ts.CallExpression): boolean {
  return call.arguments.some((argument) => anyNode(argument, (node) => ts.isIdentifier(node) && node.text === "skipToken"));
}

function shapeOf(call: ts.CallExpression, hook: Counted): string {
  const enabled = hasProperty(call.arguments[0], "enabled");
  if (readsState(call, hook)) {
    return enabled ? "ladder+enabled" : "ladder";
  }
  if (enabled) {
    return "enabled-gate";
  }
  return mentionsSkipToken(call) ? "skipToken" : "background";
}

export function buildReadCohort(sources: readonly Source[]): { readonly cohort: Cohort; readonly scan: ReadScan } {
  const members: Member[] = [];
  const counts: Record<Counted, number> = { useQuery: 0, useQueries: 0, useGatedQuery: 0, useSuspenseQuery: 0 };
  let files = 0;
  for (const source of sources) {
    const sf = source.sf;
    if (sf === null || source.layer !== "client") {
      continue;
    }
    files += 1;
    const hookOf = calleeResolver(sf);
    visit(sf, (node) => {
      const hook = ts.isCallExpression(node) ? hookOf(node.expression) : null;
      if (hook === null || !ts.isCallExpression(node)) {
        return;
      }
      counts[hook] += 1;
      if (CLASSIFIED.has(hook)) {
        const label = functionName(enclosingFunction(node), sf);
        members.push({ path: source.path, section: source.section, label, cells: { shape: { value: shapeOf(node, hook), line: lineOf(sf, node) } } });
      }
    });
  }
  return {
    scan: { counts, files },
    cohort: {
      name: "read-shape",
      what: "useQuery and useQueries calls: ladder (reads isPending, isLoading or isError), enabled (wants useGatedQuery and skipToken), skipToken, background",
      columns: ["shape"],
      defects: { shape: ["ladder", "ladder+enabled", "enabled-gate"] },
      basis: { shape: "heuristic" },
      members,
    },
  };
}
