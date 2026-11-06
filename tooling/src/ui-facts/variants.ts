// Variant census: the axes and values each door declares, and for each the values the client writes and at how many sites.
// A literal counts as written. So does a value reached through a same-file const map, a conditional or a `??`/`||` of literals.
// What the syntax cannot reach (a prop, a call, an import) is counted per reason, and an axis with any such use cannot claim a value unused.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";
import type { FileFacts } from "./file-facts.ts";
import type { Elem, Source } from "./source.ts";
import { constInitializer, unwrap, visit } from "./source.ts";

const MAX_HOPS = 3;

const DOOR_EXPORT = /^\.\/([^/]+)$/u;

/** door name to its directory under packages/ui/src, from the package exports map. */
function doorDirs(root: string): ReadonlyMap<string, string> {
  const pkg = JSON.parse(readFileSync(join(root, "packages/ui/package.json"), "utf8")) as { readonly exports: Readonly<Record<string, unknown>> };
  const map = new Map<string, string>();
  for (const [key, target] of Object.entries(pkg.exports)) {
    const door = DOOR_EXPORT.exec(key)?.[1];
    if (door !== undefined && typeof target === "string") {
      map.set(door, dirname(join("packages/ui", target)));
    }
  }
  return map;
}

interface ValueList {
  readonly values: readonly string[];
  /** A spread or an expression the syntax could not open: the list may be short. */
  readonly unread: boolean;
}

/** Top-level exported object consts of the ui layer by name; null where two files export the same name. */
type ScaleIndex = ReadonlyMap<string, ts.ObjectLiteralExpression | null>;

function exportedConsts(sf: ts.SourceFile): readonly (readonly [string, ts.Expression])[] {
  return sf.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) =>
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
        ? statement.declarationList.declarations.flatMap((declaration) =>
            ts.isIdentifier(declaration.name) && declaration.initializer !== undefined
              ? [[declaration.name.text, unwrap(declaration.initializer)] as const]
              : [],
          )
        : [],
    );
}

function scaleIndex(sources: readonly Source[]): ScaleIndex {
  const index = new Map<string, ts.ObjectLiteralExpression | null>();
  for (const source of sources) {
    for (const [name, init] of source.layer === "ui" && source.sf !== null ? exportedConsts(source.sf) : []) {
      if (ts.isObjectLiteralExpression(init)) {
        index.set(name, index.has(name) ? null : init);
      }
    }
  }
  return index;
}

/** The object literal an expression stands for: itself, a const of it (this file, else a unique ui export), or the first argument of a call. */
function objectOf(expression: ts.Expression, index: ScaleIndex, hops: number): ts.ObjectLiteralExpression | null {
  const node = unwrap(expression);
  if (ts.isObjectLiteralExpression(node)) {
    return node;
  }
  if (hops >= MAX_HOPS) {
    return null;
  }
  if (ts.isIdentifier(node)) {
    const local = constInitializer(node.getSourceFile(), node.text);
    return local === null ? (index.get(node.text) ?? null) : objectOf(local, index, hops + 1);
  }
  const first = ts.isCallExpression(node) ? node.arguments[0] : undefined;
  return first === undefined ? null : objectOf(first, index, hops + 1);
}

function keysOf(object: ts.ObjectLiteralExpression, index: ScaleIndex, hops: number): ValueList {
  const sf = object.getSourceFile();
  const parts = object.properties.map((property): ValueList => {
    if (ts.isSpreadAssignment(property)) {
      const inner = hops < MAX_HOPS ? objectOf(property.expression, index, hops + 1) : null;
      return inner === null ? { values: [], unread: true } : keysOf(inner, index, hops + 1);
    }
    return { values: [property.name.getText(sf).replace(/^["']|["']$/gu, "")], unread: ts.isMethodDeclaration(property) };
  });
  return { values: parts.flatMap((part) => part.values), unread: parts.some((part) => part.unread) };
}

function axesIn(sf: ts.SourceFile, index: ScaleIndex): ReadonlyMap<string, ValueList> {
  const axes = new Map<string, ValueList>();
  visit(sf, (node) => {
    if (!(ts.isPropertyAssignment(node) && node.name.getText(sf) === "variants" && ts.isObjectLiteralExpression(node.initializer))) {
      return;
    }
    for (const axis of node.initializer.properties) {
      if (!ts.isPropertyAssignment(axis)) {
        continue;
      }
      const name = axis.name.getText(sf);
      const object = objectOf(axis.initializer, index, 0);
      const read: ValueList = object === null ? { values: [], unread: true } : keysOf(object, index, 0);
      const before = axes.get(name);
      axes.set(name, { values: [...(before?.values ?? []), ...read.values], unread: read.unread || before?.unread === true });
    }
  });
  return axes;
}

export interface DeclaredVariants {
  /** Door to axis to the values its `tv` calls declare. */
  readonly axes: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  /** A door whose components render another door's `core.tsx`, to that door: their attributes write the owner's axes. */
  readonly carriers: ReadonlyMap<string, string>;
  /** `door.axis` of every declared axis whose values the syntax could not fully read: its census is a lower bound. */
  readonly unread: readonly string[];
}

function doorAxes(
  door: string,
  files: readonly Source[],
  index: ScaleIndex,
): { readonly axes: ReadonlyMap<string, readonly string[]>; readonly unread: readonly string[] } {
  const merged = new Map<string, string[]>();
  const unread: string[] = [];
  for (const source of files) {
    for (const [axis, list] of source.sf === null ? [] : axesIn(source.sf, index)) {
      merged.set(axis, [...new Set([...(merged.get(axis) ?? []), ...list.values])]);
      if (list.unread) {
        unread.push(`${door}.${axis}`);
      }
    }
  }
  return { axes: merged, unread };
}

const CORE_IMPORT = /^\.\.\/([^/]+)\/core\.tsx$/u;

/** The sibling directories whose `core.tsx` the file imports. */
function coreImports(sf: ts.SourceFile): readonly string[] {
  return sf.statements.flatMap((statement) => {
    const name =
      ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) ? CORE_IMPORT.exec(statement.moduleSpecifier.text)?.[1] : undefined;
    return name === undefined ? [] : [name];
  });
}

const doorAt = (dirs: ReadonlyMap<string, string>, dir: string): string | undefined => [...dirs].find(([, candidate]) => candidate === dir)?.[0];

/** Door to the door whose `core.tsx` its files import: GlyphButton, InlineAction and PictureButton render the button core. */
function coreCarriers(sources: readonly Source[], dirs: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const carriers = new Map<string, string>();
  for (const source of sources) {
    const door = source.layer === "ui" && source.sf !== null ? doorAt(dirs, dirname(source.path)) : undefined;
    for (const name of door === undefined || source.sf === null ? [] : coreImports(source.sf)) {
      const owner = doorAt(dirs, join(dirname(source.path), "..", name));
      if (door !== undefined && owner !== undefined && owner !== door) {
        carriers.set(door, owner);
      }
    }
  }
  return carriers;
}

/** Declared variant axes and values per door, read from the `tv` calls in the door directory's variants files. */
export function declaredVariants(root: string, sources: readonly Source[]): DeclaredVariants {
  const index = scaleIndex(sources);
  const axes = new Map<string, ReadonlyMap<string, readonly string[]>>();
  const unread = new Set<string>();
  const dirs = doorDirs(root);
  for (const [door, dir] of dirs) {
    const files = sources.filter((source) => source.layer === "ui" && dirname(source.path) === dir && /variants\.ts$/u.test(source.path));
    const read = doorAxes(door, files, index);
    if (read.axes.size > 0) {
      axes.set(door, read.axes);
    }
    for (const entry of read.unread) {
      unread.add(entry);
    }
  }
  return { axes, carriers: coreCarriers(sources, dirs), unread: [...unread] };
}

interface Resolution {
  readonly values: readonly string[];
  readonly reasons: readonly string[];
}

const NONE: Resolution = { values: [], reasons: [] };
const merge = (...parts: readonly Resolution[]): Resolution => ({
  values: parts.flatMap((part) => part.values),
  reasons: parts.flatMap((part) => part.reasons),
});
const unresolved = (reason: string): Resolution => ({ values: [], reasons: [reason] });

function literalOf(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return "true";
  }
  return node.kind === ts.SyntaxKind.FalseKeyword ? "false" : null;
}

function mapEntries(object: ts.ObjectLiteralExpression, key: string | null, sf: ts.SourceFile, hops: number): Resolution {
  const parts = object.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return [unresolved("map entry that is not a plain property")];
    }
    const name = property.name.getText(sf).replace(/^["']|["']$/gu, "");
    return key === null || key === name ? [resolve(property.initializer, sf, hops + 1)] : [];
  });
  return merge(NONE, ...parts);
}

function resolveMapLookup(node: ts.PropertyAccessExpression | ts.ElementAccessExpression, sf: ts.SourceFile, hops: number): Resolution {
  const target = unwrap(node.expression);
  const object = ts.isIdentifier(target) ? constInitializer(sf, target.text) : null;
  if (object === null || !ts.isObjectLiteralExpression(object)) {
    return unresolved("lookup in a map that is not a same-file const object");
  }
  if (ts.isPropertyAccessExpression(node)) {
    return mapEntries(object, node.name.text, sf, hops);
  }
  const arg = unwrap(node.argumentExpression);
  return mapEntries(object, literalOf(arg), sf, hops);
}

function resolveBinary(node: ts.BinaryExpression, sf: ts.SourceFile, hops: number): Resolution {
  const op = node.operatorToken.kind;
  if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
    return resolve(node.right, sf, hops);
  }
  if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
    return merge(resolve(node.left, sf, hops), resolve(node.right, sf, hops));
  }
  return unresolved("binary expression");
}

function resolveIdentifier(node: ts.Identifier, sf: ts.SourceFile, hops: number): Resolution {
  const init = hops >= MAX_HOPS ? null : constInitializer(sf, node.text);
  return init === null ? unresolved("identifier from a prop, parameter or import") : resolve(init, sf, hops + 1);
}

/** The string values an expression can take, and the reasons any branch of it could not be read. */
function resolve(expression: ts.Expression, sf: ts.SourceFile, hops: number): Resolution {
  const node = unwrap(expression);
  const literal = literalOf(node);
  if (literal !== null) {
    return { values: [literal], reasons: [] };
  }
  if (ts.isConditionalExpression(node)) {
    return merge(resolve(node.whenTrue, sf, hops), resolve(node.whenFalse, sf, hops));
  }
  if (ts.isBinaryExpression(node)) {
    return resolveBinary(node, sf, hops);
  }
  if (ts.isIdentifier(node)) {
    return resolveIdentifier(node, sf, hops);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return resolveMapLookup(node, sf, hops);
  }
  if (ts.isTemplateExpression(node)) {
    return unresolved("template with substitutions");
  }
  return unresolved(ts.isCallExpression(node) ? "call" : ts.SyntaxKind[node.kind]);
}

function attributeResolution(elem: Elem, name: string, sf: ts.SourceFile): { readonly resolution: Resolution; readonly direct: boolean } | null {
  const attribute = elem.attrs.get(name);
  if (attribute === undefined) {
    return null;
  }
  const init = attribute.initializer;
  if (init === undefined) {
    return { resolution: { values: ["true"], reasons: [] }, direct: true };
  }
  const expression = ts.isJsxExpression(init) ? init.expression : init;
  if (expression === undefined || !ts.isExpression(expression)) {
    return { resolution: unresolved("empty expression"), direct: false };
  }
  return { resolution: resolve(expression, sf, 0), direct: literalOf(unwrap(expression)) !== null };
}

function objectAxis(object: ts.ObjectLiteralExpression, axis: string, sf: ts.SourceFile, hops: number): Resolution {
  const parts = object.properties.map((property): Resolution => {
    if (ts.isSpreadAssignment(property)) {
      return resolveSpread(property.expression, axis, sf, hops + 1);
    }
    // A computed key can name any axis, so it is unread, not absent.
    if (ts.isComputedPropertyName(property.name)) {
      return unresolved("spread with a computed key");
    }
    if (property.name.getText(sf).replace(/^["']|["']$/gu, "") !== axis) {
      return NONE;
    }
    if (ts.isPropertyAssignment(property)) {
      return resolve(property.initializer, sf, hops + 1);
    }
    return ts.isShorthandPropertyAssignment(property)
      ? unresolved("identifier from a prop, parameter or import")
      : unresolved("spread with a getter or method");
  });
  return merge(NONE, ...parts);
}

/**
 * What `{...expression}` writes on one axis: object literals are read. Any other spread writes nothing here: the lint rule
 * `orb/no-opaque-variant-spread` refuses one whose type can carry an axis of the element it lands on.
 */
function resolveSpread(expression: ts.Expression, axis: string, sf: ts.SourceFile, hops: number): Resolution {
  const node = unwrap(expression);
  if (ts.isObjectLiteralExpression(node)) {
    return objectAxis(node, axis, sf, hops);
  }
  if (ts.isConditionalExpression(node)) {
    return merge(resolveSpread(node.whenTrue, axis, sf, hops), resolveSpread(node.whenFalse, axis, sf, hops));
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      return resolveSpread(node.right, axis, sf, hops);
    }
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      return merge(resolveSpread(node.left, axis, sf, hops), resolveSpread(node.right, axis, sf, hops));
    }
  }
  const init = ts.isIdentifier(node) && hops < MAX_HOPS ? constInitializer(sf, node.text) : null;
  return init === null ? NONE : resolveSpread(init, axis, sf, hops + 1);
}

export interface ValueUse {
  readonly value: string;
  /** Sites that write the value as a literal. */
  readonly direct: number;
  /** Sites that reach the value through a const map, conditional or fallback. */
  readonly resolved: number;
  readonly files: number;
  /** The tags that write it: layout variants are merged per door, so a value on Row counts for Stack. */
  readonly tags: readonly string[];
}

export interface AxisUse {
  readonly door: string;
  readonly axis: string;
  readonly values: readonly ValueUse[];
  /** Uses (or parts of uses) the syntax could not read, by reason. */
  readonly unresolved: Readonly<Record<string, number>>;
}

export interface VariantReport {
  readonly axes: readonly AxisUse[];
  /** Elements of a primitive that spread props. */
  readonly spreadSites: number;
  readonly sitesRead: number;
  /** Declared axes whose values the syntax could not fully read. */
  readonly unreadAxes: readonly string[];
}

interface Tally {
  direct: number;
  resolved: number;
  files: Set<string>;
  tags: Set<string>;
}

interface AxisSite {
  readonly path: string;
  readonly tag: string;
  readonly resolution: Resolution;
  readonly direct: boolean;
}

function axisSites(all: readonly FileFacts[], writers: ReadonlySet<string>, axis: string): readonly AxisSite[] {
  return all.flatMap((facts) => {
    const sf = facts.source.sf;
    if (sf === null || facts.source.layer !== "client") {
      return [];
    }
    return facts.elems.flatMap((elem) => {
      if (elem.door === null || !writers.has(elem.door)) {
        return [];
      }
      const path = facts.source.path;
      const read = attributeResolution(elem, axis, sf);
      const written = read === null ? [] : [{ path, tag: elem.tag, ...read }];
      const spread = elem.spreads.map((expression) => ({ path, tag: elem.tag, resolution: resolveSpread(expression, axis, sf, 0), direct: false }));
      return [...written, ...spread.filter((site) => site.resolution.values.length > 0 || site.resolution.reasons.length > 0)];
    });
  });
}

interface AxisKey {
  readonly door: string;
  readonly axis: string;
}

function tallyAxis(all: readonly FileFacts[], writers: ReadonlySet<string>, axis: AxisKey, declared: readonly string[]): { axisUse: AxisUse; sites: number } {
  const { door } = axis;
  const tallies = new Map<string, Tally>(declared.map((value) => [value, { direct: 0, resolved: 0, files: new Set(), tags: new Set() }]));
  const reasons: Record<string, number> = {};
  const sites = axisSites(all, writers, axis.axis);
  for (const site of sites) {
    for (const reason of site.resolution.reasons) {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    for (const value of new Set(site.resolution.values)) {
      const tally = tallies.get(value);
      if (tally !== undefined) {
        tally[site.direct ? "direct" : "resolved"] += 1;
        tally.files.add(site.path);
        tally.tags.add(site.tag);
      }
    }
  }
  const values = [...tallies.entries()].map(([value, tally]) => ({
    value,
    direct: tally.direct,
    resolved: tally.resolved,
    files: tally.files.size,
    tags: [...tally.tags].sort(),
  }));
  return { axisUse: { door, axis: axis.axis, values, unresolved: reasons }, sites: sites.length };
}

export function variantReport(all: readonly FileFacts[], declared: DeclaredVariants): VariantReport {
  const axes: AxisUse[] = [];
  let sitesRead = 0;
  for (const [door, byAxis] of declared.axes) {
    for (const [axis, values] of byAxis) {
      const writers = new Set([door, ...[...declared.carriers].filter(([, owner]) => owner === door).map(([carrier]) => carrier)]);
      const { axisUse, sites } = tallyAxis(all, writers, { door, axis }, values);
      axes.push(axisUse);
      sitesRead += sites;
    }
  }
  const spreadSites = all
    .filter((facts) => facts.source.layer === "client")
    .reduce((sum, facts) => sum + facts.elems.filter((elem) => elem.door !== null && elem.hasSpread).length, 0);
  return { axes, spreadSites, sitesRead, unreadAxes: declared.unread };
}

export const totalUses = (value: ValueUse): number => value.direct + value.resolved;
