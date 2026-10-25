// Rewrites Tailwind class candidates and `--*` custom-property names inside string literals and template chunks by an
// exact map, for token renames and namespace moves. Variant prefixes, `!`, a leading `-` and a `/modifier` survive.

import type { Codemod, Edit, GetSelector, RuleConfig } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

// The map lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_MAP_FILE = "codemod-class-map.json";

interface ClassMap {
  /** Core class (no variants, `!`, leading `-` or modifier) → its replacement. */
  readonly classes: ReadonlyMap<string, string>;
  /** Variant segment (no `/name` suffix) → its replacement, for example `@md` → `@cq-28`. */
  readonly variants: ReadonlyMap<string, string>;
  /** Custom-property name → its replacement, applied wherever the name appears in a string. */
  readonly variables: ReadonlyMap<string, string>;
}

const STRING_FRAGMENT: RuleConfig<TS> = { rule: { kind: "string_fragment" } };

/** Every string literal body and template chunk; the map decides which ones change. */
export const getSelector: GetSelector<TS> = () => STRING_FRAGMENT;

function stringRecord(value: unknown, mapFile: string, key: string): ReadonlyMap<string, string> {
  if (value === undefined) {
    return new Map();
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${mapFile}: ${key} must be an object of old to new`);
  }
  return new Map(
    Object.entries(value).map(([from, to]) => {
      if (typeof to !== "string") {
        throw new Error(`${mapFile}: ${key}.${from} maps to a non-string`);
      }
      return [from, to] as const;
    }),
  );
}

function readMap(targetDir: string, mapFile: string): ClassMap {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${mapFile}: expected an object with classes and variables`);
  }
  const record = parsed as Record<string, unknown>;
  return {
    classes: stringRecord(record["classes"], mapFile, "classes"),
    variants: stringRecord(record["variants"], mapFile, "variants"),
    variables: stringRecord(record["variables"], mapFile, "variables"),
  };
}

/** The index of the last `:` (variant separator) or `/` (modifier) outside brackets and parentheses, or -1. */
function lastTopLevel(candidate: string, separator: ":" | "/"): number {
  let depth = 0;
  let found = -1;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (char === "[" || char === "(") {
      depth += 1;
    } else if (char === "]" || char === ")") {
      depth -= 1;
    } else if (char === separator && depth === 0) {
      found = index;
    }
  }
  return found;
}

/** Rename one variant segment, keeping its `/name` container or group suffix. */
function rewriteVariant(segment: string, variants: ReadonlyMap<string, string>): string {
  const nameStart = lastTopLevel(segment, "/");
  const base = nameStart >= 0 ? segment.slice(0, nameStart) : segment;
  const target = variants.get(base);
  return target === undefined ? segment : `${target}${nameStart >= 0 ? segment.slice(nameStart) : ""}`;
}

/** Split a variant prefix into its segments at top-level colons. */
function variantSegments(prefix: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < prefix.length; index += 1) {
    const char = prefix[index];
    if (char === "[" || char === "(") {
      depth += 1;
    } else if (char === "]" || char === ")") {
      depth -= 1;
    } else if (char === ":" && depth === 0) {
      segments.push(prefix.slice(start, index));
      start = index + 1;
    }
  }
  return segments;
}

function rewriteCandidate(candidate: string, map: ClassMap): string {
  const variantEnd = lastTopLevel(candidate, ":");
  const prefix = variantSegments(candidate.slice(0, variantEnd + 1))
    .map((segment) => `${rewriteVariant(segment, map.variants)}:`)
    .join("");
  let core = candidate.slice(variantEnd + 1);
  const modifierStart = lastTopLevel(core, "/");
  const modifier = modifierStart >= 0 ? core.slice(modifierStart) : "";
  core = modifierStart >= 0 ? core.slice(0, modifierStart) : core;
  const important = core.startsWith("!") ? "!" : "";
  core = core.slice(important.length);
  const negative = core.startsWith("-") ? "-" : "";
  core = core.slice(negative.length);
  // A `/modifier` marks a fraction or an opacity, never a scale step, so the class map leaves it alone.
  const target = modifier === "" ? (map.classes.get(core) ?? core) : core;
  return `${prefix}${important}${negative}${target}${modifier}`;
}

function rewriteText(text: string, map: ClassMap): string {
  let next = text;
  for (const [from, to] of map.variables) {
    next = next.replaceAll(new RegExp(`${from}(?![a-z0-9-])`, "gu"), to);
  }
  return next
    .split(/(\s+)/u)
    .map((part) => (/^\s*$/u.test(part) ? part : rewriteCandidate(part, map)))
    .join("");
}

const codemod: Codemod<TS> = (root, options) => {
  const map = readMap(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const rootNode = root.root();
  const fragments = options.matches ?? rootNode.findAll(STRING_FRAGMENT);
  const edits: Edit[] = [];
  for (const fragment of fragments) {
    const text = fragment.text();
    const next = rewriteText(text, map);
    if (next !== text) {
      edits.push(fragment.replace(next));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
