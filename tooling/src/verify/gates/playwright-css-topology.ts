// Gate: playwright-css-topology (client-architecture-lockdown.md §4.5) — production and CT enter through
// ONE ordered TS CSS front door; the product CSS/@source topology is derived there, and CT adds only its
// own `tests/` source root.
//
// FAMILY: `css-home-topology`, the shared reader `lib/css-home-topology.ts#SANCTIONED_CSS_STYLESHEETS`,
// with `sanctioned-css-homes` as the other member. That policy asks WHICH HOMES MAY EXIST; this one asks
// WHICH HOMES THE FRONT DOORS MUST REACH. Until #2096 this module reached the list by importing the other
// GATE MODULE, which the owner banned; the list moved to `lib/` then and the family is named for it now.
//
// A DECLARED HYBRID (§12.4: "a hybrid's dual role is explicit and receipted"), and both halves are stated
// because the split is not obvious:
//   RESOURCE half — six `exact-file` ids plus `product-css`. The four TS anchors, the CT config and the
//   harness stylesheet are exact named files; the product graph is the five-home CSS identity.
//   COMPILER half — `population: { in: ["@client", "@tests"] }`. `@client` is where the three production
//   anchors' ImportDeclarations are read (exact specifiers, never text); `@tests` is the CT story/spec walk.
//
// POPULATION PORT: an INTENTIONAL NARROWING, legacy at eba8ef526, and the narrowing DELETES A DEAD CLAUSE
// rather than losing a capability. The legacy `directCtCssImports` filtered `ctx.files` for
// `rel.startsWith("playwright/") || rel.startsWith("tests/")`. The gate harness corpus is
// `_shared/ts-workspace.ts#harnessGlobs` — `packages/*/src/**`, `tests/**`, `tooling/src/**`, `scripts/**`
// and nothing else; `playwright/**/*.tsx` appears ONLY in `searchGlobs`, which the gate run does not use.
// So `ctx.files` never contained a `playwright/**` module and that clause matched zero files BY
// CONSTRUCTION rather than merely today (the tree also holds exactly four `playwright/` files, one of which
// is the CT boot the clause explicitly excluded). No legacy proof row exercised it. `@tests` is therefore
// the whole live subject.
//
// THE CT BOOT IS A TEXT ARM, AND THAT IS A DECLARED WEAKENING. `playwright/index.tsx` is outside the
// harness corpus by the paragraph above, so the legacy module reached it through
// `config-static-read.ts#readStaticSource` — a FILESYSTEM READ a final policy cannot make (§12.3) — and
// `ctx.sourceFile` refuses a path outside the effective population (`lib/policy-pass-context.ts:351-355`).
// Its arm is therefore a comment-blanked TEXT arm over the `exact-file:ct-boot` fact, which is the shape
// `contract/resource-exact.ts`'s own header sanctions for these ids BY NAME ("these files are SQL, TSX and
// CSS whose consumers do their own graph/text work"). It is weaker than an ImportDeclaration walk in
// exactly one way: a `.css` specifier spelled inside a STRING LITERAL in that file would be read as an
// import. `mustFlag[0]` pins the arm; the limit is small because the file is a nine-line boot module and is
// itself an exact declared identity.
//
// #2231 IS CLOSED BY CONSTRUCTION. The legacy `unresolved` arm was STRUCTURALLY DEAD: `cssGraph`'s `visit`
// returned before `files.push(rel)` when the read was null, and `!unresolved:<spec>` is never a real path,
// so `graph.files.filter(startsWith("!unresolved:"))` was always empty — the message could only ever print
// `unresolved=none`, a clean verdict it could not contradict, while a genuinely unresolvable non-sanctioned
// `@import` vanished with no finding at all. The graph is now walked over
// `cssInventory("product").statements` (the statement at-rule fact built for this conversion, #2183: the
// shared parser pushed at-rules only from `closeFrame`, so a BLOCKLESS `@import` produced no fact at all),
// and a specifier resolving to no sanctioned stylesheet is REPORTED by name. `mustFlag[4]` is the pin.
//
// AUTHORITY: `hard`. Every finding is a whole-file verdict about a named topology anchor with NO token, so
// `locateFinding` could never bind an ordinary position (guide §3, class 2). The legacy engine's bare
// `@orb-gate-ignore playwright-css-topology` door DID exist and does NOT survive the conversion; the marker
// census that makes that free is 0 live markers (measured 2026-09-12 over 7,725 tracked source files with a
// 1,196-hit positive control, `css-family-audit-2026-09-12.md`).
//
// WHERE A BROKEN RESOURCE REFUSES — not here. Every declared `exact-file` id must resolve or the WHOLE fact
// refuses (`contract/resource-exact.ts`), and a refused declaration makes `resolveResourceDeclarations`
// THROW at the POPULATION phase, withholding this owner before `create` runs (guide §11 ruling 3). That is
// the honest successor of the legacy `existsSync(MAIN)` early return AND of its "CSS topology anchor
// missing" arm, both of which answered a gutted tree with a silent clean. This module therefore owns no
// not-ready branch and reads through `readyResourceValue`. `mustRefuse` pins the two reachable shapes; the
// receipt set is pinned in tests/tooling/verify/gates/css-home-topology-family.test.ts, which a row cannot
// express.
//
// DECLARED LIMITS: the CT-boot text arm above, pinned by `mustFlag[0]` and the clean `mustPass[1]`.
import { posix } from "node:path";
import type { SourceFile } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { CssStatementAtRuleFact } from "../contract/resource-css.ts";
import type { ExactFile, ExactResourceId } from "../contract/resource-exact.ts";
import { blankTsCommentsInText } from "../lib/comment-spans.ts";
import { SANCTIONED_CSS_STYLESHEETS } from "../lib/css-home-topology.ts";
import { parseCssStylesheet, quotedStatementArgument } from "../lib/css-rules.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MAIN = "packages/client/src/main.tsx";
const APP_SHELL = "packages/client/src/features/app-shell/surfaces/app-shell.tsx";
const CSS_ENTRY = "packages/client/src/styles/index.ts";
const CT_BOOT = "playwright/index.tsx";
const CT_CONFIG = "playwright-ct.config.ts";
const CT_EXTENSION = "playwright/index.css";
const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const UI_GLOBALS = "packages/ui/src/styles/globals.css";
/** The one CSS specifier the front door may name that is not a relative path: the `@orb/ui` styles subpath
 *  export, which resolves to a sanctioned home. Tailwind's own `@import "tailwindcss"` names a PACKAGE the
 *  bundler owns and contributes no authored stylesheet to the graph. */
const UI_GLOBALS_SPECIFIER = "@orb/ui/styles/globals.css";
const TAILWIND_SPECIFIER = "tailwindcss";
const CT_STYLES_SPECIFIER = "@orb/client/styles";
const HARNESS_SOURCE = "../../../../tests";
const EXTENSION_PLUGIN = '"orb:ct-css-source-extension"';
const TAILWIND_PLUGIN = "tailwindcss()";
const ANCHOR_IDS = [
  "client-entry",
  "client-css-entry",
  "app-shell-surface",
  "ct-boot",
  "ct-extension-css",
  "playwright-ct-config",
] as const satisfies readonly ExactResourceId[];
const MESSAGE =
  "Playwright CT must derive the ordered product CSS graph from the production front door and add only its explicit tests/ source (client-architecture-lockdown.md §4.5)";

type Anchors = ReadonlyMap<ExactResourceId, ExactFile>;
type Report = (file: string, message: string) => void;

/** Import specifiers of one TS TEXT. Used ONLY for the CT boot, which lives outside the gate harness corpus
 *  and therefore has no SourceFile — see the header's declared limit. Comments are blanked by the shared
 *  blanker first, so a commented-out import is never a specifier. */
function textSpecifiers(text: string): readonly string[] {
  const pattern = /(?:^|[\s;}])import\s+(?:[^"';]*?from\s*)?["'](?<specifier>[^"']+)["']/gu;
  return [...blankTsCommentsInText(text).matchAll(pattern)].flatMap((match) => {
    const specifier = match.groups?.["specifier"];
    return specifier === undefined ? [] : [specifier];
  });
}

function importSpecifiers(sourceFile: SourceFile): readonly string[] {
  return sourceFile.getImportDeclarations().map((declaration) => declaration.getModuleSpecifierValue());
}

/** Resolve one authored CSS specifier to its repo path, or `undefined` when it names no authored stylesheet
 *  (the Tailwind package, whose resolution the bundler owns). */
function resolveCssSpecifier(importer: string, specifier: string): string | undefined {
  if (specifier === UI_GLOBALS_SPECIFIER) {
    return UI_GLOBALS;
  }
  return specifier === TAILWIND_SPECIFIER ? undefined : posix.normalize(posix.join(posix.dirname(importer), specifier));
}

interface CssGraph {
  readonly reached: ReadonlySet<string>;
  readonly sourceRoots: number;
  readonly unresolved: readonly string[];
}

/** Walk the product CSS graph from the front door's roots over the STATEMENT facts, never over text. A
 *  specifier resolving to a path outside the loaded product identity is recorded as UNRESOLVED and named in
 *  the finding — the arm #2231 measured structurally dead in the legacy walk, where an unreadable child
 *  simply returned before it could be recorded. */
/** One sheet's `@import` edges as `{importer, specifier, target}` rows, and its `@source` count. A target of
 *  `undefined` is the Tailwind package, which contributes no authored edge. */
function edgesOf(
  file: string,
  statements: readonly CssStatementAtRuleFact[],
): { readonly edges: readonly { specifier: string; target: string }[]; readonly sources: number } {
  const edges: { specifier: string; target: string }[] = [];
  let sources = 0;
  for (const statement of statements) {
    const argument = quotedStatementArgument(statement);
    if (statement.name === "source") {
      sources += 1;
      continue;
    }
    const target = statement.name === "import" && argument !== undefined ? resolveCssSpecifier(file, argument) : undefined;
    if (target !== undefined && argument !== undefined) {
      edges.push({ specifier: argument, target });
    }
  }
  return { edges, sources };
}

function cssGraph(roots: readonly string[], statementsByFile: ReadonlyMap<string, readonly CssStatementAtRuleFact[]>): CssGraph {
  const reached = new Set<string>();
  const unresolved: string[] = [];
  let sourceRoots = 0;
  const visit = (file: string): void => {
    if (reached.has(file)) {
      return;
    }
    reached.add(file);
    const { edges, sources } = edgesOf(file, statementsByFile.get(file) ?? []);
    sourceRoots += sources;
    for (const edge of edges) {
      if (statementsByFile.has(edge.target)) {
        visit(edge.target);
      } else {
        unresolved.push(`${file} → ${edge.specifier}`);
      }
    }
  };
  for (const root of roots) {
    if (statementsByFile.has(root)) {
      visit(root);
    } else {
      unresolved.push(`${CSS_ENTRY} → ${root}`);
    }
  }
  return { reached, sourceRoots, unresolved };
}

/** ARM A — the two PRODUCTION anchors, read as exact ImportDeclarations from the compiler half. Their
 *  `exact-file` declarations are consumed for IDENTITY (a vanished front door is a population refusal, not
 *  a clean pass), exactly as `server-layout` consumes its manifest for its path. */
function reportProductionAnchors(ctx: GatePolicyContext, report: Report): void {
  const mainImports = importSpecifiers(ctx.sourceFile(MAIN));
  if (!mainImports.includes("./styles/index.ts") || mainImports.some((value) => value.endsWith(".css"))) {
    report(MAIN, "production must import only ./styles/index.ts for CSS topology");
  }
  if (importSpecifiers(ctx.sourceFile(APP_SHELL)).some((value) => value.endsWith(".css"))) {
    report(APP_SHELL, "AppShell must not carry an independent stylesheet import outside the shared CSS front door");
  }
}

/** ARM B — the CT boot, a comment-blanked TEXT arm over its exact-file text (the header states why and what
 *  it costs). ARM C — CT story/spec modules, the compiler half's whole live subject. */
function reportCtImports(ctx: GatePolicyContext, anchors: Anchors, report: Report): void {
  const ctSpecifiers = textSpecifiers(anchors.get("ct-boot")?.text ?? "");
  if (!ctSpecifiers.includes(CT_STYLES_SPECIFIER) || ctSpecifiers.some((value) => value.endsWith(".css"))) {
    report(CT_BOOT, `CT must import ${CT_STYLES_SPECIFIER} and no product or harness stylesheet directly`);
  }
  for (const sourceFile of ctx.files) {
    const relative = ctx.relativePath(sourceFile);
    if (relative.startsWith("tests/") && importSpecifiers(sourceFile).some((value) => value.endsWith(".css"))) {
      report(relative, "CT story/spec modules must receive product CSS from the shared bootstrap, never direct imports");
    }
  }
}

/** ARM D — the ordered product CSS graph. */
function reportProductGraph(ctx: GatePolicyContext, statementsByFile: ReadonlyMap<string, readonly CssStatementAtRuleFact[]>, report: Report): void {
  const entryImports = importSpecifiers(ctx.sourceFile(CSS_ENTRY));
  const cssRoots = entryImports.filter((value) => value.endsWith(".css")).map((value) => posix.normalize(posix.join(posix.dirname(CSS_ENTRY), value)));
  if (cssRoots.length === 0 || cssRoots.length !== entryImports.length) {
    report(CSS_ENTRY, `production CSS front door must contain only nonzero ordered stylesheet imports; found ${String(cssRoots.length)}`);
  }
  const graph = cssGraph(cssRoots, statementsByFile);
  const missing = SANCTIONED_CSS_STYLESHEETS.filter((home) => !graph.reached.has(home));
  if (missing.length > 0 || graph.unresolved.length > 0) {
    const census = `imports=${String(graph.reached.size)}, sources=${String(graph.sourceRoots)}`;
    report(
      CSS_ENTRY,
      `production CSS graph is incomplete (${census}, missing=${missing.join(",") || "none"}, unresolved=${graph.unresolved.join(",") || "none"})`,
    );
  }
  if (graph.sourceRoots === 0) {
    report(CSS_ENTRY, `production CSS graph learned zero Tailwind source roots from ${String(graph.reached.size)} imported stylesheets`);
  }
}

/** ARM E — the harness extension: exactly one tests-only `@source` and nothing else. Read through the SHARED
 *  parser's statement facts, which is what retires the module's private `@source` regex. */
function reportHarnessExtension(anchors: Anchors, report: Report): void {
  const parsed = parseCssStylesheet(anchors.get("ct-extension-css")?.text ?? "");
  const sources = parsed.statements.filter((statement) => statement.name === "source").map((statement) => quotedStatementArgument(statement));
  // TWO CLAUSES, TWO MESSAGES. A single message across both makes `messageIncludes` undiscriminating
  // between the rows that pin them (the transplant test in `resource-policy-contract.md` §7), and the
  // counts are equal, so nothing would carry either row.
  if (sources.length !== 1 || sources[0] !== HARNESS_SOURCE) {
    report(
      CT_EXTENSION,
      `CT harness extension must declare exactly one tests-only @source; found ${String(sources.length)} sources ${JSON.stringify(sources)}`,
    );
  }
  if (parsed.rules.length > 0 || parsed.atRules.length > 0 || parsed.statements.length !== sources.length) {
    report(
      CT_EXTENSION,
      `CT harness extension must carry NO rules, blocks or imports beside its @source; found ${String(parsed.rules.length)} rules, ${String(parsed.atRules.length)} blocks, ${String(parsed.statements.length - sources.length)} other statements`,
    );
  }
}

/** ARM F — the CT config's four-clause fence: both plugins present, the extension BEFORE Tailwind, and the
 *  client-globals target named. */
function reportCtConfig(anchors: Anchors, report: Report): void {
  const code = blankTsCommentsInText(anchors.get("playwright-ct-config")?.text ?? "");
  const extensionPlugin = code.indexOf(EXTENSION_PLUGIN);
  const tailwindPlugin = code.indexOf(TAILWIND_PLUGIN);
  // THREE CLAUSES, THREE MESSAGES, for the same reason the extension arm splits: the legacy module fused
  // presence, ORDER and TARGET into one sentence, and the §5b audit measured the whole four-clause fence
  // UNENFORCED (cut p04) — a fused message is what makes each clause's row indistinguishable from its
  // siblings', so no `messageIncludes` can carry one.
  if (extensionPlugin < 0 || tailwindPlugin < 0) {
    report(CT_CONFIG, "CT config must register BOTH the harness source-extension plugin and Tailwind");
  } else if (extensionPlugin > tailwindPlugin) {
    report(CT_CONFIG, "CT config must register the harness source extension BEFORE Tailwind compiles it");
  }
  if (!code.includes(CLIENT_GLOBALS)) {
    report(CT_CONFIG, `CT config's source extension must inject into client globals (${CLIENT_GLOBALS}), which it names nowhere`);
  }
}

/** The complete, legal topology every proof row starts from. A row that omitted a member would measure the
 *  ARM IT DID NOT MEAN — the `server-layout` `mustFlag[0]` shape, where a fixture missing the tiers makes a
 *  one-finding claim ratify eight findings from two arms. */
const TOPOLOGY_FIXTURE: Readonly<Record<string, string>> = {
  [MAIN]: 'import "./styles/index.ts";\n',
  [APP_SHELL]: "export const AppShell = 1;\n",
  [CSS_ENTRY]: 'import "../features/app-shell/surfaces/shell.css";\nimport "./globals.css";\n',
  [CT_BOOT]: `import "${CT_STYLES_SPECIFIER}";\n`,
  [CT_CONFIG]: `const marker = "${CLIENT_GLOBALS}";\nconst plugins = [{ name: ${EXTENSION_PLUGIN} }, ${TAILWIND_PLUGIN}];\n`,
  [CT_EXTENSION]: `@source "${HARNESS_SOURCE}";\n`,
  "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
  [CLIENT_GLOBALS]: `@import "${UI_GLOBALS_SPECIFIER}";\n@source "../";\n`,
  [UI_GLOBALS]: `@import "${TAILWIND_SPECIFIER}";\n@import "./theme.css";\n@import "./tiers.css";\n`,
  "packages/ui/src/styles/theme.css": ":root {}\n",
  "packages/ui/src/styles/tiers.css": "[data-surface-tier] {}\n",
};

/** The fixture minus one member — the shape a `mustRefuse` row needs, typed so the row stays a string map. */
function topologyWithout(omitted: string): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(TOPOLOGY_FIXTURE).filter(([path]) => path !== omitted));
}

export const gate = defineGate({
  id: "playwright-css-topology",
  family: "css-home-topology",
  authority: "hard",
  severity: "error",
  population: { in: ["@client", "@tests"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [...ANCHOR_IDS.map((id) => ({ kind: "exact-file", id }) as const), { kind: "product-css" }],
  message: MESSAGE,
  fix: "import the shared packages/client/src/styles/index.ts front door from production and CT; keep playwright/index.css source-only.",
  create: (ctx) => ({
    evaluate: () => {
      const anchors = readyResourceValue(ctx.resources.exactFiles(ANCHOR_IDS));
      const inventory = readyResourceValue(ctx.resources.cssInventory("product"));
      const statementsByFile = new Map(inventory.files.map((file) => [file.path, inventory.statements.filter((statement) => statement.file === file.path)]));
      const report: Report = (file, message) => {
        ctx.report.file(file, { line: 1, column: 1, message });
      };
      reportProductionAnchors(ctx, report);
      reportCtImports(ctx, anchors, report);
      reportProductGraph(ctx, statementsByFile, report);
      reportHarnessExtension(anchors, report);
      reportCtConfig(anchors, report);
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, [CT_BOOT]: 'import "../packages/client/src/styles/globals.css";\n' },
      expect: { count: 1, messageIncludes: "CT must import" },
      why: "an independent CT stylesheet import is the handwritten parallel roster this gate removes — and the row that pins the declared TEXT-arm limit",
    },
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, "tests/client/story.tsx": 'import "../../packages/client/src/styles/globals.css";\nexport const Fixture = 1;\n' },
      expect: { count: 1, messageIncludes: "story/spec modules" },
      why: "a fixture-local product stylesheet import recreates the parallel roster behind a correct bootstrap",
    },
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, [CSS_ENTRY]: "export {};\n" },
      expect: { count: 3, messageIncludes: "production CSS" },
      why: "zero product imports, an unreachable five-home graph and zero derived source roots are three loud instrument failures, never parity",
    },
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, [CT_EXTENSION]: `@source "${HARNESS_SOURCE}";\n@source "../../../../packages/client/src";\n` },
      expect: { count: 1, messageIncludes: "exactly one tests-only @source" },
      why: "a stale product source copied into the harness extension is the reverse parity failure",
    },
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, [CT_EXTENSION]: '@source "../../../../packages/client/src";\n' },
      // The row above satisfies the arm through its CARDINALITY half (two sources); this one isolates the
      // VALUE half — exactly one source, pointed at production instead of tests. Measured UNENFORCED before
      // this row existed (`sources[0] !== HARNESS_SOURCE` → `false` killed nothing).
      expect: { count: 1, messageIncludes: "exactly one tests-only @source" },
      why: "ONE @source aimed at production instead of tests/ compiles the wrong corpus into the CT harness — the value half, which the two-source row cannot reach",
    },
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, [CLIENT_GLOBALS]: `@import "${UI_GLOBALS_SPECIFIER}";\n@import "./missing.css";\n@source "../";\n` },
      // #2231'S PIN. The legacy arm printed `unresolved=none` on this exact input because an unreadable child
      // returned before it could be recorded; the specifier is named in the message now.
      expect: { count: 1, messageIncludes: "unresolved=packages/client/src/styles/globals.css → ./missing.css" },
      why: "an @import that resolves to no sanctioned stylesheet is REPORTED by name, where the legacy arm could only ever print unresolved=none",
    },
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, [MAIN]: 'import "./styles/globals.css";\n' },
      expect: { count: 1, messageIncludes: "production must import only" },
      why: "production reaching a stylesheet past the one ordered front door is the topology this gate exists to close",
    },
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, [MAIN]: 'import { createRoot } from "react-dom/client";\nexport const boot = createRoot;\n' },
      // The row above satisfies the arm through its `.css` half; this one isolates the PRESENCE half — main
      // reaches the front door through no import at all. Measured UNENFORCED before this row existed
      // (deleting `!mainImports.includes("./styles/index.ts")` killed nothing).
      expect: { count: 1, messageIncludes: "production must import only" },
      why: "a production entry that never imports the shared front door has no CSS at all — the presence half of the same arm, which the .css row cannot reach",
    },
    {
      mode: "resource",
      files: {
        ...TOPOLOGY_FIXTURE,
        [CT_CONFIG]: `const marker = "${CLIENT_GLOBALS}";\nconst plugins = [${TAILWIND_PLUGIN}, { name: ${EXTENSION_PLUGIN} }];\n`,
      },
      // The §4.1 pin for the ORDER clause, which the §5b audit measured UNENFORCED (cut p04: `if (false)`
      // killed no row). The plugins are SWAPPED — both present, wrong order, target named — so this row is
      // the only one that dies when the ordering comparison alone is removed.
      expect: { count: 1, messageIncludes: "BEFORE Tailwind compiles it" },
      why: "the extension plugin registered AFTER Tailwind compiles client globals without the harness source root — the ORDER clause, which no legacy row reached",
    },
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, [CT_CONFIG]: `const marker = "${CLIENT_GLOBALS}";\nconst plugins = [${TAILWIND_PLUGIN}];\n` },
      expect: { count: 1, messageIncludes: "must register BOTH" },
      why: "Tailwind with no harness source-extension plugin compiles client globals blind to tests/ — the PRESENCE clause, which no legacy row reached",
    },
    {
      mode: "resource",
      files: {
        ...TOPOLOGY_FIXTURE,
        [CT_CONFIG]: `const marker = "packages/client/src/styles/other.css";\nconst plugins = [{ name: ${EXTENSION_PLUGIN} }, ${TAILWIND_PLUGIN}];\n`,
      },
      // The §4.1 pin for the fence's FOURTH clause — both plugins present and correctly ordered, but the
      // injection TARGET is some other stylesheet. Measured UNENFORCED by the cut before this row existed
      // (`!code.includes(CLIENT_GLOBALS)` → `false` killed nothing), which is the audit's p04 one clause
      // finer.
      expect: { count: 1, messageIncludes: "which it names nowhere" },
      why: "a correctly ordered extension plugin pointed at a stylesheet OTHER than client globals injects the harness source root nowhere",
    },
    {
      mode: "resource",
      files: { ...TOPOLOGY_FIXTURE, [CT_EXTENSION]: `@source "${HARNESS_SOURCE}";\n.harness-only { color: red; }\n` },
      // The §4.1 pin for the RESIDUE clause. The `@source` count and its value are both correct here, so
      // only the residue test can report — and the cut proves it does: deleting `parsed.rules.length > 0`
      // killed nothing before this row existed.
      expect: { count: 1, messageIncludes: "must carry NO rules, blocks or imports" },
      why: "a style rule authored into the harness extension is a second CSS home wearing a source declaration's clothes",
    },
    {
      mode: "resource",
      files: {
        ...TOPOLOGY_FIXTURE,
        [APP_SHELL]: 'import "./app-shell.css";\nexport const AppShell = 1;\n',
        "packages/client/src/features/app-shell/surfaces/app-shell.css": ".x {}\n",
      },
      // EXACTLY ONE finding, and the count is the claim: the surface-local stylesheet is also a seventh
      // product CSS home, but that is the SIBLING policy's verdict under a different owner, and it is NOT in
      // this graph — the walk starts at the front door's roots, which never reach it. A `count: 2` here would
      // mean the graph arm had started reporting sheets nobody imports.
      expect: { count: 1, messageIncludes: "AppShell must not carry" },
      why: "a surface-local stylesheet beside the app shell is the second production door this gate closes, and no legacy row reached it",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...TOPOLOGY_FIXTURE,
        "tests/kit/css-validate/index.test.ts": `export const customCss = "@import 'x.css';";\n`,
        "tests/ui/styles/css-structure.suite.test.ts": 'export const THEME_CSS_PATH = "packages/ui/src/styles/theme.css";\n',
      },
      why: "custom-theme CSS payloads and stylesheet path assertions are data, not ImportDeclarations",
    },
    {
      mode: "resource",
      files: TOPOLOGY_FIXTURE,
      why: "one shared ordered entry reaches all five CSS homes, derives a product source root, and adds only tests for CT",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: topologyWithout(CT_BOOT),
      // The honest successor of the legacy `loadTopologySources` arm, which reported "CSS topology anchor
      // missing" AT THIS GATE'S OWN SOURCE FILE — a path in no resource population, so `ctx.report.file`
      // would now THROW on it. A vanished anchor is "I could not judge", never a verdict about the tree.
      expect: { messageIncludes: "exact-file:ct-boot is missing" },
      why: "a vanished CT boot refuses the whole exact-file fact at the population phase rather than reporting a topology defect",
    },
    {
      mode: "resource",
      files: topologyWithout("packages/ui/src/styles/theme.css"),
      // The legacy `existsSync(MAIN)` early return's successor on the OTHER declaration: a product stylesheet
      // that is gone makes the five-home identity unloadable, which is a refusal and never "the graph is
      // incomplete".
      expect: { messageIncludes: "product-css is missing" },
      why: "a missing product stylesheet refuses the five-home identity instead of being reported as an incomplete graph",
    },
  ],
});
