import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, TSESLint } from "@typescript-eslint/utils";
import ts from "typescript";
import { staticTextValue, unwrapTsValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { posixPath } from "./syntax.ts";

// Production modules whose exported strings are names a user can read: a spec locates a control by the exported value.
// Only an export named for what it holds counts (`CHATS_SECTION_LABEL`, `MESSAGE_EDIT_NAME`, `IMMERSIVE_CARD_LABELS`); a
// field of a larger table is not a name its own consumers share.
const LABEL_EXPORT = /(?:LABEL|NAME|TITLE|COPY|SENTENCE)S?$/u;
const PRODUCTION_MODULES = "packages/*/src/**/*.ts";
const NOT_PRODUCTION = /\.(?:test|test-d|d)\.ts$/u;
const MIN_LABEL_LENGTH = 4;

// The extended index. A label-producing function is named for what it returns (`contextToggleLabel`,
// `renameChatButtonName`); a copy or name module (`*-copy.ts`, `*-names.ts`) with no value import holds only names, so
// every string it exports counts whatever the export is called.
const LABEL_FUNCTION = /(?:Label|Name|Title|Copy|Sentence)s?$/u;
const COPY_MODULE = /-(?:copy|names)\.ts$/u;
// An error code object (`CHAT_OP_CODES`, `RPG_OP_CODES`) or a single code (`TURN_LOCKED_OP_CODE`); a code is snake_case
// with an underscore, which keeps a one-word code such as `locked` from matching ordinary prose.
const CODE_EXPORT = /(?:_CODES?|_OP_CODE)$/u;
const CODE_VALUE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u;
const ROUTE_EXPORT = /ROUTES?$/u;
const MIN_ROUTE_SEGMENTS = 2;
// An env key constant (`ENV_NO_FILE_KEY`, `STACK_RUN_DIR_ENV`) holds a SCREAMING_SNAKE name.
const ENV_EXPORT = /(?:_ENV|_KEY)S?$/u;
const ENV_VALUE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/u;

/** What an extended entry is. A label-kind entry is located by a spec; the others are values that test code asserts or sends. */
const EXTENDED_KINDS = ["function", "copy", "code", "route", "env"] as const;
type ExtendedKind = (typeof EXTENDED_KINDS)[number];

/** One exported string: the module that owns it and the path to it, such as `IMMERSIVE_CARD_LABELS.rawSource`. */
export interface ExportedLabel {
  readonly module: string;
  readonly exportName: string;
  /** Set on an extended entry only. */
  readonly kind?: ExtendedKind;
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

const hasExportModifier = (node: ts.HasModifiers): boolean => ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;

function exportedStrings(source: ts.SourceFile): [string, string][] {
  const strings: [string, string][] = [];
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const { name, initializer } of statement.declarationList.declarations) {
        if (initializer !== undefined && ts.isIdentifier(name) && LABEL_EXPORT.test(name.text)) {
          collectStrings(initializer, name.text, (value, exportName) => strings.push([value, exportName]));
        }
      }
    }
  }
  return strings;
}

/** The strings an expression can evaluate to when they are all written in it: a literal, or either arm of a conditional or fallback. */
function resultStrings(node: ts.Node, found: (value: string) => void): void {
  if (ts.isStringLiteralLike(node)) {
    found(node.text);
  } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    resultStrings(node.expression, found);
  } else if (ts.isConditionalExpression(node)) {
    resultStrings(node.whenTrue, found);
    resultStrings(node.whenFalse, found);
  } else if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    resultStrings(node.left, found);
    resultStrings(node.right, found);
  }
}

/** Every `return` expression of a function body, not entering a nested function. */
function returnedExpressions(body: ts.ConciseBody): ts.Expression[] {
  if (!ts.isBlock(body)) {
    return [body];
  }
  const returned: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      returned.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return returned;
}

interface NamedBody {
  readonly name: string;
  readonly body: ts.ConciseBody;
}

function functionOf(name: ts.BindingName, initializer: ts.Expression | undefined): NamedBody | undefined {
  return initializer !== undefined && ts.isIdentifier(name) && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ? { name: name.text, body: initializer.body }
    : undefined;
}

function exportedFunctions(source: ts.SourceFile): NamedBody[] {
  const functions: NamedBody[] = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement) && statement.name !== undefined && statement.body !== undefined) {
      functions.push({ name: statement.name.text, body: statement.body });
    } else if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      functions.push(...statement.declarationList.declarations.flatMap(({ name, initializer }) => functionOf(name, initializer) ?? []));
    }
  }
  return functions;
}

/** A module with no value import, so a spec's node side loads it without the component graph. */
const hasValueImport = (source: ts.SourceFile): boolean =>
  source.statements.some((statement) => ts.isImportDeclaration(statement) && statement.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword);

function stringConstants(source: ts.SourceFile, wanted: (name: string) => boolean, kind: ExtendedKind): [string, string, ExtendedKind][] {
  const strings: [string, string, ExtendedKind][] = [];
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const { name, initializer } of statement.declarationList.declarations) {
        if (initializer !== undefined && ts.isIdentifier(name) && wanted(name.text)) {
          collectStrings(initializer, name.text, (value, exportName) => strings.push([value, exportName, kind]));
        }
      }
    }
  }
  return strings;
}

const isRoute = (value: string): boolean => value.startsWith("/") && value.split("/").length - 1 >= MIN_ROUTE_SEGMENTS;

// The value kinds, each with the export names that hold it and the shape its value takes.
const VALUE_EXPORTS: readonly { readonly kind: ExtendedKind; readonly named: RegExp; readonly valued: (value: string) => boolean }[] = [
  { kind: "code", named: CODE_EXPORT, valued: (value) => CODE_VALUE.test(value) },
  { kind: "route", named: ROUTE_EXPORT, valued: isRoute },
  { kind: "env", named: ENV_EXPORT, valued: (value) => ENV_VALUE.test(value) },
];

/** Every string the extended index holds for one production module, with the path to it and what it is. */
function extendedStrings(module: string, source: ts.SourceFile): [string, string, ExtendedKind][] {
  const found: [string, string, ExtendedKind][] = [];
  const copyModule = COPY_MODULE.test(module) && !hasValueImport(source);
  if (copyModule) {
    found.push(...stringConstants(source, () => true, "copy"));
  }
  for (const { name, body } of exportedFunctions(source)) {
    if (copyModule || LABEL_FUNCTION.test(name)) {
      for (const expression of returnedExpressions(body)) {
        resultStrings(expression, (value) => found.push([value, name, "function"]));
      }
    }
  }
  for (const { kind, named, valued } of VALUE_EXPORTS) {
    found.push(...stringConstants(source, (name) => named.test(name), kind).filter(([value]) => valued(value)));
  }
  return found;
}

/** The one owner of a label, or none when several exports hold it: a constant that is the label outranks a table field that repeats the word. */
function soleOwner(held: ReadonlyMap<string, ExportedLabel>): ExportedLabel | undefined {
  const owners = [...held.values()];
  const standalone = owners.filter((owner) => !owner.exportName.includes("."));
  const candidates = standalone.length > 0 ? standalone : owners;
  return candidates.length === 1 ? candidates[0] : undefined;
}

// A module path is POSIX on every OS: globSync joins with the platform separator, and a finding names the module.
function productionSources(root: string, mustContain: string): { readonly module: string; readonly text: string }[] {
  return globSync(PRODUCTION_MODULES, { cwd: root })
    .map(posixPath)
    .sort()
    .filter((module) => !NOT_PRODUCTION.test(module))
    .map((module) => ({ module, text: readFileSync(join(root, module), "utf8") }))
    .filter(({ text }) => text.includes(mustContain));
}

function soleOwners(
  strings: Iterable<readonly [module: string, value: string, exportName: string, kind: ExtendedKind | undefined]>,
): ReadonlyMap<string, ExportedLabel> {
  const owners = new Map<string, Map<string, ExportedLabel>>();
  for (const [module, value, exportName, kind] of strings) {
    if (value.length >= MIN_LABEL_LENGTH) {
      const held = owners.get(value) ?? new Map<string, ExportedLabel>();
      const key = `${module}\n${exportName.split(".")[0]}`;
      held.set(key, held.get(key) ?? (kind === undefined ? { module, exportName } : { module, exportName, kind }));
      owners.set(value, held);
    }
  }
  return new Map(
    [...owners]
      .flatMap(([value, held]) => [[value, soleOwner(held)] as const])
      .filter((entry): entry is readonly [string, ExportedLabel] => entry[1] !== undefined),
  );
}

/**
 * Every string a production `.ts` module exports by value, keyed by the string. A string that two exports of the
 * same rank hold names no single control, so it is left out.
 */
export function exportedLabels(root: string): ReadonlyMap<string, ExportedLabel> {
  return soleOwners(
    productionSources(root, "export const").flatMap(({ module, text }) =>
      exportedStrings(ts.createSourceFile(module, text, ts.ScriptTarget.Latest, false)).map(
        ([value, exportName]) => [module, value, exportName, undefined] as const,
      ),
    ),
  );
}

/**
 * The strings `exportedLabels` does not index: what a label-producing function returns, every string a zero-import copy
 * or name module exports, the values of an exported error code object, a route constant and an env key constant. Rule
 * scope `all` reads it; scope `named` does not, so no finding appears before a sweep has fixed its sites.
 */
export function exportedProductionValues(root: string): ReadonlyMap<string, ExportedLabel> {
  return soleOwners(
    productionSources(root, "export").flatMap(({ module, text }) =>
      extendedStrings(module, ts.createSourceFile(module, text, ts.ScriptTarget.Latest, false)).map(
        ([value, exportName, kind]) => [module, value, exportName, kind] as const,
      ),
    ),
  );
}

function nameOption(options: TSESTree.CallExpressionArgument | undefined): TSESTree.Node | undefined {
  if (options?.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  for (const property of options.properties) {
    if (property.type === AST_NODE_TYPES.Property && !property.computed && property.key.type === AST_NODE_TYPES.Identifier && property.key.name === "name") {
      return property.value;
    }
  }
  return undefined;
}

// The text a locator call matches: `getByLabel("x")`, `getByText("x")` and `getByRole(role, { name: "x" })`.
function locatedName(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed || callee.property.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  if (callee.property.name === "getByLabel" || callee.property.name === "getByText" || callee.property.name === "toHaveAccessibleName") {
    return call.arguments[0];
  }
  return callee.property.name === "getByRole" ? nameOption(call.arguments[1]) : undefined;
}

/** The nodes a located name can evaluate to: each arm of a conditional or a `||`/`??` fallback, judged on its own. */
function nameArms(node: TSESTree.Node): TSESTree.Node[] {
  const expression = unwrapTsValue(node);
  if (expression.type === AST_NODE_TYPES.ConditionalExpression) {
    return [...nameArms(expression.consequent), ...nameArms(expression.alternate)];
  }
  if (expression.type === AST_NODE_TYPES.LogicalExpression && expression.operator !== "&&") {
    return [...nameArms(expression.left), ...nameArms(expression.right)];
  }
  return [expression];
}

function variableOf(context: OrbRuleContext, identifier: TSESTree.Identifier): TSESLint.Scope.Variable | undefined {
  for (let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return undefined;
}

type FunctionNode = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

/** The identifier a helper is called by: a function declaration's name, or the const an arrow or function expression initializes. */
function helperName(fn: FunctionNode): TSESTree.Identifier | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id ?? undefined;
  }
  const { parent } = fn;
  return parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier ? parent.id : undefined;
}

function paramIdentifier(param: TSESTree.Parameter): TSESTree.Node {
  if (param.type === AST_NODE_TYPES.AssignmentPattern) {
    return param.left;
  }
  return param.type === AST_NODE_TYPES.TSParameterProperty ? param.parameter : param;
}

/** When a located name is a helper's own parameter, the helper's variable and that parameter's position. */
function nameParameter(context: OrbRuleContext, arm: TSESTree.Node): readonly [TSESLint.Scope.Variable, number] | undefined {
  const variable = arm.type === AST_NODE_TYPES.Identifier ? variableOf(context, arm) : undefined;
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type !== TSESLint.Scope.DefinitionType.Parameter) {
    return undefined;
  }
  const fn = definition.node as FunctionNode;
  const name = helperName(fn);
  const helper = name === undefined ? undefined : variableOf(context, name);
  const index = fn.params.findIndex((param) => paramIdentifier(param) === definition.name);
  return helper === undefined || index === -1 ? undefined : [helper, index];
}

/**
 * The same-file helpers that pass a parameter straight into a locator's name: that argument is a located name at each
 * call. Calls are judged once the file is read, because a hoisted helper can be declared after its callers.
 */
function helperNameTracker(context: OrbRuleContext, judgeName: (name: TSESTree.Node) => void): HelperNameTracker {
  const nameParameters = new Map<TSESLint.Scope.Variable, Set<number>>();
  const calls: TSESTree.CallExpression[] = [];
  const namedArguments = (call: TSESTree.CallExpression): TSESTree.Node[] => {
    const helper = call.callee.type === AST_NODE_TYPES.Identifier ? variableOf(context, call.callee) : undefined;
    const indexes = helper === undefined ? undefined : nameParameters.get(helper);
    return [...(indexes ?? [])].flatMap((index) => {
      const argument = call.arguments[index];
      return argument === undefined || argument.type === AST_NODE_TYPES.SpreadElement ? [] : [argument];
    });
  };
  return {
    located(name: TSESTree.Node): void {
      for (const arm of nameArms(name)) {
        const parameter = nameParameter(context, arm);
        if (parameter !== undefined) {
          nameParameters.set(parameter[0], (nameParameters.get(parameter[0]) ?? new Set()).add(parameter[1]));
        }
      }
    },
    called(call: TSESTree.CallExpression): void {
      calls.push(call);
    },
    finish(): void {
      for (const argument of calls.flatMap(namedArguments)) {
        judgeName(argument);
      }
    },
  };
}

interface HelperNameTracker {
  /** Records a helper whose parameter this located name is. */
  readonly located: (name: TSESTree.Node) => void;
  readonly called: (call: TSESTree.CallExpression) => void;
  /** Judges each recorded call's name arguments. */
  readonly finish: () => void;
}

const VALUE_KINDS: ReadonlySet<ExtendedKind | undefined> = new Set<ExtendedKind>(["code", "route", "env"]);

// A route is matched whole, or as the head of a longer path: a query, or the id after a `:param` segment.
function routeHead(route: string): string {
  const param = route.indexOf("/:");
  return param === -1 ? route : route.slice(0, param + 1);
}

function routeOwner(value: string, routes: readonly (readonly [string, ExportedLabel])[]): ExportedLabel | undefined {
  let best: readonly [string, ExportedLabel] | undefined;
  for (const entry of routes) {
    const [route] = entry;
    const head = routeHead(route);
    const matches = head === route ? value === route || value.startsWith(`${route}?`) : value.startsWith(head);
    if (matches && (best === undefined || route.length > best[0].length)) {
      best = entry;
    }
  }
  return best?.[1];
}

// A string that names no value: an object key, an import or export source, a type, a directive.
function isValueSite(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent === undefined) {
    return false;
  }
  switch (parent.type) {
    case AST_NODE_TYPES.Property:
    case AST_NODE_TYPES.PropertyDefinition:
    case AST_NODE_TYPES.MethodDefinition:
    case AST_NODE_TYPES.TSPropertySignature:
      return !(parent.key === node && !parent.computed);
    case AST_NODE_TYPES.ImportDeclaration:
    case AST_NODE_TYPES.ExportNamedDeclaration:
    case AST_NODE_TYPES.ExportAllDeclaration:
    case AST_NODE_TYPES.ImportExpression:
    case AST_NODE_TYPES.TSLiteralType:
    case AST_NODE_TYPES.TSEnumMember:
    case AST_NODE_TYPES.TSExternalModuleReference:
    case AST_NODE_TYPES.TSImportType:
      return false;
    case AST_NODE_TYPES.ExpressionStatement:
      return parent.directive === undefined;
    default:
      return true;
  }
}

type Scope = "named" | "all";

function scopeOf(options: readonly unknown[]): Scope {
  const [option] = options;
  return typeof option === "object" && option !== null && "scope" in option && option.scope === "all" ? "all" : "named";
}

interface ValueIndex {
  readonly values: ReadonlyMap<string, ExportedLabel>;
  readonly routes: readonly (readonly [string, ExportedLabel])[];
}

function valueIndex(extended: ReadonlyMap<string, ExportedLabel>): ValueIndex {
  const entries = [...extended];
  return {
    values: new Map(entries.filter(([, owner]) => VALUE_KINDS.has(owner.kind) && owner.kind !== "route")),
    routes: entries.filter(([, owner]) => owner.kind === "route"),
  };
}

function reporter(context: OrbRuleContext): (node: TSESTree.Node, value: string, owner: ExportedLabel) => void {
  return (node, value, owner) =>
    context.report({
      node,
      message: `"${value}" is hand-copied: ${owner.module} exports it as ${owner.exportName}. Import it so the test follows the product.`,
    });
}

export function handCopiedLabelRule(labels: ReadonlyMap<string, ExportedLabel>, extended: ReadonlyMap<string, ExportedLabel> = new Map()): OrbRule {
  const { values, routes } = valueIndex(extended);
  return {
    meta: {
      type: "problem",
      schema: [{ type: "object", properties: { scope: { enum: ["named", "all"] } }, additionalProperties: false }],
    },
    create(context: OrbRuleContext): RuleVisitor {
      const all = scopeOf(context.options) === "all";
      const report = reporter(context);
      // A code, route or env key is asserted or sent wherever a test writes it, so every string site is judged.
      const judge = (node: TSESTree.Node, whole: string | null, head: string): void => {
        const owner = isValueSite(node) ? ((whole === null ? undefined : values.get(whole)) ?? routeOwner(whole ?? head, routes)) : undefined;
        if (owner !== undefined) {
          report(node, whole ?? head, owner);
        }
      };
      // The label an exported string names at a locator call: a label kind, never a code, route or env key.
      const locatorOwner = (value: string): ExportedLabel | undefined => {
        const extendedOwner = all ? extended.get(value) : undefined;
        return labels.get(value) ?? (VALUE_KINDS.has(extendedOwner?.kind) ? undefined : extendedOwner);
      };
      const judgeName = (name: TSESTree.Node): void => {
        for (const arm of nameArms(name)) {
          const value = staticTextValue(context, arm);
          const owner = typeof value === "string" ? locatorOwner(value) : undefined;
          if (typeof value === "string" && owner !== undefined) {
            report(arm, value, owner);
          }
        }
      };
      const helpers = helperNameTracker(context, judgeName);
      return {
        "CallExpression[callee.type='MemberExpression']"(call: TSESTree.CallExpression): void {
          const name = locatedName(call);
          if (name !== undefined) {
            judgeName(name);
            helpers.located(name);
          }
        },
        "CallExpression[callee.type='Identifier']"(call: TSESTree.CallExpression): void {
          helpers.called(call);
        },
        "Program:exit"(): void {
          helpers.finish();
        },
        "Literal:exit"(node: TSESTree.Literal): void {
          if (all && typeof node.value === "string") {
            judge(node, node.value, node.value);
          }
        },
        "TemplateLiteral:exit"(node: TSESTree.TemplateLiteral): void {
          const head = node.quasis[0]?.value.cooked ?? "";
          if (all) {
            judge(node, node.expressions.length === 0 ? head : null, head);
          }
        },
      };
    },
  };
}
