// Which `@orb/ui` primitives a client component hands its `className` to, so a class written on a wrapper is judged where it lands.
import { posix } from "node:path";
import ts from "typescript";
import type { Elem, Source, Wearer } from "../eslint/index.ts";
import { componentsIn, elementsOf, firstFunction, propsPattern, visit, wearerOf } from "../eslint/index.ts";

const CLASS_NAME = "className";
const MAX_HOPS = 4;
const ALIAS = /^#(?<dir>[a-z-]+)$/u;
const CLIENT_ROOT = "packages/client/src";

/** File path to component name to the elements of that component that wear its `className`. */
type Forwards = ReadonlyMap<string, ReadonlyMap<string, readonly Elem[]>>;

/** Resolves a component to the primitives its `className` lands on, through any wrappers between them. */
export type ForwardReader = (path: string, elem: Elem) => readonly Wearer[];

/** The name the component holds the caller's class under, or the rest binding that carries it on; null when it takes none. */
function classBinding(body: ts.Node): { readonly name: string; readonly rest: boolean } | null {
  const pattern = propsPattern(firstFunction(body));
  const named = pattern?.elements.find((element) => (element.propertyName ?? element.name).getText() === CLASS_NAME);
  if (named !== undefined) {
    return { name: named.name.getText(), rest: false };
  }
  const rest = pattern?.elements.find((element) => element.dotDotDotToken !== undefined);
  return rest === undefined ? null : { name: rest.name.getText(), rest: true };
}

const reads = (node: ts.Node, name: string): boolean => {
  let found = false;
  visit(node, (inner) => {
    found ||= ts.isIdentifier(inner) && inner.text === name;
  });
  return found;
};

/** The element takes the binding: in its `className`, or through a spread of the rest that carries it. */
function wears(elem: Elem, { name, rest }: { readonly name: string; readonly rest: boolean }): boolean {
  const attribute = elem.attrs.get(CLASS_NAME)?.initializer;
  return rest ? elem.spreads.some((spread) => reads(spread, name)) : attribute !== undefined && reads(attribute, name);
}

function forwardsOf(sf: ts.SourceFile, elements: readonly Elem[]): ReadonlyMap<string, readonly Elem[]> {
  const entries = componentsIn(sf).flatMap(([component, body]) => {
    const binding = classBinding(body);
    const worn = binding === null ? [] : elements.filter((elem) => elem.opening.pos >= body.pos && elem.opening.end <= body.end && wears(elem, binding));
    return worn.length === 0 ? [] : [[component, worn] as const];
  });
  return new Map(entries);
}

/** The file a client import names, by its relative path or its `#dir` alias, with the extensions this tree writes. */
function resolved(path: string, specifier: string, known: ReadonlySet<string>): string | undefined {
  const alias = ALIAS.exec(specifier)?.groups?.["dir"];
  const base = alias === undefined ? posix.join(posix.dirname(path), specifier) : `${CLIENT_ROOT}/${alias}`;
  return [base, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => known.has(candidate));
}

/** The file that declares a name an index re-exports, followed from the file an import names. */
function declaringFile(path: string, name: string, sources: ReadonlyMap<string, ts.SourceFile>, forwards: Forwards): string | undefined {
  if (forwards.get(path)?.has(name) === true) {
    return path;
  }
  const known = new Set(sources.keys());
  for (const statement of sources.get(path)?.statements ?? []) {
    const from = ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined ? statement.moduleSpecifier : undefined;
    const clause = ts.isExportDeclaration(statement) ? statement.exportClause : undefined;
    const exported = clause !== undefined && ts.isNamedExports(clause) && clause.elements.some((element) => element.name.text === name);
    if (from !== undefined && ts.isStringLiteral(from) && exported) {
      const next = resolved(path, from.text, known);
      return next === undefined ? undefined : declaringFile(next, name, sources, forwards);
    }
  }
  return undefined;
}

/** Read every client component once; the reader answers for an element by the file it sits in. */
export function classForwards(sources: readonly Source[]): ForwardReader {
  const files = new Map(sources.flatMap((source) => (source.sf === null || source.layer !== "client" ? [] : [[source.path, source.sf] as const])));
  const forwards = new Map([...files].map(([path, sf]) => [path, forwardsOf(sf, elementsOf(sf))] as const));
  const known = new Set(files.keys());
  const wearersOf = (path: string, elem: Elem, hops: number): readonly Wearer[] => {
    const own = wearerOf(elem);
    if (own !== null || hops >= MAX_HOPS || elem.kind === "raw") {
      return own === null ? [] : [own];
    }
    const name = elem.imported?.name ?? elem.tag;
    const target = elem.imported === null ? path : resolved(path, elem.imported.source, known);
    const home = target === undefined ? undefined : declaringFile(target, name, files, forwards);
    const worn = home === undefined ? [] : (forwards.get(home)?.get(name) ?? []);
    return worn.flatMap((inner) => wearersOf(home ?? path, inner, hops + 1));
  };
  return (path, elem) => (elem.kind === "ui" ? [] : wearersOf(path, elem, 0));
}
