// The ONE reader for "what does the INSTALLED @base-ui/react actually expose, and what does @orb/ui
// actually render". Every `baseui-*` gate and the baseui-surface baseline writer reads through here, so the
// surface is derived from the package on disk exactly once, in one spelling. The prop EXPANDER it delegates
// to is ./baseui-expand.ts; the shapes are ../contract/baseui.ts; the DERIVATIONS over acquired inputs (the
// anatomy walk over a loaded Project, the manifest JSON reader, the two surface tripwires) are
// ./baseui-surface-derive.ts, split out at the size cap 2026-09-18 — both Project constructions, the caches
// and the resource doors stay HERE under the `tooling-project-home:baseui-read` grant, and the three derived
// names every gate imports (`surfaceManifestFrom`, `blindParts`, `truncatedParts`) keep this module as
// their door.
//
// WHY A PRIVATE ts-morph Project (the reviewed grant `tooling-project-home:baseui-read`, not an ambient
// exception): the one-loader rule protects the shared WORKSPACE from being re-loaded per gate. The installed
// `.d.ts` surface is NOT the workspace — it is not in `harnessGlobs`, no gate can subscribe to its nodes,
// and it must be read out of `node_modules` or the manifest has nothing to be compared against. Measured
// 788 files / ~270ms, loaded lazily and cached per process.
//
// WHO STILL USES THE FILESYSTEM HALF, after the #1584 conversion of the `baseui-read` family: ONLY
// `ops/gen/baseui-surface.ts` (the baseline WRITER, a generator rather than a policy) and
// `lib/css-selector-writers.ts` (read by `css-selector-has-a-writer`, which converts with the CSS family
// because its collector lifecycle is shared with `css-family-ownership`). Every CONVERTED `baseui-*`
// policy reaches the same data through declared ResourceHost doors — `json:baseui-manifest` for the
// committed ledger, `installed-package:base-ui` for the installed surface — and narrows it here, so each
// artifact's SHAPE has one home whichever side reads it. That is why this module keeps its fs imports
// while the gate modules have none: `gate:contract`'s non-negotiables are about what a GATE MODULE does,
// and a policy that calls `surfaceManifestFrom(readyResourceValue(ctx.resources.json(...)).value)` or
// `installedSurfaceFrom(declarations.declarationPaths, metadata.version)` touches no filesystem.
//
// TWO ACQUISITIONS, ONE DERIVATION. `installedSurfaceOver` / `stateAttributeValuesOver` take a LOADED
// project and derive everything from it; the two acquisitions differ only in how that project's file set
// was enumerated — `globbedSurfaceProject` globs the package directory for the fs half,
// `declaredSurfaceProject` adds exactly the paths the `installed-package` door returned. A second copy of
// the anatomy walk behind the resource door would be exactly the second home this module exists to
// prevent, and the two sides would then drift on the next Base UI shape change with nothing to notice.
// PROVEN rather than asserted: driven over `@base-ui/react@1.7.0`, the two acquisitions produce a
// byte-identical `InstalledSurface` — 39 components, version 1.7.0, 78,010 JSON bytes on both sides — with
// two planted controls (an anchorless path set derives NOTHING; dropping one component's `index.d.ts` from
// the declared set drops exactly that component).
//
// THE PATH SET IS THE SAME SET ON BOTH SIDES, and that is a measurement rather than a hope: the fs glob is
// `${pkgDir}/*/**/*.d.ts` + `${pkgDir}/*/*.d.ts`, i.e. every declaration at least one directory below the
// package root, and the `installed-package` door's recursive walk returns those PLUS the root-level ones.
// `nestedDeclarations` re-imposes the glob's own fence, so the admitted sets are equal. Measured
// 2026-09-13 against `@base-ui/react@1.7.0`: the door returns 790 paths, exactly 2 of them root-level
// (`global.d.ts`, `index.d.ts`), leaving 788 — the same 788 this header's grant paragraph records.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Identifier, Node, ParameterDeclaration, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { BaseUiBinding, InstalledSurface, RenderSite, SurfaceManifest, SurfaceManifestRead } from "../contract/baseui.ts";
import { INSTALLED_PACKAGE_DEFINITIONS } from "../contract/resource-installed.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { unwrapExpression } from "./ast-read.ts";
import {
  BASE_UI_MODULE_PREFIX,
  installedSurfaceOver,
  surfaceManifestFrom as manifestFrom,
  nestedDeclarations,
  stateAttributeValuesOver,
  blindParts as surfaceBlindParts,
  truncatedParts as surfaceTruncatedParts,
} from "./baseui-surface-derive.ts";

/** Where the package is installed. `@orb/ui` is its only dependent, so pnpm hangs the symlink here. */
export const BASE_UI_PKG_REL = "packages/ui/node_modules/@base-ui/react";
/** The manifest the installed surface is adjudicated against (the §2 site-6 baseline-file sibling). */
export const BASE_UI_MANIFEST_REL = "tooling/src/verify/gates/baseui-surface.manifest.json";
/** Where a seal may live. Base UI is a `@orb/ui` dependency only — features compose sealed primitives. */
export const UI_SRC = "packages/ui/src/";

/** Caches are keyed BY ROOT, never a single slot: gate conformance runs each example in its own temp tree
 *  with its own synthetic `@base-ui/react`, and a one-slot cache would serve example #1's surface to every
 *  later example — a self-proof that silently stops proving anything. */
const projectByPkgDir = new Map<string, Project>();
const surfaceByRoot = new Map<string, InstalledSurface>();
const stateAttributesByRoot = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>();

/** Test seam: drop the process caches (a test that rewrites a tree in place needs this). */
export function resetBaseUiSurfaceCache(): void {
  projectByPkgDir.clear();
  surfaceByRoot.clear();
  stateAttributesByRoot.clear();
}

/** The `@base-ui/react` package DIRECTORY, derived from the door's own declaration paths rather than
 *  guessed from a repo-relative spelling. Under pnpm the door resolves through node and lands on the STORE
 *  path (`node_modules/.pnpm/@base-ui+react@1.7.0_…/node_modules/@base-ui/react`), never the
 *  `packages/ui/node_modules/@base-ui/react` symlink an importer sees — so `BASE_UI_PKG_REL` is the fs
 *  half's spelling and must not be joined onto a door-supplied path.
 *
 *  The anchor is the package SPECIFIER from the installed-package contract, so a rename moves one string.
 *  Fail-closed: a set carrying no such segment means the door handed back declarations from somewhere else
 *  and the caller reports blindness rather than deriving an empty surface (which reads as "nothing
 *  changed"). */
export function installedPackageRootOf(declarationPaths: readonly string[]): string | undefined {
  const anchor = `/${INSTALLED_PACKAGE_DEFINITIONS["base-ui"].specifier}/`;
  const inside = declarationPaths.find((path) => path.includes(anchor));
  return inside === undefined ? undefined : inside.slice(0, inside.lastIndexOf(anchor) + anchor.length - 1);
}

/** The FS half's project: the package directory IS the whole input, so the directory is the whole key. */
function globbedSurfaceProject(pkgDir: string): Project {
  const hit = projectByPkgDir.get(pkgDir);
  if (hit !== undefined) {
    return hit;
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  project.addSourceFilesAtPaths([`${pkgDir}/*/**/*.d.ts`, `${pkgDir}/*/*.d.ts`]);
  projectByPkgDir.set(pkgDir, project);
  return project;
}

/** The DOOR half's project, keyed by the DECLARATION SET rather than by the package directory.
 *
 *  THE PACKAGE DIRECTORY IS NOT A SUFFICIENT KEY HERE, and that is a measurement rather than caution: the
 *  door's input is the path LIST, so two calls naming the same package with different lists are two
 *  different surfaces. Keyed by directory, the second call silently returns the first call's project — the
 *  exact "one-slot cache serves example #1's surface to every later example" failure this module's cache
 *  comment already warns about, one level in, and it is worse here because the fs half's key genuinely IS
 *  the directory. Caught by `baseui-and-surface-family.suite.repo.int.test.ts`'s drop-one-component control,
 *  which returned the full surface. A WeakMap on the array identity is the key that cannot be wrong: the
 *  resource host hands every consumer in one invocation the SAME fact object, so the siblings share a hit,
 *  and a genuinely different list is a genuinely different key. */
const projectByDeclarationSet = new WeakMap<readonly string[], Project>();

function declaredSurfaceProject(pkgDir: string, declarationPaths: readonly string[]): Project {
  const hit = projectByDeclarationSet.get(declarationPaths);
  if (hit !== undefined) {
    return hit;
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  for (const path of nestedDeclarations(pkgDir, declarationPaths)) {
    project.addSourceFileAtPath(path);
  }
  projectByDeclarationSet.set(declarationPaths, project);
  return project;
}

/** The installed surface from the DECLARED `installed-package` doors — `mode: "ast"` supplies
 *  `declarationPaths`, `mode: "metadata"` supplies `version`.
 *
 *  WHY THE VERSION IS A SECOND ARGUMENT RATHER THAN DERIVED: `mode: "ast"` returns PATHS ONLY
 *  (`contract/resource-installed.ts#InstalledPackageDeclarations`), and the package manifest is not a
 *  `.d.ts`, so no declaration path carries the version. A consumer that only compares anatomy — the
 *  selector-writer family's state-attribute reconciliation — passes `""` and says so; this family's drift
 *  arm needs the real one and declares the metadata door for it.
 *
 *  `undefined` is the §4.6 blindness case: the door resolved declarations that carry no `@base-ui/react`
 *  package root, so the reader learned nothing and the caller must report RED rather than derive an empty
 *  surface (which reads as "nothing changed"). A package that is not installed at all never reaches here —
 *  the door refuses `missing` one phase earlier and every consumer is WITHHELD. */
export function installedSurfaceFrom(declarationPaths: readonly string[], version: string): InstalledSurface | undefined {
  const pkgDir = installedPackageRootOf(declarationPaths);
  if (pkgDir === undefined) {
    return;
  }
  return installedSurfaceOver(declaredSurfaceProject(pkgDir, declarationPaths), pkgDir, version);
}

/** Installed Base UI state attributes and their statically-declared string/number values, from the DECLARED
 *  `installed-package {mode: "ast"}` door — the resource-fed successor of the retired `ctx.root` filesystem reader.
 *
 *  An EMPTY MAP HERE IS NOT THE FS HALF'S EMPTY MAP, and the difference is the whole point of the door: the
 *  fs function returns one when the package is absent, which is a silent blindness. Reaching this function
 *  at all means the door already resolved READY, so an empty map means the installed declarations genuinely
 *  declare no `*State` interface — a real verdict about a real package. The one exception is an anchorless
 *  path set, which is the same fail-closed case `installedSurfaceFrom` returns `undefined` for; it is
 *  reported as an empty map here because a state-attribute census has no "I could not read" value in its
 *  own type, so a consumer that needs to tell the two apart asks `installedSurfaceFrom` first. */
export function installedStateAttributeValuesFrom(declarationPaths: readonly string[]): ReadonlyMap<string, ReadonlySet<string>> {
  const pkgDir = installedPackageRootOf(declarationPaths);
  if (pkgDir === undefined) {
    return new Map();
  }
  return stateAttributeValuesOver(declaredSurfaceProject(pkgDir, declarationPaths));
}

/** The installed surface, or undefined when the package is not on disk — the §4.6 blindness case every
 *  gate keyed on this must report as RED rather than silently pass. THE FS ACQUISITION: it enumerates the
 *  declaration set with a glob and hands it to the same derivation the resource door uses. */
export function readInstalledSurface(root: string): InstalledSurface | undefined {
  const hit = surfaceByRoot.get(root);
  if (hit !== undefined) {
    return hit;
  }
  const pkgDir = join(root, BASE_UI_PKG_REL);
  if (!existsSync(join(pkgDir, "package.json"))) {
    return;
  }
  const version = String((JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { version?: string }).version ?? "");
  const surface = installedSurfaceOver(globbedSurfaceProject(pkgDir), pkgDir, version);
  surfaceByRoot.set(root, surface);
  return surface;
}

/** The reader's own blindness tripwire (a part the expander learned NOTHING about) and the depth-ceiling
 *  census — derived in `baseui-surface-derive.ts`, kept here by name because this module is the family's one
 *  door (every `baseui-*` gate and the baseline writer import them from here). */
export function blindParts(surface: InstalledSurface | SurfaceManifest): string[] {
  return surfaceBlindParts(surface);
}

export function truncatedParts(surface: InstalledSurface | SurfaceManifest): string[] {
  return surfaceTruncatedParts(surface);
}

// ── the committed MANIFEST (surface + dispositions) ─────────────────────────────────────────────────

/** The manifest JSON, narrowed to `SurfaceManifest` or refused with the first shape failure — the same door
 *  rule as `blindParts`: derived in `baseui-surface-derive.ts`, imported from here. */
export function surfaceManifestFrom(value: JsonValue): SurfaceManifestRead {
  return manifestFrom(value);
}

export function readManifest(root: string): SurfaceManifest | undefined {
  const path = join(root, BASE_UI_MANIFEST_REL);
  if (!existsSync(path)) {
    return;
  }
  const read = surfaceManifestFrom(JSON.parse(readFileSync(path, "utf8")) as JsonValue);
  return read.ok ? read.manifest : undefined;
}

// ── what @orb/ui actually IMPORTS and RENDERS ───────────────────────────────────────────────────────

/** Every `@base-ui/react/*` named binding in a file, value and type alike. */
export function baseUiBindings(sf: SourceFile): BaseUiBinding[] {
  const out: BaseUiBinding[] = [];
  for (const imp of sf.getImportDeclarations()) {
    const module = imp.getModuleSpecifierValue();
    if (!module.startsWith(BASE_UI_MODULE_PREFIX)) {
      continue;
    }
    const typeOnlyDecl = imp.isTypeOnly();
    for (const spec of imp.getNamedImports()) {
      out.push({ local: spec.getAliasNode()?.getText() ?? spec.getName(), exported: spec.getName(), module, typeOnly: typeOnlyDecl || spec.isTypeOnly() });
    }
  }
  return out;
}

/** JSX tag names rendered in a file, exactly as written (`BaseSelect.Trigger`, `BaseButton`), each mapped to
 *  the line of its FIRST occurrence. Both JSX element spellings are read — a self-closing-only reader is
 *  the §5 lying-proof class that once shipped a confident false-positive factory. */
export function renderedTagNames(sf: SourceFile): Map<string, number> {
  const tags = new Map<string, number>();
  const add = (tag: string, line: number): void => {
    const prior = tags.get(tag);
    if (prior === undefined || line < prior) {
      tags.set(tag, line);
    }
  };
  for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    add(el.getTagNameNode().getText(), el.getStartLineNumber());
  }
  for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    add(el.getTagNameNode().getText(), el.getStartLineNumber());
  }
  return tags;
}

/** Base UI parts RENDERED anywhere in `@orb/ui`, keyed `Component` → part names → the files that render
 *  them. This is the fact `baseui-anatomy-completeness` judges the manifest's `exposed` claims against.
 *  Namespaced components match `<local.Part>`; a flat component (`Button`) matches a bare `<local>` and is
 *  recorded under its own name as its single part. */
export function renderedPartsByComponent(files: readonly SourceFile[], surface: InstalledSurface | SurfaceManifest): Map<string, Map<string, RenderSite[]>> {
  const out = new Map<string, Map<string, RenderSite[]>>();
  for (const sf of files) {
    const rel = repoRelative(sf.getFilePath());
    if (!rel.includes(UI_SRC)) {
      continue;
    }
    const bindings = baseUiBindings(sf).filter((b) => !b.typeOnly && b.exported in surface.components);
    if (bindings.length === 0) {
      continue;
    }
    const tags = renderedTagNames(sf);
    for (const binding of bindings) {
      collectRenderedParts(out, surface, binding, { tags, file: rel });
    }
  }
  return out;
}

/** Record every part of ONE binding's component that this file renders. */
function collectRenderedParts(
  out: Map<string, Map<string, RenderSite[]>>,
  surface: InstalledSurface | SurfaceManifest,
  binding: BaseUiBinding,
  where: { tags: ReadonlyMap<string, number>; file: string },
): void {
  const component = surface.components[binding.exported];
  if (component === undefined) {
    return;
  }
  for (const part of Object.keys(component.parts)) {
    const line = where.tags.get(component.namespaced ? `${binding.local}.${part}` : binding.local);
    if (line === undefined) {
      continue;
    }
    const byPart = out.get(binding.exported) ?? new Map<string, RenderSite[]>();
    byPart.set(part, [...(byPart.get(part) ?? []), { file: where.file, line }]);
    out.set(binding.exported, byPart);
  }
}

// ── SEAL-SHAPE READERS (the `baseui-read` family's subtree walks live HERE, never in a policy) ───────
//
// Every one of these takes a node and answers a question about the subtree under it. They are in `lib/`
// rather than in the `baseui-*` policies for a CONTRACT reason, not a taste one: `gate:contract`'s
// `direct-walk` rule forbids `getDescendantsOfKind` inside a gate module regardless of receiver, and the
// sanctioned alternative it names is "visitors, ctx.files, or a shared reader". A `className` expression's
// identifiers and a portal's `container` target are both SUBTREE questions about ONE delivered node, which
// no kind-indexed visitor can answer without re-deriving the ancestor chain — so they are readers.

const HOOK_CALL_RE = /^use[A-Z]/u;
const CONTAINER_PROP = "container";

/** Local identifiers bound by a hook call in this file (`const [open, setOpen] = useState(false)`,
 *  `const open = useSomething()`), at ANY depth — a seal's state lives inside its component function.
 *  A PROP of the same name is deliberately NOT local state: threading a controlled prop into a variant
 *  call is the house convention in ~40 seals, not a parallel source of truth. */
export function localReactStateBindings(sf: SourceFile): ReadonlySet<string> {
  const out = new Set<string>();
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (init === undefined || !init.isKind(SyntaxKind.CallExpression) || !HOOK_CALL_RE.test(init.getExpression().getText())) {
      continue;
    }
    const name = decl.getNameNode();
    if (name.isKind(SyntaxKind.Identifier)) {
      out.add(name.getText());
      continue;
    }
    for (const element of name.getDescendantsOfKind(SyntaxKind.Identifier)) {
      out.add(element.getText());
    }
  }
  return out;
}

/** Genuine VALUE reads of one of `keys` inside `node`, in source order.
 *
 *  The `.value` half of a property access and a property NAME in an object literal are excluded:
 *  `slots.value()` and `{ value: x }` MENTION the word without reading the binding, and counting them is how
 *  `baseui-state-data-attributes` once false-positived on our own slot helpers (`select.tsx`'s
 *  `slots.value()` is the live case). */
export function stateKeyReads(node: Node, keys: readonly string[]): readonly Identifier[] {
  return node.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => keys.includes(id.getText()) && isValueRead(id));
}

function isValueRead(id: Identifier): boolean {
  const parent = id.getParent();
  if (parent.isKind(SyntaxKind.PropertyAccessExpression) && parent.getNameNode() === id) {
    return false;
  }
  return !(parent.isKind(SyntaxKind.PropertyAssignment) && parent.getNameNode() === id);
}

/** Does `expression` read `document.body` — the unsafe Base UI portal default, spelled explicitly? */
export function readsDocumentBody(expression: Node): boolean {
  return [expression, ...expression.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)].some(
    (node) => node.isKind(SyntaxKind.PropertyAccessExpression) && node.getName() === "body" && node.getExpression().getText() === "document",
  );
}

function isParameterRead(node: Node, parameters: readonly ParameterDeclaration[]): boolean {
  return node.isKind(SyntaxKind.Identifier) && node.getDefinitionNodes().some((definition) => parameters.includes(definition as ParameterDeclaration));
}

function bindingFromParameter(binding: Node, parameters: readonly ParameterDeclaration[]): boolean {
  const parameter = binding.getFirstAncestorByKind(SyntaxKind.Parameter);
  if (parameter !== undefined) {
    return parameters.includes(parameter);
  }
  const initializer = binding.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
  return initializer !== undefined && isParameterRead(unwrapExpression(initializer), parameters);
}

/** Does `expression` consume a `container` prop of one of `parameters` — as `props.container`, or as a
 *  destructured `{ container }` binding (directly, or via a `const { container } = props` statement)?
 *
 *  PRESENCE IS NOT WIRING, which is the whole point: a `container={somethingElse}` attribute satisfies a
 *  naive attribute check while delivering exactly the unsafe default. */
export function consumesContainerProp(expression: Node, parameters: readonly ParameterDeclaration[]): boolean {
  for (const access of [expression, ...expression.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)]) {
    if (
      access.isKind(SyntaxKind.PropertyAccessExpression) &&
      access.getName() === CONTAINER_PROP &&
      isParameterRead(unwrapExpression(access.getExpression()), parameters)
    ) {
      return true;
    }
  }
  for (const id of [expression, ...expression.getDescendantsOfKind(SyntaxKind.Identifier)]) {
    if (
      id.isKind(SyntaxKind.Identifier) &&
      id.getText() === CONTAINER_PROP &&
      id.getDefinitionNodes().some((definition) => definition.isKind(SyntaxKind.BindingElement) && bindingFromParameter(definition, parameters))
    ) {
      return true;
    }
  }
  return false;
}

/** Absolute ts-morph path → the repo-relative posix path gates report with. */
function repoRelative(path: string): string {
  const idx = path.indexOf("/packages/");
  if (idx !== -1) {
    return path.slice(idx + 1);
  }
  const tooling = path.indexOf("/tooling/");
  return tooling === -1 ? path : path.slice(tooling + 1);
}
