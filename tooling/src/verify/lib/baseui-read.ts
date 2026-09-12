// The ONE reader for "what does the INSTALLED @base-ui/react actually expose, and what does @orb/ui
// actually render". Every `baseui-*` gate and the baseui-surface baseline writer reads through here, so the
// surface is derived from the package on disk exactly once, in one spelling. The prop EXPANDER it delegates
// to is ./baseui-expand.ts; the shapes are ../contract/baseui.ts.
//
// WHY A PRIVATE ts-morph Project (the reviewed grant `tooling-project-home:baseui-read`, not an ambient
// exception): the one-loader rule protects the shared WORKSPACE from being re-loaded per gate. The installed
// `.d.ts` surface is NOT the workspace — it is not in `harnessGlobs`, no gate can subscribe to its nodes,
// and it must be read out of `node_modules` or the manifest has nothing to be compared against. Measured
// 788 files / ~270ms, loaded lazily and cached per process.
//
// WHO STILL USES THE FILESYSTEM HALF, after the #1584 conversion of the `baseui-read` family: ONLY
// `ops/gen/baseui-surface.ts` (the baseline WRITER, a generator rather than a policy) and
// `lib/css-selector-writers.ts` (read by a gate that has not converted yet). Every CONVERTED `baseui-*`
// policy reaches the same data through declared ResourceHost doors — `json:baseui-manifest` for the
// committed ledger — and narrows it here, through `surfaceManifestFrom`, so the manifest's SHAPE has one
// home whichever side reads it. That is why this module keeps its fs imports while the gate modules have
// none: `gate:contract`'s non-negotiables are about what a GATE MODULE does, and a policy that calls
// `surfaceManifestFrom(readyResourceValue(ctx.resources.json(...)).value)` touches no filesystem at all.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExportDeclaration, ExportSpecifier, Identifier, Node, ParameterDeclaration, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type {
  BaseUiBinding,
  Disposition,
  ExportKind,
  InstalledComponent,
  InstalledPart,
  InstalledSurface,
  ManifestComponent,
  ManifestPart,
  RenderSite,
  SurfaceManifest,
  SurfaceManifestRead,
} from "../contract/baseui.ts";
import { DISPOSITIONS, EXPORT_KINDS } from "../contract/baseui.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { unwrapExpression } from "./ast-read.ts";
import { declarationFile, propsOf, TRUNCATED } from "./baseui-expand.ts";

/** Where the package is installed. `@orb/ui` is its only dependent, so pnpm hangs the symlink here. */
export const BASE_UI_PKG_REL = "packages/ui/node_modules/@base-ui/react";
/** The manifest the installed surface is adjudicated against (the §2 site-6 baseline-file sibling). */
export const BASE_UI_MANIFEST_REL = "tooling/src/verify/gates/baseui-surface.manifest.json";
/** The import prefix that marks a file as a Base UI consumer. */
export const BASE_UI_MODULE_PREFIX = "@base-ui/react/";
/** Where a seal may live. Base UI is a `@orb/ui` dependency only — features compose sealed primitives. */
export const UI_SRC = "packages/ui/src/";

const NAMESPACE_REEXPORT = /export\s+\*\s+as\s+(?<ns>\w+)\s+from\s+"\.\/index\.parts\.js"/u;
const FLAT_REEXPORT = /export\s+\{\s*(?<name>\w+)\s*\}\s+from/u;
/** Package plumbing: real directories with declarations that publish no component anatomy. */
const NON_COMPONENT_DIRS = new Set(["docs", "internals", "types", "utils", "floating-ui-react", "merge-props", "use-render", "unstable-use-media-query"]);

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

function surfaceProject(pkgDir: string): Project {
  const hit = projectByPkgDir.get(pkgDir);
  if (hit !== undefined) {
    return hit;
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  project.addSourceFilesAtPaths([`${pkgDir}/*/**/*.d.ts`, `${pkgDir}/*/*.d.ts`]);
  projectByPkgDir.set(pkgDir, project);
  return project;
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

/** One re-export specifier → its manifest entry. A specifier whose target declares no `<Symbol>Props` is a
 *  hook or a type re-export, not an anatomy part — recorded so the bump tripwire still sees it appear or
 *  vanish, but carrying no surface to adjudicate. */
function readExport(project: Project, decl: ExportDeclaration, spec: ExportSpecifier, componentDir: string): { name: string; part: InstalledPart } {
  const specifier = decl.getModuleSpecifierValue() ?? "";
  const symbol = spec.getName();
  const name = spec.getAliasNode()?.getText() ?? symbol;
  const target = declarationFile(project, componentDir, specifier);
  const shape = target === undefined ? undefined : propsOf(project, target, symbol);
  if (shape !== undefined) {
    return { name, part: { kind: "part", symbol, from: specifier, ...shape } };
  }
  const kind = decl.isTypeOnly() || spec.isTypeOnly() ? "type" : "hook";
  return { name, part: { kind, symbol, from: specifier, props: [], handlers: {}, state: [], inherits: [] } };
}

function readComponent(project: Project, pkgDir: string, dir: string): InstalledComponent | undefined {
  const componentDir = join(pkgDir, dir);
  const namespaced = existsSync(join(componentDir, "index.parts.d.ts"));
  const entry = project.getSourceFile(join(componentDir, namespaced ? "index.parts.d.ts" : "index.d.ts"));
  if (entry === undefined) {
    return;
  }
  const parts: Record<string, InstalledPart> = {};
  for (const decl of entry.getExportDeclarations()) {
    if (decl.getModuleSpecifierValue() === undefined) {
      continue;
    }
    for (const spec of decl.getNamedExports()) {
      const { name, part } = readExport(project, decl, spec, componentDir);
      parts[name] = part;
    }
  }
  return { module: `${BASE_UI_MODULE_PREFIX}${dir}`, namespaced, parts: sortKeys(parts) };
}

/** The namespace/component NAME a module dir publishes (`select` → `Select`), read from its own index. */
function publishedName(pkgDir: string, dir: string): string | undefined {
  const index = readFileSync(join(pkgDir, dir, "index.d.ts"), "utf8");
  return NAMESPACE_REEXPORT.exec(index)?.groups?.["ns"] ?? FLAT_REEXPORT.exec(index)?.groups?.["name"];
}

/** Component module dirs, DERIVED from the entry files rather than listed — so a new module in a version
 *  bump appears on its own, which is the whole point of the tripwire. */
function componentDirs(pkgDir: string): string[] {
  return readdirSync(pkgDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !NON_COMPONENT_DIRS.has(d.name) && existsSync(join(pkgDir, d.name, "index.d.ts")))
    .map((d) => d.name)
    .sort();
}

/** The installed surface, or undefined when the package is not on disk — the §4.6 blindness case every
 *  gate keyed on this must report as RED rather than silently pass. */
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
  const project = surfaceProject(pkgDir);
  const components: Record<string, InstalledComponent> = {};
  for (const dir of componentDirs(pkgDir)) {
    const name = publishedName(pkgDir, dir);
    const component = name === undefined ? undefined : readComponent(project, pkgDir, dir);
    if (name !== undefined && component !== undefined && Object.keys(component.parts).length > 0) {
      components[name] = component;
    }
  }
  const surface: InstalledSurface = { version, components: sortKeys(components) };
  surfaceByRoot.set(root, surface);
  return surface;
}

/** Installed Base UI state attributes and their statically-declared string/number values. Empty values
 * mean a presence-only boolean/state contract; exact CSS values are never guessed from the key alone. */
export function readInstalledStateAttributeValues(root: string): ReadonlyMap<string, ReadonlySet<string>> {
  const hit = stateAttributesByRoot.get(root);
  if (hit !== undefined) {
    return hit;
  }
  const pkgDir = join(root, BASE_UI_PKG_REL);
  if (!existsSync(join(pkgDir, "package.json"))) {
    return new Map();
  }
  const project = surfaceProject(pkgDir);
  const mutable = new Map<string, Set<string>>();
  for (const source of project.getSourceFiles()) {
    for (const declaration of source.getInterfaces().filter((candidate) => candidate.getName().endsWith("State"))) {
      recordStateInterface(mutable, declaration);
    }
  }
  stateAttributesByRoot.set(root, mutable);
  return mutable;
}

function recordStateInterface(mutable: Map<string, Set<string>>, declaration: import("ts-morph").InterfaceDeclaration): void {
  for (const property of declaration.getProperties()) {
    const name = `data-${property.getName().toLowerCase()}`;
    const values = mutable.get(name) ?? new Set<string>();
    const type = property.getType();
    for (const part of type.isUnion() ? type.getUnionTypes() : [type]) {
      const literal = part.getLiteralValue();
      if (typeof literal === "string" || typeof literal === "number") {
        values.add(String(literal));
      }
    }
    mutable.set(name, values);
  }
}

/** The READER'S OWN blindness tripwire (GATE-AUTHORING §4.6). A part whose Props type resolved to NEITHER a
 *  prop NOR a stopped/unresolved heritage arm means the expander learned NOTHING about it — the shape moved
 *  and the resolver silently walked off the end. That is a false GREEN for every gate keyed on the manifest,
 *  so it is reported as loudly as a violation. (Not hypothetical: a depth cap of 8 produced exactly this
 *  class on `Combobox.Root`, cutting 44 props to 14 with no diagnostic at all.)
 *
 *  A part legitimately declaring zero own props still records its `BaseUIComponentProps` arm in `inherits`,
 *  so the "both empty" test does not fire on `Accordion.Header` and friends. */
export function blindParts(surface: InstalledSurface | SurfaceManifest): string[] {
  const out: string[] = [];
  for (const [name, component] of Object.entries(surface.components)) {
    for (const [part, shape] of Object.entries(component.parts)) {
      if (shape.kind === "part" && shape.props.length === 0 && shape.inherits.length === 0) {
        out.push(`${name}.${part}`);
      }
    }
  }
  return out;
}

/** Parts whose prop expansion hit the depth ceiling — recorded, never silent (see `TRUNCATED`). */
export function truncatedParts(surface: InstalledSurface | SurfaceManifest): string[] {
  const out: string[] = [];
  for (const [name, component] of Object.entries(surface.components)) {
    for (const [part, shape] of Object.entries(component.parts)) {
      if (shape.inherits.some((i) => i.startsWith(TRUNCATED))) {
        out.push(`${name}.${part}`);
      }
    }
  }
  return out;
}

// ── the committed MANIFEST (surface + dispositions) ─────────────────────────────────────────────────

export function readManifest(root: string): SurfaceManifest | undefined {
  const path = join(root, BASE_UI_MANIFEST_REL);
  if (!existsSync(path)) {
    return;
  }
  const read = surfaceManifestFrom(JSON.parse(readFileSync(path, "utf8")) as JsonValue);
  return read.ok ? read.manifest : undefined;
}

function refuseManifest(reason: string): SurfaceManifestRead {
  return { ok: false, reason };
}

function isRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: JsonValue | undefined): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isArityMap(value: JsonValue | undefined): value is { readonly [key: string]: number } {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "number");
}

/** One `parts` entry.
 *
 *  ABSENT COLLECTION KEYS DEFAULT TO EMPTY; ONLY A PRESENT-AND-WRONG VALUE REFUSES. That asymmetry is the
 *  LEGACY CONTRACT preserved deliberately, and it was paid for: the first draft of this reader required all
 *  four collections and reported a shape refusal without them, which silenced `baseui-derives-not-respells`
 *  on every fixture that omits `state` — a gate that reads `handlers`/`props` and never touches `state`, so
 *  the legacy `as SurfaceManifest` cast let it through. `tests/tooling/ui-gate-structural-regressions.int.test.ts`
 *  caught it. The real committed ledger carries all nine keys on all 292 parts (measured 2026-09-13), so the
 *  tolerance costs nothing there; what it buys is that TIGHTENING A SHARED READ does not silently disarm a
 *  consumer that never wanted the tightened field. The identity fields — `kind`, `symbol`, `from`,
 *  `disposition`, `why` — are required, because a part with no ruling or no alias target is not a row. */
function manifestPart(value: JsonValue, at: string): ManifestPart | string {
  if (!isRecord(value)) {
    return `${at} is not an object`;
  }
  const { kind, symbol, from, props, handlers, state, inherits, disposition, why } = value;
  if (typeof kind !== "string" || !(EXPORT_KINDS as readonly string[]).includes(kind)) {
    return `${at}.kind is not one of ${EXPORT_KINDS.join("/")}`;
  }
  if (typeof symbol !== "string" || typeof from !== "string" || typeof why !== "string") {
    return `${at} is missing a string symbol/from/why`;
  }
  const wrongCollection = Object.entries({ props, state, inherits }).find(([, entry]) => entry !== undefined && !isStringArray(entry));
  if (wrongCollection !== undefined) {
    return `${at}.${wrongCollection[0]} is present but is not a string array`;
  }
  if (handlers !== undefined && !isArityMap(handlers)) {
    return `${at}.handlers is present but is not a name-to-arity map`;
  }
  if (typeof disposition !== "string" || !(DISPOSITIONS as readonly string[]).includes(disposition)) {
    return `${at}.disposition is not one of ${DISPOSITIONS.join("/")}`;
  }
  return {
    kind: kind as ExportKind,
    symbol,
    from,
    props: isStringArray(props) ? props : [],
    handlers: isArityMap(handlers) ? handlers : {},
    state: isStringArray(state) ? state : [],
    inherits: isStringArray(inherits) ? inherits : [],
    disposition: disposition as Disposition,
    why,
  };
}

function manifestComponent(value: JsonValue, at: string): ManifestComponent | string {
  if (!isRecord(value)) {
    return `${at} is not an object`;
  }
  const { module, namespaced, parts } = value;
  if (typeof module !== "string" || typeof namespaced !== "boolean") {
    return `${at} is missing a string module or a boolean namespaced`;
  }
  if (!isRecord(parts)) {
    return `${at}.parts is not an object`;
  }
  const read: Record<string, ManifestPart> = {};
  for (const [name, part] of Object.entries(parts)) {
    const one = manifestPart(part, `${at}.parts.${name}`);
    if (typeof one === "string") {
      return one;
    }
    read[name] = one;
  }
  return { module, namespaced, parts: read };
}

export function surfaceManifestFrom(value: JsonValue): SurfaceManifestRead {
  if (!isRecord(value)) {
    return refuseManifest("the manifest is not a JSON object");
  }
  if (typeof value["version"] !== "string") {
    return refuseManifest("the manifest has no string `version`");
  }
  const components = value["components"];
  if (!isRecord(components)) {
    return refuseManifest("the manifest has no `components` object");
  }
  const read: Record<string, ManifestComponent> = {};
  for (const [name, component] of Object.entries(components)) {
    const one = manifestComponent(component, `components.${name}`);
    if (typeof one === "string") {
      return refuseManifest(one);
    }
    read[name] = one;
  }
  return { ok: true, manifest: { version: value["version"], components: read } };
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
export function repoRelative(path: string): string {
  const idx = path.indexOf("/packages/");
  if (idx !== -1) {
    return path.slice(idx + 1);
  }
  const tooling = path.indexOf("/tooling/");
  return tooling === -1 ? path : path.slice(tooling + 1);
}
