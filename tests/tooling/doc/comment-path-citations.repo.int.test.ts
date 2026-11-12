// Every cite a code comment or a law document carries resolves, in the grammar `.claude/rules/comments.md` states and
// `tooling/src/eslint/cites.ts` implements. A repo path, a Markdown doc or a test file names a tracked file; a decision
// names an ADR file or the reserved window `docs/adr/README.md` rules; a doc section names a heading or numbered item
// that doc carries; a lint rule id names a rule the composed ESLint
// config or Biome's schema holds; a TSDoc link names a declared symbol; an enforcement claim names a checker that exists.
// Comments are read by each language's own parser: the TypeScript scanner's comment ranges for scripts, PostCSS comment
// nodes (through stylelint) for sheets. A cite inside a string literal or JSX text is a fixture or copy, never a citation.
// A law document also cites a directory-qualified path from the repo root, so a moved file turns its citation red.
import { execFileSync } from "node:child_process";
import { basename, dirname, extname, join, posix } from "node:path";
import { execPath } from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import extractDepcruiseConfig from "dependency-cruiser/config-utl/extract-depcruise-config";
import type { Rule } from "stylelint";
import stylelint from "stylelint";
import ts from "typescript";
import { describe } from "vitest";
import eslintConfig from "../../../eslint.config.ts";
import stylelintConfig from "../../../stylelint.config.ts";
import type { Cite } from "../../../tooling/src/eslint/cites.ts";
import {
  BARE,
  CITED_EXT,
  checkerCites,
  citesIn,
  enforcementClaims,
  foldLineComments,
  isCheckerSource,
  NON_LITERAL,
  RELATIVE,
  ROOTED,
  SECTION_SIGN,
  URL_RE,
} from "../../../tooling/src/eslint/cites.ts";
import type { Source, Span, Tracked } from "./_sources.ts";
import { LAW_DOC, MARKDOWN, REPO_ROOT, ROOT_CONFIG, readFromRepo, SCRIPT_KINDS, scriptComments, trackedFiles, VENDORED } from "./_sources.ts";

const SCANNED_ROOTS = ["packages", "tooling", "tests", "scripts", ".github", "docker", ".claude/hooks"] as const;
// A tsconfig anywhere is JSONC, and its comments explain a compiler world.
const TSCONFIG = /(?:^|\/)tsconfig[\w.-]*\.json$/u;
// The image recipe has no extension; its comments are `#` lines.
const DOCKERFILE = "Dockerfile";
// A hook runs in the harness and names the harness's own runtime files, such as the memory index, by bare name, so only its rooted and
// relative paths cite the repository.
const HOOKS = ".claude/hooks/";
const JSONC_EXT = ".json";
const CSS_EXT = ".css";
const HASH_COMMENT_EXTS = new Set([".sh", ".yaml", ".yml"]);
// A path with a directory that is neither rooted nor relative: in a law document it must be written from the repo root.
const UNROOTED = new RegExp(
  String.raw`(?<![\w./*@+-])(?!(?:docs|packages|tooling|tests|scripts|docker|\.claude|\.github|legacy-source)\/)[\w+-][\w.+-]*\/[\w./+@-]*\w\.${CITED_EXT}(?![\w*{/-])`,
  "gu",
);
// A quoted literal in a law document is a code or config sample (an export map, an import call), resolved by its own package.
const QUOTED = /"[^"\n]*"/gu;
// Any of the three, to skip a file that names no path outside its module specifiers before parsing it.
const ANY_PATH = new RegExp([ROOTED.source, RELATIVE.source, BARE.source].join("|"), "u");
const MODULE_SPECIFIER = /(?:\bfrom|\bimport\s*\(?)\s*["'][^"'\n]*["']/gu;

/** Every comment in a sheet, from the PostCSS tree stylelint parses, through a rule that only collects. */
async function sheetComments(source: Source): Promise<Span[]> {
  const comments: Span[] = [];
  const collect: Rule = () => (root) => {
    root.walkComments((node) => {
      comments.push({ line: node.source?.start?.line ?? 0, text: node.text });
    });
  };
  collect.ruleName = "orb-test/collect-comments";
  collect.messages = {};
  collect.meta = { url: "" };
  await stylelint.lint({
    code: source.text,
    codeFilename: join(REPO_ROOT, source.path),
    config: { plugins: [stylelint.createPlugin(collect.ruleName, collect)], rules: { [collect.ruleName]: true } },
    configBasedir: REPO_ROOT,
  });
  return comments;
}

function hashComments(source: Source): Span[] {
  return source.text.split("\n").flatMap((line, index) => (line.includes("#") ? [{ line: index + 1, text: line.slice(line.indexOf("#")) }] : []));
}

function commentsOf(source: Source): Promise<Span[]> {
  const ext = extname(source.path);
  if (ext === MARKDOWN) {
    return Promise.resolve([{ line: 1, text: source.text.replaceAll(QUOTED, " ") }]);
  }
  const kind = SCRIPT_KINDS[ext];
  if (ext === CSS_EXT) {
    return sheetComments(source);
  }
  if (kind !== undefined) {
    return Promise.resolve(scriptComments(source, kind));
  }
  if (ext === JSONC_EXT) {
    return Promise.resolve(scriptComments(source, ts.ScriptKind.JSON));
  }
  return Promise.resolve(HASH_COMMENT_EXTS.has(ext) || basename(source.path) === DOCKERFILE ? hashComments(source) : []);
}

/** Each path a comment names that is not a tracked file, as `file:line token`. */
async function staleCitations(sources: readonly Source[], tracked: Tracked): Promise<readonly string[]> {
  const findings: string[] = [];
  for (const source of sources) {
    for (const comment of await commentsOf(source)) {
      comment.text.split("\n").forEach((text, offset) => {
        const line = text.replaceAll(URL_RE, " ");
        const hits = [
          ...[...line.matchAll(ROOTED)].map(([token]) => ({ token, present: tracked.paths.has(token) })),
          ...[...line.matchAll(RELATIVE)].map(([token]) => ({ token, present: tracked.paths.has(posix.join(dirname(source.path), token)) })),
          ...(source.path.startsWith(HOOKS) ? [] : [...line.matchAll(BARE)]).map(([token]) => ({ token, present: tracked.basenames.has(token) })),
          ...(extname(source.path) === MARKDOWN ? [...line.matchAll(UNROOTED)].map(([token]) => ({ token, present: tracked.paths.has(token) })) : []),
        ];
        for (const hit of hits.filter(({ token, present }) => !(present || NON_LITERAL.test(token)))) {
          findings.push(`${source.path}:${String(comment.line + offset)} ${hit.token}`);
        }
      });
    }
  }
  return findings;
}

/** Every tracked source under the scanned roots or among the root config files, in a language this reads, that names a
 *  path anywhere in its text. */
function candidateSources(tracked: Tracked, read: (path: string) => string = readFromRepo): Source[] {
  const readable = (path: string): boolean =>
    LAW_DOC.test(path) ||
    ROOT_CONFIG.test(path) ||
    TSCONFIG.test(path) ||
    path === DOCKERFILE ||
    (SCANNED_ROOTS.some((root) => path.startsWith(`${root}/`)) &&
      !path.startsWith(VENDORED) &&
      (SCRIPT_KINDS[extname(path)] !== undefined || extname(path) === CSS_EXT || HASH_COMMENT_EXTS.has(extname(path))));
  return [...tracked.paths]
    .filter(readable)
    .map((path) => ({ path, text: read(path) }))
    .filter((source) => ANY_PATH.test(source.text.replaceAll(MODULE_SPECIFIER, "")));
}

// ── decisions, rule ids, links and enforcement claims ───────────────────────────────────────────────────────────────

const CITE_ROOTS = ["packages/", "tooling/", "tests/", "scripts/"] as const;
const ADR_FILE = /^docs\/adr\/(\d{4})-[^/]+\.md$/u;
const ADR_INDEX = "docs/adr/README.md";
// The window `docs/adr/README.md` reserves for rolled-back rulings whose surviving code still cites them.
const RESERVED_WINDOW = /\bD(\d+)–D(\d+) are reserved\b/u;
const BIOME_BIN = "node_modules/@biomejs/biome/bin/biome";
const BIOME_CONFIG = "biome.json";
const BIOME_ENABLED_HEADING = "Enabled rules:";
const BIOME_ENABLED_RULE = /^ {4}([a-zA-Z0-9]+)\/([a-zA-Z0-9]+)$/gmu;
const BIOME_NAMESPACE = "lint";
const BIOME_GROUP_SETTINGS = new Set(["preset", "recommended", "all"]);
const OFF = "off";
const ROOT_MANIFEST = "package.json";
const WORKSPACE_MANIFEST = /^(?:packages\/[^/]+|tooling)\/package\.json$/u;
const TYPESCRIPT = /\.tsx?$/u;
const CRUISER_CONFIG = ".dependency-cruiser.ts";
const VIRTUAL_PROBE = join(REPO_ROOT, "cite-globals-probe.ts");

/** Every name a cite can resolve to, each read from the file or tool that owns it. */
interface Universe {
  readonly tracked: Tracked;
  readonly directories: ReadonlySet<string>;
  readonly minted: ReadonlySet<number>;
  readonly reserved: { readonly from: number; readonly to: number };
  readonly scripts: ReadonlySet<string>;
  /** Every script any workspace `package.json` declares: a script named without `pnpm` may run in a package. */
  readonly workspaceScripts: ReadonlySet<string>;
  readonly lintNamespaces: ReadonlySet<string>;
  readonly lintRules: ReadonlySet<string>;
  /** Biome's groups, each with its rule names. */
  readonly biome: ReadonlyMap<string, ReadonlySet<string>>;
  /** A checker named alone: a dependency-cruiser rule, an ESLint or stylelint rule without its namespace, a test file's stem. */
  readonly checkerNames: ReadonlySet<string>;
  readonly symbols: ReadonlySet<string>;
  /** Each law doc's path by its stem, the bare name a section cite may give it (`Spine-Testing`). */
  readonly lawDocs: ReadonlyMap<string, string>;
  /** The section numbers a tracked Markdown doc carries. */
  readonly anchorsOf: (path: string) => ReadonlySet<string>;
}

const LAW_DIR = "docs/law/";
const HEADING = /^#{1,6}\s+(.*)$/u;
// A heading's own number, `8.` or `§1` or `6a.`, opens its text.
const HEADING_NUMBER = /^§?\s?(\d+(?:\.\d+)*[a-z]?)(?=[.)\s:]|$)/u;
// A heading may also carry the number another doc's numbering gave it: "String-union dispatch (spine §7.5)".
const HEADING_ALIAS = /§\s?(\d+(?:\.\d+)*[a-z]?)/gu;
const NUMBERED_ITEM = /^(\d+)\.\s/u;
const FENCED_BLOCK = /^```[\s\S]+?^```/gmu;

/** The section numbers a Markdown doc carries: each heading's own number, each `§` number its text names, and
 *  `<heading>.<item>` for a top-level numbered item under a numbered heading. */
const headingNumbers = (title: string): string[] =>
  [HEADING_NUMBER.exec(title)?.[1], ...[...title.matchAll(HEADING_ALIAS)].map((match) => match[1])].flatMap((number) => (number === undefined ? [] : [number]));

function markdownAnchors(text: string): Set<string> {
  const anchors = new Set<string>();
  let heading: string | undefined;
  // A fenced block's `#` lines are code comments, not headings.
  for (const line of text.replaceAll(FENCED_BLOCK, "").split("\n")) {
    const title = HEADING.exec(line)?.[1];
    if (title !== undefined) {
      heading = HEADING_NUMBER.exec(title)?.[1];
      for (const number of headingNumbers(title)) {
        anchors.add(number);
      }
      continue;
    }
    const item = NUMBERED_ITEM.exec(line)?.[1];
    if (item !== undefined && heading !== undefined) {
      anchors.add(`${heading}.${item}`);
    }
  }
  return anchors;
}

// The one item of a list, or undefined when it holds none or several.
const only = (items: readonly string[]): string | undefined => (items.length === 1 ? items[0] : undefined);

/** The tracked doc a section cite names: a path as `path` cites resolve, a bare doc name preferring the law tree, or a
 *  law doc's stem or the unique stem it opens (`Core-0`). `undefined` when the spelling names no doc here. */
function sectionDoc(doc: string, citer: string, universe: Universe): string | undefined {
  const { paths } = universe.tracked;
  if (!doc.endsWith(MARKDOWN)) {
    return universe.lawDocs.get(doc) ?? universe.lawDocs.get(only([...universe.lawDocs.keys()].filter((stem) => stem.startsWith(`${doc}-`))) ?? "");
  }
  if (doc.includes("/")) {
    return [doc, posix.join(dirname(citer), doc)].find((path) => paths.has(path));
  }
  const named = [...paths].filter((path) => basename(path) === doc);
  return named.find((path) => path.startsWith(LAW_DIR)) ?? only(named);
}

/** Whether a section cite's doc carries its number, or `undefined` when the doc spelling names no tracked doc. */
function resolvesSection(token: string, citer: string, universe: Universe): boolean | undefined {
  const at = token.lastIndexOf(SECTION_SIGN);
  const doc = sectionDoc(token.slice(0, at), citer, universe);
  return doc === undefined ? undefined : universe.anchorsOf(doc).has(token.slice(at + SECTION_SIGN.length));
}

/** The part of a composed ESLint block a rule cite reads: the plugins it loads and the rules it sets. */
interface EslintBlock {
  readonly plugins?: Readonly<Record<string, unknown>>;
  readonly rules?: Readonly<Record<string, unknown>>;
}

/** The part of `biome.json` that turns rules on for some files only. */
interface BiomeConfig {
  readonly overrides?: readonly { readonly linter?: { readonly rules?: Readonly<Record<string, unknown>> } }[];
}

/** A citing file and the comment spans, or for a law document the whole text, it cites from. */
interface CitingFile {
  readonly path: string;
  readonly spans: readonly Span[];
}

/** Each decision number an ADR file carries; the id is read from the file name, never from prose. */
const mintedDecisions = (tracked: Tracked): Set<number> =>
  new Set([...tracked.paths].flatMap((path) => (ADR_FILE.exec(path)?.[1] === undefined ? [] : [Number(ADR_FILE.exec(path)?.[1])])));

function reservedWindow(index: string): Universe["reserved"] {
  const match = RESERVED_WINDOW.exec(index);
  return { from: Number(match?.[1] ?? Number.NaN), to: Number(match?.[2] ?? Number.NaN) };
}

/** The Biome rules the composed configuration turns on for at least one file, by group. Biome itself lists the root
 *  configuration's enabled rules, preset members included (`biome rage --linter`); an override adds what it turns on. */
function biomeEnabled(rage: string, config: BiomeConfig): Map<string, Set<string>> {
  const listed = [...rage.slice(rage.indexOf(BIOME_ENABLED_HEADING)).matchAll(BIOME_ENABLED_RULE)].map(([, group = "", rule = ""]) => [group, rule] as const);
  const enabled = new Map<string, Set<string>>();
  for (const [group, rule] of [...listed, ...overrideRules(config)]) {
    enabled.set(group, (enabled.get(group) ?? new Set<string>()).add(rule));
  }
  return enabled;
}

const biomeLevel = (setting: unknown): unknown => (typeof setting === "object" && setting !== null && "level" in setting ? setting.level : setting);

/** Each `[group, rule]` an override turns on. */
const overrideRules = (config: BiomeConfig): (readonly [string, string])[] =>
  (config.overrides ?? []).flatMap((override) =>
    Object.entries(override.linter?.rules ?? {}).flatMap(([group, rules]) =>
      Object.entries(typeof rules === "object" && rules !== null ? rules : {}).flatMap(([rule, setting]) =>
        BIOME_GROUP_SETTINGS.has(rule) || biomeLevel(setting) === OFF ? [] : [[group, rule] as const],
      ),
    ),
  );

const readBiomeRage = (): string =>
  execFileSync(execPath, [join(REPO_ROOT, BIOME_BIN), "rage", "--linter"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

// An ESLint severity, alone or as the head of an options tuple.
const eslintOn = (setting: unknown): boolean => {
  const severity: unknown = Array.isArray(setting) ? setting[0] : setting;
  return severity !== OFF && severity !== 0;
};

/** Every ESLint rule id some block of the composed config turns on, and every plugin namespace it loads. A rule a plugin
 *  registers but no block turns on enforces nothing, so a cite of it is dead. */
function eslintRuleIds(config: readonly EslintBlock[]): { readonly namespaces: Set<string>; readonly rules: Set<string> } {
  const namespaces = new Set(config.flatMap((block) => Object.keys(block.plugins ?? {})));
  const rules = new Set(config.flatMap((block) => Object.entries(block.rules ?? {}).flatMap(([rule, setting]) => (eslintOn(setting) ? [rule] : []))));
  return { namespaces, rules };
}

/** Every stylelint rule some block of the config turns on; `null` turns a rule off. */
function stylelintRuleIds(): string[] {
  return [stylelintConfig, ...(stylelintConfig.overrides ?? [])].flatMap((block) =>
    Object.entries(block.rules ?? {}).flatMap(([rule, setting]) => (setting === null || (Array.isArray(setting) && setting[0] === null) ? [] : [rule])),
  );
}

/** The names the TypeScript and DOM libs and `@types/node` declare globally, read off a checker over one empty file. */
function libGlobals(): Set<string> {
  const options: ts.CompilerOptions = {
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
    types: ["node"],
    typeRoots: [join(REPO_ROOT, "node_modules/@types")],
    noEmit: true,
  };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version): ts.SourceFile | undefined =>
    name === VIRTUAL_PROBE ? ts.createSourceFile(name, "export {};\n", version) : read(name, version);
  const program = ts.createProgram([VIRTUAL_PROBE], options, host);
  const probe = program.getSourceFile(VIRTUAL_PROBE);
  return probe === undefined
    ? new Set()
    : new Set(
        program
          .getTypeChecker()
          .getSymbolsInScope(probe, ts.SymbolFlags.All)
          .map(({ name }) => name),
      );
}

const isNode = (value: unknown): value is ts.Node => typeof value === "object" && value !== null && "kind" in value && "pos" in value;

/** Every name a declaration in the scanned scripts carries, at any depth: the program's symbols a link may name. */
function declaredNames(sources: readonly Source[]): Set<string> {
  const names = new Set<string>();
  for (const source of sources) {
    const visit = (node: ts.Node): void => {
      // The public API has no named-declaration guard; every named declaration carries its name node as `name`.
      const name = "name" in node ? node.name : undefined;
      if (isNode(name) && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name))) {
        names.add(name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, false, SCRIPT_KINDS[extname(source.path)]));
  }
  return names;
}

/** Every directory a tracked file sits below, spelled with its trailing slash. */
const directoriesOf = (paths: Iterable<string>): Set<string> =>
  new Set(
    [...paths].flatMap((path) =>
      path
        .split("/")
        .slice(0, -1)
        .map((_, depth, parts) => `${parts.slice(0, depth + 1).join("/")}/`),
    ),
  );

// A link may name a call, `{@link run()}`: the symbol is the part before its parameters.
const beforeCall = (token: string): string => token.split("(")[0] ?? token;

/** Whether a cite names something that exists, or `undefined` when its spelling is not a cite of that kind here: a
 *  `domain/chat` directory in rule-id shape, or a link to a URL. */
function resolves(cite: Cite, citer: string, universe: Universe): boolean | undefined {
  switch (cite.kind) {
    case "path":
      return cite.token.startsWith(".")
        ? universe.tracked.paths.has(posix.join(dirname(citer), cite.token))
        : universe.tracked.paths.has(cite.token) || (!cite.token.includes("/") && universe.tracked.basenames.has(cite.token));
    case "directory":
      return universe.directories.has(cite.token);
    case "decision": {
      const id = Number(cite.token.slice(1));
      return universe.minted.has(id) || (id >= universe.reserved.from && id <= universe.reserved.to);
    }
    case "section":
      return resolvesSection(cite.token, citer, universe);
    case "script":
      return universe.scripts.has(cite.token);
    case "task":
      return universe.workspaceScripts.has(cite.token);
    case "rule": {
      const [namespace = "", group = "", rule] = cite.token.split("/");
      if (namespace === BIOME_NAMESPACE) {
        const rules = universe.biome.get(group);
        return rules !== undefined && (rule === undefined || rules.has(rule));
      }
      const scope = cite.token.slice(0, cite.token.lastIndexOf("/"));
      return universe.lintNamespaces.has(scope) ? universe.lintRules.has(cite.token) : undefined;
    }
    case "biome":
      return [...universe.biome.values()].some((rules) => rules.has(cite.token));
    case "name":
      return universe.checkerNames.has(cite.token);
    case "link": {
      if (/^https?:/u.test(cite.token)) {
        return undefined;
      }
      // A package-qualified target (`pkg#Symbol`) is resolved by its symbol; each dotted member must be declared too.
      const target = beforeCall(cite.token.slice(cite.token.lastIndexOf("#") + 1));
      return target.split(/[.~]/u).every((part) => part === "" || universe.symbols.has(part));
    }
  }
}

// The kinds every comment and law line is held to. A Biome or checker name alone is read only inside a claim, where it
// names a checker: elsewhere `useState` and a kebab id are code.
const RESOLVED_EVERYWHERE = new Set<Cite["kind"]>(["directory", "decision", "section", "rule", "link"]);

/** Each decision, rule id or link a comment or law line carries that names nothing, as `file:line token`. */
function deadCites(spans: readonly CitingFile[], universe: Universe): string[] {
  return spans.flatMap(({ path, spans: lines }) =>
    lines.flatMap(({ line, text }) =>
      text.split("\n").flatMap((part, offset) =>
        citesIn(part)
          .filter((cite) => RESOLVED_EVERYWHERE.has(cite.kind) && resolves(cite, path, universe) === false)
          .map(({ token }) => `${path}:${String(line + offset)} ${token}`),
      ),
    ),
  );
}

/** Each comment sentence that claims a checker holds a fact and names no checker that exists, as `file:line sentence`. */
function unbackedClaims(sources: readonly CitingFile[], universe: Universe): string[] {
  return sources.flatMap(({ path, spans }) =>
    spans.flatMap(({ line, text }) =>
      enforcementClaims(text, isCheckerSource(path))
        .filter(({ sentence }) => !checkerCites(sentence).some((cite) => resolves(cite, path, universe) === true))
        .map(({ sentence, line: offset }) => `${path}:${String(line + offset)} ${sentence}`),
    ),
  );
}

/** A script's comments as the claim rule reads them: a run of `//` lines is one span. */
const commentSpans = (source: Source): Span[] => foldLineComments(scriptComments(source, SCRIPT_KINDS[extname(source.path)] ?? ts.ScriptKind.TS));

/** The comments of every tracked script under the cite roots, and every line of the law documents. */
function citingSpans(tracked: Tracked): { readonly scripts: Source[]; readonly spans: CitingFile[] } {
  const scripts = [...tracked.paths]
    .filter((path) => CITE_ROOTS.some((root) => path.startsWith(root)) && SCRIPT_KINDS[extname(path)] !== undefined && !path.startsWith(VENDORED))
    .map((path) => ({ path, text: readFromRepo(path) }));
  const laws = [...tracked.paths].filter((path) => LAW_DOC.test(path)).map((path) => ({ path, text: readFromRepo(path) }));
  return {
    scripts,
    spans: [
      ...scripts.map((source) => ({ path: source.path, spans: commentSpans(source) })),
      ...laws.map(({ path, text }) => ({ path, spans: [{ line: 1, text }] })),
    ],
  };
}

const scriptsOf = (manifest: string): string[] =>
  Object.keys((JSON.parse(readFromRepo(manifest)) as { readonly scripts?: Readonly<Record<string, string>> }).scripts ?? {});

async function universeOf(tracked: Tracked, scripts: readonly Source[]): Promise<Universe> {
  const eslint = eslintRuleIds(eslintConfig);
  // The composed config: the preset `extends` names (`no-circular`) are rules a comment may cite.
  const cruiserConfig = await extractDepcruiseConfig(join(REPO_ROOT, CRUISER_CONFIG));
  const cruiser = (cruiserConfig.forbidden ?? []).flatMap(({ name }) => (name === undefined ? [] : [name]));
  const stylelintRules = stylelintRuleIds();
  // A stylelint plugin rule shares the `orb/` namespace with the ESLint plugin, so one rule-id set holds both tools.
  const rules = new Set([...eslint.rules, ...stylelintRules]);
  const namespaces = new Set([...eslint.namespaces, ...stylelintRules.flatMap((rule) => (rule.includes("/") ? [rule.slice(0, rule.lastIndexOf("/"))] : []))]);
  const stems = [...tracked.paths].filter((path) => path.startsWith("tests/")).map((path) => basename(path).split(".")[0] ?? "");
  const anchors = new Map<string, Set<string>>();
  return {
    lawDocs: new Map([...tracked.paths].filter((path) => path.startsWith(LAW_DIR) && path.endsWith(MARKDOWN)).map((path) => [basename(path, MARKDOWN), path])),
    anchorsOf: (path) => anchors.get(path) ?? anchors.set(path, markdownAnchors(readFromRepo(path))).get(path) ?? new Set(),
    tracked,
    directories: directoriesOf(tracked.paths),
    minted: mintedDecisions(tracked),
    reserved: reservedWindow(readFromRepo(ADR_INDEX)),
    scripts: new Set(scriptsOf(ROOT_MANIFEST)),
    workspaceScripts: new Set([...tracked.paths].filter((path) => path === ROOT_MANIFEST || WORKSPACE_MANIFEST.test(path)).flatMap(scriptsOf)),
    lintNamespaces: namespaces,
    lintRules: rules,
    biome: biomeEnabled(readBiomeRage(), JSON.parse(readFromRepo(BIOME_CONFIG)) as BiomeConfig),
    checkerNames: new Set([...cruiser, ...stems, ...[...rules].map((rule) => rule.slice(rule.lastIndexOf("/") + 1))]),
    symbols: new Set([...declaredNames(scripts), ...libGlobals()]),
  };
}

describe("the real tree", () => {
  test("every decision, lint rule id and TSDoc link a code comment or law document names exists, and every enforcement claim names a checker that exists", {
    timeout: 300_000,
  }, async () => {
    const tracked = trackedFiles();
    const { scripts, spans } = citingSpans(tracked);
    const universe = await universeOf(tracked, scripts);
    // An unread source would pass every cite it holds: each owner yields a known member.
    expect(universe.reserved.to).toBeGreaterThan(universe.reserved.from);
    expect([universe.minted.has(317), universe.lintRules.has("orb/commented-code"), universe.biome.get("style")?.has("useNamingConvention")]).toStrictEqual([
      true,
      true,
      true,
    ]);
    expect([
      universe.symbols.has("createOrbPlugin"),
      universe.symbols.has("Promise"),
      universe.checkerNames.has("tooling-cli-via-index"),
      universe.checkerNames.has("no-circular"),
    ]).toStrictEqual([true, true, true, true]);
    // Claims are read where `orb/enforcement-claim-cites-checker` runs: TypeScript source.
    const typescript = spans.filter(({ path }) => TYPESCRIPT.test(path));
    expect({ dead: deadCites(spans, universe), claims: unbackedClaims(typescript, universe) }).toStrictEqual({ dead: [], claims: [] });
  });

  test("every path a code comment or law document names is a tracked file", async () => {
    const tracked = trackedFiles();
    const sources = candidateSources(tracked);
    // A read that missed a root or a language would pass every citation in it.
    expect(SCANNED_ROOTS.filter((root) => !sources.some((source) => source.path.startsWith(`${root}/`)))).toStrictEqual([]);
    expect(sources.filter((source) => ROOT_CONFIG.test(source.path)).map((source) => extname(source.path))).toEqual(
      expect.arrayContaining([".ts", ".yaml", JSONC_EXT]),
    );
    expect([".ts", ".tsx", CSS_EXT, MARKDOWN].filter((ext) => !sources.some((source) => source.path.endsWith(ext)))).toStrictEqual([]);
    expect(await staleCitations(sources, tracked)).toStrictEqual([]);
  });
});

describe("the reader", () => {
  const tracked: Tracked = {
    paths: new Set(["docs/law/Spine-Testing.md", "tests/a/real.ct.tsx", "packages/x/src/real.ts"]),
    basenames: new Set(["Spine-Testing.md", "real.ct.tsx", "real.ts"]),
  };

  test("refuses a missing path in every comment form a language has", async () => {
    const sources: Source[] = [
      { path: "packages/x/src/a.ts", text: "// see docs/law/Gone.md\nconst a = 1; /* tests/a/gone.ct.tsx */\n" },
      { path: "packages/x/src/b.ts", text: "/**\n * The header.\n *  pinned by app-shell.ct.tsx\n */\nexport const b = 1;\n" },
      { path: "packages/x/src/c.ts", text: "/* opened here\n   and continued in docs/law/Inner.md\n*/\nexport const c = 1;\n" },
      { path: "packages/x/src/d.tsx", text: "export const d = (\n  <div>\n    {/* the row\n        inner-gone.ct.tsx */}\n  </div>\n);\n" },
      { path: "packages/x/src/e.ts", text: 'const s = "it\'s"; // after-quote.ct.tsx\n' },
      { path: "packages/x/src/f.tsx", text: "export const f = (\n  <p>\n    Don't stop. {/* jsx-gone.ct.tsx */}\n  </p>\n);\n" },
      { path: "packages/x/src/g.css", text: ".a {\n  /* first line\n     ../gone.ts */\n  opacity: 1;\n}\n" },
      { path: "packages/x/src/h.ts", text: "// the band moved to gone-source.tsx\n" },
      { path: "tooling/run.sh", text: "echo hi\n# packages/x/src/gone.ts\n" },
      { path: "docs/law/Law.md", text: "# Law\n\nThe slot lives in `app-shell/lib/moved.ts` and `packages/x/src/gone.ts`.\n" },
    ];
    expect(await staleCitations(sources, tracked)).toStrictEqual([
      "packages/x/src/a.ts:1 docs/law/Gone.md",
      "packages/x/src/a.ts:2 tests/a/gone.ct.tsx",
      "packages/x/src/b.ts:3 app-shell.ct.tsx",
      "packages/x/src/c.ts:2 docs/law/Inner.md",
      "packages/x/src/d.tsx:4 inner-gone.ct.tsx",
      "packages/x/src/e.ts:1 after-quote.ct.tsx",
      "packages/x/src/f.tsx:3 jsx-gone.ct.tsx",
      "packages/x/src/g.css:3 ../gone.ts",
      "packages/x/src/h.ts:1 gone-source.tsx",
      "tooling/run.sh:2 packages/x/src/gone.ts",
      "docs/law/Law.md:3 packages/x/src/gone.ts",
      "docs/law/Law.md:3 app-shell/lib/moved.ts",
    ]);
  });

  test("reads the root configs, the workflow, image and hook homes and every tsconfig, and nothing else outside the scanned roots", async () => {
    const planted: Readonly<Record<string, string>> = {
      "eslint.config.ts": "// see tests/tooling/gone.test.ts\nexport default [];\n",
      "pnpm-workspace.yaml": "packages:\n  # pinned by tests/server/gone.int.test.ts\n  - packages/*\n",
      "tsconfig.base.json": '{\n  // docs/law/Gone.md owns this\n  "compilerOptions": { "path": "docs/law/Quoted.md" }\n}\n',
      "scripts/corpus-fixture.ts": "// moved to tooling/src/gone.ts\nexport {};\n",
      "scripts/install.sh": "# see docs/law/Gone.md\necho ok\n",
      ".github/workflows/ci.yml": "# docs/law/Gone.md\n",
      ".github/actions/setup/run.mjs": "// see tooling/src/gone.ts\nexport {};\n",
      "docker/compose.yaml": "# docs/law/Gone.md\n",
      "docker/entrypoint.sh": "# moved to scripts/gone.sh\n",
      [DOCKERFILE]: "# pinned by tests/tooling/gone.test.ts\nFROM node\n",
      ".claude/hooks/guard.mjs": "// see docs/law/Gone.md\n",
      "packages/x/tsconfig.json": '{\n  // the world docs/law/Gone.md names\n  "include": ["src"]\n}\n',
      "packages/x/package.json": '{ "description": "docs/law/Gone.md" }\n',
      "package.json": '{ "description": "docs/law/Gone.md" }\n',
    };
    const files: Tracked = { paths: new Set(Object.keys(planted)), basenames: new Set() };
    const sources = candidateSources(files, (path) => planted[path] ?? "");
    expect(await staleCitations(sources, tracked)).toStrictEqual([
      "eslint.config.ts:1 tests/tooling/gone.test.ts",
      "pnpm-workspace.yaml:2 tests/server/gone.int.test.ts",
      "tsconfig.base.json:2 docs/law/Gone.md",
      "scripts/corpus-fixture.ts:1 tooling/src/gone.ts",
      "scripts/install.sh:1 docs/law/Gone.md",
      ".github/workflows/ci.yml:1 docs/law/Gone.md",
      ".github/actions/setup/run.mjs:1 tooling/src/gone.ts",
      "docker/compose.yaml:1 docs/law/Gone.md",
      "docker/entrypoint.sh:1 scripts/gone.sh",
      "Dockerfile:1 tests/tooling/gone.test.ts",
      ".claude/hooks/guard.mjs:1 docs/law/Gone.md",
      "packages/x/tsconfig.json:2 docs/law/Gone.md",
    ]);
  });

  test("passes a tracked path, a string, JSX text, a URL and a glob", async () => {
    const sources: Source[] = [
      { path: "packages/x/src/a.ts", text: "// docs/law/Spine-Testing.md and real.ct.tsx and ./real.ts\n" },
      { path: "packages/x/src/b.ts", text: 'const path = "docs/law/Gone.md"; const t = `/* tests/a/gone.ct.tsx */`;\n' },
      { path: "packages/x/src/c.tsx", text: "export const c = <p>See https://example.com and copy.ct.tsx // not a comment</p>;\n" },
      { path: "packages/x/src/d.ts", text: "// https://example.com/docs/law/Gone.md\n// every tests/**/*.ct.tsx and tests/a/ directory\n" },
      { path: "packages/x/src/f.ts", text: "// real.ts, its `-model.ts` sibling and react.d.ts\n" },
      { path: "packages/x/src/e.css", text: '.a { content: "/* gone.ct.tsx */"; }\n' },
      {
        path: "docs/law/Law.md",
        text: '# Law\n\nSee `packages/x/src/real.ts`, [the spine](./Spine-Testing.md), `<domain>/verbs/<action>.ts`, `legacy-source/ui/gone.ct.tsx` and `"./button": "./src/button/index.ts"`.\n',
      },
    ];
    expect(await staleCitations(sources, tracked)).toStrictEqual([]);
  });
});

describe("the cite resolver", () => {
  const lawPath = "docs/law/Law-Of-Things.md";
  // Numbered, lettered and aliased headings, a numbered list under heading 10, and a fenced `#` line that is no heading.
  const plantedLaw =
    "# Law\n\n## 3. Three\n\n## Dispatch (spine §7.5)\n\n## 10. Rules\n\n1. one\n2. two\n\n### 6a. Lettered\n\n```sh\n# 9. not a heading\n```\n";
  const universe: Universe = {
    tracked: {
      paths: new Set(["tests/tooling/real.test.ts", "packages/x/src/real.ts", lawPath]),
      basenames: new Set(["real.test.ts", "real.ts", basename(lawPath)]),
    },
    directories: directoriesOf(["tests/tooling/real.test.ts", "packages/x/src/real.ts"]),
    minted: new Set([141, 317]),
    reserved: reservedWindow("A planted index: D10–D20 are reserved for a planted reason."),
    scripts: new Set(["test", "lint:eslint", "knip"]),
    workspaceScripts: new Set(["test", "lint:eslint", "knip", "surface:build"]),
    lintNamespaces: new Set(["orb", "@typescript-eslint"]),
    lintRules: new Set(["orb/commented-code", "@typescript-eslint/no-deprecated", "no-restricted-syntax"]),
    biome: new Map([["style", new Set(["useNamingConvention"])]]),
    checkerNames: new Set(["tooling-cli-via-index", "real", "commented-code"]),
    symbols: new Set(["createRoot", "Root", "dispose"]),
    lawDocs: new Map([[basename(lawPath, MARKDOWN), lawPath]]),
    anchorsOf: (path) => (path === lawPath ? markdownAnchors(plantedLaw) : new Set()),
  };
  const comments = (path: string, text: string): CitingFile => ({
    path,
    spans: commentSpans({ path, text }),
  });

  test("reads the reserved window from the index sentence, and a rephrased sentence reads no window", () => {
    expect(universe.reserved).toStrictEqual({ from: 10, to: 20 });
    expect(Number.isNaN(reservedWindow("D10 to D20 are kept back.").from)).toBe(true);
  });

  test("refuses a decision no ADR file or reserved number carries, and passes a minted one, a reserved one and a range announcement", () => {
    const file = comments("packages/x/src/a.ts", "// D141 and D317 hold; D15 is reserved; D165+ is next\n// D346 and D9 name nothing\nexport {};\n");
    expect(deadCites([file], universe)).toStrictEqual(["packages/x/src/a.ts:2 D346", "packages/x/src/a.ts:2 D9"]);
  });

  test("refuses a rule id in a loaded namespace that names no rule, and a Biome rule outside its group", () => {
    const file = comments(
      "packages/x/src/a.ts",
      "// `orb/commented-code`, `@typescript-eslint/no-deprecated` and `lint/style/useNamingConvention` hold\n// `orb/ghost-rule`, `@typescript-eslint/ghost-rule`, `lint/style/noGhost` and `lint/ghost` do not; `domain/chat` is a directory\n// orb/commented-code holds bare; orb/bare-ghost does not, and @orb/ui/button is a package door\n// the tests/tooling/ directory holds and tests/gone/ does not\nexport {};\n",
    );
    expect(deadCites([file], universe)).toStrictEqual([
      "packages/x/src/a.ts:2 orb/ghost-rule",
      "packages/x/src/a.ts:2 @typescript-eslint/ghost-rule",
      "packages/x/src/a.ts:2 lint/style/noGhost",
      "packages/x/src/a.ts:2 lint/ghost",
      "packages/x/src/a.ts:3 orb/bare-ghost",
      "packages/x/src/a.ts:4 tests/gone/",
    ]);
  });

  test("refuses a TSDoc link to a name nothing declares, and passes a declared symbol, a dotted member, a package-qualified symbol and a URL", () => {
    const file = comments(
      "packages/x/src/a.ts",
      "/**\n * See {@link createRoot}, {@link Root.dispose}, {@link @orb/x#Root} and {@link https://example.com}.\n * Not {@link goneHelper} or {@link Root.gone}.\n */\nexport const a = 1;\n",
    );
    expect(deadCites([file], universe)).toStrictEqual(["packages/x/src/a.ts:3 goneHelper", "packages/x/src/a.ts:3 Root.gone"]);
  });

  test("refuses a section its doc does not carry, in every doc spelling, and passes a heading, an alias, a numbered item and a stem that names no doc", () => {
    const file = comments(
      "packages/x/src/a.ts",
      [
        "// `docs/law/Law-Of-Things.md` §3, Law-Of-Things §7.5, Law-Of §10.2 and [the law](../../../docs/law/Law-Of-Things.md) §6a hold.",
        "// Law-Of-Things.md §3–§4, Law-Of-Things §9 and Law-Of-Things §10.3 do not; the snap skill §5 and the guide §3 name no doc.",
        "export {};",
      ].join("\n"),
    );
    expect(deadCites([file], universe)).toStrictEqual([
      "packages/x/src/a.ts:2 Law-Of-Things.md§4",
      "packages/x/src/a.ts:2 Law-Of-Things§9",
      "packages/x/src/a.ts:2 Law-Of-Things§10.3",
    ]);
  });

  test("reads a law document's decisions and rule ids", () => {
    const law: CitingFile = {
      path: "docs/law/Law.md",
      spans: [{ line: 1, text: "# Law\n\nSee D141 and `orb/commented-code`.\n\nSee D400 and `orb/gone`.\n" }],
    };
    expect(deadCites([law], universe)).toStrictEqual(["docs/law/Law.md:5 D400", "docs/law/Law.md:5 orb/gone"]);
  });

  test("refuses an enforcement claim that names no checker or a dead one, and passes one whose cite resolves", () => {
    const file = comments(
      "packages/x/src/a.ts",
      [
        "// A CT pins the header to the column.",
        "// The order is pinned by tests/tooling/gone.test.ts.",
        "// dependency-cruiser bans the edge (`ghost-edge`).",
        "// The order is pinned by tests/tooling/real.test.ts.",
        "// `orb/commented-code` is the lint that refuses parked code; biome forbids it via `lint/style/useNamingConvention`.",
        "// dependency-cruiser bans the edge (policy `tooling-cli-via-index`).",
        "// A test must pin this. If the test fails, read the log. It cannot be pinned by a rendered test.",
        '// The message quotes "a CT pins the header" as an example.',
        "// A wrapped claim is pinned by",
        "// tests/tooling/real.test.ts on its next line.",
        "export {};",
      ].join("\n"),
    );
    expect(unbackedClaims([file], universe)).toStrictEqual([
      "packages/x/src/a.ts:1 A CT pins the header to the column.",
      "packages/x/src/a.ts:2 The order is pinned by tests/tooling/gone.test.ts.",
      "packages/x/src/a.ts:3 dependency-cruiser bans the edge (`ghost-edge`).",
    ]);
  });

  test("reads a claim with a bare subject, a plural subject, a fourth verb form, a will-future and a tool's own name", () => {
    const file = comments(
      "packages/x/src/a.ts",
      [
        "// Lint refuses the import.",
        "// Tests pin the order.",
        "// Our tests cover the reset.",
        "// dependency-cruiser bars the edge.",
        "// A CT will catch the drift.",
        "// tsc refuses a missing case.",
        "// The typecheck fails on a missing case.",
        "// check:boot-chunk separately enforces the ceiling.",
        "// `check:db-baseline` fails until the chain records it.",
        "// surface:build holds the slot list (`pnpm knip`).",
        "export {};",
      ].join("\n"),
    );
    expect(unbackedClaims([file], universe)).toStrictEqual([
      "packages/x/src/a.ts:1 Lint refuses the import.",
      "packages/x/src/a.ts:2 Tests pin the order.",
      "packages/x/src/a.ts:3 Our tests cover the reset.",
      "packages/x/src/a.ts:4 dependency-cruiser bars the edge.",
      "packages/x/src/a.ts:5 A CT will catch the drift.",
      "packages/x/src/a.ts:6 tsc refuses a missing case.",
      "packages/x/src/a.ts:7 The typecheck fails on a missing case.",
      "packages/x/src/a.ts:8 check:boot-chunk separately enforces the ceiling.",
      "packages/x/src/a.ts:9 `check:db-baseline` fails until the chain records it.",
    ]);
  });

  test("passes a compound noun, an object a checker reads, a hyphenated adjective, reported speech, a denial, a relative clause and a heading", () => {
    const file = comments(
      "packages/x/src/a.ts",
      [
        "// The slot names the stage for the styles tier and the CT pin.",
        "// The fixture is the item the content seeder suites assert on.",
        "// These are the values a test asserts or sends.",
        "// The arm is probe-verified in the CT chromium build.",
        "// A comment sentence that claims a test holds a fact names it.",
        "// No lint rule refuses a second one.",
        "// Suites that prove a boot step take the grant here.",
        "// Native ESLint guards for how tests are authored.",
        "export {};",
      ].join("\n"),
    );
    expect(unbackedClaims([file], universe)).toStrictEqual([]);
  });

  test("a whole-suite command, a source file that is no checker and a dead script name back no claim", () => {
    const file = comments(
      "packages/x/src/a.ts",
      [
        "// A test pins the order (`pnpm test`).",
        "// A test pins the order, see packages/x/src/real.ts.",
        "// A test pins the order (`check:gone`).",
        "// A test pins the order (`pnpm knip`).",
        "// A test pins the order (tests/tooling/real.test.ts).",
        "export {};",
      ].join("\n"),
    );
    expect(unbackedClaims([file], universe)).toStrictEqual([
      "packages/x/src/a.ts:1 A test pins the order (`pnpm test`).",
      "packages/x/src/a.ts:2 A test pins the order, see packages/x/src/real.ts.",
      "packages/x/src/a.ts:3 A test pins the order (`check:gone`).",
    ]);
  });

  test("a rule a plugin registers or a preset lists but no block turns on is no rule a cite may name", () => {
    const eslint = eslintRuleIds([
      { plugins: { p: {} }, rules: { "p/on": "error", "p/off": "off", "p/tuple-off": ["off", {}], "p/tuple-on": [1], "core-off": 0 } },
    ]);
    expect([...eslint.rules]).toStrictEqual(["p/on", "p/tuple-on"]);
    const rage = "Linter:\n  Enabled rules:\n    style/useNamingConvention\n\nWorkspace:\n";
    const biome = biomeEnabled(rage, {
      overrides: [{ linter: { rules: { suspicious: { noOn: "error", noOff: "off", noLevelOff: { level: "off" } }, style: { recommended: true } } } }],
    });
    expect([...biome].map(([group, rules]) => [group, [...rules]])).toStrictEqual([
      ["style", ["useNamingConvention"]],
      ["suspicious", ["noOn"]],
    ]);
  });

  test("a claim in a test or a rule source about the test it sits in names itself", () => {
    const text = "// The test fails on its own timeout. A CT pins the header.\nexport {};\n";
    expect(unbackedClaims([comments("tests/x/a.test.ts", text)], universe)).toStrictEqual(["tests/x/a.test.ts:1 A CT pins the header."]);
    expect(unbackedClaims([comments("packages/x/src/a.ts", text)], universe)).toStrictEqual([
      "packages/x/src/a.ts:1 The test fails on its own timeout.",
      "packages/x/src/a.ts:1 A CT pins the header.",
    ]);
  });
});
