// Where liveness starts, read from the configs that own it: knip's production view (entries, consumers, trusted files,
// tags), each workspace manifest (exports, bin, the scripts that run a file) and the client's index.html. A script whose
// output ships, a build or a published package's prepare, runs in the product (D357). The judged
// population is knip's own: each workspace's `project` files, claimed by the deepest workspace that holds them, so
// vendored code inside a workspace is neither walked nor judged.
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join, matchesGlob, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { PACKAGE_EFFECT_CLASS } from "../../package-effects/index.ts";

// How a root module runs: in the shipped product, by an operator, as a consumer of production, as a published door
// third parties import, or as a file knip trusts whole.
const ROOT_KINDS = ["product", "operator", "consumer", "published", "trusted"] as const;
export type RootKind = (typeof ROOT_KINDS)[number];

// A root and the config line that makes it one.
interface RootReason {
  readonly kind: RootKind;
  readonly why: string;
}

/** Where liveness starts, by repository-relative file. */
export interface Roots {
  /** Modules that run, each with how. */
  readonly modules: ReadonlyMap<string, RootReason>;
  /** Files whose every export is kept: a published door or a knip-trusted file. */
  readonly exportsKept: ReadonlyMap<string, RootReason>;
  /** The JSDoc tags knip excludes from its report: a tagged declaration is kept. */
  readonly keepTags: readonly string[];
  /** Whether a file is in some workspace's knip `project`. */
  readonly inProject: (file: string) => boolean;
}

const KNIP_CONFIG = "knip.ts";
const MANIFEST = "package.json";
const INDEX_HTML = "index.html";

const patterns = z.union([z.string(), z.array(z.string())]).optional();
const workspaceSchema = z.object({
  entry: patterns,
  project: patterns,
  ignore: patterns,
  ignoreIssues: z.record(z.string(), z.array(z.string())).optional(),
  includeEntryExports: z.boolean().optional(),
});
const knipSchema = z.object({ tags: z.array(z.string()).optional(), workspaces: z.record(z.string(), workspaceSchema) });
type KnipView = z.infer<typeof knipSchema>;
type Workspace = z.infer<typeof workspaceSchema>;
const knipModuleSchema = z.object({
  default: z.custom<(flags: { readonly production: boolean }) => unknown>((value) => typeof value === "function"),
  config: knipSchema,
  /** Per workspace, the globs of the files an operator runs: knip ignores them as consumers, the graph roots them operator. */
  operators: z.record(z.string(), z.array(z.string())),
});
// A package.json exports target: a path, a null exclusion, a fallback list, or a conditions map nesting any of them.
type ExportTarget = string | null | readonly ExportTarget[] | { readonly [condition: string]: ExportTarget };
const exportTargetSchema: z.ZodType<ExportTarget> = z.lazy(() =>
  z.union([z.string(), z.null(), z.array(exportTargetSchema), z.record(z.string(), exportTargetSchema)]),
);
const manifestSchema = z.object({
  name: z.string().optional(),
  private: z.boolean().optional(),
  exports: exportTargetSchema.optional(),
  bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
});

type Manifest = z.infer<typeof manifestSchema>;
const NONE: ReadonlySet<string> = new Set();

const CODE = /\.(?:m|c)?[jt]sx?$/u;
// A `node` invocation and what follows it up to the next shell separator.
const NODE_RUN = /(?:^|[\s;&|(])node\s+([^;&|]+)/gu;
// The node options that take their value as the next word (node --help); every other option is a flag or `--x=v`.
const NODE_VALUE_OPTIONS: ReadonlySet<string> = new Set([
  "--import",
  "--require",
  "-r",
  "--loader",
  "--experimental-loader",
  "--env-file",
  "--conditions",
  "-C",
  "--input-type",
  "--eval",
  "-e",
  "--print",
  "-p",
]);
const EVALUATES: ReadonlySet<string> = new Set(["--eval", "-e", "--print", "-p"]);
// A script a pnpm command runs: in its own manifest, or with `--filter <package>` (`-F`) in that package's.
const PNPM_RUN = /pnpm\s+(?:(?:--filter|-F)[\s=](\S+)\s+)?(?:run\s+)?(\w[\w:-]*)/gu;
const SCRIPT_SRC = /<script\s(?:[^>]*\s)?type="module"(?:[^>]*\s)?src="([^"]+)"/gu;
// The npm lifecycle scripts an installed package runs on its own (npm docs, "Life Cycle Scripts").
const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prestart", "start", "poststart"] as const;
// The scripts whose output ships: every manifest's build, and a published package's prepare, which npm runs before it
// packs. A private package's prepare readies a checkout and ships nothing (D357).
const BUILD_SCRIPTS = ["prebuild", "build"] as const;
const PUBLISH_SCRIPTS = ["prepare"] as const;
// A knip pattern ending in "!" is production-visible; one starting with "!" excludes.
const PRODUCTION_MARK = "!";
const WHOLE_WORKSPACE = "**";
const ROOT_WORKSPACE = ".";

const list = (value: string | readonly string[] | undefined): readonly string[] => {
  if (value === undefined) {
    return [];
  }
  return typeof value === "string" ? [value] : value;
};

class RootTable {
  readonly #root: string;
  readonly modules = new Map<string, RootReason>();
  readonly exportsKept = new Map<string, RootReason>();

  constructor(root: string) {
    this.#root = root;
  }

  glob(dir: string, pattern: string): readonly string[] {
    return globSync(pattern, { cwd: dir })
      .map((path) => relative(this.#root, resolve(dir, path)))
      .filter((path) => CODE.test(path));
  }

  // The first reason holds, except that a product reason outranks any other: a file the product runs is the product's,
  // however else a config also names it.
  add(into: Map<string, RootReason>, file: string, reason: RootReason): void {
    const held = into.get(file);
    if (held === undefined || (reason.kind === "product" && held.kind !== "product")) {
      into.set(file, reason);
    }
  }
}

/** Every root of the tree at `root`. */
export async function loadRoots(root: string): Promise<Roots> {
  const knip = knipModuleSchema.parse(await import(pathToFileURL(join(root, KNIP_CONFIG)).href));
  const production = knipSchema.parse(knip.default({ production: true }));
  const table = new RootTable(root);
  const manifests = new Map(
    Object.keys(production.workspaces).flatMap((name) => {
      const path = join(resolve(root, name), MANIFEST);
      return existsSync(path) ? [[name, manifestSchema.parse(JSON.parse(readFileSync(path, "utf8")))] as const] : [];
    }),
  );
  const shipped = shippedScripts(manifests);
  for (const [name, workspace] of Object.entries(production.workspaces)) {
    workspaceRoots(root, table, { name, workspace, operators: knip.operators[name] ?? [], manifest: manifests.get(name), shipped: shipped.get(name) ?? NONE });
  }
  const all = knipSchema.parse(knip.default({ production: false }));
  return {
    modules: table.modules,
    exportsKept: table.exportsKept,
    keepTags: (knip.config.tags ?? []).filter((tag) => tag.startsWith("-@")).map((tag) => tag.slice("-@".length)),
    inProject: projectMembership(root, all),
  };
}

interface WorkspaceInput {
  readonly name: string;
  readonly workspace: Workspace;
  readonly operators: readonly string[];
  readonly manifest: Manifest | undefined;
  /** The manifest's scripts whose run ships. */
  readonly shipped: ReadonlySet<string>;
}

function workspaceRoots(root: string, table: RootTable, { name, workspace, operators, manifest, shipped }: WorkspaceInput): void {
  const dir = resolve(root, name);
  const consumers = list(workspace.ignore);
  const operatorFiles = new Set(operators.flatMap((pattern) => table.glob(dir, pattern)));
  const isOperator = (file: string): boolean => operatorFiles.has(file);
  // a workspace the production view ignores wholesale only consumes production (testkit, tooling)
  const consumerWorkspace = consumers.includes(WHOLE_WORKSPACE);
  const consumerFiles = new Set(consumers.flatMap((pattern) => table.glob(dir, pattern)));
  const isConsumer = (file: string): boolean => consumerWorkspace || consumerFiles.has(file);
  for (const pattern of list(workspace.entry).filter((entry) => !entry.startsWith(PRODUCTION_MARK))) {
    const visible = pattern.endsWith(PRODUCTION_MARK);
    for (const file of table.glob(dir, visible ? pattern.slice(0, -PRODUCTION_MARK.length) : pattern)) {
      table.add(table.modules, file, {
        kind: entryKind({ operator: isOperator(file), consumer: isConsumer(file), shipped: visible && name !== ROOT_WORKSPACE }),
        why: `knip ${name} entry ${pattern}`,
      });
    }
  }
  for (const [pattern] of Object.entries(workspace.ignoreIssues ?? {}).filter(([, issues]) => issues.includes("exports"))) {
    for (const file of table.glob(dir, pattern)) {
      table.add(table.exportsKept, file, { kind: "trusted", why: `knip ${name} ignoreIssues ${pattern}` });
    }
  }
  if (manifest !== undefined) {
    manifestRoots(root, table, { name, dir, workspace, consumerWorkspace, isConsumer, isOperator, manifest, shipped });
  }
  htmlRoots(root, table, name, dir);
}

// A workspace's index.html loads its module scripts in the browser: each one ships.
function htmlRoots(root: string, table: RootTable, name: string, dir: string): void {
  const html = join(dir, INDEX_HTML);
  if (!existsSync(html)) {
    return;
  }
  for (const match of readFileSync(html, "utf8").matchAll(SCRIPT_SRC)) {
    table.add(table.modules, relative(root, resolve(dirname(html), (match[1] ?? "").replace(/^\//u, ""))), {
      kind: "product",
      why: `${name} index.html module script`,
    });
  }
}

// A file knip names an operator's runs by hand; another file the production view ignores drives production as a
// consumer; a production-visible entry of a package workspace ships; any other entry an operator runs.
function entryKind({ operator, consumer, shipped }: { readonly operator: boolean; readonly consumer: boolean; readonly shipped: boolean }): RootKind {
  if (operator) {
    return "operator";
  }
  if (consumer) {
    return "consumer";
  }
  return shipped ? "product" : "operator";
}

interface ManifestContext {
  readonly name: string;
  readonly dir: string;
  readonly workspace: Workspace;
  readonly consumerWorkspace: boolean;
  readonly isConsumer: (file: string) => boolean;
  readonly isOperator: (file: string) => boolean;
  readonly manifest: Manifest;
  readonly shipped: ReadonlySet<string>;
}

function manifestRoots(root: string, table: RootTable, context: ManifestContext): void {
  const { name, dir, manifest, shipped } = context;
  doorRoots(root, table, context);
  const bins = typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin ?? {});
  for (const bin of bins) {
    table.add(table.modules, relative(root, resolve(dir, bin)), { kind: "product", why: `${name} package.json bin` });
  }
  for (const [script, command] of Object.entries(manifest.scripts ?? {})) {
    for (const run of nodeRuns(command)) {
      const file = relative(root, resolve(dir, run));
      if (existsSync(join(root, file))) {
        table.add(table.modules, file, { kind: scriptKind(context, file, shipped.has(script)), why: `${name} script ${script}` });
      }
    }
  }
}

// A published package's exports are its doors; an application's exports map is the door its testkit and tooling enter
// by, while production runs its entries.
function doorRoots(root: string, table: RootTable, { name, dir, workspace, manifest }: ManifestContext): void {
  const doors = exportTargets(manifest.exports).map((door) => relative(root, resolve(dir, door)));
  for (const file of doors.filter((door) => existsSync(join(root, door)))) {
    if (workspace.includeEntryExports === false) {
      table.add(table.modules, file, { kind: "published", why: `${name} publishes its doors (knip includeEntryExports false)` });
      table.add(table.exportsKept, file, { kind: "published", why: `${name} publishes its doors` });
    } else {
      table.add(table.modules, file, { kind: "consumer", why: `${name} package.json exports (entered by consumers)` });
    }
  }
}

function scriptKind(context: ManifestContext, file: string, shipped: boolean): RootKind {
  return entryKind({ operator: context.isOperator(file), consumer: context.consumerWorkspace || context.isConsumer(file), shipped });
}

// The scripts whose run ships, by workspace: an installed application's lifecycle scripts, every manifest's build
// scripts and a published package's prepare, with every script they call through pnpm, in their own manifest or in the
// one `--filter` names. The application or library class of each workspace is ruled in
// tooling/src/package-effects/index.ts.
function shippedScripts(manifests: ReadonlyMap<string, Manifest>): ReadonlyMap<string, ReadonlySet<string>> {
  const byPackage = new Map([...manifests].flatMap(([name, manifest]) => (manifest.name === undefined ? [] : [[manifest.name, name] as const])));
  const shipped = new Map<string, Set<string>>();
  const queue = [...manifests].flatMap(([name, manifest]) => startScripts(name, manifest).map((script) => ({ name, script })));
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const { name, script } = next;
    const done = shipped.get(name) ?? new Set<string>();
    shipped.set(name, done);
    if (done.has(script)) {
      continue;
    }
    done.add(script);
    queue.push(...calledScripts(manifests, byPackage, manifests.get(name)?.scripts?.[script] ?? "", name));
  }
  return shipped;
}

// The scripts a command runs through pnpm, each in its own workspace: `name`'s, or the one `--filter` names by package.
function calledScripts(
  manifests: ReadonlyMap<string, Manifest>,
  byPackage: ReadonlyMap<string, string>,
  command: string,
  name: string,
): readonly { readonly name: string; readonly script: string }[] {
  return [...command.matchAll(PNPM_RUN)].flatMap((match) => {
    const target = match[1] === undefined ? name : byPackage.get(match[1]);
    const script = match[2] ?? "";
    return target !== undefined && script in (manifests.get(target)?.scripts ?? {}) ? [{ name: target, script }] : [];
  });
}

// The scripts a workspace's run starts from: an installed application's lifecycle, its build, and a published
// package's prepare.
function startScripts(name: string, manifest: Manifest): readonly string[] {
  const scripts = manifest.scripts ?? {};
  const application = Object.entries(PACKAGE_EFFECT_CLASS).some(([dir, effect]) => dir === name && effect === "application");
  return [...(application && name !== ROOT_WORKSPACE ? LIFECYCLE_SCRIPTS : []), ...BUILD_SCRIPTS, ...(manifest.private === true ? [] : PUBLISH_SCRIPTS)].filter(
    (script) => script in scripts,
  );
}

// The script file each `node …` in a command runs: the first word after node's options, when it names a code file. An
// option that takes a value skips that value too, and `-e` or `-p` runs code given inline, so no file.
function nodeRuns(command: string): readonly string[] {
  return [...command.matchAll(NODE_RUN)].flatMap((match) => {
    const script = scriptWord((match[1] ?? "").trim().split(/\s+/u));
    return script === null ? [] : [script];
  });
}

// The first word past node's options, when it names a code file.
function scriptWord(words: readonly string[]): string | null {
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at] ?? "";
    if (EVALUATES.has(word)) {
      return null;
    }
    if (!word.startsWith("-")) {
      return CODE.test(word) ? word : null;
    }
    at += NODE_VALUE_OPTIONS.has(word) ? 1 : 0;
  }
  return null;
}

// The code files an exports map names: a string target, at any nesting of conditions.
function exportTargets(exports: ExportTarget | undefined): readonly string[] {
  if (typeof exports === "string") {
    return CODE.test(exports) ? [exports] : [];
  }
  if (exports === null || exports === undefined) {
    return [];
  }
  return (isTargetList(exports) ? exports : Object.values(exports)).flatMap(exportTargets);
}

const isTargetList = (target: ExportTarget): target is readonly ExportTarget[] => Array.isArray(target);

// knip's population: a file belongs to the deepest workspace that holds it, and to its project when the workspace's
// `project` globs include it (a workspace with none takes knip's default, every source file).
function projectMembership(root: string, view: KnipView): (file: string) => boolean {
  const projects = Object.entries(view.workspaces)
    .map(([name, workspace]) => ({ dir: relative(root, resolve(root, name)), patterns: list(workspace.project).map((pattern) => pattern.replace(/!$/u, "")) }))
    .sort((a, b) => b.dir.length - a.dir.length);
  return (file: string): boolean => {
    const owner = projects.find(({ dir }) => dir === "" || file.startsWith(`${dir}/`));
    if (owner === undefined) {
      return false;
    }
    if (owner.patterns.length === 0) {
      return true;
    }
    const inner = owner.dir === "" ? file : relative(owner.dir, file);
    const included = owner.patterns.filter((pattern) => !pattern.startsWith(PRODUCTION_MARK)).some((pattern) => matchesGlob(inner, pattern));
    return included && !owner.patterns.filter((pattern) => pattern.startsWith(PRODUCTION_MARK)).some((pattern) => matchesGlob(inner, pattern.slice(1)));
  };
}
