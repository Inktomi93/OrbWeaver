// The recipe each exported `@orb/ui` component applies: its own `tv()` axes and arms, limited to the axes it forwards, and what a
// migration must read to prove a move renders the same: axis order, defaults, compounds and the classes the door writes itself.
import { dirname } from "node:path";
import ts from "typescript";
import type { Source } from "./source.ts";
import { constInitializer, unwrap, visit } from "./source.ts";
import type { ArmClasses, ScaleIndex, ValueList } from "./variants.ts";
import { axesIn, classTokensOf, doorDirs, scaleIndex } from "./variants.ts";

const MAX_HOPS = 3;
const CLASS_NAME = "className";
const COMPOUND_LISTS = ["compoundVariants", "compoundSlots"] as const;
const STAMP_TUPLE = "STAMPED_VARIANT_AXES";

/** One `compoundVariants` entry. */
interface Compound {
  /** The axes its condition reads. */
  readonly reads: readonly string[];
  readonly tokens: readonly string[];
}

export interface ComponentRecipe {
  /** The axes the component forwards under the prop of the same name, with their arms. */
  readonly axes: ReadonlyMap<string, ArmClasses>;
  /** Every axis its tables declare, forwarded or not, in the order `tv()` writes them. */
  readonly declared: ReadonlyMap<string, ArmClasses>;
  /** The axes whose arm list the syntax could not fully read. */
  readonly unread: ReadonlySet<string>;
  /** Axis to the arm `defaultVariants` names. */
  readonly defaults: ReadonlyMap<string, string>;
  readonly compounds: readonly Compound[];
  /** A compound list holds something the syntax could not open. */
  readonly compoundsUnread: boolean;
  /** Axis to the classes the door writes beside that axis's table: its own literals and the base of any other table it applies. */
  readonly doorClasses: ReadonlyMap<string, readonly string[]>;
  /** The axes the door reads outside the call that applies its table: a prop that does more than write a class. */
  readonly sideReads: ReadonlySet<string>;
  /** The door hands the caller's `className` to the expression that applies its table. */
  readonly classNameApplied: boolean;
}

/** Door to component to the recipe that component applies. */
export type ComponentTables = ReadonlyMap<string, ReadonlyMap<string, ComponentRecipe>>;

interface ReadContext {
  readonly index: ScaleIndex;
  readonly stamped: ReadonlySet<string>;
}

interface Table {
  readonly axes: ReadonlyMap<string, ValueList>;
  readonly base: readonly string[];
  readonly defaults: ReadonlyMap<string, string>;
  readonly compounds: readonly Compound[];
  readonly compoundsUnread: boolean;
}

const isTvCall = (node: ts.Node): node is ts.CallExpression => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tv";
const COMPONENT_NAME = /^[A-Z]/u;

function configProperty(config: ts.ObjectLiteralExpression | undefined, name: string): ts.Expression | undefined {
  const found = config?.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText() === name);
  return found !== undefined && ts.isPropertyAssignment(found) ? found.initializer : undefined;
}

/** The entries of a compound list, through spreads and same-file consts; null for an element the syntax cannot open. */
function compoundEntries(expression: ts.Expression, hops: number): readonly ts.ObjectLiteralExpression[] | null {
  const node = unwrap(expression);
  if (ts.isObjectLiteralExpression(node)) {
    return [node];
  }
  if (ts.isArrayLiteralExpression(node)) {
    const parts = node.elements.map((element) => compoundEntries(ts.isSpreadElement(element) ? element.expression : element, hops));
    return parts.some((part) => part === null) ? null : parts.flatMap((part) => part ?? []);
  }
  const init = ts.isIdentifier(node) && hops < MAX_HOPS ? constInitializer(node.getSourceFile(), node.text) : null;
  return init === null ? null : compoundEntries(init, hops + 1);
}

function compoundOf(entry: ts.ObjectLiteralExpression, index: ScaleIndex): Compound {
  const isClass = (name: string): boolean => name === "class" || name === CLASS_NAME;
  const names = entry.properties.flatMap((property) => (ts.isSpreadAssignment(property) ? [] : [property.name.getText()]));
  const tokens = names.filter(isClass).flatMap((name) => {
    const value = configProperty(entry, name);
    return value === undefined ? [] : classTokensOf(value, index, 0);
  });
  return { reads: names.filter((name) => !isClass(name)), tokens };
}

function defaultsOf(config: ts.ObjectLiteralExpression | undefined): ReadonlyMap<string, string> {
  const object = configProperty(config, "defaultVariants");
  if (object === undefined || !ts.isObjectLiteralExpression(object)) {
    return new Map();
  }
  return new Map(
    object.properties.flatMap((property) =>
      ts.isPropertyAssignment(property) ? [[property.name.getText(), property.initializer.getText().replace(/^["'`]|["'`]$/gu, "")] as const] : [],
    ),
  );
}

function tableOf(call: ts.CallExpression, index: ScaleIndex): Table {
  const config = call.arguments.find(ts.isObjectLiteralExpression);
  const lists = COMPOUND_LISTS.flatMap((name) => {
    const value = configProperty(config, name);
    return value === undefined ? [] : [compoundEntries(value, 0)];
  });
  const slots = configProperty(config, "slots");
  const rootSlot = slots !== undefined && ts.isObjectLiteralExpression(slots) ? configProperty(slots, "root") : undefined;
  const base = configProperty(config, "base") ?? rootSlot;
  return {
    axes: axesIn(call, index),
    base: base === undefined ? [] : classTokensOf(base, index, 0),
    defaults: defaultsOf(config),
    compounds: lists.flatMap((list) => list ?? []).map((entry) => compoundOf(entry, index)),
    compoundsUnread: lists.some((list) => list === null),
  };
}

/** The `tv()` tables a variants file declares, by the name of the const that holds each. */
function tablesIn(sf: ts.SourceFile, index: ScaleIndex): ReadonlyMap<string, Table> {
  const tables = new Map<string, Table>();
  visit(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && isTvCall(node.initializer)) {
      tables.set(node.name.text, tableOf(node.initializer, index));
    }
  });
  return tables;
}

/** The exported or local components a file declares: an uppercase function, or an uppercase const holding a function. */
function componentsIn(sf: ts.SourceFile): readonly (readonly [string, ts.Node])[] {
  return sf.statements.flatMap((statement): readonly (readonly [string, ts.Node])[] => {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && COMPONENT_NAME.test(statement.name.text)) {
      return [[statement.name.text, statement]];
    }
    if (!ts.isVariableStatement(statement)) {
      return [];
    }
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) && COMPONENT_NAME.test(declaration.name.text) && declaration.initializer !== undefined
        ? [[declaration.name.text, declaration.initializer] as const]
        : [],
    );
  });
}

/**
 * The props a call hands on under their own name, read from its first object literal: a shorthand, or a name set to the same
 * identifier. A literal is the door's choice and a renamed value is another prop, so neither is forwarded. Null when the call
 * passes the whole props (a spread or no object).
 */
function forwardedBy(call: ts.CallExpression): ReadonlySet<string> | null {
  const object = call.arguments.find(ts.isObjectLiteralExpression);
  if (object === undefined || object.properties.some(ts.isSpreadAssignment)) {
    return null;
  }
  const names = object.properties.flatMap((property) => {
    const sameName = ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer) && property.initializer.text === property.name.getText();
    return ts.isShorthandPropertyAssignment(property) || sameName ? [property.name.getText()] : [];
  });
  return new Set(names);
}

/** The call that applies a table: `fooVariants({ ... })`, or `helper(fooVariants, { ... })`. */
function applyingCall(identifier: ts.Identifier): ts.CallExpression | null {
  const parent = identifier.parent;
  return ts.isCallExpression(parent) ? parent : null;
}

/** The whole expression a call sits in: one element attribute, one declaration or one statement, where a door writes the class beside it. */
function holderOf(call: ts.CallExpression): ts.Node {
  let node: ts.Node = call;
  while (!(ts.isJsxAttribute(node) || ts.isJsxSpreadAttribute(node) || ts.isVariableDeclaration(node) || ts.isStatement(node) || ts.isSourceFile(node))) {
    node = node.parent;
  }
  return node;
}

function namesClassName(holder: ts.Node): boolean {
  let found = false;
  visit(holder, (node) => {
    found ||= ts.isIdentifier(node) && node.text === CLASS_NAME;
  });
  return found;
}

/** The names the body reads outside the given calls: not a binding, a property key, a member name or an attribute name. */
function readsOutside(body: ts.Node, calls: readonly ts.CallExpression[]): ReadonlySet<string> {
  const reads = new Set<string>();
  const inCall = (node: ts.Node): boolean => calls.some((call) => node.pos >= call.pos && node.end <= call.end);
  visit(body, (node) => {
    const parent = node.parent;
    const naming =
      ts.isBindingElement(parent) ||
      (ts.isPropertyAssignment(parent) && parent.name === node) ||
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      ts.isJsxAttribute(parent);
    if (ts.isIdentifier(node) && !naming && !inCall(node)) {
      reads.add(node.text);
    }
  });
  return reads;
}

interface Applied {
  readonly name: string;
  readonly table: Table;
  readonly call: ts.CallExpression | null;
}

function appliedTables(body: ts.Node, tables: ReadonlyMap<string, Table>): readonly Applied[] {
  const applied: Applied[] = [];
  visit(body, (node) => {
    const table = ts.isIdentifier(node) ? tables.get(node.text) : undefined;
    if (ts.isIdentifier(node) && table !== undefined) {
      applied.push({ name: node.text, table, call: applyingCall(node) });
    }
  });
  return applied;
}

/** The axis names `STAMPED_VARIANT_AXES` lists, read from its source: a table applied through a helper stamps these as `data-*` attributes. */
function stampedAxes(sources: readonly Source[]): ReadonlySet<string> {
  const tuple = sources.flatMap((source) => (source.sf === null ? [] : [constInitializer(source.sf, STAMP_TUPLE)])).find((init) => init !== null);
  return new Set(tuple !== undefined && ts.isArrayLiteralExpression(tuple) ? tuple.elements.filter(ts.isStringLiteral).map((item) => item.text) : []);
}

/** What one component applies: the axes it forwards, and the facts a move onto one of them is proved against. */
function recipeOf(body: ts.Node, { index, stamped }: ReadContext, tables: ReadonlyMap<string, Table>): ComponentRecipe {
  const applied = appliedTables(body, tables);
  const calls = applied.flatMap(({ call }) => (call === null ? [] : [call]));
  const throughHelper = calls.some((call) => !tables.has(call.expression.getText()));
  const reads = new Set([...readsOutside(body, calls), ...(throughHelper ? stamped : [])]);
  const literals = classTokensOf(body, index, 0);
  const axes = new Map<string, ArmClasses>();
  const declared = new Map<string, ArmClasses>();
  const unread = new Set<string>();
  const doorClasses = new Map<string, readonly string[]>();
  for (const { name, table, call } of applied) {
    const forwarded = call === null ? null : forwardedBy(call);
    const otherBases = applied.filter((other) => other.name !== name).flatMap((other) => other.table.base);
    for (const [axis, list] of table.axes) {
      declared.set(axis, list.arms);
      doorClasses.set(axis, [...literals, ...otherBases]);
      if (list.unread) {
        unread.add(axis);
      }
      if (forwarded === null || forwarded.has(axis)) {
        axes.set(axis, list.arms);
      }
    }
  }
  return {
    axes,
    declared,
    unread,
    defaults: new Map(applied.flatMap(({ table }) => [...table.defaults])),
    compounds: applied.flatMap(({ table }) => table.compounds),
    compoundsUnread: applied.some(({ table }) => table.compoundsUnread),
    doorClasses,
    sideReads: new Set([...declared.keys()].filter((axis) => reads.has(axis))),
    classNameApplied: calls.some((call) => namesClassName(holderOf(call))),
  };
}

/** The components of one door directory, each with the axes its own table writes and it forwards. */
function doorComponents(inDoor: readonly Source[], context: ReadContext): ReadonlyMap<string, ComponentRecipe> {
  const tables = new Map<string, Table>();
  for (const source of inDoor.filter((candidate) => /variants\.ts$/u.test(candidate.path))) {
    for (const [name, table] of source.sf === null ? [] : tablesIn(source.sf, context.index)) {
      tables.set(name, table);
    }
  }
  const components = new Map<string, ComponentRecipe>();
  for (const source of inDoor.filter((candidate) => candidate.path.endsWith(".tsx"))) {
    for (const [name, body] of source.sf === null ? [] : componentsIn(source.sf)) {
      const recipe = recipeOf(body, context, tables);
      if (recipe.axes.size > 0) {
        components.set(name, recipe);
      }
    }
  }
  return components;
}

/**
 * Per door and component, the recipe the component's own `tv()` tables give it. A component that applies no table in its own file,
 * such as one that renders another door's core, has no entry.
 */
export function componentTables(root: string, sources: readonly Source[]): ComponentTables {
  const context: ReadContext = { index: scaleIndex(sources), stamped: stampedAxes(sources) };
  const result = new Map<string, ReadonlyMap<string, ComponentRecipe>>();
  for (const [door, dir] of doorDirs(root)) {
    const components = doorComponents(
      sources.filter((source) => source.layer === "ui" && source.sf !== null && dirname(source.path) === dir),
      context,
    );
    if (components.size > 0) {
      result.set(door, components);
    }
  }
  return result;
}
