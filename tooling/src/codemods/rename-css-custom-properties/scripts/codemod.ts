// Renames `var(--old)` reads in CSS by an exact map. A target with a unit becomes a unit conversion of a registered
// number (`calc(var(--new) * 1px)`); a fallback is dropped, since a registered property's initial value replaces it.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type CSS from "codemod:ast-grep/langs/css";
import { readFileSync } from "fs";
import { join } from "path";

// The map lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_MAP_FILE = "codemod-css-property-map.json";

interface PropertyTarget {
  readonly name: string;
  /** Present when the target is a registered number the reader converts to this unit. */
  readonly unit?: string;
}

// A math function takes a calculation as an argument, so a product needs no `calc()` of its own there.
const MATH_FUNCTIONS = new Set(["calc", "min", "max", "clamp", "round"]);

const VAR_CALL: RuleConfig<CSS> = {
  rule: { kind: "call_expression", has: { kind: "function_name", regex: "^var$" } },
};

export const getSelector: GetSelector<CSS> = () => VAR_CALL;

function readMap(targetDir: string, mapFile: string): ReadonlyMap<string, PropertyTarget> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  const properties = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>)["properties"] : undefined;
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error(`${mapFile}: expected { "properties": { "--old": { "name": "--new", "unit"?: "px" } } }`);
  }
  return new Map(
    Object.entries(properties).map(([from, to]) => {
      const target = to as Partial<PropertyTarget> | null;
      if (target === null || typeof target.name !== "string" || (target.unit !== undefined && typeof target.unit !== "string")) {
        throw new Error(`${mapFile}: properties.${from} needs a string name and an optional string unit`);
      }
      return [from, target.unit === undefined ? { name: target.name } : { name: target.name, unit: target.unit }] as const;
    }),
  );
}

/** The first argument of a `var()` call: the custom property it reads. */
function readName(call: SgNode<CSS>): string | undefined {
  const args = call.children().find((child) => child.kind() === "arguments");
  return args
    ?.children()
    .find((child) => child.kind() === "plain_value")
    ?.text();
}

function enclosingFunction(call: SgNode<CSS>): string | undefined {
  const parent = call.parent();
  if (parent?.kind() !== "arguments") {
    return undefined;
  }
  return parent
    .parent()
    ?.children()
    .find((child) => child.kind() === "function_name")
    ?.text();
}

function replacement(call: SgNode<CSS>, target: PropertyTarget): string {
  const read = `var(${target.name})`;
  if (target.unit === undefined) {
    return read;
  }
  const product = `${read} * 1${target.unit}`;
  if (call.parent()?.kind() === "binary_expression") {
    return `(${product})`;
  }
  const outer = enclosingFunction(call);
  return outer !== undefined && MATH_FUNCTIONS.has(outer) ? product : `calc(${product})`;
}

const codemod: Codemod<CSS> = (root, options) => {
  const map = readMap(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const rootNode = root.root();
  const calls = options.matches ?? rootNode.findAll(VAR_CALL);
  const edits: Edit[] = [];
  for (const call of calls) {
    const name = readName(call);
    const target = name === undefined ? undefined : map.get(name);
    if (target !== undefined) {
      edits.push(call.replace(replacement(call, target)));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
