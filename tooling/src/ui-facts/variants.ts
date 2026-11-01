// Variant report: for each primitive axis, the values the client writes and at how many sites.
// A literal counts as written. So does a value reached through a same-file const map, a conditional or a `??`/`||` of literals.
// What the syntax cannot reach (a prop, a call, an import) is counted per reason, and an axis with any such use cannot claim a value unused.
import ts from "typescript";
import type { FileFacts } from "./file-facts.ts";
import type { Elem } from "./source.ts";

const MAX_HOPS = 3;

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

function unwrap(node: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
    return unwrap(node.expression);
  }
  return node;
}

function constInitializer(sf: ts.SourceFile, name: string): ts.Expression | null {
  let found: ts.Expression | null = null;
  const look = (node: ts.Node): void => {
    if (found === null && ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer !== undefined) {
      const list = node.parent;
      found = ts.isVariableDeclarationList(list) && list.getFirstToken(sf)?.kind === ts.SyntaxKind.ConstKeyword ? unwrap(node.initializer) : null;
    }
    ts.forEachChild(node, look);
  };
  look(sf);
  return found;
}

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
  /** Elements of a primitive that spread props: a spread can carry any axis. */
  readonly spreadSites: number;
  readonly sitesRead: number;
}

interface Tally {
  direct: number;
  resolved: number;
  files: Set<string>;
  tags: Set<string>;
}

type Declared = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;

interface AxisSite {
  readonly path: string;
  readonly tag: string;
  readonly resolution: Resolution;
  readonly direct: boolean;
}

function axisSites(all: readonly FileFacts[], door: string, axis: string): readonly AxisSite[] {
  return all.flatMap((facts) => {
    const sf = facts.source.sf;
    if (sf === null || facts.source.layer !== "client") {
      return [];
    }
    return facts.elems.flatMap((elem) => {
      const read = elem.door === door ? attributeResolution(elem, axis, sf) : null;
      return read === null ? [] : [{ path: facts.source.path, tag: elem.tag, ...read }];
    });
  });
}

function tallyAxis(all: readonly FileFacts[], door: string, axis: string, declared: readonly string[]): { axisUse: AxisUse; sites: number } {
  const tallies = new Map<string, Tally>(declared.map((value) => [value, { direct: 0, resolved: 0, files: new Set(), tags: new Set() }]));
  const reasons: Record<string, number> = {};
  const sites = axisSites(all, door, axis);
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
  return { axisUse: { door, axis, values, unresolved: reasons }, sites: sites.length };
}

export function variantReport(all: readonly FileFacts[], declared: Declared): VariantReport {
  const axes: AxisUse[] = [];
  let sitesRead = 0;
  for (const [door, byAxis] of declared) {
    for (const [axis, values] of byAxis) {
      const { axisUse, sites } = tallyAxis(all, door, axis, values);
      axes.push(axisUse);
      sitesRead += sites;
    }
  }
  const spreadSites = all
    .filter((facts) => facts.source.layer === "client")
    .reduce((sum, facts) => sum + facts.elems.filter((elem) => elem.door !== null && elem.hasSpread).length, 0);
  return { axes, spreadSites, sitesRead };
}

export const totalUses = (value: ValueUse): number => value.direct + value.resolved;
