// Gives each `z.object(` site a JSON plan in the target directory names its declared unknown-key mode: `strict` becomes
// `z.strictObject(`, `strip` gains an explicit `.strip()`, and `loose` turns `z.object(...).loose()` into `z.looseObject(...)`.
// A site is `<path relative to the target>:<1-based line of the constructor name>:<0-based ordinal of the z.object,
// z.strictObject and z.looseObject calls on that line>`; counting all three keeps a site's key stable after a rewrite.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

// The plan lives in the target directory so a directory fixture can carry its own; the sandbox allows that read.
const DEFAULT_SITES_FILE = "codemod-strict-object-sites.json";

const OBJECT_MODES = ["strict", "strip", "loose"] as const;
type ObjectMode = (typeof OBJECT_MODES)[number];

const CONSTRUCTOR_CALL: RuleConfig<TS> = {
  rule: { kind: "call_expression", any: [{ pattern: "z.object($$$)" }, { pattern: "z.strictObject($$$)" }, { pattern: "z.looseObject($$$)" }] },
};

/** Every object-constructor call; the plan decides which ones change. */
export const getSelector: GetSelector<TS> = () => CONSTRUCTOR_CALL;

function isObjectMode(value: unknown): value is ObjectMode {
  return OBJECT_MODES.some((mode) => mode === value);
}

function readPlan(targetDir: string, sitesFile: string): ReadonlyMap<string, ObjectMode> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, sitesFile), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${sitesFile}: expected an object of "<path>:<line>:<ordinal>" keys`);
  }
  const plan = new Map<string, ObjectMode>();
  for (const [site, mode] of Object.entries(parsed)) {
    if (!isObjectMode(mode)) {
      throw new Error(`${sitesFile}: ${site} names ${String(mode)}, not one of ${OBJECT_MODES.join(", ")}`);
    }
    plan.set(site, mode);
  }
  return plan;
}

// The method a call is the receiver of, as in `.strip` for `z.object({}).strip()`, with the call that applies it.
function chainedMethod(call: SgNode<TS>): { readonly name: string; readonly call: SgNode<TS> } | null {
  const member = call.parent();
  const name = member?.kind() === "member_expression" ? member.field("property")?.text() : undefined;
  const applied = member?.parent();
  return name !== undefined && applied?.kind() === "call_expression" ? { name, call: applied } : null;
}

// Edits never span the call's arguments, so a nested site's own edit stays disjoint from its parent's.
function editsFor(call: SgNode<TS>, property: SgNode<TS>, mode: ObjectMode, site: string): readonly Edit[] {
  const chained = chainedMethod(call);
  if (mode === "strict") {
    return [property.replace("strictObject")];
  }
  const end = call.range().end.index;
  if (mode === "strip") {
    return chained?.name === "strip" ? [] : [{ startPos: end, endPos: end, insertedText: ".strip()" }];
  }
  if (chained?.name !== "loose") {
    throw new Error(`${site}: a loose site must already read z.object(...).loose(); the plan would widen it`);
  }
  return [property.replace("looseObject"), { startPos: end, endPos: chained.call.range().end.index, insertedText: "" }];
}

const codemod: Codemod<TS> = (root, options) => {
  const plan = readPlan(options.targetDir, options.params["sites"] ?? DEFAULT_SITES_FILE);
  const rootNode = root.root();
  const calls: readonly SgNode<TS>[] = options.matches ?? rootNode.findAll(CONSTRUCTOR_CALL);
  const file = root.relativeFilename();
  const perLine = new Map<number, number>();
  const edits: Edit[] = [];
  const sited = calls.flatMap((call) => {
    const property = call.field("function")?.field("property");
    return property === undefined || property === null ? [] : [{ call, property }];
  });
  for (const { call, property } of sited.toSorted((a, b) => a.property.range().start.index - b.property.range().start.index)) {
    const line = property.range().start.line + 1;
    const ordinal = perLine.get(line) ?? 0;
    perLine.set(line, ordinal + 1);
    const site = `${file}:${String(line)}:${String(ordinal)}`;
    const mode = plan.get(site);
    if (mode === undefined || property.text() !== "object") {
      continue;
    }
    edits.push(...editsFor(call, property, mode, site));
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
