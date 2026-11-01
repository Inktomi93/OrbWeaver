// Area F: each mutation factory call, where it is defined, and how it keeps reads fresh and reports failure.
import ts from "typescript";
import type { Cohort, Member } from "./compare.ts";
import type { Source } from "./source.ts";
import { lineOf, visit } from "./source.ts";

const FACTORIES = new Set(["createEntityMutation", "useMutation"]);
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
      errorToast: { value: options === null ? "n/a" : propertyKind(options, "errorToast"), line },
      factory: { value: factory, line },
    },
  };
}

export function buildMutationCohort(sources: readonly Source[]): Cohort {
  const members: Member[] = [];
  for (const source of sources) {
    const sf = source.sf;
    if (sf === null || source.layer !== "client") {
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
    what: "mutation factories: defining file, freshness mechanism, error toast, factory",
    columns: ["home", "freshness", "errorToast", "factory"],
    defects: { home: ["component or surface file"] },
    members,
  };
}
