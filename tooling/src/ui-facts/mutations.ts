// Area F: each mutation factory call, where it is defined, and how it keeps reads fresh and reports failure.
import ts from "typescript";
import type { Source } from "../eslint/index.ts";
import { lineOf, visit } from "../eslint/index.ts";
import type { Cohort, Member } from "../floor/verdict/cohort-compare.ts";

const OWNER = "createEntityMutation";
const FACTORIES = new Set([OWNER, "useMutation"]);
const FRESHNESS_XOR =
  "freshness is a typed XOR: `busDriven` when a verb's bus event covers the read, else `invalidates` (client-architecture-state-and-gates.md §10a; packages/client/src/data/create-entity-mutation.ts `FreshnessSource`)";
const HOOK_HOME = /\/hooks\/|-mutations?\.tsx?$|\/data\//u;

function propertyKind(options: ts.ObjectLiteralExpression, name: string): string {
  const property = options.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText() === name);
  if (property === undefined || !ts.isPropertyAssignment(property)) {
    return "none";
  }
  if (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer)) {
    return "string";
  }
  return ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer) ? "function" : "expression";
}

function freshness(options: ts.ObjectLiteralExpression | null): string {
  if (options === null) {
    return "n/a";
  }
  if (propertyKind(options, "busDriven") !== "none") {
    return "busDriven";
  }
  return propertyKind(options, "invalidates") === "none" ? "neither" : "invalidates";
}

// The factory's failure class (client-architecture-state-and-gates.md §11): a toast's form, the background log, or the inline line.
function failure(options: ts.ObjectLiteralExpression | null): string {
  if (options === null) {
    return "n/a";
  }
  if (propertyKind(options, "backgroundFailure") !== "none") {
    return "background";
  }
  if (propertyKind(options, "failureShownInline") !== "none") {
    return "inline";
  }
  const toast = propertyKind(options, "errorToast");
  return toast === "none" ? "none" : `toast ${toast}`;
}

function mutationMember(source: Source, sf: ts.SourceFile, call: ts.CallExpression, factory: string): Member {
  const first = call.arguments[0];
  const options = first !== undefined && ts.isObjectLiteralExpression(first) ? first : null;
  const line = lineOf(sf, call);
  return {
    path: source.path,
    section: source.section,
    label: factory,
    cells: {
      home: { value: HOOK_HOME.test(source.path) ? "hooks file" : "component or surface file", line },
      freshness: { value: freshness(options), line },
      failure: { value: failure(options), line },
      factory: { value: factory, line },
    },
  };
}

export function buildMutationCohort(sources: readonly Source[]): Cohort {
  const members: Member[] = [];
  for (const source of sources) {
    const sf = source.sf;
    // The factory's own file wraps the one `useMutation` every member goes through, so it owns the cohort.
    if (sf === null || source.layer !== "client" || sf.statements.some((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === OWNER)) {
      continue;
    }
    visit(sf, (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && FACTORIES.has(node.expression.text)) {
        members.push(mutationMember(source, sf, node, node.expression.text));
      }
    });
  }
  return {
    name: "mutation",
    what: "mutation factories: defining file, freshness mechanism, failure class, factory",
    columns: ["home", "freshness", "failure", "factory"],
    defects: { home: ["component or surface file"], failure: ["none"] },
    kept: {
      freshness: { invalidates: FRESHNESS_XOR, busDriven: FRESHNESS_XOR },
      failure: {
        "toast expression":
          "an action the person took toasts its failure, and a named copy constant is one (client-architecture-state-and-gates.md §11, Toasts)",
        "toast function":
          "an action the person took toasts its failure; a function form answers null only for an error another surface says itself (client-architecture-state-and-gates.md §11, Toasts)",
        background: "background housekeeping the person did not start logs its failure and shows no toast (client-architecture-state-and-gates.md §11, Toasts)",
        inline: "a surface on screen while it fails states the failure inline, and no toast repeats it (client-architecture-state-and-gates.md §11, Toasts)",
      },
    },
    members,
  };
}
