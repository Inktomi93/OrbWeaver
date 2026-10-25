// Which browser-compat keys (`api.Element.computedStyleMap`, `css.properties.field-sizing`) some declared browser floor cannot run,
// read from MDN's per-key support statements. A key the data does not carry, or a browser it does not list, is unknown and never refused.
import bcd from "@mdn/browser-compat-data" with { type: "json" };
import type { SimpleSupportStatement, SupportStatement } from "@mdn/browser-compat-data/types";

/** Our esbuild-style target names → the compat data's browser ids. */
const BROWSER_IDS: Readonly<Record<string, string>> = { chrome: "chrome", edge: "edge", firefox: "firefox", safari: "safari", ios: "safari_ios" };
const TARGET = /^([a-z]+)(\d+(?:\.\d+)?)$/u;
// The key families the lint judges: browser APIs, JS builtins, CSS properties (and their values) and CSS at-rules.
const ROOTS = [["api"], ["javascript", "builtins"], ["css", "properties"], ["css", "at-rules"]] as const;

type Node = { readonly __compat?: { readonly support: Readonly<Record<string, SupportStatement | undefined>> } } & Readonly<Record<string, unknown>>;

function floorsOf(targets: readonly string[]): ReadonlyMap<string, number> {
  const floors = new Map<string, number>();
  for (const target of targets) {
    const [, name, version] = TARGET.exec(target) ?? [];
    const id = BROWSER_IDS[name ?? ""];
    if (version === undefined || id === undefined) {
      throw new Error(`Browser target "${target}" has no compat-data browser; map it in browser-support/unsupported.ts.`);
    }
    floors.set(id, Number.parseFloat(version));
  }
  return floors;
}

const versionOf = (value: string): number => Number.parseFloat(value.replace("≤", ""));

/**
 * A statement that ships the feature, unflagged, at `floor`; a partial implementation still exists there. A vendor prefix counts only for
 * CSS (`prefixOk`), where the build prefixes per target (Lightning CSS); a prefixed script name is a different identifier.
 */
function shipsAt(statement: SimpleSupportStatement, floor: number, prefixOk: boolean): boolean {
  const { version_added: added, version_removed: removed } = statement;
  if (statement.flags !== undefined || (statement.prefix !== undefined && !prefixOk) || statement.alternative_name !== undefined) {
    return false;
  }
  const present = added !== false && added !== "preview" && versionOf(added) <= floor;
  return present && (removed === undefined || versionOf(removed) > floor);
}

function lackingIn(node: Node, floors: ReadonlyMap<string, number>, prefixOk: boolean): readonly string[] {
  const support = node.__compat?.support;
  if (support === undefined) {
    return [];
  }
  return [...floors]
    .filter(([id, floor]) => {
      const statements = support[id];
      return statements !== undefined && ![statements].flat().some((statement) => shipsAt(statement, floor, prefixOk));
    })
    .map(([id]) => id);
}

function collect(node: Node, path: string, floors: ReadonlyMap<string, number>, out: Map<string, readonly string[]>): void {
  const lacking = lackingIn(node, floors, path.startsWith("css."));
  if (lacking.length > 0) {
    out.set(path, lacking);
  }
  for (const [name, child] of Object.entries(node)) {
    if (name !== "__compat" && typeof child === "object" && child !== null) {
      collect(child as Node, `${path}.${name}`, floors, out);
    }
  }
}

/** Each compat key a floor in `targets` lacks → the browser ids that lack it. */
export function unsupportedAtFloor(targets: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const floors = floorsOf(targets);
  const unsupported = new Map<string, readonly string[]>();
  for (const root of ROOTS) {
    const start = root.reduce<unknown>((node, name) => (node as Record<string, unknown>)[name], bcd);
    collect(start as Node, root.join("."), floors, unsupported);
  }
  return unsupported;
}

/** `unsupported` without the builtins a polyfill installs (`Temporal`, `RegExp.escape`) and everything beneath them. */
export function withoutPolyfilled(unsupported: ReadonlyMap<string, readonly string[]>, polyfilled: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const installed = polyfilled.map((name) => `javascript.builtins.${name}`);
  return new Map([...unsupported].filter(([key]) => !installed.some((prefix) => key === prefix || key.startsWith(`${prefix}.`))));
}
