// Shared reader: the MOVE-STABLE IDENTITY of a caught-failure site — the sixth sibling of
// `lib/caught-failure.ts`. The committed census (`gates/caught-failure-ownership.population.json`) is keyed
// by it, the census generator (`ops/gen/caught-failure-population.ts`) mints it and the hard policy
// `caught-failure-ownership-health` joins on it, so it has exactly one spelling and it lives here.
//
// ── THE SHAPE: `path::<declaration>::<token>::<ordinal>` (work item 0009) ────────────────────────────────
// No coordinate enters the id, so a line inserted above a site leaves it untouched. The ordinal counts
// same-token sites WITHIN ONE ENCLOSING DECLARATION, not within the file: under a per-file ordinal, adding or
// deleting an earlier bindingless `catch` anywhere in the file shifted every later `::catch::n` (270 of 620
// rows sat in such groups), and a shifted id silently hands one site's recorded verdict to another. Scoped to
// its declaration, an edit re-keys only sites in the function it touched.
//
// The declaration is the chain of NAMED containers from the module down to the site, joined with `.`:
// a function, method, constructor, accessor or class, and a function or arrow expression that a variable,
// class property or object property names. An anonymous callback is not a container — its sites belong to
// the named function around it, which is what a reader would call "where this catch lives". A site with no
// named container is `<module>`.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureSite } from "./caught-failure.ts";

const MODULE = "<module>";

/** The name a function or arrow EXPRESSION is known by: its own name, else the binding that names it. */
function boundName(fn: Node): string | undefined {
  const own = fn.isKind(SyntaxKind.FunctionExpression) ? fn.getName() : undefined;
  const parent = fn.getParent();
  const binding =
    parent !== undefined &&
    (parent.isKind(SyntaxKind.VariableDeclaration) || parent.isKind(SyntaxKind.PropertyDeclaration) || parent.isKind(SyntaxKind.PropertyAssignment))
      ? parent.getNameNode().getText()
      : undefined;
  return own ?? binding;
}

/** The name one ancestor contributes to the declaration chain, or undefined when it is not a named container.
 *  One tail return over an accumulator: the `noUselessReturn` / `noImplicitReturns` pincer
 *  (.claude/rules/tooling.md). */
function containerName(node: Node): string | undefined {
  let name: string | undefined;
  if (node.isKind(SyntaxKind.FunctionDeclaration)) {
    name = node.getName() ?? "default";
  } else if (node.isKind(SyntaxKind.FunctionExpression) || node.isKind(SyntaxKind.ArrowFunction)) {
    name = boundName(node);
  } else if (node.isKind(SyntaxKind.Constructor)) {
    name = "constructor";
  } else if (node.isKind(SyntaxKind.MethodDeclaration) || node.isKind(SyntaxKind.GetAccessor) || node.isKind(SyntaxKind.SetAccessor)) {
    name = node.getName();
  } else if (node.isKind(SyntaxKind.ClassDeclaration) || node.isKind(SyntaxKind.ClassExpression)) {
    name = node.getName();
  }
  return name;
}

/** The named-container chain around a site, outermost first — `<module>` when there is none. */
function enclosingDeclaration(node: Node): string {
  const names = node
    .getAncestors()
    .map(containerName)
    .filter((name): name is string => name !== undefined)
    .toReversed();
  return names.length === 0 ? MODULE : names.join(".");
}

/** One site with its identity, or with `siteId: undefined` when the classifier derived no anchor — such a
 *  site has no position to key on, and each consumer refuses it in its own terms rather than inventing one. */
interface KeyedCaughtFailureSite {
  readonly site: CaughtFailureSite;
  readonly siteId: string | undefined;
  readonly ordinal: number;
}

/** Key ONE file's sites. Sorted by source position here rather than trusted from the caller, because the
 *  ordinal is an occurrence count in SOURCE ORDER and the two consumers collect their sites differently: the
 *  census walks the file, the health policy receives dispatcher-delivered nodes. */
export function keyCaughtFailureSites(path: string, sites: readonly CaughtFailureSite[]): readonly KeyedCaughtFailureSite[] {
  const ordinals = new Map<string, number>();
  return sites
    .toSorted((left, right) => left.node.getStart() - right.node.getStart())
    .map((site) => {
      if (site.anchor === undefined) {
        return { site, siteId: undefined, ordinal: 0 };
      }
      const scope = `${path}::${enclosingDeclaration(site.node)}::${site.anchor.token}`;
      const ordinal = (ordinals.get(scope) ?? 0) + 1;
      ordinals.set(scope, ordinal);
      return { site, siteId: `${scope}::${ordinal}`, ordinal };
    });
}
