// Product CSS has a closed set of homes, and production and Playwright CT reach them through one ordered front door.
// Both checks run over a path-and-text tree: the live tests judge the real tree, the rows plant one defect on top of it.
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, relative, resolve } from "node:path";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { readAuthoredRepositoryInventory } from "@orb/tooling/floor/compiler/authored-repository";
import { compile } from "tailwindcss";
import ts from "typescript";

const ROOT = join(import.meta.dirname, "../../..");
const MAIN = "packages/client/src/main.tsx";
const APP_SHELL = "packages/client/src/features/app-shell/surfaces/app-shell.tsx";
const CSS_ENTRY = "packages/client/src/styles/index.ts";
const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const CT_BOOT = "playwright/index.tsx";
const CT_EXTENSION = "playwright/index.css";
const FRONT_DOOR = "./styles/index.ts";
const CT_FRONT_DOOR = "@orb/client/styles";
const TOKEN_VAULT = "packages/ui/src/tokens/tokens.json";
const THEME = "packages/ui/src/styles/theme.css";
const SANCTIONED_STYLESHEETS = [
  THEME,
  "packages/ui/src/styles/globals.css",
  "packages/ui/src/styles/tiers.css",
  CLIENT_GLOBALS,
  "packages/client/src/features/app-shell/surfaces/shell.css",
] as const;
const SANCTIONED_HOMES: readonly string[] = [TOKEN_VAULT, ...SANCTIONED_STYLESHEETS];
const NON_AUTHORED_SEGMENTS: ReadonlySet<string> = new Set(["node_modules", ".git", "dist", ".cache"]);
// What Tailwind echoes back for a harness extension that is only comments and @source statements.
const SOURCE_STATEMENT_OR_COMMENT_RE = /\/\*[\s\S]*?\*\/|@source\s+(?:not\s+)?(?:"[^"]*"|'[^']*')\s*;/gu;
const PACKAGE_REQUIRE = createRequire(join(ROOT, "package.json"));
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const isCss = (specifier: string): boolean => specifier.endsWith(".css");

// The closed set, both ways: no other stylesheet under packages/, and every home present as a file.
function homeFindings(paths: readonly string[]): readonly string[] {
  const authored = paths.filter((path) => path.startsWith("packages/") && !path.split("/").some((segment) => NON_AUTHORED_SEGMENTS.has(segment)));
  if (authored.length === 0) {
    throw new Error("the authored packages/ tree is empty or missing");
  }
  const present = new Set(authored);
  return [
    ...authored.filter((path) => isCss(path) && !SANCTIONED_HOMES.includes(path)).map((path) => `stylesheet outside the closed set of homes: ${path}`),
    ...SANCTIONED_HOMES.filter((home) => !present.has(home)).map((home) => `sanctioned home missing or not a regular file: ${home}`),
  ];
}

interface Tree {
  readonly paths: readonly string[];
  // The file's text. A missing file or invalid UTF-8 throws, so a gutted tree can never read as clean.
  readonly read: (path: string) => string;
}

const AUTHORED_PATHS = readAuthoredRepositoryInventory(ROOT).paths;

function diskTree(): Tree {
  return {
    paths: AUTHORED_PATHS,
    read: (path): string => {
      if (!existsSync(join(ROOT, path))) {
        throw new Error(`ENOENT: ${path} is missing`);
      }
      return strictUtf8.decode(readFileSync(join(ROOT, path)));
    },
  };
}

// The real tree with named files replaced, added (a string) or removed (null).
function planted(base: Tree, changes: Readonly<Record<string, string | null>>): Tree {
  return {
    paths: [...new Set([...base.paths, ...Object.keys(changes)])].filter((path) => changes[path] !== null),
    read: (path): string => {
      const change = changes[path];
      if (change === null) {
        throw new Error(`ENOENT: ${path} is missing`);
      }
      return change ?? base.read(path);
    },
  };
}

function anchor(tree: Tree, path: string): string {
  const text = tree.read(path);
  if (text === "") {
    throw new Error(`${path} is empty`);
  }
  return text;
}

// Module specifiers the way TypeScript's own scanner sees them: comments and string payloads are not imports.
function importsOf(text: string): readonly string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map(({ fileName }) => fileName);
}

// A sanctioned stylesheet that is missing, empty or unparseable refuses the verdict. Its @imports are stubbed, so only its own syntax is judged.
async function assertHomesReadable(tree: Tree): Promise<void> {
  for (const home of SANCTIONED_STYLESHEETS) {
    await compile(anchor(tree, home), {
      base: dirname(join(ROOT, home)),
      loadStylesheet: (_id, base) => Promise.resolve({ path: join(base, "stub.css"), base, content: "" }),
    });
  }
}

// Tailwind resolves the stylesheet graph itself, so the walk follows the same edges the build does. Returns the @source count.
// The graph is closed: an existing third-party or harness stylesheet is still no sanctioned home.
function assertSanctioned(path: string): void {
  if (!SANCTIONED_STYLESHEETS.some((home) => home === path)) {
    throw new Error(`${path} is outside the sanctioned stylesheet homes`);
  }
}

async function walkStylesheets(tree: Tree, root: string, reached: Set<string>): Promise<number> {
  assertSanctioned(root);
  const compiled = await compile(anchor(tree, root), {
    base: dirname(join(ROOT, root)),
    from: join(ROOT, root),
    loadStylesheet: (id, base) => {
      if (id === "tailwindcss") {
        const path = join(dirname(PACKAGE_REQUIRE.resolve("tailwindcss/package.json")), "index.css");
        return Promise.resolve({ path, base: dirname(path), content: readFileSync(path, "utf8") });
      }
      const path = id.startsWith(".") ? join(base, id) : PACKAGE_REQUIRE.resolve(id, { paths: [base] });
      assertSanctioned(relative(ROOT, path));
      reached.add(relative(ROOT, path));
      return Promise.resolve({ path, base: dirname(path), content: anchor(tree, relative(ROOT, path)) });
    },
  });
  return compiled.sources.length;
}

function productionAnchorFindings(tree: Tree): readonly string[] {
  const found: string[] = [];
  const main = importsOf(tree.read(MAIN));
  if (!main.includes(FRONT_DOOR) || main.some(isCss)) {
    found.push(`${MAIN}: production must import only ${FRONT_DOOR} for CSS topology`);
  }
  if (importsOf(tree.read(APP_SHELL)).some(isCss)) {
    found.push(`${APP_SHELL}: AppShell must not carry an independent stylesheet import outside the shared CSS front door`);
  }
  return found;
}

function ctImportFindings(tree: Tree): readonly string[] {
  const found: string[] = [];
  const boot = importsOf(anchor(tree, CT_BOOT));
  if (!boot.includes(CT_FRONT_DOOR) || boot.some(isCss)) {
    found.push(`${CT_BOOT}: CT must import ${CT_FRONT_DOOR} and no product or harness stylesheet directly`);
  }
  for (const path of tree.paths.filter((candidate) => candidate.startsWith("tests/") && /\.tsx?$/u.test(candidate))) {
    // A specifier ending in .css contains ".css", so this prefilter skips only files that cannot match.
    const text = tree.read(path);
    if (text.includes(".css") && importsOf(text).some(isCss)) {
      found.push(`${path}: CT story/spec modules must receive product CSS from the shared bootstrap, never direct imports`);
    }
  }
  return found;
}

async function productGraphFindings(tree: Tree): Promise<readonly string[]> {
  const found: string[] = [];
  const entry = importsOf(anchor(tree, CSS_ENTRY));
  const roots = entry.filter(isCss).map((specifier) => posix.join(posix.dirname(CSS_ENTRY), specifier));
  if (roots.length === 0 || roots.length !== entry.length) {
    found.push(`${CSS_ENTRY}: production CSS front door must contain only nonzero ordered stylesheet imports; found ${String(roots.length)}`);
  }
  const reached = new Set<string>(roots);
  const unresolved: string[] = [];
  let sourceRoots = 0;
  for (const root of roots) {
    try {
      sourceRoots += await walkStylesheets(tree, root, reached);
    } catch (error) {
      unresolved.push(`${root} → ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const missing = SANCTIONED_STYLESHEETS.filter((home) => !reached.has(home));
  if (missing.length > 0 || unresolved.length > 0) {
    found.push(
      `${CSS_ENTRY}: production CSS graph is incomplete (imports=${String(reached.size)}, missing=${missing.join(",") || "none"}, unresolved=${unresolved.join(",") || "none"})`,
    );
  }
  // A graph that could not be walked has no source count to judge.
  if (sourceRoots === 0 && unresolved.length === 0) {
    found.push(`${CSS_ENTRY}: production CSS graph learned zero Tailwind source roots from ${String(reached.size)} imported stylesheets`);
  }
  return found;
}

// The extension is appended to client globals, so its @source resolves against that file's directory.
async function harnessExtensionFindings(tree: Tree): Promise<readonly string[]> {
  const residue = `${CT_EXTENSION}: CT harness extension must carry NO rules, blocks or imports beside its @source`;
  const extension = await compile(anchor(tree, CT_EXTENSION), {
    base: dirname(join(ROOT, CLIENT_GLOBALS)),
    loadStylesheet: () => Promise.reject(new Error("a harness extension cannot @import")),
  }).catch((error: unknown) => (error instanceof Error && error.message === "a harness extension cannot @import" ? undefined : Promise.reject(error)));
  if (extension === undefined) {
    return [residue];
  }
  const found: string[] = [];
  const [only] = extension.sources;
  if (only === undefined || extension.sources.length !== 1 || only.negated || resolve(only.base, only.pattern) !== join(ROOT, "tests")) {
    found.push(
      `${CT_EXTENSION}: CT harness extension must declare exactly one tests-only @source; found ${String(extension.sources.length)} sources ${JSON.stringify(extension.sources.map(({ pattern }) => pattern))}`,
    );
  }
  if (extension.build([]).replace(SOURCE_STATEMENT_OR_COMMENT_RE, "").trim() !== "") {
    found.push(residue);
  }
  return found;
}

async function topologyFindings(tree: Tree): Promise<readonly string[]> {
  await assertHomesReadable(tree);
  return [...productionAnchorFindings(tree), ...ctImportFindings(tree), ...(await productGraphFindings(tree)), ...(await harnessExtensionFindings(tree))];
}

test("the authored packages/ tree holds exactly the six sanctioned CSS homes, each a regular file", () => {
  const { paths } = diskTree();
  expect(paths.filter((path) => path.startsWith("packages/") && isCss(path)).length, "the stylesheet population is non-empty").toBeGreaterThan(0);
  expect(homeFindings(paths)).toEqual([]);
  for (const home of SANCTIONED_HOMES) {
    expect(lstatSync(join(ROOT, home)).isFile(), home).toBe(true);
  }
});

for (const row of [
  {
    name: "a feature-local stylesheet",
    paths: [...SANCTIONED_HOMES, "packages/client/src/features/thing/thing.css"],
    count: 1,
    message: "outside the closed set",
  },
  {
    name: "an extra stylesheet beside a UI home",
    paths: [...SANCTIONED_HOMES, "packages/ui/src/styles/extra.css"],
    count: 1,
    message: "outside the closed set",
  },
  {
    name: "a dotfile stylesheet and one under a dot-directory",
    paths: [...SANCTIONED_HOMES, "packages/ui/src/styles/.extra.css", "packages/ui/src/.hidden/extra.css"],
    count: 2,
    message: "outside the closed set",
  },
  {
    name: "a directory at an exact home path",
    paths: [...SANCTIONED_HOMES.filter((home) => home !== THEME), `${THEME}/keep`],
    count: 1,
    message: `sanctioned home missing or not a regular file: ${THEME}`,
  },
  { name: "a packages tree with none of the homes", paths: ["packages/client/src/features/chat/thing.tsx"], count: 6, message: "sanctioned home missing" },
]) {
  test(`sanctioned CSS homes flag ${row.name}`, () => {
    const found = homeFindings(row.paths);
    expect(found).toHaveLength(row.count);
    expect(found.every((finding) => finding.includes(row.message))).toBe(true);
  });
}

test("generated dist output, vendored node_modules CSS and a .cache artifact are not authored stylesheets", () => {
  const ignored = ["packages/ui/dist/generated.css", "packages/ui/node_modules/vendor/vendor.css", "packages/ui/.cache/warm.css"];
  expect(homeFindings([...SANCTIONED_HOMES, ...ignored])).toEqual([]);
});

test("an absent packages tree is a refusal, never six vanished homes", () => {
  expect(() => homeFindings(["package.json"])).toThrow("empty or missing");
});

test("production and CT reach every sanctioned stylesheet through one ordered front door, and CT adds only tests/", async () => {
  const tree = diskTree();
  expect(
    tree.paths.some((path) => path.startsWith("tests/legacy/")),
    "the story population includes tests/legacy",
  ).toBe(true);
  expect(await topologyFindings(tree)).toEqual([]);
});

for (const row of [
  {
    name: "an independent CT stylesheet import",
    changes: { [CT_BOOT]: 'import "../packages/client/src/styles/globals.css";\n' },
    count: 1,
    message: "CT must import",
  },
  {
    name: "a fixture-local product stylesheet import",
    changes: { "tests/client/story.tsx": 'import "../../packages/client/src/styles/globals.css";\nexport const Fixture = 1;\n' },
    count: 1,
    message: "story/spec modules",
  },
  { name: "a front door with no stylesheet imports", changes: { [CSS_ENTRY]: "export {};\n" }, count: 3, message: "production CSS" },
  {
    name: "two harness sources",
    changes: { [CT_EXTENSION]: '@source "../../../../tests";\n@source "../../../../packages/client/src";\n' },
    count: 1,
    message: "exactly one tests-only @source",
  },
  {
    name: "one harness source aimed at production",
    changes: { [CT_EXTENSION]: '@source "../../../../packages/client/src";\n' },
    count: 1,
    message: "exactly one tests-only @source",
  },
  {
    name: "an @import that resolves to nothing",
    changes: { [CLIENT_GLOBALS]: '@import "@orb/ui/styles/globals.css";\n@import "./missing.css";\n@source "../";\n' },
    count: 1,
    message: "unresolved=packages/client/src/styles/globals.css → packages/client/src/styles/missing.css is outside the sanctioned stylesheet homes",
  },
  {
    name: "an @import of an existing third-party stylesheet",
    changes: { [CLIENT_GLOBALS]: '@import "@orb/ui/styles/globals.css";\n@import "tailwindcss/theme.css";\n@source "../";\n' },
    count: 1,
    message: "→ node_modules/",
  },
  {
    name: "an @import of an existing harness stylesheet",
    changes: { [CLIENT_GLOBALS]: '@import "@orb/ui/styles/globals.css";\n@import "../../../../playwright/index.css";\n@source "../";\n' },
    count: 1,
    message: "→ playwright/index.css is outside the sanctioned stylesheet homes",
  },
  {
    name: "production reaching a stylesheet past the front door",
    changes: { [MAIN]: 'import "./styles/globals.css";\n' },
    count: 1,
    message: "production must import only",
  },
  {
    name: "a production entry that never imports the front door",
    changes: { [MAIN]: 'import { createRoot } from "react-dom/client";\nexport const boot = createRoot;\n' },
    count: 1,
    message: "production must import only",
  },
  {
    name: "a style rule authored into the harness extension",
    changes: { [CT_EXTENSION]: '@source "../../../../tests";\n.harness-only { color: red; }\n' },
    count: 1,
    message: "must carry NO rules",
  },
  {
    name: "an @import authored into the harness extension",
    changes: { [CT_EXTENSION]: '@source "../../../../tests";\n@import "./other.css";\n' },
    count: 1,
    message: "must carry NO rules",
  },
  {
    name: "a surface-local stylesheet beside the app shell",
    changes: {
      [APP_SHELL]: 'import "./app-shell.css";\nexport const AppShell = 1;\n',
      "packages/client/src/features/app-shell/surfaces/app-shell.css": ".x {}\n",
    },
    count: 1,
    message: "AppShell must not carry",
  },
]) {
  test(`the CSS front door flags ${row.name}`, async () => {
    const found = await topologyFindings(planted(diskTree(), row.changes));
    expect(found).toHaveLength(row.count);
    expect(found.every((finding) => finding.includes(row.message))).toBe(true);
  });
}

test("stylesheet text inside a string and a commented-out CT boot import are data, not imports", async () => {
  const found = await topologyFindings(
    planted(diskTree(), {
      "tests/kit/css-validate/index.test.ts": `export const customCss = "@import 'x.css';";\n`,
      "tests/ui/styles/css-structure.suite.test.ts": 'export const THEME_CSS_PATH = "packages/ui/src/styles/theme.css";\n',
      [CT_BOOT]: `import "${CT_FRONT_DOOR}";\n// import "../packages/client/src/styles/globals.css";\n`,
    }),
  );
  expect(found).toEqual([]);
});

for (const row of [
  { name: "a vanished CT boot", changes: { [CT_BOOT]: null }, error: "playwright/index.tsx is missing" },
  { name: "a missing product stylesheet", changes: { [THEME]: null }, error: `${THEME} is missing` },
  { name: "a malformed product stylesheet", changes: { [THEME]: ":root {\n" }, error: "Missing closing }" },
  { name: "a zero-length product stylesheet", changes: { [THEME]: "" }, error: `${THEME} is empty` },
  { name: "a zero-length CT boot", changes: { [CT_BOOT]: "" }, error: "playwright/index.tsx is empty" },
]) {
  test(`the CSS front door refuses ${row.name} instead of judging it`, async () => {
    await expect(topologyFindings(planted(diskTree(), row.changes))).rejects.toThrow(row.error);
  });
}
