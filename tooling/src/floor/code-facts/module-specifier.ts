// Authored module positions and path spellings; native resolution belongs to module-target.
import { posix } from "node:path";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { PACKAGE_NAMES } from "../compiler/project-worlds.ts";
import type { PackageFileReach, RelativeClimb } from "./module-reach-contract.ts";

/** The test kit's package root and the specifier prefix its world subpaths export under. */
export const TESTKIT_ROOT = "tests/support/";
export const TESTKIT_PACKAGE = "@orb/testkit/";

const PACKAGE_SOURCE = /^packages\/([^/]+)\/src\/(.+)$/u;
const MODULE_CALLEES: ReadonlySet<string> = new Set(["vi.mock", "vi.doMock", "vi.unmock", "vi.doUnmock", "vi.importActual", "vi.importMock", "require"]);
const PACKAGES: ReadonlySet<string> = new Set(PACKAGE_NAMES);

/** The string literal in a module position: an import or re-export declaration, `import()` in a value or type position, or a vi.mock-family or
 *  `require` call. Anything else (a path read as data, a fixture source string) is not a module edge. */
export function modulePositionSpecifier(node: MorphNode): MorphNode | undefined {
  if (Node.isImportDeclaration(node) || Node.isExportDeclaration(node)) {
    return node.getModuleSpecifier();
  }
  if (Node.isImportTypeNode(node)) {
    const argument = node.getArgument();
    return Node.isLiteralTypeNode(argument) ? argument.getLiteral() : undefined;
  }
  if (!Node.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression();
  const isModuleCall = callee.getKind() === SyntaxKind.ImportKeyword || MODULE_CALLEES.has(callee.getText());
  return isModuleCall ? node.getArguments()[0] : undefined;
}

/** A relative specifier from `importer` that climbs into a package's `src/`, or into the test kit from outside it. */
export function relativeClimb(importer: string, spec: string): RelativeClimb | undefined {
  const target = resolveRelativeImport(importer, spec);
  if (target === null) {
    return;
  }
  const source = PACKAGE_SOURCE.exec(target);
  if (source?.[1] !== undefined && source[2] !== undefined) {
    return { kind: "package", pkg: source[1], path: source[2] };
  }
  return target.startsWith(TESTKIT_ROOT) && !importer.startsWith(TESTKIT_ROOT)
    ? { kind: "testkit", door: `${TESTKIT_PACKAGE}${target.slice(TESTKIT_ROOT.length)}` }
    : undefined;
}

/** The package file a raw `#<package>/<path>` specifier (the root imports map) reaches, or undefined. */
export function rawPackageReach(spec: string): PackageFileReach | undefined {
  if (!spec.startsWith("#")) {
    return;
  }
  const slash = spec.indexOf("/");
  const pkg = spec.slice(1, slash);
  return slash > 1 && PACKAGES.has(pkg) ? { pkg, path: spec.slice(slash + 1) } : undefined;
}

export const TOOLING_PREFIX = "tooling/src/";
/** `tooling/src/<tool>/cli.ts` — exactly four path segments (Core-Tooling-Law §2.5, the five-slot template). */
const CLI_DEPTH = 4;

/** The tooling dir (`snap`, `floor`, …) a repo-relative tooling path belongs to. */
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
 *  `#floor/...` resolves to nothing and node reports that loudly) or an npm / `node:` / `@orb/*` specifier
 *  (the resolver and the cruiser own those edges). */
export function resolveRelativeImport(rel: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }
  return posix.normalize(posix.join(posix.dirname(rel), specifier));
}
