// Replaces a run of class tokens that a shared constant owns, inside a class string, with that constant, by a map read
// from the target directory: `"flex flex-col gap-field inline-full"` becomes `` `${FIELD_STACK} inline-full` ``. A run is
// the cluster's tokens next to each other in any order. A string that is exactly one cluster becomes the bare constant.
// Strings that are not class text (an object key, a comparison, a module specifier, a type) are left alone. The import is
// added to the lib barrel's own statement; sorting it is Biome's.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_MAP_FILE = "codemod-cluster-map.json";
const LIB_DIR = "/packages/ui/src/lib/";

interface Cluster {
  readonly name: string;
  readonly classes: ReadonlySet<string>;
  /** The file under `packages/ui/src/lib/` that exports the constant, for a file inside lib that imports it relatively. */
  readonly file: string;
}

interface ClusterMap {
  /** Largest first, so a cluster that contains another claims its tokens before the smaller one. */
  readonly clusters: readonly Cluster[];
  /** Path fragments of files the codemod leaves alone: the constants' own home and files another owner holds. */
  readonly skip: readonly string[];
  /** The module a non-lib file imports the constants from. */
  readonly from: string;
}

const STRINGS: RuleConfig<TS> = { rule: { any: [{ kind: "string" }, { kind: "template_string" }] } };

export const getSelector: GetSelector<TS> = () => STRINGS;

const moved = useMetricAtom("class-cluster-to-constant.moved");
const skipped = useMetricAtom("class-cluster-to-constant.skipped");

function readMap(targetDir: string, mapFile: string): ClusterMap {
  const parsed = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8")) as {
    readonly clusters?: readonly { readonly name: string; readonly classes: readonly string[]; readonly file: string }[];
    readonly skip?: readonly string[];
    readonly from?: string;
  };
  if (parsed.clusters === undefined || parsed.from === undefined) {
    throw new Error(`${mapFile}: expected { from, clusters: [{ name, classes, file }], skip? }`);
  }
  const clusters = parsed.clusters
    .map((entry) => ({ name: entry.name, classes: new Set(entry.classes), file: entry.file }))
    .sort((left, right) => right.classes.size - left.classes.size);
  return { clusters, skip: parsed.skip ?? [], from: parsed.from };
}

interface Run {
  readonly start: number;
  readonly end: number;
  readonly cluster: Cluster;
}

/** The runs of one fragment's text, in order. Each token belongs to at most one run. */
function runsIn(text: string, clusters: readonly Cluster[]): readonly Run[] {
  const tokens = [...text.matchAll(/\S+/gu)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
  const taken = tokens.map(() => false);
  const runs: Run[] = [];
  for (const cluster of clusters) {
    const size = cluster.classes.size;
    for (let index = 0; index + size <= tokens.length; index += 1) {
      const window = tokens.slice(index, index + size);
      const free = window.every((_, offset) => taken[index + offset] === false);
      if (free && new Set(window.map((token) => token.text)).size === size && window.every((token) => cluster.classes.has(token.text))) {
        window.forEach((_, offset) => {
          taken[index + offset] = true;
        });
        runs.push({ start: window[0]?.start ?? 0, end: window[size - 1]?.end ?? 0, cluster });
        index += size - 1;
      }
    }
  }
  return runs.sort((left, right) => left.start - right.start);
}

/** The text with each run swapped for a template substitution. */
function substitute(text: string, runs: readonly Run[]): string {
  let out = "";
  let cursor = 0;
  for (const run of runs) {
    out += `${text.slice(cursor, run.start)}\${${run.cluster.name}}`;
    cursor = run.end;
  }
  return out + text.slice(cursor);
}

/** A run that is the whole text but for the whitespace around it. */
function wholeRun(text: string, runs: readonly Run[]): Run | undefined {
  const [only] = runs;
  return runs.length === 1 && only !== undefined && text.slice(0, only.start).trim() === "" && text.slice(only.end).trim() === "" ? only : undefined;
}

const NOT_CLASS_PARENTS: ReadonlySet<string> = new Set([
  "import_statement",
  "export_statement",
  "literal_type",
  "switch_case",
  "enum_assignment",
  "ambient_declaration",
]);
const COMPARISONS: ReadonlySet<string> = new Set(["==", "===", "!=", "!=="]);

/** True when the string is not class text: a key, a comparison, a specifier, a type. */
function isNotClassText(node: SgNode<TS>): boolean {
  const parent = node.parent();
  if (parent === null) {
    return false;
  }
  if (NOT_CLASS_PARENTS.has(parent.kind())) {
    return true;
  }
  if (parent.kind() === "pair") {
    return parent.field("key")?.id() === node.id();
  }
  if (parent.kind() === "binary_expression") {
    return COMPARISONS.has(parent.field("operator")?.text() ?? "");
  }
  if (parent.kind() === "jsx_attribute") {
    const name = parent.child(0)?.text() ?? "";
    return name !== "className" && !name.endsWith("ClassName");
  }
  return false;
}

interface Planned {
  readonly edit: Edit;
  readonly names: readonly string[];
}

/** The edit for one string literal, or undefined when it holds no run or cannot be rewritten safely. */
function planString(node: SgNode<TS>, clusters: readonly Cluster[]): Planned | undefined {
  const fragments = node.children().filter((child) => child.kind() === "string_fragment");
  const clean = fragments.length === 1 && node.children().every((child) => child.kind() !== "escape_sequence");
  const fragment = fragments[0];
  if (!clean || fragment === undefined) {
    return undefined;
  }
  const text = fragment.text();
  const runs = runsIn(text, clusters);
  if (runs.length === 0) {
    return undefined;
  }
  const inAttribute = node.parent()?.kind() === "jsx_attribute";
  const whole = wholeRun(text, runs);
  const names = runs.map((run) => run.cluster.name);
  if (whole !== undefined) {
    return { edit: node.replace(inAttribute ? `{${whole.cluster.name}}` : whole.cluster.name), names };
  }
  if (text.includes("`") || text.includes("${") || text.includes("\\")) {
    skipped.increment({ reason: "string cannot become a template" });
    return undefined;
  }
  const template = `\`${substitute(text, runs)}\``;
  return { edit: node.replace(inAttribute ? `{${template}}` : template), names };
}

/** The edits for one template literal: its own text chunks, or the whole literal when it is one cluster. */
function planTemplate(node: SgNode<TS>, clusters: readonly Cluster[]): readonly Planned[] {
  const fragments = node.children().filter((child) => child.kind() === "string_fragment");
  const hasSubstitution = node.children().some((child) => child.kind() === "template_substitution");
  const only = fragments[0];
  if (!hasSubstitution && fragments.length === 1 && only !== undefined) {
    const runs = runsIn(only.text(), clusters);
    const whole = wholeRun(only.text(), runs);
    if (whole !== undefined) {
      return [{ edit: node.replace(whole.cluster.name), names: [whole.cluster.name] }];
    }
  }
  return fragments.flatMap((fragment) => {
    const runs = runsIn(fragment.text(), clusters);
    return runs.length === 0 ? [] : [{ edit: fragment.replace(substitute(fragment.text(), runs)), names: runs.map((run) => run.cluster.name) }];
  });
}

const LIB_BARREL = /^["'](?:#lib|@orb\/ui\/lib|(?:\.\.\/)+lib\/index\.ts)["']$/u;

/** The edit that makes `names` importable: into the lib barrel's own statement, or a new line after the last import. */
function importEdit(rootNode: SgNode<TS>, filename: string, names: readonly string[], map: ClusterMap): Edit | undefined {
  const inLib = filename.includes(LIB_DIR);
  const imports = rootNode.findAll({ rule: { kind: "import_statement" } });
  const bound = new Set(imports.flatMap((statement) => statement.findAll({ rule: { kind: "import_specifier" } }).map((specifier) => specifier.text())));
  const missing = [...new Set(names)].filter((name) => !bound.has(name)).sort();
  if (missing.length === 0) {
    return undefined;
  }
  if (inLib) {
    const byFile = new Map<string, string[]>();
    for (const name of missing) {
      const file = map.clusters.find((cluster) => cluster.name === name)?.file ?? "";
      byFile.set(file, [...(byFile.get(file) ?? []), name]);
    }
    const lines = [...byFile].map(([file, list]) => `import { ${list.join(", ")} } from "./${file}";\n`).join("");
    const last = imports.at(-1);
    return last === undefined
      ? { startPos: 0, endPos: 0, insertedText: lines }
      : { startPos: last.range().end.index, endPos: last.range().end.index, insertedText: `\n${lines.trimEnd()}` };
  }
  const barrel = imports.find((statement) => LIB_BARREL.test(statement.field("source")?.text() ?? "") && !statement.text().startsWith("import type"));
  const specifiers = barrel?.findAll({ rule: { kind: "import_specifier" } }) ?? [];
  const lastSpecifier = specifiers.at(-1);
  if (lastSpecifier !== undefined) {
    return { startPos: lastSpecifier.range().end.index, endPos: lastSpecifier.range().end.index, insertedText: `, ${missing.join(", ")}` };
  }
  const line = `import { ${missing.join(", ")} } from "${map.from}";`;
  const last = imports.at(-1);
  return last === undefined
    ? { startPos: 0, endPos: 0, insertedText: `${line}\n` }
    : { startPos: last.range().end.index, endPos: last.range().end.index, insertedText: `\n${line}` };
}

const codemod: Codemod<TS> = (root, options) => {
  const map = readMap(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const filename = root.filename();
  if (map.skip.some((fragment) => filename.includes(fragment))) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const planned: Planned[] = [];
  for (const node of options.matches ?? rootNode.findAll(STRINGS)) {
    if (isNotClassText(node)) {
      continue;
    }
    const found =
      node.kind() === "template_string"
        ? planTemplate(node, map.clusters)
        : [planString(node, map.clusters)].flatMap((plan) => (plan === undefined ? [] : [plan]));
    planned.push(...found);
  }
  if (planned.length === 0) {
    return Promise.resolve(null);
  }
  const edits = planned.map((plan) => plan.edit);
  const importing = importEdit(
    rootNode,
    filename,
    planned.flatMap((plan) => plan.names),
    map,
  );
  for (const name of planned.flatMap((plan) => plan.names)) {
    moved.increment({ constant: name });
  }
  if (importing === undefined) {
    return Promise.resolve(rootNode.commitEdits(edits));
  }
  return Promise.resolve(rootNode.commitEdits([...edits, importing]));
};

export default codemod;
