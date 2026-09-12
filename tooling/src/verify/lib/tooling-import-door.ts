// The ONE reader for "where does a tooling import land?" — the family reader shared by `tooling-front-door`
// (the ordinary cross-tool / cli boundary) and `tooling-root-config-import` (the reviewed relative-escape
// grant policy), so the two halves of Core-Tooling-Law §4.2 cannot drift on what a specifier RESOLVES to.
//
// SPELLING IS THE SUBJECT HERE, deliberately. An import boundary is a rule about the door an author WROTE
// (`#<tool>`, `../<tool>/index.ts`, a relative path), not about the declaration behind it — the resolver and
// the dependency-cruiser stanzas own the resolved-edge graph (§4.6), and this is the lane-speed AST arm that
// matches specifier shape. So the reader is pure syntax over one ImportDeclaration's module specifier: no
// checker, no walk, no Project, no filesystem, no cache.
import { posix } from "node:path";

export const TOOLING_PREFIX = "tooling/src/";
/** `tooling/src/<tool>/cli.ts` — exactly four path segments (Core-Tooling-Law §2.5, the five-slot template). */
const CLI_DEPTH = 4;

/** The tooling dir (`snap`, `_shared`, …) a repo-relative tooling path belongs to. */
export function toolOf(rel: string): string {
  return rel.slice(TOOLING_PREFIX.length).split("/")[0] ?? "";
}

/** The argv front door of a tool, derived by SHAPE rather than a path list: a cli.ts that moves stops being
 *  one and its reads red at the new path, which is the rot a hand-written home table cannot have. */
export function isToolCli(rel: string): boolean {
  return rel.endsWith("/cli.ts") && rel.split("/").length === CLI_DEPTH;
}

/** The repo-relative path a RELATIVE specifier lands on when imported from `rel`, or `null` when the
 *  specifier is not this reader's subject — a `#<tool>` imports-map entry (front-door by construction;
 *  `#_shared` resolves to nothing and node reports that loudly) or an npm / `node:` / `@orb/*` specifier
 *  (the resolver and the cruiser own those edges). */
export function resolveRelativeImport(rel: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }
  return posix.normalize(posix.join(posix.dirname(rel), specifier));
}
