// The dead-reference spellings beyond a cited path, each read from the file that owns its truth: a repo path in a
// workflow step, a `pnpm` command, an `@orb/<package>/<subpath>` specifier in lint configuration and a
// comment marker tag. Each check holds no list of its own; the names come from `package.json`, `pnpm help`, the exports
// maps and the rule sources. A `policy` cite is checked beside the law's rule cites, in `tests/tooling/law-rule-citations.test.ts`.
import { execFileSync } from "node:child_process";
import { extname } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { describe } from "vitest";
import { parse } from "yaml";
import type { Source, Span, Tracked } from "./_sources.ts";
import {
  LAW_DOC,
  MARKDOWN,
  NON_LITERAL,
  REPO_ROOT,
  ROOT_CONFIG,
  ROOTED,
  readFromRepo,
  SCRIPT_KINDS,
  scriptComments,
  scriptStrings,
  trackedFiles,
  VENDORED,
} from "./_sources.ts";

const WORKFLOW = /^\.github\/(?:workflows\/[^/]+|actions\/.+)\.ya?ml$/u;
const ACTION_FILES = ["action.yml", "action.yaml"] as const;
const LOCAL_ACTION = "./";
const EXPRESSION = "${{";
const YAML_EXTS = new Set([".yml", ".yaml"]);

const PNPM_ROOTS = ["tooling/src/", "scripts/", "tests/tooling/", ".github/"] as const;
// A command is a name the next characters do not continue into a word, a glob or a placeholder (`pnpm sdk:*`); a
// sentence stop after it is not part of it.
const NAME = String.raw`([a-z](?:[\w:.-]*\w)?)(?![\w*<{]|[:.-][\w*<{])`;
// In a string or a run line a command opens the text, a line or a shell clause; in prose only a backticked span
// names one, so "pnpm and its workers" stays English.
const PNPM_IN_CODE = new RegExp(String.raw`(?:^|[\x60(]|&&|\|\||[;|]|\$\()[ \t]*(?:\$ )?pnpm\s+${NAME}`, "gmu");
const PNPM_IN_PROSE = new RegExp(String.raw`\x60(?:\$ )?pnpm\s+${NAME}[^\x60\n]*\x60`, "gu");
const FENCE = "```";
const FENCED_COMMAND = new RegExp(String.raw`^\s*(?:\$ )?pnpm\s+${NAME}`, "u");

const LINT_HOMES = [/^eslint\.config\.ts$/u, /^\.dependency-cruiser\.ts$/u, /^tooling\/src\/biome-config\//u, /^tooling\/src\/eslint\//u] as const;
// The subpath ends on a word character, so a sentence stop after a specifier is not part of it.
const ORB_SPECIFIER = /@orb\/([a-z][\w-]*)\/([\w-]+(?:[./][\w-]+)*)/gu;
// A string that is only a specifier pattern is an import a rule matches or bans, never a citation of a door.
const BARE_SPECIFIER = /^@orb\/\S+$/u;
const PACKAGE_MANIFESTS = /^(?:packages\/[^/]+|tests\/support|tooling)\/package\.json$/u;
const EXPORT_WILDCARD = "*";

const MARKER_ROOTS = ["tooling/src/", "packages/", "tests/", "scripts/"] as const;
// A marker tag a comment carries or names as an exemption: the positioned waiver or an `@<family>-ok` tag.
const MARKER_TAG = /(?<![\w@-])@(orb-waive|[a-z][\w-]*-ok)\b/gu;
const MARKER_HINT = /@(?:orb-waive|[a-z][\w-]*-ok)\b/u;
// The sources whose rules read comment or attribute markers: the lint plugins, the stylelint configs and the
// ui-audit walker, whose rules read the markers a rendered control declares.
const RULE_SOURCES = [/^tooling\/src\/eslint\//u, /^tooling\/src\/biome-config\//u, /^stylelint[\w.-]*\.ts$/u, /^tooling\/src\/ui-audit\//u] as const;

const kindOf = (path: string): (typeof SCRIPT_KINDS)[string] | undefined => SCRIPT_KINDS[extname(path)];
const isVendored = (path: string): boolean => path.startsWith(VENDORED);

// ── workflow paths ──────────────────────────────────────────────────────────────────────────────────────────────────

interface Step {
  readonly key: string;
  readonly value: string;
}

/** Every `run` and `uses` string in a parsed workflow or action, at any depth. */
function stepValues(node: unknown): Step[] {
  if (Array.isArray(node)) {
    return node.flatMap(stepValues);
  }
  if (typeof node !== "object" || node === null) {
    return [];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    (key === "run" || key === "uses") && typeof value === "string" ? [{ key, value }] : stepValues(value),
  );
}

/** Each repo path a workflow `run` line names, and each local `uses` action, that is not a tracked file. */
function deadWorkflowPaths(sources: readonly Source[], tracked: Tracked): string[] {
  return sources.flatMap((source) =>
    stepValues(parse(source.text)).flatMap(({ key, value }) => {
      if (key === "uses") {
        const dir = value.slice(LOCAL_ACTION.length).replace(/\/$/u, "");
        return value.startsWith(LOCAL_ACTION) && !ACTION_FILES.some((file) => tracked.paths.has(`${dir}/${file}`)) ? [`${source.path} uses ${value}`] : [];
      }
      return value
        .split("\n")
        .filter((line) => !line.includes(EXPRESSION))
        .flatMap((line) => [...line.matchAll(ROOTED)].map(([token]) => token))
        .filter((token) => !(tracked.paths.has(token) || NON_LITERAL.test(token)))
        .map((token) => `${source.path} run ${token}`);
    }),
  );
}

// ── pnpm commands ───────────────────────────────────────────────────────────────────────────────────────────────────

/** pnpm's own commands and their aliases, read off `pnpm help`'s command table. */
function pnpmBuiltIns(help: string): ReadonlySet<string> {
  const table = help.slice(help.indexOf("Commands:"), help.indexOf("Options:"));
  return new Set(
    table.split("\n").flatMap((line) => {
      const name = /^ {2}([a-z][\w-]*)\s/u.exec(line)?.[1];
      const aliases = /\[alias(?:es)?: ([^\]]+)\]/u.exec(line)?.[1]?.split(/,\s*/u) ?? [];
      return name === undefined ? [] : [name, ...aliases];
    }),
  );
}

/** Each command token a source names, from its strings, its comments' backticked spans and a law doc's fences. */
function pnpmTokens(source: Source): Span[] {
  const ext = extname(source.path);
  const from = (spans: readonly Span[], pattern: RegExp): Span[] =>
    spans.flatMap((span) => [...span.text.matchAll(pattern)].map((match) => ({ line: span.line, text: match[1] ?? "" })));
  if (ext === MARKDOWN) {
    let fenced = false;
    return source.text.split("\n").flatMap((text, index): Span[] => {
      if (text.startsWith(FENCE)) {
        fenced = !fenced;
        return [];
      }
      const command = fenced ? FENCED_COMMAND.exec(text)?.[1] : undefined;
      return command === undefined ? from([{ line: index + 1, text }], PNPM_IN_PROSE) : [{ line: index + 1, text: command }];
    });
  }
  if (YAML_EXTS.has(ext)) {
    const runs = WORKFLOW.test(source.path) ? stepValues(parse(source.text)).filter(({ key }) => key === "run") : [];
    const comments = source.text.split("\n").flatMap((text, index) => (text.includes("#") ? [{ line: index + 1, text: text.slice(text.indexOf("#")) }] : []));
    return [
      ...from(
        runs.map(({ value }) => ({ line: 0, text: value })),
        PNPM_IN_CODE,
      ),
      ...from(comments, PNPM_IN_PROSE),
    ];
  }
  const kind = kindOf(source.path);
  return kind === undefined ? [] : [...from(scriptStrings(source, kind), PNPM_IN_CODE), ...from(scriptComments(source, kind), PNPM_IN_PROSE)];
}

function deadPnpmCommands(sources: readonly Source[], known: ReadonlySet<string>): string[] {
  return sources.flatMap((source) =>
    pnpmTokens(source)
      .filter(({ text }) => !known.has(text))
      .map(({ line, text }) => `${source.path}:${String(line)} pnpm ${text}`),
  );
}

// ── package specifiers ──────────────────────────────────────────────────────────────────────────────────────────────

/** Each workspace package's name and the subpath patterns its `exports` map admits. */
function exportMaps(tracked: Tracked, read: (path: string) => string): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...tracked.paths]
      .filter((path) => PACKAGE_MANIFESTS.test(path))
      .map((path) => JSON.parse(read(path)) as { readonly name: string; readonly exports?: Readonly<Record<string, unknown>> })
      .map((manifest) => [manifest.name, Object.keys(manifest.exports ?? {})] as const),
  );
}

/** Whether `./subpath` is an exports key, or matches a key with one `*` wildcard. */
function admits(keys: readonly string[], subpath: string): boolean {
  const wanted = `./${subpath}`;
  return keys.some((key) => {
    const star = key.indexOf(EXPORT_WILDCARD);
    return star === -1 ? key === wanted : wanted.startsWith(key.slice(0, star)) && wanted.endsWith(key.slice(star + 1)) && wanted.length >= key.length;
  });
}

function deadSpecifiers(sources: readonly Source[], exports: ReadonlyMap<string, readonly string[]>): string[] {
  return sources.flatMap((source) => {
    const kind = kindOf(source.path);
    const prose = (kind === undefined ? [] : scriptStrings(source, kind)).filter(({ text }) => !BARE_SPECIFIER.test(text.trim()));
    return prose.flatMap(({ line, text }) =>
      [...text.matchAll(ORB_SPECIFIER)].flatMap(([token, name = "", subpath = ""]) => {
        const keys = exports.get(`@orb/${name}`);
        return subpath === "" || NON_LITERAL.test(token) || (keys !== undefined && admits(keys, subpath))
          ? []
          : [`${source.path}:${String(line)} @orb/${name}/${subpath}`];
      }),
    );
  });
}

// ── marker tags ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The string literals of the rule sources: a marker is live only when a rule spells it. */
function ruleStrings(sources: readonly Source[]): ReadonlySet<string> {
  return new Set(
    sources.flatMap((source) => {
      const kind = kindOf(source.path);
      return kind === undefined ? [] : scriptStrings(source, kind).map(({ text }) => text);
    }),
  );
}

function deadMarkerTags(sources: readonly Source[], read: ReadonlySet<string>): string[] {
  const live = (tag: string): boolean => [...read].some((text) => text.includes(tag));
  return sources.flatMap((source) => {
    const kind = kindOf(source.path);
    return (kind === undefined ? [] : scriptComments(source, kind)).flatMap(({ line, text }) =>
      [...text.matchAll(MARKER_TAG)].flatMap(([token, tag = ""]) => (live(tag) ? [] : [`${source.path}:${String(line)} ${token}`])),
    );
  });
}

// ── the tree ────────────────────────────────────────────────────────────────────────────────────────────────────────

const sourcesWhere = (tracked: Tracked, keep: (path: string) => boolean, hint?: RegExp | string): Source[] =>
  [...tracked.paths]
    .filter((path) => !isVendored(path) && keep(path))
    .map((path) => ({ path, text: readFromRepo(path) }))
    .filter(({ text }) => hint === undefined || (typeof hint === "string" ? text.includes(hint) : hint.test(text)));

const scriptUnder =
  (roots: readonly string[]) =>
  (path: string): boolean =>
    kindOf(path) !== undefined && (roots.some((root) => path.startsWith(root)) || ROOT_CONFIG.test(path));

describe("the real tree", () => {
  const tracked = trackedFiles();

  test("every repo path a workflow step runs and every local action it uses is a tracked file", () => {
    const workflows = sourcesWhere(tracked, (path) => WORKFLOW.test(path));
    expect(workflows.map(({ path }) => path)).toEqual(expect.arrayContaining([".github/workflows/ci.yml", ".github/actions/setup/action.yml"]));
    expect(deadWorkflowPaths(workflows, tracked)).toStrictEqual([]);
  });

  test("every pnpm command a tool, script, workflow or law names is a package script or a pnpm built-in", () => {
    const scripts = Object.keys((JSON.parse(readFromRepo("package.json")) as { readonly scripts: Readonly<Record<string, string>> }).scripts);
    const builtIns = pnpmBuiltIns(execFileSync("pnpm", ["--help"], { cwd: REPO_ROOT, encoding: "utf8" }));
    // An unread help table would pass nothing; one it does read holds the commands every script leans on.
    expect([...builtIns]).toEqual(expect.arrayContaining(["exec", "install", "dlx", "run"]));
    const sources = sourcesWhere(
      tracked,
      (path) =>
        LAW_DOC.test(path) ||
        (ROOT_CONFIG.test(path) && (kindOf(path) !== undefined || YAML_EXTS.has(extname(path)))) ||
        (PNPM_ROOTS.some((root) => path.startsWith(root)) && (kindOf(path) !== undefined || YAML_EXTS.has(extname(path)))),
      "pnpm",
    );
    expect(deadPnpmCommands(sources, new Set([...scripts, ...builtIns]))).toStrictEqual([]);
  });

  test("every @orb subpath a lint configuration or lint message names is admitted by its package's exports map", () => {
    const exports = exportMaps(tracked, readFromRepo);
    expect([...exports.keys()]).toEqual(expect.arrayContaining(["@orb/ui", "@orb/testkit", "@orb/tooling"]));
    const sources = sourcesWhere(tracked, (path) => kindOf(path) !== undefined && LINT_HOMES.some((home) => home.test(path)), "@orb/");
    expect(deadSpecifiers(sources, exports)).toStrictEqual([]);
  });

  test("every marker tag a comment carries is one a rule source spells", () => {
    const read = ruleStrings(sourcesWhere(tracked, (path) => kindOf(path) !== undefined && RULE_SOURCES.some((home) => home.test(path))));
    expect(read.size).toBeGreaterThan(0);
    const sources = sourcesWhere(tracked, scriptUnder(MARKER_ROOTS), MARKER_HINT);
    expect(deadMarkerTags(sources, read)).toStrictEqual([]);
  });
});

describe("the readers", () => {
  const tracked: Tracked = {
    paths: new Set(["tests/tooling/real.test.ts", ".github/actions/setup/action.yml", "packages/ui/package.json"]),
    basenames: new Set(),
  };

  test("a workflow names a deleted test in a run line and a missing local action", () => {
    const workflow: Source = {
      path: ".github/workflows/ci.yml",
      text: [
        "jobs:",
        "  proof:",
        "    steps:",
        "      - uses: ./.github/actions/setup",
        "      - uses: ./.github/actions/gone",
        "      - uses: actions/checkout@v5",
        "      - run: |",
        "          pnpm test tests/tooling/real.test.ts tests/tooling/gone.test.ts",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: a workflow expression in YAML text, not a template.
        "          echo ${{ matrix.file }} tests/tooling/${{ matrix.name }}.test.ts",
        "",
      ].join("\n"),
    };
    expect(deadWorkflowPaths([workflow], tracked)).toStrictEqual([
      ".github/workflows/ci.yml uses ./.github/actions/gone",
      ".github/workflows/ci.yml run tests/tooling/gone.test.ts",
    ]);
  });

  test("a missing pnpm script is refused in a string, a backticked comment, a run line and a law fence, and prose passes", () => {
    const known = new Set(["test", "exec", "lint"]);
    // The planted commands are spliced around the runner name, so this file's own string literals name no command and
    // the real-tree check above, which reads this file too, does not flag its fixtures.
    const run = "pnpm";
    const sources: Source[] = [
      {
        path: "tooling/src/a.ts",
        text: `const hint = "run \`${run} check:docs\` first";\nconst note = "a child of ${run} and its workers";\n// the top-level ${run} and its workers; \`${run} lint\` then \`${run} verify\`, never \`${run} sdk:*-probe\`\nexport {};\n`,
      },
      { path: ".github/workflows/w.yml", text: `jobs:\n  a:\n    steps:\n      - run: ${run} test:scoped x && ${run} exec tsc\n` },
      { path: "docs/law/Law.md", text: `Run \`${run} test x\`.\n\n\`\`\`bash\n${run} ghost\n\`\`\`\n` },
    ];
    expect(deadPnpmCommands(sources, known)).toStrictEqual([
      "tooling/src/a.ts:1 pnpm check:docs",
      "tooling/src/a.ts:3 pnpm verify",
      ".github/workflows/w.yml:0 pnpm test:scoped",
      "docs/law/Law.md:4 pnpm ghost",
    ]);
  });

  test("the built-in table yields command names and their aliases", () => {
    const help = "Commands:\n  install         Install packages [alias: i]\n  remove          Remove [aliases: uninstall, rm]\n\nOptions:\n  -v, --version\n";
    expect([...pnpmBuiltIns(help)]).toStrictEqual(["install", "i", "remove", "uninstall", "rm"]);
  });

  test("an @orb subpath outside the exports map is refused, and an exact or wildcard key passes", () => {
    const exports = new Map([["@orb/ui", ["./button", "./tokens/*.json", "./icons/*"]]]);
    const source: Source = {
      path: "eslint.config.ts",
      text: 'export const m = ["import from @orb/ui/button", "@orb/ui/icons/x", "@orb/ui/tokens/dark.json", "use @orb/ui/content", "^@orb/ui/[^/]+$", "@orb/ui/banned"];\n',
    };
    expect(deadSpecifiers([source], exports)).toStrictEqual(["eslint.config.ts:1 @orb/ui/content"]);
  });

  test("a marker tag no rule source spells is refused, and one a rule reads passes", () => {
    const source: Source = {
      path: "packages/x/src/a.ts",
      text: '// @column-ok: write-only\n// @orb-waive turn-identity(P): a shim\n// @sub-floor-ok as declared\n// reads whose `@owner-scope-ok` exemption holds\nconst s = "// @typeonly-ok in a string";\n',
    };
    expect(deadMarkerTags([source], new Set(["sub-floor-ok"]))).toStrictEqual([
      "packages/x/src/a.ts:1 @column-ok",
      "packages/x/src/a.ts:2 @orb-waive",
      "packages/x/src/a.ts:4 @owner-scope-ok",
    ]);
  });
});
