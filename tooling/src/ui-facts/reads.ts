// Read shape: each `useQuery` call as a loading ladder, a gated read that wants skipToken, or a background read.
// Law: a suspending read is `useGatedQuery` or `useSuspenseQuery` inside `QueryBoundary`, never a bare `useQuery` state ladder.
import ts from "typescript";
import type { Cohort, Member } from "./compare.ts";
import type { Source } from "./source.ts";
import { lineOf, visit } from "./source.ts";
import { anyNode, enclosingFunction, hasProperty, resultBinding } from "./syntax.ts";

const STATE_FLAGS = new Set(["isPending", "isLoading", "isError", "isLoadingError", "status"]);
const COUNTED = ["useQuery", "useQueries", "useGatedQuery", "useSuspenseQuery"] as const;

export interface ReadScan {
  readonly counts: Readonly<Record<(typeof COUNTED)[number], number>>;
  readonly files: number;
}

function functionName(fn: ts.Node, sf: ts.SourceFile): string {
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name !== undefined) {
    return fn.name.text;
  }
  return ts.isVariableDeclaration(fn.parent) ? fn.parent.name.getText(sf) : "?";
}

/** Reads the call's result through a state flag: `const { isPending } = useQuery()` or `q.isError` on `const q = useQuery()`. */
function readsState(call: ts.CallExpression): boolean {
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

function shapeOf(call: ts.CallExpression): string {
  const enabled = hasProperty(call.arguments[0], "enabled");
  if (readsState(call)) {
    return enabled ? "ladder+enabled" : "ladder";
  }
  if (enabled) {
    return "enabled-gate";
  }
  return mentionsSkipToken(call) ? "skipToken" : "background";
}

export function buildReadCohort(sources: readonly Source[]): { readonly cohort: Cohort; readonly scan: ReadScan } {
  const members: Member[] = [];
  const counts = { useQuery: 0, useQueries: 0, useGatedQuery: 0, useSuspenseQuery: 0 };
  let files = 0;
  for (const source of sources) {
    const sf = source.sf;
    if (sf === null || source.layer !== "client") {
      continue;
    }
    files += 1;
    visit(sf, (node) => {
      if (!(ts.isCallExpression(node) && ts.isIdentifier(node.expression))) {
        return;
      }
      const callee = node.expression.text;
      if (callee in counts) {
        counts[callee as (typeof COUNTED)[number]] += 1;
      }
      if (callee === "useQuery") {
        const label = functionName(enclosingFunction(node), sf);
        members.push({ path: source.path, section: source.section, label, cells: { shape: { value: shapeOf(node), line: lineOf(sf, node) } } });
      }
    });
  }
  return {
    scan: { counts, files },
    cohort: {
      name: "read-shape",
      what: "useQuery calls: ladder (reads isPending, isLoading or isError), enabled (wants useGatedQuery and skipToken), skipToken, background",
      columns: ["shape"],
      defects: { shape: ["ladder", "ladder+enabled", "enabled-gate"] },
      basis: { shape: "heuristic" },
      members,
    },
  };
}
