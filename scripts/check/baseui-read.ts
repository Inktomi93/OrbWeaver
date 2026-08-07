// The ONE reader for "what does the INSTALLED @base-ui/react actually expose, and what does @orb/ui
// actually render". Every `baseui-*` gate and `gen-baseui-surface.ts` reads through here, so the surface
// is derived from the package on disk exactly once, in one spelling.
//
// WHY A PRIVATE ts-morph Project (the one sanctioned exception to GATE-AUTHORING §1's "never
// `new Project(`"): that rule protects the shared WORKSPACE from being re-loaded per gate. The installed
// `.d.ts` surface is NOT the workspace — it is not in `harnessGlobs`, no gate can subscribe to its nodes,
// and it must be read out of `node_modules` or the manifest has nothing to be compared against. Measured
// 788 files / ~270ms, loaded lazily and cached per process.
//
// DECLARED LIMIT: the surface is read SYNTACTICALLY off the shipped declarations — own-declared members of
// `<Symbol>Props` plus the heritage clause NAMES. Props inherited through `BaseUIComponentProps` (className,
// render, style, and the whole HTML attribute surface) are deliberately NOT expanded: they are universal,
// they are not what a seal re-spells by accident, and expanding them would make every gate keyed on this
// manifest fire on `className` in all ~40 seals (crunch item 5 — a separate, deliberate decision about our
// `cn()` seam, not this manifest's business).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExportDeclaration, ExportSpecifier, InterfaceDeclaration, SourceFile, TypeAliasDeclaration, TypeNode } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";

/** Where the package is installed. `@orb/ui` is its only dependent, so pnpm hangs the symlink here. */
export const BASE_UI_PKG_REL = "packages/ui/node_modules/@base-ui/react";
/** The manifest the installed surface is adjudicated against (the §2 site-6 baseline-file sibling). */
export const BASE_UI_MANIFEST_REL = "scripts/check/gates/baseui-surface.manifest.json";
/** The import prefix that marks a file as a Base UI consumer. */
export const BASE_UI_MODULE_PREFIX = "@base-ui/react/";
/** Where a seal may live. Base UI is a `@orb/ui` dependency only — features compose sealed primitives. */
export const UI_SRC = "packages/ui/src/";

// ── the INSTALLED surface ───────────────────────────────────────────────────────────────────────────

/** `part` = an anatomy part (its declaration file declares `<Symbol>Props`); `hook` / `type` = the other
 *  things a component module re-exports (`useFilteredItems`, `Field.ValidityData`). Only a `part` owes a
 *  disposition — a hook has no anatomy to expose or seal away. */
export type ExportKind = "part" | "hook" | "type";

export interface InstalledPart {
  readonly kind: ExportKind;
  /** The UNDERLYING declaration name behind the export alias (`Drawer.Handle` → `DrawerHandle`). Recorded
   *  because a re-typing keeps the alias and swaps the target: 1.6's `Drawer.Handle` aliased dialog's
   *  `DialogHandle`, 1.7 mints its own — a material public-surface change the changelog filed as a "fix". */
  readonly symbol: string;
  /** The module the part is re-exported FROM, relative to its component dir. Same reason as `symbol`. */
  readonly from: string;
  /** Every prop NAME this part accepts, sorted (own-declared plus everything the expander resolved through
   *  intersections / `Omit` / `Pick` / heritage). Empty for a hook/type export. */
  readonly props: readonly string[];
  /** The subset of `props` whose declared type is (or contains) a FUNCTION signature, mapped to that
   *  signature's PARAMETER COUNT. This is what makes eventDetails-stripping detectable without a type
   *  checker: Base UI's change handlers are `(value, eventDetails) => void`, so a seal that re-declares one
   *  as `(value) => void` is an arity LOSS visible in the AST (crunch item 6 — the two live cases were
   *  `Combobox`/`Autocomplete`, and the same shape was still live in `Textarea` and `ColorField`). */
  readonly handlers: Readonly<Record<string, number>>;
  /** The keys of `<Symbol>State` — Base UI's own STATE surface for the part, and therefore exactly the set
   *  of `data-*` attributes it stamps on the DOM (`open` → `data-open`, `readOnly` → `data-readonly`). This
   *  is what lets `baseui-state-data-attributes` be a structural rule rather than a name hunch: a seal
   *  computing a class from a boolean that is ALREADY on the element as a data-attribute is re-deriving
   *  state the framework hands it. */
  readonly state: readonly string[];
  /** Heritage / intersection arms the expander deliberately stopped at or could not resolve, as written. */
  readonly inherits: readonly string[];
}

export interface InstalledComponent {
  /** The import specifier a seal writes: `@base-ui/react/select`. */
  readonly module: string;
  /** True when the module re-exports a parts NAMESPACE (`export * as Select from "./index.parts.js"`), so
   *  a seal writes `<BaseSelect.Trigger>`; false for a flat single component (`<BaseButton>`). */
  readonly namespaced: boolean;
  readonly parts: Readonly<Record<string, InstalledPart>>;
}

export interface InstalledSurface {
  readonly version: string;
  readonly components: Readonly<Record<string, InstalledComponent>>;
}

const NAMESPACE_REEXPORT = /export\s+\*\s+as\s+(?<ns>\w+)\s+from\s+"\.\/index\.parts\.js"/u;
const FLAT_REEXPORT = /export\s+\{\s*(?<name>\w+)\s*\}\s+from/u;
/** Package plumbing: real directories with declarations that publish no component anatomy. */
const NON_COMPONENT_DIRS = new Set(["docs", "internals", "types", "utils", "floating-ui-react", "merge-props", "use-render", "unstable-use-media-query"]);

/** Caches are keyed BY ROOT, never a single slot: gate conformance runs each example in its own temp tree
 *  with its own synthetic `@base-ui/react`, and a one-slot cache would serve example #1's surface to every
 *  later example — a self-proof that silently stops proving anything. */
const projectByPkgDir = new Map<string, Project>();
const surfaceByRoot = new Map<string, InstalledSurface>();

/** Test seam: drop the process caches (a test that rewrites a tree in place needs this). */
export function resetBaseUiSurfaceCache(): void {
  projectByPkgDir.clear();
  surfaceByRoot.clear();
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

const JS_EXT_RE = /\.js$/u;

/** `./root/SelectRoot.js` → the `.d.ts` beside it. */
function declarationFile(project: Project, fromDir: string, specifier: string): SourceFile | undefined {
  return project.getSourceFile(join(fromDir, specifier.replace(JS_EXT_RE, ".d.ts")));
}

/** Where prop EXPANSION deliberately stops. `BaseUIComponentProps` (className/render/style + the whole HTML
 *  attribute surface) and the React prop helpers are universal: every part has them, no seal re-spells them
 *  by accident, and expanding them would drown every gate keyed on this manifest in `className`. The arm's
 *  TEXT is recorded in `inherits` instead, so a bump that changes its SHAPE is still a visible diff. */
const EXPANSION_STOPS = new Set([
  "BaseUIComponentProps",
  "NativeButtonProps",
  "NonNativeButtonProps",
  "HTMLProps",
  "ComponentPropsWithRef",
  "ComponentProps",
  "HTMLAttributes",
  "React",
]);
/** Mapped helpers the expander understands structurally rather than resolving. */
const OMIT_LIKE = new Set(["Omit"]);
const PICK_LIKE = new Set(["Pick"]);
const PASSTHROUGH = new Set(["Partial", "Required", "Readonly", "Simplify", "WithBaseUIEvent", "NoInfer"]);
/** Depth is bounded so a pathological alias chain can never hang the harness. MEASURED: `Combobox.Root`
 *  needs 10 hops (`ComboboxRootProps` → `&` → `Omit` → `AriaCombobox.Props` → `AriaComboboxProps` → `&` →
 *  the internal `ComboboxRootProps` interface). A cap of 8 truncated exactly there and reported 14 props
 *  instead of 44 — SILENTLY, on the one component crunch item 6 is about. Truncation is now RECORDED in
 *  `inherits` rather than dropped, so the next time the ceiling is hit the manifest says so out loud. */
const MAX_EXPANSION_DEPTH = 32;
/** Marker written into `inherits` when the depth cap cut an expansion short — never silence. */
const TRUNCATED = "TRUNCATED:";

interface Expansion {
  readonly props: Set<string>;
  /** prop name → parameter count of the function signature in its type (absent = not a handler). */
  readonly handlers: Map<string, number>;
  /** Arms the expander deliberately stopped at or could not resolve, as written. */
  readonly inherits: Set<string>;
}

function emptyExpansion(): Expansion {
  return { props: new Set(), handlers: new Map(), inherits: new Set() };
}

/** The function signature inside a prop's declared type, seen through the `((…) => R) | undefined` union
 *  and parenthesis wrappers Base UI writes every handler in. Returns the PARAMETER COUNT, or undefined when
 *  the type carries no signature at all. A union-blind reader would classify every Base UI handler as a
 *  plain value — the §5 literal-shape blindness class, applied to types. */
export function signatureArity(node: TypeNode | undefined): number | undefined {
  // ONE return path (the pass.ts idiom): tsc's noImplicitReturns wants every path to return, biome calls a
  // bare `return undefined;` useless — an accumulator satisfies both without suppressing either.
  let arity: number | undefined;
  if (node !== undefined && Node.isFunctionTypeNode(node)) {
    arity = node.getParameters().length;
  } else if (node !== undefined && Node.isParenthesizedTypeNode(node)) {
    arity = signatureArity(node.getTypeNode());
  } else if (node !== undefined && Node.isUnionTypeNode(node)) {
    arity = node
      .getTypeNodes()
      .map((arm) => signatureArity(arm))
      .find((found) => found !== undefined);
  }
  return arity;
}

/** Record one property's name — and its handler arity when it has a signature. */
function addProperty(into: Expansion, name: string, typeNode: TypeNode | undefined): void {
  into.props.add(name);
  const arity = signatureArity(typeNode);
  if (arity !== undefined && !into.handlers.has(name)) {
    into.handlers.set(name, arity);
  }
}

/** A named type applied to arguments, as reached from EITHER a `TypeReference` node or an interface's
 *  heritage clause — two different node kinds carrying the same information. Normalizing to one shape is
 *  what stops the heritage path from quietly resolving fewer helpers than the alias path. */
interface TypeRef {
  readonly head: string;
  readonly args: readonly TypeNode[];
  readonly text: string;
}

/** One position in the walk: which package Project, which file, how deep, and the cycle guard (SHARED by
 *  reference across the whole walk — the position is what changes, not the memory). Bundling these is not
 *  cosmetic: the recursion is four mutually-calling arms deep, and threading `project`/`seen` by hand
 *  through every one is how an arm ends up with its own empty guard and silently re-walks a cycle. */
interface Walk {
  readonly project: Project;
  readonly sf: SourceFile;
  readonly depth: number;
  readonly seen: Set<string>;
}

/** One hop deeper, optionally crossing into another file. */
function descend(w: Walk, sf: SourceFile = w.sf): Walk {
  return { project: w.project, sf, depth: w.depth + 1, seen: w.seen };
}

const WHITESPACE_RUN = /\s+/gu;

function flat(node: Node): string {
  return node.getText().replace(WHITESPACE_RUN, " ");
}

/** The string keys inside a `'a' | 'b'` union (or a single literal) — an `Omit`/`Pick` key argument. */
function literalKeys(node: TypeNode): string[] {
  if (Node.isLiteralTypeNode(node)) {
    const literal = node.getLiteral();
    return Node.isStringLiteral(literal) ? [literal.getLiteralText()] : [];
  }
  if (Node.isUnionTypeNode(node)) {
    return node.getTypeNodes().flatMap(literalKeys);
  }
  return [];
}

/** Merge `from` into `into`, keeping only the props `keep` admits. */
function mergeProps(into: Expansion, from: Expansion, keep: (name: string) => boolean): void {
  for (const name of from.props) {
    if (!keep(name)) {
      continue;
    }
    into.props.add(name);
    const arity = from.handlers.get(name);
    if (arity !== undefined && !into.handlers.has(name)) {
      into.handlers.set(name, arity);
    }
  }
  for (const arm of from.inherits) {
    into.inherits.add(arm);
  }
}

/** The declaration named by `NS.Member` inside `w.sf`, when the namespace is declared there. */
function namespacedDeclaration(w: Walk, head: string, member: string): InterfaceDeclaration | TypeAliasDeclaration | undefined {
  const ns = w.sf.getModule(head);
  return ns?.getTypeAlias(member) ?? ns?.getInterface(member);
}

/** The file a RELATIVE import of `head` resolves to, when this file imports that name. */
function importedFileFor(w: Walk, head: string): SourceFile | undefined {
  const imp = w.sf
    .getImportDeclarations()
    .find(
      (d) => d.getModuleSpecifierValue().startsWith(".") && d.getNamedImports().some((spec) => (spec.getAliasNode()?.getText() ?? spec.getName()) === head),
    );
  return imp === undefined ? undefined : declarationFile(w.project, dirname(w.sf.getFilePath()), imp.getModuleSpecifierValue());
}

/** Find the declaration a type NAME refers to, following the file's own imports one hop at a time. Handles
 *  `Foo`, and the namespace form `NS.Member` used by Base UI's internal `AriaCombobox.Props`. */
function findDeclaration(w: Walk, name: string): { sf: SourceFile; node: InterfaceDeclaration | TypeAliasDeclaration } | undefined {
  const [head, member] = name.split(".");
  if (head === undefined) {
    return;
  }
  const local = member === undefined ? (w.sf.getInterface(head) ?? w.sf.getTypeAlias(head)) : namespacedDeclaration(w, head, member);
  if (local !== undefined) {
    return { sf: w.sf, node: local };
  }
  const target = importedFileFor(w, head);
  return target === undefined ? undefined : findDeclaration(descend(w, target), name);
}

function expandRef(w: Walk, ref: TypeRef, into: Expansion): void {
  if (EXPANSION_STOPS.has(ref.head) || ref.head.startsWith("React.")) {
    into.inherits.add(ref.text);
    return;
  }
  const [first, second] = ref.args;
  if (first !== undefined && second !== undefined && (OMIT_LIKE.has(ref.head) || PICK_LIKE.has(ref.head))) {
    const inner = emptyExpansion();
    expandType(descend(w), first, inner);
    const keys = new Set(literalKeys(second));
    mergeProps(into, inner, (name) => (OMIT_LIKE.has(ref.head) ? !keys.has(name) : keys.has(name)));
    return;
  }
  if (first !== undefined && PASSTHROUGH.has(ref.head)) {
    expandType(descend(w), first, into);
    return;
  }
  const found = findDeclaration(w, ref.head);
  if (found === undefined) {
    into.inherits.add(ref.text);
    return;
  }
  expandDeclaration(descend(w, found.sf), found.node, into);
}

function expandType(w: Walk, node: TypeNode, into: Expansion): void {
  if (w.depth > MAX_EXPANSION_DEPTH) {
    into.inherits.add(`${TRUNCATED}${flat(node)}`);
    return;
  }
  if (Node.isTypeLiteral(node)) {
    for (const p of node.getProperties()) {
      addProperty(into, p.getName(), p.getTypeNode());
    }
    return;
  }
  if (Node.isIntersectionTypeNode(node) || Node.isUnionTypeNode(node)) {
    for (const arm of node.getTypeNodes()) {
      expandType(descend(w), arm, into);
    }
    return;
  }
  if (Node.isParenthesizedTypeNode(node)) {
    expandType(descend(w), node.getTypeNode(), into);
    return;
  }
  if (Node.isTypeReference(node)) {
    expandRef(w, { head: node.getTypeName().getText(), args: node.getTypeArguments(), text: flat(node) }, into);
    return;
  }
  into.inherits.add(flat(node));
}

function expandDeclaration(w: Walk, decl: InterfaceDeclaration | TypeAliasDeclaration, into: Expansion): void {
  const key = `${w.sf.getFilePath()}#${decl.getName()}`;
  if (w.seen.has(key)) {
    return;
  }
  if (w.depth > MAX_EXPANSION_DEPTH) {
    into.inherits.add(`${TRUNCATED}${decl.getName()}`);
    return;
  }
  w.seen.add(key);
  if (Node.isInterfaceDeclaration(decl)) {
    for (const p of decl.getProperties()) {
      addProperty(into, p.getName(), p.getTypeNode());
    }
    for (const h of decl.getExtends()) {
      expandRef(descend(w), { head: h.getExpression().getText(), args: h.getTypeArguments(), text: flat(h) }, into);
    }
    return;
  }
  const body = decl.getTypeNode();
  if (body !== undefined) {
    expandType(descend(w), body, into);
  }
}

/** Fully expand `<name>` declared in `sf`, on a fresh cycle guard. */
function expandNamed(project: Project, sf: SourceFile, name: string): Expansion | undefined {
  const decl = sf.getInterface(name) ?? sf.getTypeAlias(name);
  if (decl === undefined) {
    return;
  }
  const into = emptyExpansion();
  expandDeclaration({ project, sf, depth: 0, seen: new Set() }, decl, into);
  return into;
}

/** The prop + state surface of `<symbol>Props` / `<symbol>State`, fully expanded. `undefined` = this export
 *  declares no Props type at all, so it is a hook or a type re-export, not an anatomy part.
 *
 *  WHY NOT `getProperties()` ON THE INTERFACE AND STOP (the blind spot the expander replaced):
 *  `ComboboxRootProps` is a TYPE ALIAS whose right-hand side is `Omit<AriaCombobox.Props<…>, …> & { … }`, so
 *  a TypeLiteral-only reader returned ZERO props for the single component crunch item 6 is about — a gate
 *  keyed on that would have been silently, confidently green (GATE-AUTHORING.md §5, literal-shape blindness). */
function propsOf(project: Project, sf: SourceFile, symbol: string): Omit<InstalledPart, "kind" | "symbol" | "from"> | undefined {
  const props = expandNamed(project, sf, `${symbol}Props`);
  if (props === undefined) {
    return;
  }
  const state = expandNamed(project, sf, `${symbol}State`);
  return {
    props: [...props.props].sort(),
    handlers: Object.fromEntries([...props.handlers.entries()].sort(([a], [b]) => a.localeCompare(b))),
    state: state === undefined ? [] : [...state.props].sort(),
    inherits: [...props.inherits].sort(),
  };
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

/** What the `@orb/ui` seal does with an anatomy part.
 *  - `exposed`      — the seal renders it (`baseui-anatomy-completeness` proves the claim against the JSX);
 *  - `sealed-away`  — deliberately not rendered, `why` states the decision AND what would end it;
 *  - `n-a`          — nothing in `@orb/ui` wraps this component at all;
 *  - `unresolved`   — the birth state a version bump mints. ALWAYS RED; a human adjudicates it away. */
export type Disposition = "exposed" | "sealed-away" | "n-a" | "unresolved";

export const DISPOSITIONS: readonly Disposition[] = ["exposed", "sealed-away", "n-a", "unresolved"];

export interface ManifestPart extends InstalledPart {
  readonly disposition: Disposition;
  /** Why, and what would end it — the `ExemptionRow` discipline expressed in JSON. Mandatory for every
   *  disposition except `exposed` (whose justification is the rendered JSX the gate checks). */
  readonly why: string;
}

export interface ManifestComponent {
  readonly module: string;
  readonly namespaced: boolean;
  readonly parts: Readonly<Record<string, ManifestPart>>;
}

export interface SurfaceManifest {
  readonly version: string;
  readonly components: Readonly<Record<string, ManifestComponent>>;
}

export function readManifest(root: string): SurfaceManifest | undefined {
  const path = join(root, BASE_UI_MANIFEST_REL);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as SurfaceManifest) : undefined;
}

// ── what @orb/ui actually IMPORTS and RENDERS ───────────────────────────────────────────────────────

/** One `@base-ui/react/*` named binding in a file. */
export interface BaseUiBinding {
  /** The local identifier in this file (`BaseSelect`). */
  readonly local: string;
  /** The exported name (`Select`) — the manifest's component key for a value import. */
  readonly exported: string;
  /** The module specifier (`@base-ui/react/select`). */
  readonly module: string;
  /** True for a type-only binding (`import type { SelectRootProps }`) — never a render site. */
  readonly typeOnly: boolean;
}

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

/** Where a Base UI part is rendered. */
export interface RenderSite {
  readonly file: string;
  readonly line: number;
}

/** Absolute ts-morph path → the repo-relative posix path gates report with. */
export function repoRelative(path: string): string {
  const idx = path.indexOf("/packages/");
  if (idx !== -1) {
    return path.slice(idx + 1);
  }
  const scripts = path.indexOf("/scripts/");
  return scripts === -1 ? path : path.slice(scripts + 1);
}
