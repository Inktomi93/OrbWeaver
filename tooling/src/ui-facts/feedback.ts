// Feedback shape: for each consumer of an entity-mutation hook, what tells the user it worked and what tells them it failed.
import ts from "typescript";
import type { Cohort, Member } from "./compare.ts";
import type { Source } from "./source.ts";
import { lineOf, visit } from "./source.ts";
import { enclosingFunction, hasProperty, resultBinding } from "./syntax.ts";

const FACTORY = "createEntityMutation";
const ERROR_READS = new Set(["error", "isError", "retry", "clearError"]);
const SUCCESS_READS = new Set(["onSuccess", "isSuccess"]);

export interface FeedbackScan {
  readonly factories: number;
  readonly consumers: number;
  readonly files: number;
}

const clientSources = (sources: readonly Source[]): readonly (Source & { readonly sf: ts.SourceFile })[] =>
  sources.flatMap((source) => (source.sf === null || source.layer !== "client" ? [] : [{ ...source, sf: source.sf }]));

/** Mutation hooks minted by the factory at module scope, with whether the factory carries an errorToast. */
function factoryDefs(sources: readonly Source[]): ReadonlyMap<string, boolean> {
  const defs = new Map<string, boolean>();
  for (const { sf } of clientSources(sources)) {
    visit(sf, (node) => {
      const call = ts.isVariableDeclaration(node) ? node.initializer : undefined;
      if (call !== undefined && ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === FACTORY) {
        defs.set((node as ts.VariableDeclaration).name.getText(sf), hasProperty(call.arguments[0], "errorToast"));
      }
    });
  }
  return defs;
}

function readsFrom(call: ts.CallExpression, names: ReadonlySet<string>): { readonly errorRead: boolean; readonly successRead: boolean } {
  const binding = resultBinding(call);
  let errorRead = binding.destructured.some((name) => names.has(name));
  let successRead = false;
  visit(enclosingFunction(call), (node) => {
    if (binding.name !== null && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === binding.name) {
      errorRead ||= names.has(node.name.text);
    }
    successRead ||= ts.isIdentifier(node) && SUCCESS_READS.has(node.text);
  });
  return { errorRead, successRead };
}

function failureOf(factoryToast: boolean, inline: boolean): string {
  if (factoryToast && inline) {
    return "toast+inline";
  }
  if (factoryToast) {
    return "toast";
  }
  return inline ? "inline" : "none";
}

function memberOf(source: Source, sf: ts.SourceFile, call: ts.CallExpression, factoryHasToast: boolean): Member {
  const inlineFlag = hasProperty(call.arguments[0], "failureShownInline");
  const { errorRead, successRead } = readsFrom(call, ERROR_READS);
  let success = "none";
  if (sf.text.includes("useToastManager(")) {
    success = "toast";
  } else if (successRead) {
    success = "callback";
  }
  const line = lineOf(sf, call);
  return {
    path: source.path,
    section: source.section,
    label: call.expression.getText(sf),
    cells: { success: { value: success, line }, failure: { value: failureOf(factoryHasToast && !inlineFlag, inlineFlag || errorRead), line } },
  };
}

export function buildFeedbackCohort(sources: readonly Source[]): { readonly cohort: Cohort; readonly scan: FeedbackScan } {
  const defs = factoryDefs(sources);
  const files = clientSources(sources);
  const members = files.flatMap((source) => {
    const out: Member[] = [];
    visit(source.sf, (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && defs.has(node.expression.text)) {
        out.push(memberOf(source, source.sf, node, defs.get(node.expression.text) === true));
      }
    });
    return out;
  });
  return {
    scan: { factories: defs.size, consumers: members.length, files: files.length },
    cohort: {
      name: "feedback",
      what: "entity-mutation consumers: success (toast, callback, none) and failure surface (factory toast, inline, both, none)",
      columns: ["success", "failure"],
      defects: { failure: ["toast+inline"] },
      basis: { success: "heuristic", failure: "heuristic" },
      members,
    },
  };
}
