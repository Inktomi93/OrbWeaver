// THE SHAPE DERIVATIONS of the `baseui-*` family over inputs that have ALREADY been acquired: the anatomy
// walk over a loaded `.d.ts` Project (`installedSurfaceOver`, `stateAttributeValuesOver`), the committed
// manifest JSON → `SurfaceManifest` reader (`surfaceManifestFrom`), and the two surface tripwires. Split out
// of `baseui-read.ts` at the size cap (2026-09-18). NO ACQUISITION HERE BY DESIGN: both `new Project(` sites,
// the caches, the fs reads and the resource doors stay in `baseui-read.ts`, where the
// `tooling-project-home:baseui-read` grant licenses them, and that module keeps the derived names every gate
// imports as its own door — this module imports nothing from it.
import { join } from "node:path";
import type { ExportDeclaration, ExportSpecifier, Project } from "ts-morph";
import type {
  Disposition,
  ExportKind,
  InstalledComponent,
  InstalledPart,
  InstalledSurface,
  ManifestComponent,
  ManifestPart,
  SurfaceManifest,
  SurfaceManifestRead,
} from "../contract/baseui.ts";
import { DISPOSITIONS, EXPORT_KINDS } from "../contract/baseui.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { declarationFile, propsOf, TRUNCATED } from "./baseui-expand.ts";

/** The import prefix that marks a file as a Base UI consumer. */
export const BASE_UI_MODULE_PREFIX = "@base-ui/react/";

const NAMESPACE_REEXPORT = /export\s+\*\s+as\s+(?<ns>\w+)\s+from\s+"\.\/index\.parts\.js"/u;
const FLAT_REEXPORT = /export\s+\{\s*(?<name>\w+)\s*\}\s+from/u;
/** Package plumbing: real directories with declarations that publish no component anatomy. */
const NON_COMPONENT_DIRS = new Set(["docs", "internals", "types", "utils", "floating-ui-react", "merge-props", "use-render", "unstable-use-media-query"]);

/** The door's paths, fenced to the fs glob's own set: every declaration at least one directory below the
 *  package root. See the header — this is what makes the two acquisitions admit the identical set. */
export function nestedDeclarations(pkgDir: string, declarationPaths: readonly string[]): readonly string[] {
  const prefix = `${pkgDir}/`;
  return declarationPaths.filter((path) => path.startsWith(prefix) && path.slice(prefix.length).includes("/"));
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
  const namespaced = project.getSourceFile(join(componentDir, "index.parts.d.ts")) !== undefined;
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

/** The namespace/component NAME a module dir publishes (`select` → `Select`), read from its own index.
 *  Read out of the loaded project rather than off disk, so the acquisition that enumerated the paths is the
 *  only thing that touches a filesystem. */
function publishedName(project: Project, pkgDir: string, dir: string): string | undefined {
  const index = project.getSourceFile(join(pkgDir, dir, "index.d.ts"))?.getFullText();
  if (index === undefined) {
    return;
  }
  return NAMESPACE_REEXPORT.exec(index)?.groups?.["ns"] ?? FLAT_REEXPORT.exec(index)?.groups?.["name"];
}

/** Component module dirs, DERIVED from the entry files rather than listed — so a new module in a version
 *  bump appears on its own, which is the whole point of the tripwire.
 *
 *  The DERIVATION IS THE SAME on both acquisitions: a component dir is a direct child of the package root
 *  publishing an `index.d.ts`. The fs half used to ask `readdirSync` for directories and then `existsSync`
 *  for the entry; the entry test is what actually decided, so reading the loaded project's own paths admits
 *  the identical set with no second filesystem question. */
function componentDirs(project: Project, pkgDir: string): string[] {
  const prefix = `${pkgDir}/`;
  const dirs = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!path.startsWith(prefix)) {
      continue;
    }
    const [dir, ...rest] = path.slice(prefix.length).split("/");
    if (dir !== undefined && rest.length === 1 && rest[0] === "index.d.ts" && !NON_COMPONENT_DIRS.has(dir)) {
      dirs.add(dir);
    }
  }
  return [...dirs].sort();
}

/** THE ONE anatomy derivation. Both acquisitions land here: the fs half below, and the declared
 *  `installed-package:base-ui` resource door through `installedSurfaceFrom`. */
export function installedSurfaceOver(project: Project, pkgDir: string, version: string): InstalledSurface {
  const components: Record<string, InstalledComponent> = {};
  for (const dir of componentDirs(project, pkgDir)) {
    const name = publishedName(project, pkgDir, dir);
    const component = name === undefined ? undefined : readComponent(project, pkgDir, dir);
    if (name !== undefined && component !== undefined && Object.keys(component.parts).length > 0) {
      components[name] = component;
    }
  }
  return { version, components: sortKeys(components) };
}

/** THE ONE state-attribute derivation, shared by both acquisitions (see `installedSurfaceOver`). */
export function stateAttributeValuesOver(project: Project): ReadonlyMap<string, ReadonlySet<string>> {
  const mutable = new Map<string, Set<string>>();
  for (const source of project.getSourceFiles()) {
    for (const declaration of source.getInterfaces().filter((candidate) => candidate.getName().endsWith("State"))) {
      recordStateInterface(mutable, declaration);
    }
  }
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
