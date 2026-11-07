// The recipe each exported `@orb/ui` component applies: its own `tv()` axes and arms, limited to the axes it forwards, and what a
// migration must read to prove a move renders the same: axis order, defaults, compounds and the classes the door writes itself.
import { dirname } from "node:path";
import ts from "typescript";
import { isJoinerCall, opaqueIn, readClassExpression } from "./class-expression.ts";
import type { Source } from "./source.ts";
import { constInitializer, unwrap, visit } from "./source.ts";
import type { ArmClasses, ScaleIndex, ValueList } from "./variants.ts";
import { axesIn, classTokensOf, doorDirs, readClasses, scaleIndex } from "./variants.ts";

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
  /** The axes the door reads outside a plain hand-on in the call that applies its table: a prop that does more than write a class. */
  readonly sideReads: ReadonlySet<string>;
  /** Axis to why the door around it could not be read whole: an axis with an entry moves nothing. */
  readonly doorRefusals: ReadonlyMap<string, string>;
  /** Axis to the arm the door itself passes, or null for a value it computes; the caller's prop never reaches such an axis. */
  readonly chosen: ReadonlyMap<string, string | null>;
  /** Axis to the prop that carries it: the door reads it as a member of that prop (`size: scale?.size`), so a wrapper hands it on inside that prop. */
  readonly carried: ReadonlyMap<string, string>;
  /** The tables the door applies, as their exporting file and name, so a check can call the real recipes. */
  readonly applied: readonly TableRef[];
}

interface TableRef {
  readonly file: string;
  readonly name: string;
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
  /** Why a door on this table cannot be proved: an `extend`, a config that is no object literal, or a base with an unread name. */
  readonly unread: string | null;
  readonly file: string;
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

const isClassKey = (name: string): boolean => name === "class" || name === CLASS_NAME;

function compoundOf(entry: ts.ObjectLiteralExpression, index: ScaleIndex): Compound {
  const names = entry.properties.flatMap((property) => (ts.isSpreadAssignment(property) ? [] : [property.name.getText()]));
  const tokens = names.filter(isClassKey).flatMap((name) => {
    const value = configProperty(entry, name);
    return value === undefined ? [] : classTokensOf(value, index, 0);
  });
  return { reads: names.filter((name) => !isClassKey(name)), tokens };
}

const compoundUnread = (entry: ts.ObjectLiteralExpression, index: ScaleIndex): boolean =>
  entry.properties.some((property) => ts.isSpreadAssignment(property) || (isClassKey(property.name.getText()) && readClasses(property, index, 0).unread));

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

function tableUnread(config: ts.ObjectLiteralExpression | undefined, base: ts.Expression | undefined, index: ScaleIndex): string | null {
  if (config === undefined || config.properties.some(ts.isSpreadAssignment)) {
    return "its tv() config is not one object literal";
  }
  if (configProperty(config, "extend") !== undefined) {
    return "its tv() extends another table";
  }
  return base !== undefined && readClasses(base, index, 0).unread ? "its base holds a name the reader cannot resolve" : null;
}

function tableOf(call: ts.CallExpression, index: ScaleIndex, file: string): Table {
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
    compoundsUnread: lists.some((list) => list === null || list.some((entry) => compoundUnread(entry, index))),
    unread: tableUnread(config, base, index),
    file,
  };
}

/** The `tv()` tables a variants file declares, by the name of the const that holds each. */
function tablesIn(sf: ts.SourceFile, index: ScaleIndex, file: string): ReadonlyMap<string, Table> {
  const tables = new Map<string, Table>();
  visit(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && isTvCall(node.initializer)) {
      tables.set(node.name.text, tableOf(node.initializer, index, file));
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

const isHandOn = (property: ts.ObjectLiteralElementLike): boolean =>
  ts.isShorthandPropertyAssignment(property) ||
  (ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer) && property.initializer.text === property.name.getText());

function literalArm(value: ts.Expression): string | null {
  if (ts.isStringLiteralLike(value)) {
    return value.text;
  }
  return value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword ? value.getText() : null;
}

/** The props a call hands on under their own name. A literal is the door's choice and a renamed value is another prop, so neither is forwarded. */
function forwardedBy(object: ts.ObjectLiteralExpression | undefined): ReadonlySet<string> {
  return new Set(object?.properties.flatMap((property) => (isHandOn(property) && property.name !== undefined ? [property.name.getText()] : [])));
}

/** What the door itself passes in a call: a literal arm, or null for a value it computes. */
const chosenIn = (object: ts.ObjectLiteralExpression | undefined): readonly (readonly [string, string | null])[] =>
  (object?.properties ?? []).flatMap((property) =>
    ts.isPropertyAssignment(property) && !isHandOn(property) && property.name.getText() !== CLASS_NAME
      ? [[property.name.getText(), literalArm(unwrap(property.initializer))] as const]
      : [],
  );

/** The axes a call reads as the same-named member of one identifier, with that identifier. */
const carriedIn = (object: ts.ObjectLiteralExpression | undefined): readonly (readonly [string, string])[] =>
  (object?.properties ?? []).flatMap((property) => {
    const value = ts.isPropertyAssignment(property) ? unwrap(property.initializer) : undefined;
    return value !== undefined && ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression) && value.name.text === property.name?.getText()
      ? [[value.name.text, value.expression.text] as const]
      : [];
  });

const firstFunction = (body: ts.Node): ts.SignatureDeclaration | undefined => {
  let found: ts.SignatureDeclaration | undefined;
  visit(body, (node) => {
    found ??= ts.isFunctionLike(node) ? node : undefined;
  });
  return found;
};

/** The name a function gives its whole props object, when its first parameter is not a pattern. */
const propsName = (fn: ts.SignatureDeclaration | undefined): string | undefined => {
  const name = fn?.parameters[0]?.name;
  return name !== undefined && ts.isIdentifier(name) ? name.text : undefined;
};

const bodyOf = (fn: ts.SignatureDeclaration): ts.Node => ("body" in fn && fn.body !== undefined ? fn.body : fn);

/** Whether the body holds the props object other than by a destructuring, a member or element read, or an `in` test: any other read hands it on whole. */
function readsPropsWhole(fn: ts.SignatureDeclaration, name: string): boolean {
  let whole = false;
  visit(bodyOf(fn), (node) => {
    const parent = node.parent;
    const named =
      ts.isVariableDeclaration(parent) ||
      (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
      (ts.isElementAccessExpression(parent) && parent.expression === node) ||
      (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.InKeyword && parent.right === node);
    whole ||= ts.isIdentifier(node) && node.text === name && !named && !ts.isParameter(parent);
  });
  return whole;
}

/**
 * The pattern a function takes its props through: its first parameter, or the destructuring of a first parameter named in its body
 * (`const { a, b, ...rest } = props`) when that is the only way the body holds the object whole.
 */
function propsPattern(fn: ts.SignatureDeclaration | undefined): ts.ObjectBindingPattern | undefined {
  const name = fn?.parameters[0]?.name;
  if (fn === undefined || name === undefined) {
    return undefined;
  }
  if (ts.isObjectBindingPattern(name)) {
    return name;
  }
  if (ts.isArrayBindingPattern(name) || readsPropsWhole(fn, name.getText())) {
    return undefined;
  }
  let pattern: ts.ObjectBindingPattern | undefined;
  visit(bodyOf(fn), (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === name.getText()
    ) {
      pattern ??= node.name;
    }
  });
  return pattern;
}

/** The door's parameter defaults, read from its destructured props: null when it takes the props whole. */
function paramDefaults(body: ts.Node): ReadonlyMap<string, string | null> | null {
  const found = firstFunction(body);
  const pattern = propsPattern(found);
  if (pattern === undefined) {
    return found?.parameters.length === 0 ? new Map() : null;
  }
  return new Map(
    pattern.elements.flatMap((element) =>
      element.initializer !== undefined && ts.isIdentifier(element.name) ? [[element.name.text, literalArm(unwrap(element.initializer))] as const] : [],
    ),
  );
}

const carriesClassName = (expression: ts.Expression): boolean => {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    const local = node.text === CLASS_NAME ? null : localConst(node);
    return node.text === CLASS_NAME || (local !== null && carriesClassName(local));
  }
  const last = isJoinerCall(node) ? node.arguments.at(-1) : undefined;
  return last !== undefined && carriesClassName(last);
};

/** A const declared in the name's own function; `constInitializer` holds only the file's top level. */
function localConst(name: ts.Identifier): ts.Expression | null {
  let scope: ts.Node = name;
  while (!(ts.isFunctionLike(scope) || ts.isSourceFile(scope))) {
    scope = scope.parent;
  }
  const declarations: ts.VariableDeclaration[] = [];
  visit(scope, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name.text) {
      declarations.push(node);
    }
  });
  return declarations[0]?.initializer ?? null;
}

/** The joiners a table's call sits inside, nearest first: where the door writes classes beside it. */
function joinersAround(call: ts.CallExpression): readonly ts.CallExpression[] {
  const joiners: ts.CallExpression[] = [];
  for (let node: ts.Node = call; isJoinerCall(node.parent) || ts.isParenthesizedExpression(node.parent); node = node.parent) {
    if (isJoinerCall(node.parent)) {
      joiners.push(node.parent);
    }
  }
  return joiners;
}

const CLASS_HELPER = "variantProps";
const CLASS_NAME_DROPPED = "the door does not hand className to the call that applies its recipe";

/**
 * Why the class would not land where the arm does, or null. `className` must render last: in the call that applies the table, or as the
 * last argument of a joiner around it. Every other argument of those joiners must read closed, or the door can write what nobody sees.
 */
function classNameRefusal(call: ts.CallExpression, object: ts.ObjectLiteralExpression | undefined): string | null {
  const joiners = joinersAround(call);
  const beside = joiners.flatMap((joiner) => joiner.arguments.filter((argument) => !(argument.pos <= call.pos && argument.end >= call.end)));
  const opaque = beside.filter((argument) => !carriesClassName(argument)).map((argument) => opaqueIn(readClassExpression(argument)));
  const held = opaque.find((text) => text !== null);
  if (held !== undefined) {
    return `the door writes ${held}, which the reader cannot open`;
  }
  const passed = object?.properties.find((property) => property.name?.getText() === CLASS_NAME);
  const inCall =
    passed !== undefined && (ts.isShorthandPropertyAssignment(passed) || (ts.isPropertyAssignment(passed) && carriesClassName(passed.initializer)));
  // `variantProps(table, selection, className, tone)` joins the class after the recipe, as a joiner would.
  const atEnd = call.expression.getText() === CLASS_HELPER && call.arguments[2] !== undefined && carriesClassName(call.arguments[2]);
  const outer = joiners.at(-1)?.arguments.at(-1);
  return inCall || atEnd || (outer !== undefined && carriesClassName(outer)) ? null : CLASS_NAME_DROPPED;
}

/** The call that applies a table: `fooVariants({ ... })`, or `helper(fooVariants, { ... })`. */
function applyingCall(identifier: ts.Identifier): ts.CallExpression | null {
  const parent = identifier.parent;
  return ts.isCallExpression(parent) ? parent : null;
}

/** The names the body reads outside a plain hand-on in the given calls: not a binding, a property key, a member name or an attribute name. */
function readsOutside(body: ts.Node, calls: readonly ts.CallExpression[]): ReadonlySet<string> {
  const reads = new Set<string>();
  const holder = propsName(firstFunction(body));
  const handOns = calls.flatMap((call) => call.arguments.filter(ts.isObjectLiteralExpression).flatMap((object) => object.properties.filter(isHandOn)));
  const inCall = (node: ts.Node): boolean => handOns.some((handOn) => node.pos >= handOn.pos && node.end <= handOn.end);
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
    // `props.justify` and `props["justify"]` read the prop by name.
    if (holder !== undefined && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === holder) {
      reads.add(node.name.text);
    }
    if (
      holder !== undefined &&
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === holder &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      reads.add(node.argumentExpression.text);
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
function axisRefusal(axis: string, { table, call }: Applied, others: readonly Applied[]): string | null {
  const object = call?.arguments.find(ts.isObjectLiteralExpression);
  if (call === null || object === undefined) {
    return "the door does not apply its table through a call with one props object";
  }
  if (object.properties.some(ts.isSpreadAssignment)) {
    return "a spread in the call that applies the table can carry any axis";
  }
  if (others.some((other) => other.table.axes.has(axis))) {
    return `two tables the door applies both declare ${axis}`;
  }
  return table.unread ?? others.map((other) => other.table.unread).find((reason) => reason !== null) ?? classNameRefusal(call, object);
}

/** The caller's prop of this name reaches the table: a plain hand-on, or a call that passes everything. */
function handedOn(axis: string, { call }: Applied): boolean {
  const object = call?.arguments.find(ts.isObjectLiteralExpression);
  return object === undefined || object.properties.some(ts.isSpreadAssignment) || forwardedBy(object).has(axis);
}

const PROPS_WHOLE = "the door takes its props whole, so its reads of them are not visible";

function recipeOf(body: ts.Node, { index, stamped }: ReadContext, tables: ReadonlyMap<string, Table>): ComponentRecipe {
  const applied = appliedTables(body, tables);
  const params = paramDefaults(body);
  const paramEntries = [...(params ?? [])];
  const calls = applied.flatMap(({ call }) => (call === null ? [] : [call]));
  const throughHelper = calls.some((call) => !tables.has(call.expression.getText()));
  const reads = new Set([...readsOutside(body, calls), ...(throughHelper ? stamped : [])]);
  const literals = classTokensOf(body, index, 0);
  const axisRows = applied.flatMap((one) => [...one.table.axes].map(([axis, list]) => ({ axis, list, one })));
  const others = (one: Applied): readonly Applied[] => applied.filter((other) => other.name !== one.name);
  const axes = new Map(axisRows.filter(({ axis, one }) => handedOn(axis, one)).map(({ axis, list }) => [axis, list.arms]));
  const declared = new Map(axisRows.map(({ axis, list }) => [axis, list.arms]));
  const unread = new Set(axisRows.filter(({ list }) => list.unread).map(({ axis }) => axis));
  const doorClasses = new Map(axisRows.map(({ axis, one }) => [axis, [...literals, ...others(one).flatMap((other) => other.table.base)]]));
  const doorRefusals = new Map(
    axisRows.flatMap(({ axis, one }) => {
      const refused = params === null ? PROPS_WHOLE : axisRefusal(axis, one, others(one));
      return refused === null ? [] : [[axis, refused] as const];
    }),
  );
  const chosen = applied.flatMap(({ call }) => chosenIn(call?.arguments.find(ts.isObjectLiteralExpression)));
  return {
    axes,
    declared,
    unread,
    defaults: new Map([
      ...applied.flatMap(({ table }) => [...table.defaults]),
      ...paramEntries.flatMap(([axis, arm]) => (arm === null ? [] : [[axis, arm] as const])),
    ]),
    compounds: applied.flatMap(({ table }) => table.compounds),
    compoundsUnread: applied.some(({ table }) => table.compoundsUnread),
    doorClasses,
    sideReads: new Set([...declared.keys()].filter((axis) => reads.has(axis))),
    doorRefusals,
    chosen: new Map([...chosen, ...paramEntries.filter(([, arm]) => arm === null)]),
    carried: new Map(applied.flatMap(({ call }) => carriedIn(call?.arguments.find(ts.isObjectLiteralExpression)))),
    applied: [...new Map(applied.map(({ name, table }) => [name, { file: table.file, name }])).values()],
  };
}

/** The props a component destructures, by name. */
function destructuredNames(body: ts.Node): ReadonlySet<string> {
  const pattern = propsPattern(firstFunction(body));
  return new Set(pattern === undefined ? [] : pattern.elements.flatMap((element) => (ts.isIdentifier(element.name) ? [element.name.text] : [])));
}

/**
 * The recipe of a component that applies no table of its own and renders one component of its door with the rest of its props
 * (`<ButtonCore {...rest} />`): the rendered component's axes, less any the wrapper takes itself and does not hand on under their own name.
 */
function wrapperRecipe(body: ts.Node, components: ReadonlyMap<string, ComponentRecipe>): ComponentRecipe | undefined {
  const rendered: ts.JsxSelfClosingElement[] = [];
  visit(body, (node) => {
    if (ts.isJsxSelfClosingElement(node) && components.has(node.tagName.getText()) && node.attributes.properties.some(ts.isJsxSpreadAttribute)) {
      rendered.push(node);
    }
  });
  const [element] = rendered;
  const core = element === undefined ? undefined : components.get(element.tagName.getText());
  if (element === undefined || core === undefined || rendered.length !== 1) {
    return undefined;
  }
  const passedByName = new Set(
    element.attributes.properties.flatMap((attribute) =>
      ts.isJsxAttribute(attribute) &&
      attribute.initializer !== undefined &&
      ts.isJsxExpression(attribute.initializer) &&
      attribute.initializer.expression?.getText() === attribute.name.getText()
        ? [attribute.name.getText()]
        : [],
    ),
  );
  const taken = [...destructuredNames(body)].filter((name) => !passedByName.has(name));
  const handed = handedInside(element, core);
  const params = [...(paramDefaults(body) ?? [])].flatMap(([axis, arm]) => (arm === null ? [] : [[axis, arm] as const]));
  return {
    ...core,
    axes: new Map([...core.declared].filter(([axis]) => handed.has(axis) || (core.axes.has(axis) && !taken.includes(axis)))),
    chosen: new Map([...core.chosen].filter(([axis]) => !handed.has(axis))),
    defaults: new Map([...core.defaults, ...params]),
  };
}

/** The axes a wrapper hands on inside the prop that carries them (`scale={{ size, square }}`): the caller's own prop reaches each one. */
function handedInside(element: ts.JsxSelfClosingElement, core: ComponentRecipe): ReadonlySet<string> {
  return new Set(
    element.attributes.properties.flatMap((attribute) => {
      const value =
        ts.isJsxAttribute(attribute) && attribute.initializer !== undefined && ts.isJsxExpression(attribute.initializer)
          ? attribute.initializer.expression
          : undefined;
      const object = value === undefined ? undefined : unwrap(value);
      return object !== undefined && ts.isObjectLiteralExpression(object)
        ? [...forwardedBy(object)].filter((axis) => core.carried.get(axis) === attribute.name?.getText())
        : [];
    }),
  );
}

const componentsOf = (inDoor: readonly Source[]): readonly (readonly [string, ts.Node])[] =>
  inDoor.filter((candidate) => candidate.path.endsWith(".tsx")).flatMap((source) => (source.sf === null ? [] : componentsIn(source.sf)));

/** The components of one door directory, each with the axes its own table writes and it forwards. */
function doorComponents(inDoor: readonly Source[], context: ReadContext): ReadonlyMap<string, ComponentRecipe> {
  const tables = new Map<string, Table>();
  for (const source of inDoor.filter((candidate) => /variants\.ts$/u.test(candidate.path))) {
    for (const [name, table] of source.sf === null ? [] : tablesIn(source.sf, context.index, source.path)) {
      tables.set(name, table);
    }
  }
  const components = new Map<string, ComponentRecipe>();
  for (const [name, body] of componentsOf(inDoor)) {
    const recipe = recipeOf(body, context, tables);
    if (recipe.axes.size > 0) {
      components.set(name, recipe);
    }
  }
  // A door export that wraps another component of the door (`Button` over `ButtonCore`) owns that component's axes.
  for (const [name, body] of componentsOf(inDoor).filter(([declared]) => !components.has(declared))) {
    const wrapped = wrapperRecipe(body, components);
    if (wrapped !== undefined && wrapped.axes.size > 0) {
      components.set(name, wrapped);
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
