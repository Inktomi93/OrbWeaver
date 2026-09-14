// UI primitive judgments over one immutable source/resource snapshot. Permission candidates are
// emitted before authority reconciliation; this reader contains no private exception tables.
import type { Node } from "ts-morph";
import type { GateFactValue } from "../contract/fact.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import type { SourceEvidence, uiPrimitiveFact } from "./ui-primitive-fact.ts";

type Snapshot = GateFactValue<typeof uiPrimitiveFact> & {
  readonly primitiveEntries: readonly ResourceTreeEntry[];
  readonly testEntries: readonly ResourceTreeEntry[];
};
type Sources = GateFactValue<typeof uiPrimitiveFact>["sources"];
interface Site {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}
interface Occurrence {
  readonly node: Node;
  readonly token: string;
  readonly offset: number;
}
interface Permission {
  readonly subject: string;
  readonly operation: "primitive-shape" | "primitive-ct" | "test-color-values" | "inline-test-provider";
  readonly sites: readonly Site[];
}
const PRIMITIVES = "packages/ui/src/primitives";
const ANCHORED = new Set(["popover", "menu", "select", "autocomplete", "tooltip"]);
const MODAL = new Set(["dialog", "alert-dialog", "drawer"]);
const COLOR_LITERAL_RE = /(?:oklch|\brgba?)\\?\((?=[^)\n]*\d)|#[0-9a-fA-F]{3,8}\b/u;
const VARIANTS_SPEC_RE = /(?:^|\/)variants$/u;

function primitiveNames(snapshot: Snapshot): readonly string[] {
  return snapshot.primitiveEntries
    .filter(({ path, kind }) => kind === "directory" && path.startsWith(`${PRIMITIVES}/`) && !path.slice(PRIMITIVES.length + 1).includes("/"))
    .map(({ path }) => path.slice(PRIMITIVES.length + 1))
    .sort();
}
function camelCase(kebab: string): string {
  return kebab.replace(/-(?<letter>[a-z])/gu, (_m, c: string) => c.toUpperCase());
}
function shapeSites(snapshot: Snapshot, entries: ReadonlySet<string>, name: string): readonly Site[] {
  const dir = `${PRIMITIVES}/${name}`;
  const sites: Site[] = [];
  for (const required of [`${name}.tsx`, "index.ts", "variants.ts"]) {
    if (!entries.has(`${dir}/${required}`)) {
      sites.push({ file: `${dir}/`, line: 1, message: `missing ${required} — a styled primitive requires its component, index and variants files.` });
    }
  }
  const variants = snapshot.sources.get(`${dir}/variants.ts`);
  if (variants !== undefined) {
    const expected = `${camelCase(name)}Variants`;
    if (variants.tvExports.length !== 1) {
      sites.push({
        file: `${dir}/variants.ts`,
        line: 1,
        message: `variants.ts must export exactly one tv() const (found ${variants.tvExports.length}); expected ${expected}.`,
      });
    } else {
      const only = variants.tvExports[0];
      if (only !== undefined && only.getName() !== expected) {
        sites.push({ file: `${dir}/variants.ts`, line: only.getStartLineNumber(), message: `tv-export-name:${only.getName()} — expected ${expected}.` });
      }
    }
  }
  const component = snapshot.sources.get(`${dir}/${name}.tsx`);
  if (component !== undefined && !component.code.includes("data-slot")) {
    sites.push({ file: `${dir}/${name}.tsx`, line: 1, message: "no data-slot locator — every primitive part declares its locator." });
  }
  return sites;
}
function overlaySites(sources: Sources, name: string): readonly Site[] {
  const file = `${PRIMITIVES}/${name}/${name}.tsx`;
  const component = sources.get(file);
  if (component === undefined) {
    return [];
  }
  const has = (part: string): boolean => component.code.includes(`.${part}`);
  const sites: Site[] = [];
  if (ANCHORED.has(name) && has("Popup") && !has("Positioner")) {
    sites.push({ file, line: 1, message: `anchored overlay '${name}' has a .Popup but no .Positioner.` });
  }
  if (MODAL.has(name)) {
    if (!(has("Backdrop") && has("Popup"))) {
      sites.push({ file, line: 1, message: `modal overlay '${name}' must use .Backdrop + .Popup.` });
    }
    if (has("Positioner")) {
      sites.push({ file, line: 1, message: `modal overlay '${name}' must NOT have a .Positioner.` });
    }
  }
  return sites;
}

function colorPermission(file: string, source: SourceEvidence): Permission | undefined {
  if (!(file.startsWith("tests/ui/") && file.endsWith(".ct.tsx"))) {
    return;
  }
  const sites = source.colorText
    .split("\n")
    .flatMap((line, index) =>
      COLOR_LITERAL_RE.test(line) ? [{ file, line: index + 1, message: "hardcoded color literal in a .ct.tsx — assert colors via TOKENS." }] : [],
    );
  return sites.length > 0 ? { subject: file, operation: "test-color-values", sites } : undefined;
}
function collectProviders(file: string, source: SourceEvidence, providers: Map<string, Site[]>): void {
  if (!(file.startsWith("tests/ui/") && /\.(?:ct|fixtures)\.tsx$/u.test(file))) {
    return;
  }
  for (const element of source.jsx) {
    if (!element.tag.endsWith("Provider")) {
      continue;
    }
    const sites = providers.get(element.tag) ?? [];
    sites.push({ file, line: element.line, message: `inline <${element.tag}> in a test — global providers live in CtProviders.` });
    providers.set(element.tag, sites);
  }
}
function sourceOccurrences(file: string, source: SourceEvidence): readonly Occurrence[] {
  if (!file.startsWith("packages/ui/src/")) {
    return [];
  }
  const occurrences: Occurrence[] = [];
  if (file.endsWith("/index.ts")) {
    for (const declaration of source.exports) {
      const specifier = declaration.getModuleSpecifier();
      const value = declaration.getModuleSpecifierValue();
      if (specifier !== undefined && value !== undefined && VARIANTS_SPEC_RE.test(value)) {
        occurrences.push({ node: specifier, token: value, offset: 1 });
      }
    }
  }
  if (file.endsWith(".tsx") && !file.includes("/charts/")) {
    for (const element of source.jsx) {
      if (element.tag === "svg") {
        occurrences.push({ node: element.node, token: "svg", offset: element.node.getText().indexOf("svg") });
      }
    }
  }
  return occurrences;
}

export function readUiPrimitiveStructure(snapshot: Snapshot): {
  readonly permissions: readonly Permission[];
  readonly occurrences: readonly Occurrence[];
  readonly health: readonly Site[];
  readonly primitives: number;
} {
  const names = primitiveNames(snapshot);
  const permissions: Permission[] = [];
  const occurrences: Occurrence[] = [];
  const health: Site[] = [];
  const tests = new Set(snapshot.testEntries.map(({ path }) => path));
  const entries = new Set(snapshot.primitiveEntries.map(({ path }) => path));
  for (const name of names) {
    const subject = `${PRIMITIVES}/${name}`;
    const shape = shapeSites(snapshot, entries, name);
    if (shape.length > 0) {
      permissions.push({ subject, operation: "primitive-shape", sites: shape });
    }
    const expected = `tests/ui/primitives/${name}/${name}.ct.tsx`;
    if (!tests.has(expected)) {
      permissions.push({ subject, operation: "primitive-ct", sites: [{ file: `${subject}/`, line: 1, message: `no co-located CT — expected ${expected}.` }] });
    }
    health.push(...overlaySites(snapshot.sources, name));
  }
  const providers = new Map<string, Site[]>();
  for (const [file, source] of snapshot.sources) {
    const color = colorPermission(file, source);
    if (color !== undefined) {
      permissions.push(color);
    }
    collectProviders(file, source, providers);
    occurrences.push(...sourceOccurrences(file, source));
  }
  for (const [subject, sites] of providers) {
    permissions.push({ subject, operation: "inline-test-provider", sites });
  }
  return { permissions, occurrences, health, primitives: names.length };
}

/** Syntax-only siblings need no topology acquisition; the source fact owns their admitted census. */
export function readUiPrimitiveOccurrences(sources: Sources): readonly Occurrence[] {
  return [...sources].flatMap(([file, source]) => sourceOccurrences(file, source));
}

export function readUiPrimitiveOverlayHealth(sources: Sources): readonly Site[] {
  return [...ANCHORED, ...MODAL].flatMap((name) => overlaySites(sources, name));
}
