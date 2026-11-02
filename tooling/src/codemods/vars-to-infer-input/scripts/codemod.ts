// Rewrites a plan-listed input type argument of `createEntityMutation<…>`, named or an inline literal, to `inferInput<Trpc["a"]["b"]>`,
// taking the procedure from its `options: (trpc) => trpc.a.b.mutationOptions()` call. Mode `assert` instead appends
// one type-level equality check per site, so a typecheck proves the named type equals the router input first.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_PLAN_FILE = "codemod-vars-to-infer-input.json";
// Marks the lines `assert` mode appends; `rewrite` mode removes them again with the rewrite.
const ASSERT_MARKER = "// vars-to-infer-input:assert";
const INFER_INPUT = { name: "inferInput", module: "@trpc/tanstack-react-query" } as const;
const TRPC = { name: "Trpc", module: "#data" } as const;
const NEWLINE = 0x0a;
// `trpc`, the router key, the procedure key.
const PROCEDURE_PATH_LENGTH = 3;

interface Plan {
  /** Sites whose named input type equals the router input, as `file` (relative to the target) and `type`. */
  readonly sites: readonly { readonly file: string; readonly type: string }[];
  /** Named types that must stay, each with the reason the router input is not the same type. */
  readonly skip: readonly { readonly type: string; readonly reason: string }[];
}

interface Import {
  readonly name: string;
  readonly module: string;
}

interface Site {
  readonly typeArgument: SgNode<TS>;
  readonly procedure: string;
}

const FACTORY_CALL: RuleConfig<TS> = { rule: { kind: "call_expression", has: { field: "function", kind: "identifier", regex: "^createEntityMutation$" } } };

/** Only files that call the factory can change. */
export const getSelector: GetSelector<TS> = () => FACTORY_CALL;

function readPlan(targetDir: string, planFile: string): Plan {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, planFile), "utf8"));
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("sites" in parsed) ||
    !Array.isArray(parsed.sites) ||
    !("skip" in parsed) ||
    !Array.isArray(parsed.skip)
  ) {
    throw new Error(`${planFile}: expected { "sites": [...], "skip": [...] }`);
  }
  const sites = parsed.sites.map((site: unknown, index: number) => {
    if (site === null || typeof site !== "object" || !("file" in site && typeof site.file === "string") || !("type" in site && typeof site.type === "string")) {
      throw new Error(`${planFile}: site ${index} needs file and type`);
    }
    return { file: site.file, type: site.type };
  });
  const skip = parsed.skip.map((entry: unknown, index: number) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !("type" in entry && typeof entry.type === "string") ||
      !("reason" in entry && typeof entry.reason === "string") ||
      entry.reason === ""
    ) {
      throw new Error(`${planFile}: skip ${index} needs type and a reason`);
    }
    return { type: entry.type, reason: entry.reason };
  });
  for (const site of sites) {
    if (skip.some((entry) => entry.type === site.type)) {
      throw new Error(`${planFile}: ${site.type} is both a site and on the skip list`);
    }
  }
  return { sites, skip };
}

// A field the node's kind may not have (an identifier callee has no `property`), so the result is nullable.
function fieldOf(node: SgNode<TS> | null | undefined, name: string): SgNode<TS> | null | undefined {
  return node?.field(name);
}

/** `trpc.a.b` from `(trpc) => trpc.a.b.mutationOptions()`, as `Trpc["a"]["b"]`; null for any other `options` shape. */
function procedureOf(call: SgNode<TS>): string | null {
  const config = call.field("arguments")?.child(1);
  if (config?.kind() !== "object") {
    return null;
  }
  const options = config.findAll({ rule: { kind: "pair" } }).find((pair) => pair.field("key")?.text() === "options");
  const body = fieldOf(fieldOf(options, "value"), "body");
  if (body?.kind() !== "call_expression") {
    return null;
  }
  const method = fieldOf(body, "function");
  const path = fieldOf(method, "object");
  if (fieldOf(method, "property")?.text() !== "mutationOptions" || path?.kind() !== "member_expression") {
    return null;
  }
  const segments = path.text().split(".");
  return segments.length === PROCEDURE_PATH_LENGTH && segments[0] === "trpc" ? `Trpc["${segments[1]}"]["${segments[2]}"]` : null;
}

// The first type argument of each factory call whose named type the plan lists for this file.
function plannedSites(rootNode: SgNode<TS>, types: ReadonlySet<string>): readonly Site[] {
  const sites: Site[] = [];
  for (const call of rootNode.findAll(FACTORY_CALL)) {
    const first = call
      .field("type_arguments")
      ?.children()
      .find((child) => child.isNamed());
    const procedure = procedureOf(call);
    if ((first?.kind() === "type_identifier" || first?.kind() === "object_type") && procedure !== null && types.has(first.text())) {
      sites.push({ typeArgument: first, procedure });
    }
  }
  return sites;
}

// Any module counts: the file may import the binding through a relative door (a sibling `trpc` module) rather than `#data`.
function hasImport(rootNode: SgNode<TS>, wanted: Import): boolean {
  return rootNode.findAll({ rule: { kind: "import_specifier" } }).some((specifier) => specifier.field("name")?.text() === wanted.name);
}

// A declaration only the replaced type argument used goes with it; one with a comment above it stays for a hand call.
// References at or after `limit` are the assertion lines this same pass deletes.
function unusedDeclaration(
  rootNode: SgNode<TS>,
  name: string,
  bytes: Uint8Array,
  scope: { readonly replaced: ReadonlySet<number>; readonly limit: number },
): Edit | null {
  const { replaced, limit } = scope;
  const references = rootNode.findAll({ rule: { kind: "type_identifier", regex: `^${name}$` } }).filter((reference) => reference.range().start.index < limit);
  const declaration = references.find((reference) => {
    const parent = reference.parent();
    return (parent?.kind() === "type_alias_declaration" || parent?.kind() === "interface_declaration") && parent.field("name")?.id() === reference.id();
  });
  const declarationNode = declaration?.parent();
  if (declaration === undefined || declarationNode === null || declarationNode === undefined) {
    return null;
  }
  // An exported declaration may have importers this file cannot see.
  const stillUsed = references.some((reference) => reference.id() !== declaration.id() && !replaced.has(reference.id()));
  if (stillUsed || declarationNode.parent()?.kind() === "export_statement" || declarationNode.prev()?.kind() === "comment") {
    return null;
  }
  const { start, end } = declarationNode.range();
  // The declaration's line and the blank line after it, so no double blank line is left behind.
  const afterLine = bytes[end.index] === NEWLINE ? end.index + 1 : end.index;
  return { startPos: start.index, endPos: bytes[afterLine] === NEWLINE ? afterLine + 1 : afterLine, insertedText: "" };
}

function assertEdit(sites: readonly Site[], bytes: Uint8Array): Edit {
  const lines = sites.map(
    (site, index) =>
      `export const __varsEquality${index}: (<T>() => T extends ${site.typeArgument.text()} ? 1 : 2) extends <T>() => T extends import("${INFER_INPUT.module}").inferInput<import("${TRPC.module}").${site.procedure}> ? 1 : 2 ? true : false = true;`,
  );
  return { startPos: bytes.length, endPos: bytes.length, insertedText: `\n${ASSERT_MARKER}\n${lines.join("\n")}\n` };
}

function rewriteEdits(rootNode: SgNode<TS>, sites: readonly Site[], bytes: Uint8Array, limit: number): readonly Edit[] {
  const replaced = new Set(sites.map((site) => site.typeArgument.id()));
  const edits: Edit[] = sites.map((site) => site.typeArgument.replace(`inferInput<${site.procedure}>`));
  const named = sites.filter((site) => site.typeArgument.kind() === "type_identifier");
  for (const type of new Set(named.map((site) => site.typeArgument.text()))) {
    const removal = unusedDeclaration(rootNode, type, bytes, { replaced, limit });
    if (removal !== null) {
      edits.push(removal);
    }
  }
  const lastImport = rootNode.findAll({ rule: { kind: "import_statement" } }).at(-1);
  const at = lastImport === undefined ? 0 : lastImport.range().end.index;
  const missing = [INFER_INPUT, TRPC]
    .filter((needed) => !hasImport(rootNode, needed))
    .map((needed) => `import type { ${needed.name} } from "${needed.module}";`);
  if (missing.length > 0) {
    edits.push({ startPos: at, endPos: at, insertedText: `\n${missing.join("\n")}` });
  }
  return edits;
}

const codemod: Codemod<TS> = (root, options) => {
  const plan = readPlan(options.targetDir, options.params["plan"] ?? DEFAULT_PLAN_FILE);
  const file = root.relativeFilename();
  const types = new Set(plan.sites.filter((site) => site.file === file).map((site) => site.type));
  const rootNode = root.root();
  const bytes = new TextEncoder().encode(rootNode.text());
  const sites = plannedSites(rootNode, types);
  if (options.params["mode"] === "assert") {
    return Promise.resolve(sites.length === 0 ? null : rootNode.commitEdits([assertEdit(sites, bytes)]));
  }
  // The appended assertion lines sit at the end of the file, in a planned file or one whose site failed its check;
  // the rewrite takes them out in the same pass.
  const marker = rootNode.find({ rule: { kind: "comment", regex: `^${ASSERT_MARKER}$` } });
  const limit = marker === null ? bytes.length : marker.range().start.index;
  const cleanup: Edit[] = marker === null ? [] : [{ startPos: limit, endPos: bytes.length, insertedText: "" }];
  const edits = [...cleanup, ...(sites.length === 0 ? [] : rewriteEdits(rootNode, sites, bytes, limit))];
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
