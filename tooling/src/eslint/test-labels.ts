import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import { staticTextValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// Production modules whose exported strings are names a user can read: a spec locates a control by the exported value.
// Only an export named for what it holds counts (`CHATS_SECTION_LABEL`, `MESSAGE_EDIT_NAME`, `IMMERSIVE_CARD_LABELS`); a
// field of a larger table is not a name its own consumers share.
const LABEL_EXPORT = /(?:LABEL|NAME|TITLE|COPY|SENTENCE)S?$/u;
const PRODUCTION_MODULES = "packages/*/src/**/*.ts";
const NOT_PRODUCTION = /\.(?:test|test-d|d)\.ts$/u;
const MIN_LABEL_LENGTH = 4;

/** One exported string: the module that owns it and the path to it, such as `IMMERSIVE_CARD_LABELS.rawSource`. */
export interface ExportedLabel {
  readonly module: string;
  readonly exportName: string;
}

function collectStrings(node: ts.Node, path: string, found: (value: string, path: string) => void): void {
  if (ts.isStringLiteralLike(node)) {
    found(node.text, path);
  } else if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    collectStrings(node.expression, path, found);
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))) {
        collectStrings(property.initializer, `${path}.${property.name.text}`, found);
      }
    }
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      collectStrings(element, path, found);
    }
  }
}

const isExported = (statement: ts.VariableStatement): boolean =>
  statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;

function exportedStrings(source: ts.SourceFile): [string, string][] {
  const strings: [string, string][] = [];
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const { name, initializer } of statement.declarationList.declarations) {
        if (initializer !== undefined && ts.isIdentifier(name) && LABEL_EXPORT.test(name.text)) {
          collectStrings(initializer, name.text, (value, exportName) => strings.push([value, exportName]));
        }
      }
    }
  }
  return strings;
}

/** The one owner of a label, or none when several exports hold it: a constant that is the label outranks a table field that repeats the word. */
function soleOwner(held: ReadonlyMap<string, ExportedLabel>): ExportedLabel | undefined {
  const owners = [...held.values()];
  const standalone = owners.filter((owner) => !owner.exportName.includes("."));
  const candidates = standalone.length > 0 ? standalone : owners;
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Every string a production `.ts` module exports by value, keyed by the string. A string that two exports of the
 * same rank hold names no single control, so it is left out.
 */
export function exportedLabels(root: string): ReadonlyMap<string, ExportedLabel> {
  const owners = new Map<string, Map<string, ExportedLabel>>();
  for (const module of globSync(PRODUCTION_MODULES, { cwd: root }).sort()) {
    const text = readFileSync(join(root, module), "utf8");
    if (NOT_PRODUCTION.test(module) || !text.includes("export const")) {
      continue;
    }
    for (const [value, exportName] of exportedStrings(ts.createSourceFile(module, text, ts.ScriptTarget.Latest, false))) {
      if (value.length >= MIN_LABEL_LENGTH) {
        const held = owners.get(value) ?? new Map<string, ExportedLabel>();
        const key = `${module}\n${exportName.split(".")[0]}`;
        held.set(key, held.get(key) ?? { module, exportName });
        owners.set(value, held);
      }
    }
  }
  return new Map(
    [...owners]
      .flatMap(([value, held]) => [[value, soleOwner(held)] as const])
      .filter((entry): entry is readonly [string, ExportedLabel] => entry[1] !== undefined),
  );
}

function nameOption(options: TSESTree.CallExpressionArgument | undefined): TSESTree.Node | undefined {
  if (options?.type !== "ObjectExpression") {
    return undefined;
  }
  for (const property of options.properties) {
    if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "name") {
      return property.value;
    }
  }
  return undefined;
}

// The text a locator call matches: `getByLabel("x")`, `getByText("x")` and `getByRole(role, { name: "x" })`.
function locatedName(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = call;
  if (callee.type !== "MemberExpression" || callee.computed || callee.property.type !== "Identifier") {
    return undefined;
  }
  if (callee.property.name === "getByLabel" || callee.property.name === "getByText" || callee.property.name === "toHaveAccessibleName") {
    return call.arguments[0];
  }
  return callee.property.name === "getByRole" ? nameOption(call.arguments[1]) : undefined;
}

export function handCopiedLabelRule(labels: ReadonlyMap<string, ExportedLabel>): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      return {
        "CallExpression[callee.type='MemberExpression']"(call: TSESTree.CallExpression): void {
          const name = locatedName(call);
          const value = name === undefined ? undefined : staticTextValue(context, name);
          const owner = typeof value === "string" ? labels.get(value) : undefined;
          if (name !== undefined && owner !== undefined) {
            context.report({
              node: name,
              message: `"${value}" is hand-copied: ${owner.module} exports it as ${owner.exportName}. Import it so the test follows the product.`,
            });
          }
        },
      };
    },
  };
}
