// The ONE reader for "which door does a test's module specifier enter?" — the family reader shared by
// `tests-package-subpath` (a relative climb into a package or the test kit) and `tests-raw-package-reach` (the
// root `#<package>/*` map). Spelling is the subject: the rule is about the door an author wrote, so the reader is
// pure syntax over one module-position literal. Core-0-Architecture-and-Structure.md §5 owns the doors.
import { posix } from "node:path";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { PACKAGE_NAMES } from "../../floor/compiler/project-worlds.ts";

/** The test kit's package root and the specifier prefix its world subpaths export under. */
export const TESTKIT_ROOT = "tests/support/";
export const TESTKIT_PACKAGE = "@orb/testkit/";

const PACKAGE_SOURCE = /^packages\/([^/]+)\/src\/(.+)$/u;
const MODULE_CALLEES: ReadonlySet<string> = new Set(["vi.mock", "vi.doMock", "vi.unmock", "vi.doUnmock", "vi.importActual", "vi.importMock", "require"]);
const PACKAGES: ReadonlySet<string> = new Set(PACKAGE_NAMES);

/** A package file a specifier names: its package directory and its path under `src/`. */
interface PackageFileReach {
  readonly pkg: string;
  readonly path: string;
}

/** Where a relative specifier climbs to when it leaves its legal tree. */
type RelativeClimb = ({ readonly kind: "package" } & PackageFileReach) | { readonly kind: "testkit"; readonly door: string };

/** The string literal in a module position: an import or re-export declaration, `import()` in a value or type position, or a vi.mock-family or
 *  `require` call. Anything else (a path read as data, a fixture source string) is not a module edge. */
export function testModuleSpecifier(node: MorphNode): MorphNode | undefined {
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
  if (!spec.startsWith(".")) {
    return;
  }
  const target = posix.normalize(posix.join(posix.dirname(importer), spec));
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
