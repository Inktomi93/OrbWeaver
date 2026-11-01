// Primitive adoption: raw against primitive elements per section, and which variants the client uses, ignores or uses once.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";
import type { FileFacts } from "./file-facts.ts";
import type { Elem } from "./source.ts";
import { attrValue, visit } from "./source.ts";

export interface SectionAdoption {
  readonly section: string;
  readonly raw: number;
  readonly ui: number;
  readonly composite: number;
  readonly local: number;
  /** Primitive elements over raw plus primitive elements. */
  readonly share: number;
}

export interface VariantUse {
  readonly door: string;
  readonly axis: string;
  readonly values: Readonly<Record<string, number>>;
  /** Uses whose value the syntax cannot read. A dynamic axis cannot claim an unused value. */
  readonly dynamic: number;
}

const DOOR_EXPORT = /^\.\/([^/]+)$/u;

/** door name to its directory under packages/ui/src, from the package exports map. */
function doorDirs(root: string): ReadonlyMap<string, string> {
  const pkg = JSON.parse(readFileSync(join(root, "packages/ui/package.json"), "utf8")) as { readonly exports: Readonly<Record<string, unknown>> };
  const map = new Map<string, string>();
  for (const [key, target] of Object.entries(pkg.exports)) {
    const door = DOOR_EXPORT.exec(key)?.[1];
    if (door !== undefined && typeof target === "string") {
      map.set(door, dirname(join("packages/ui", target)));
    }
  }
  return map;
}

function axesIn(text: string, file: string): ReadonlyMap<string, readonly string[]> {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const axes = new Map<string, string[]>();
  visit(sf, (node) => {
    if (!(ts.isPropertyAssignment(node) && node.name.getText(sf) === "variants" && ts.isObjectLiteralExpression(node.initializer))) {
      return;
    }
    for (const axis of node.initializer.properties) {
      if (ts.isPropertyAssignment(axis) && ts.isObjectLiteralExpression(axis.initializer)) {
        const values = axis.initializer.properties.flatMap((value) =>
          ts.isPropertyAssignment(value) ? [value.name.getText(sf).replace(/^["']|["']$/gu, "")] : [],
        );
        axes.set(axis.name.getText(sf), [...(axes.get(axis.name.getText(sf)) ?? []), ...values]);
      }
    }
  });
  return axes;
}

/** Declared variant axes and values per door, read from the `tv` calls in the door directory's variants files. */
export function declaredVariants(root: string): ReadonlyMap<string, ReadonlyMap<string, readonly string[]>> {
  const out = new Map<string, ReadonlyMap<string, readonly string[]>>();
  for (const [door, dir] of doorDirs(root)) {
    const merged = new Map<string, string[]>();
    let files: string[] = [];
    try {
      files = readdirSync(join(root, dir)).filter((name) => /variants\.ts$/u.test(name));
    } catch {
      continue;
    }
    for (const name of files) {
      for (const [axis, values] of axesIn(readFileSync(join(root, dir, name), "utf8"), name)) {
        merged.set(axis, [...new Set([...(merged.get(axis) ?? []), ...values])]);
      }
    }
    if (merged.size > 0) {
      out.set(door, merged);
    }
  }
  return out;
}

export function adoptionBySection(all: readonly FileFacts[]): readonly SectionAdoption[] {
  const bySection = new Map<string, { raw: number; ui: number; composite: number; local: number }>();
  for (const facts of all) {
    if (facts.source.layer !== "client") {
      continue;
    }
    const row = bySection.get(facts.source.section) ?? { raw: 0, ui: 0, composite: 0, local: 0 };
    for (const elem of facts.elems) {
      row[elem.kind] += 1;
    }
    bySection.set(facts.source.section, row);
  }
  return [...bySection.entries()]
    .map(([section, row]) => ({ section, ...row, share: row.raw + row.ui === 0 ? 0 : row.ui / (row.raw + row.ui) }))
    .sort((a, b) => a.share - b.share);
}

type UseTable = Map<string, { values: Record<string, number>; dynamic: number }>;

function countUses(uses: UseTable, elem: Elem): void {
  if (elem.door === null) {
    return;
  }
  for (const [name, attribute] of elem.attrs) {
    const use = uses.get(`${elem.door}|${name}`);
    const value = use === undefined ? null : attrValue(attribute);
    if (use === undefined) {
      continue;
    }
    if (value === null) {
      use.dynamic += 1;
    } else {
      use.values[value] = (use.values[value] ?? 0) + 1;
    }
  }
}

/** How the client uses every declared variant value; a value never written, and a value written once, are the findings. */
export function variantUsage(all: readonly FileFacts[], declared: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>): readonly VariantUse[] {
  const uses: UseTable = new Map();
  for (const [door, axes] of declared) {
    for (const [axis, values] of axes) {
      uses.set(`${door}|${axis}`, { values: Object.fromEntries(values.map((value) => [value, 0])), dynamic: 0 });
    }
  }
  for (const facts of all) {
    if (facts.source.layer === "client") {
      for (const elem of facts.elems) {
        countUses(uses, elem);
      }
    }
  }
  return [...uses.entries()].map(([key, use]) => {
    const [door = "", axis = ""] = key.split("|");
    return { door, axis, values: use.values, dynamic: use.dynamic };
  });
}
