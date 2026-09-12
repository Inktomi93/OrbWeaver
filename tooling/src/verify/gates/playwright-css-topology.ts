// Gate: playwright-css-topology (client-architecture-lockdown.md §4.5) — production and CT enter through
// one ordered TS CSS front door; product CSS/@source topology is derived there, while CT adds only tests/.
// fs-backed, whole-project: TS imports are exact ImportDeclarations; CSS directives are comment-BLIND.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { blankCssComments, blankTsCommentsInText } from "../lib/comment-spans.ts";
import { readStaticSource } from "../lib/config-static-read.ts";
import { SANCTIONED_CSS_HOMES } from "../lib/sanctioned-css-homes.ts";

const MAIN = "packages/client/src/main.tsx";
const APP_SHELL = "packages/client/src/features/app-shell/surfaces/app-shell.tsx";
const CSS_ENTRY = "packages/client/src/styles/index.ts";
const CT_BOOT = "playwright/index.tsx";
const CT_CONFIG = "playwright-ct.config.ts";
const CT_EXTENSION = "playwright/index.css";
const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const GATE_SELF = "tooling/src/verify/gates/playwright-css-topology.ts";
const CSS_IMPORT_RE = /@import\s+["'](?<specifier>[^"']+)["'][^;]*;/g;
const CSS_SOURCE_RE = /@source\s+["'](?<source>[^"']+)["']\s*;/g;

function read(root: string, rel: string): string | null {
  const path = join(root, rel);
  return statSync(path, { throwIfNoEntry: false })?.isFile() === true ? readFileSync(path, "utf8") : null;
}

function tsImports(ctx: GateRunCtx, rel: string): string[] | null {
  const sourceFile = ctx.project.getSourceFile(join(ctx.root, rel));
  if (sourceFile !== undefined) {
    return sourceFile.getImportDeclarations().map((declaration) => declaration.getModuleSpecifierValue());
  }
  const outsideWorkspace = readStaticSource(ctx.root, rel);
  return outsideWorkspace.kind === "ok" ? outsideWorkspace.sf.getImportDeclarations().map((declaration) => declaration.getModuleSpecifierValue()) : null;
}

function repoPath(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join("/");
}

function resolveCssImport(root: string, importer: string, specifier: string): string | null {
  if (specifier === "tailwindcss") {
    return null;
  }
  if (specifier === "@orb/ui/styles/globals.css") {
    return "packages/ui/src/styles/globals.css";
  }
  return specifier.startsWith(".") ? repoPath(root, resolve(root, dirname(importer), specifier)) : `!unresolved:${specifier}`;
}

function cssGraph(root: string, roots: readonly string[]): { readonly files: readonly string[]; readonly sources: readonly string[] } {
  const files: string[] = [];
  const sources: string[] = [];
  const seen = new Set<string>();
  const visit = (rel: string): void => {
    if (seen.has(rel)) {
      return;
    }
    seen.add(rel);
    const source = read(root, rel);
    if (source === null) {
      return;
    }
    files.push(rel);
    const code = blankCssComments(source);
    for (const match of code.matchAll(CSS_IMPORT_RE)) {
      const child = resolveCssImport(root, rel, match.groups?.["specifier"] ?? "");
      if (child !== null) {
        visit(child);
      }
    }
    for (const match of code.matchAll(CSS_SOURCE_RE)) {
      sources.push(`${rel}:${match.groups?.["source"] ?? ""}`);
    }
  };
  for (const rootFile of roots) {
    visit(rootFile);
  }
  return { files, sources };
}

function report(ctx: Parameters<NonNullable<GateDescriptor["run"]>>[0], message: string, file = GATE_SELF): void {
  ctx.report({ file, line: 1, column: 0, message });
}

interface TopologySources {
  readonly extension: string;
  readonly ctConfig: string;
}

interface TopologyImports {
  readonly main: readonly string[];
  readonly shell: readonly string[];
  readonly entry: readonly string[];
  readonly ct: readonly string[];
}

function loadTopologySources(ctx: GateRunCtx): TopologySources | null {
  const required = [MAIN, APP_SHELL, CSS_ENTRY, CT_BOOT, CT_CONFIG, CT_EXTENSION];
  if (required.some((rel) => read(ctx.root, rel) === null)) {
    report(ctx, "CSS topology anchor missing — production entry, CT bootstrap/config, and harness extension must all be regular files");
    return null;
  }
  return {
    extension: read(ctx.root, CT_EXTENSION) ?? "",
    ctConfig: read(ctx.root, CT_CONFIG) ?? "",
  };
}

function loadTopologyImports(ctx: GateRunCtx): TopologyImports | null {
  const main = tsImports(ctx, MAIN);
  const shell = tsImports(ctx, APP_SHELL);
  const entry = tsImports(ctx, CSS_ENTRY);
  const ct = tsImports(ctx, CT_BOOT);
  if (main === null || shell === null || entry === null || ct === null) {
    report(ctx, "CSS topology TypeScript anchors must be parseable from the shared workspace or their exact governed file");
    return null;
  }
  return { main, shell, entry, ct };
}

function directCtCssImports(ctx: GateRunCtx): string[] {
  return ctx.files
    .filter((sourceFile) => {
      const rel = repoPath(ctx.root, sourceFile.getFilePath());
      return rel !== CT_BOOT && (rel.startsWith("playwright/") || rel.startsWith("tests/"));
    })
    .flatMap((sourceFile) =>
      sourceFile
        .getImportDeclarations()
        .filter((declaration) => declaration.getModuleSpecifierValue().endsWith(".css"))
        .map(() => repoPath(ctx.root, sourceFile.getFilePath())),
    );
}

function validateTypeScriptTopology(ctx: GateRunCtx, imports: TopologyImports): void {
  if (!imports.main.includes("./styles/index.ts") || imports.main.some((value) => value.endsWith(".css"))) {
    report(ctx, "production must import only ./styles/index.ts for CSS topology", MAIN);
  }
  if (imports.shell.some((value) => value.endsWith(".css"))) {
    report(ctx, "AppShell must not carry an independent stylesheet import outside the shared CSS front door", APP_SHELL);
  }
  if (!imports.ct.includes("@orb/client/styles") || imports.ct.some((value) => value.endsWith(".css"))) {
    report(ctx, "CT must import @orb/client/styles and no product or harness stylesheet directly", CT_BOOT);
  }
  for (const file of directCtCssImports(ctx)) {
    report(ctx, "CT story/spec modules must receive product CSS from the shared bootstrap, never direct imports", file);
  }
}

function validateProductCssGraph(ctx: GateRunCtx, entryImports: readonly string[]): void {
  const cssRoots = entryImports.filter((value) => value.endsWith(".css")).map((value) => repoPath(ctx.root, resolve(ctx.root, dirname(CSS_ENTRY), value)));
  if (cssRoots.length === 0 || cssRoots.length !== entryImports.length) {
    report(ctx, `production CSS front door must contain only nonzero ordered stylesheet imports; found ${cssRoots.length}`, CSS_ENTRY);
  }
  const graph = cssGraph(ctx.root, cssRoots);
  const expectedCss = SANCTIONED_CSS_HOMES.filter((value) => value.endsWith(".css"));
  const missing = expectedCss.filter((value) => !graph.files.includes(value));
  const unresolved = graph.files.filter((value) => value.startsWith("!unresolved:"));
  if (missing.length > 0 || unresolved.length > 0) {
    report(
      ctx,
      `production CSS graph is incomplete (imports=${graph.files.length}, sources=${graph.sources.length}, missing=${missing.join(",") || "none"}, unresolved=${unresolved.join(",") || "none"})`,
      CSS_ENTRY,
    );
  }
  if (graph.sources.length === 0) {
    report(ctx, `production CSS graph learned zero Tailwind source roots from ${graph.files.length} imported stylesheets`, CSS_ENTRY);
  }
}

function validateHarnessExtension(ctx: GateRunCtx, extension: string): void {
  const extensionCode = blankCssComments(extension);
  const extensionSources = [...extensionCode.matchAll(CSS_SOURCE_RE)].map((match) => match.groups?.["source"] ?? "");
  const residue = extensionCode.replace(CSS_SOURCE_RE, "").trim();
  if (extensionSources.length !== 1 || extensionSources[0] !== "../../../../tests" || residue !== "") {
    report(
      ctx,
      `CT harness extension must contain exactly one tests-only @source and no imports/rules; found ${extensionSources.length} sources`,
      CT_EXTENSION,
    );
  }
}

function validateCtConfig(ctx: GateRunCtx, ctConfig: string): void {
  const code = blankTsCommentsInText(ctConfig);
  const extensionPlugin = code.indexOf('"orb:ct-css-source-extension"');
  const tailwindPlugin = code.indexOf("tailwindcss()");
  if (extensionPlugin < 0 || tailwindPlugin < 0 || extensionPlugin > tailwindPlugin || !code.includes(CLIENT_GLOBALS)) {
    report(ctx, "CT config must inject the harness source extension into client globals before Tailwind compiles it", CT_CONFIG);
  }
}

export const gate: GateDescriptor = {
  name: "playwright-css-topology",
  docRow: "client-architecture-lockdown.md §4.5",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: "Playwright CT must derive the ordered product CSS graph from the production front door and add only its explicit tests/ source",
  fix: "import the shared packages/client/src/styles/index.ts front door from production and CT; keep playwright/index.css source-only",
  run: (ctx) => {
    if (!existsSync(join(ctx.root, MAIN))) {
      return;
    }
    const sources = loadTopologySources(ctx);
    const imports = loadTopologyImports(ctx);
    if (sources === null || imports === null) {
      return;
    }
    validateTypeScriptTopology(ctx, imports);
    validateProductCssGraph(ctx, imports.entry);
    validateHarnessExtension(ctx, sources.extension);
    validateCtConfig(ctx, sources.ctConfig);
  },
  mustFlag: [
    {
      files: {
        [MAIN]: 'import "./styles/index.ts";\n',
        [APP_SHELL]: "export const AppShell = 1;\n",
        [CSS_ENTRY]: 'import "../features/app-shell/surfaces/shell.css";\nimport "./globals.css";\n',
        [CT_BOOT]: 'import "../packages/client/src/styles/globals.css";\n',
        [CT_CONFIG]: `const marker = "${CLIENT_GLOBALS}";\nconst plugins = [{ name: "orb:ct-css-source-extension" }, tailwindcss()];\n`,
        [CT_EXTENSION]: '@source "../../../../tests";\n',
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/styles/globals.css": '@import "@orb/ui/styles/globals.css";\n@source "../";\n',
        "packages/ui/src/styles/globals.css": '@import "tailwindcss";\n@import "./theme.css";\n@import "./tiers.css";\n',
        "packages/ui/src/styles/theme.css": ":root {}\n",
        "packages/ui/src/styles/tiers.css": "[data-surface-tier] {}\n",
      },
      expect: { count: 1, messageIncludes: "CT must import" },
      why: "an independent CT stylesheet import is the handwritten parallel roster this gate removes",
    },
    {
      files: {
        [MAIN]: 'import "./styles/index.ts";\n',
        [APP_SHELL]: "export const AppShell = 1;\n",
        [CSS_ENTRY]: 'import "../features/app-shell/surfaces/shell.css";\nimport "./globals.css";\n',
        [CT_BOOT]: 'import "@orb/client/styles";\n',
        [CT_CONFIG]: `const marker = "${CLIENT_GLOBALS}";\nconst plugins = [{ name: "orb:ct-css-source-extension" }, tailwindcss()];\n`,
        [CT_EXTENSION]: '@source "../../../../tests";\n',
        "tests/client/__g_fixture.tsx": 'import "../../../packages/client/src/styles/globals.css";\nexport const Fixture = 1;\n',
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/styles/globals.css": '@import "@orb/ui/styles/globals.css";\n@source "../";\n',
        "packages/ui/src/styles/globals.css": '@import "tailwindcss";\n@import "./theme.css";\n@import "./tiers.css";\n',
        "packages/ui/src/styles/theme.css": ":root {}\n",
        "packages/ui/src/styles/tiers.css": "[data-surface-tier] {}\n",
      },
      expect: { count: 1, messageIncludes: "story/spec modules" },
      why: "a fixture-local product stylesheet import recreates the parallel roster behind a correct bootstrap",
    },
    {
      files: {
        [MAIN]: 'import "./styles/index.ts";\n',
        [APP_SHELL]: "export const AppShell = 1;\n",
        [CSS_ENTRY]: "export {};\n",
        [CT_BOOT]: 'import "@orb/client/styles";\n',
        [CT_CONFIG]: `const marker = "${CLIENT_GLOBALS}";\nconst plugins = [{ name: "orb:ct-css-source-extension" }, tailwindcss()];\n`,
        [CT_EXTENSION]: '@source "../../../../tests";\n',
      },
      expect: { count: 3, messageIncludes: "production CSS" },
      why: "zero product imports and zero derived source roots are loud instrument failures, never parity",
    },
    {
      files: {
        [MAIN]: 'import "./styles/index.ts";\n',
        [APP_SHELL]: "export const AppShell = 1;\n",
        [CSS_ENTRY]: 'import "../features/app-shell/surfaces/shell.css";\nimport "./globals.css";\n',
        [CT_BOOT]: 'import "@orb/client/styles";\n',
        [CT_CONFIG]: `const marker = "${CLIENT_GLOBALS}";\nconst plugins = [{ name: "orb:ct-css-source-extension" }, tailwindcss()];\n`,
        [CT_EXTENSION]: '@source "../../../../tests";\n@source "../../../../packages/client/src";\n',
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/styles/globals.css": '@import "@orb/ui/styles/globals.css";\n@source "../";\n',
        "packages/ui/src/styles/globals.css": '@import "tailwindcss";\n@import "./theme.css";\n@import "./tiers.css";\n',
        "packages/ui/src/styles/theme.css": ":root {}\n",
        "packages/ui/src/styles/tiers.css": "[data-surface-tier] {}\n",
      },
      expect: { count: 1, messageIncludes: "tests-only" },
      why: "a stale product source copied into the harness extension is the reverse parity failure",
    },
  ],
  mustPass: [
    {
      files: {
        [MAIN]: 'import "./styles/index.ts";\n',
        [APP_SHELL]: "export const AppShell = 1;\n",
        [CSS_ENTRY]: 'import "../features/app-shell/surfaces/shell.css";\nimport "./globals.css";\n',
        [CT_BOOT]: 'import "@orb/client/styles";\n',
        [CT_CONFIG]: `const marker = "${CLIENT_GLOBALS}";\nconst plugins = [{ name: "orb:ct-css-source-extension" }, tailwindcss()];\n`,
        [CT_EXTENSION]: '@source "../../../../tests";\n',
        "tests/kit/css-validate/index.test.ts": `const customCss = "@import 'x.css';";\n`,
        "tests/server/domain/settings/verbs/create-theme.int.test.ts": `const input = { css: "@import 'x.css';" };\n`,
        "tests/ui/styles/css-structure.suite.test.ts":
          'const THEME_CSS_PATH = "packages/ui/src/styles/theme.css";\nexpect(THEME_CSS_PATH).toContain("theme.css");\n',
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/styles/globals.css": '@import "@orb/ui/styles/globals.css";\n@source "../";\n',
        "packages/ui/src/styles/globals.css": '@import "tailwindcss";\n@import "./theme.css";\n@import "./tiers.css";\n',
        "packages/ui/src/styles/theme.css": ":root {}\n",
        "packages/ui/src/styles/tiers.css": "[data-surface-tier] {}\n",
      },
      why: "custom-theme CSS payloads and stylesheet path assertions are data, not ImportDeclarations",
    },
    {
      files: {
        [MAIN]: 'import "./styles/index.ts";\n',
        [APP_SHELL]: "export const AppShell = 1;\n",
        [CSS_ENTRY]: 'import "../features/app-shell/surfaces/shell.css";\nimport "./globals.css";\n',
        [CT_BOOT]: 'import "@orb/client/styles";\n',
        [CT_CONFIG]: `const marker = "${CLIENT_GLOBALS}";\nconst plugins = [{ name: "orb:ct-css-source-extension" }, tailwindcss()];\n`,
        [CT_EXTENSION]: '@source "../../../../tests";\n',
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/styles/globals.css": '@import "@orb/ui/styles/globals.css";\n@source "../";\n',
        "packages/ui/src/styles/globals.css": '@import "tailwindcss";\n@import "./theme.css";\n@import "./tiers.css";\n',
        "packages/ui/src/styles/theme.css": ":root {}\n",
        "packages/ui/src/styles/tiers.css": "[data-surface-tier] {}\n",
      },
      why: "one shared ordered entry reaches all five CSS homes, derives product source roots, and adds only tests for CT",
    },
    {
      files: { "packages/client/src/features/chat/probe.ts": "export const probe = true;\n" },
      why: "a partial synthetic tree without the production main anchor is outside this whole-project contract",
    },
  ],
};
