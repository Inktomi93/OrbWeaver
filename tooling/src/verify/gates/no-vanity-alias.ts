// Policy: no-vanity-alias — one symbol, one name; rename at source or use the original (a needless second
// name is the amnesiac agent's insider-knowledge trap). Sanctioned: a genuine in-module collision (rename-
// import); a rename-EXPORT of a GENERIC name (declared by ≥2 producer modules — barrel disambiguation); an
// @orb/ui / @orb/db-`*Table` / @orb/contracts-`*Wire` rename; a `/contract/` distinct-alias-per-verb home.
// Vendor-package renames are always legal.
// docs/law/Spine-TypeScript-and-Patterns.md.
//
// CANDIDATES: the authored rename syntax comes from `floor/code-facts/rename-bindings.ts`, the reader `pnpm ast aliases`
// lists every rename with; this policy adds the sanctioned-rename rules. Four arms: rename-import, rename-export, a
// top-level `const Y = X` and a bare `type Y = X`; the last two judge only an X the file imports from the workspace or
// declares itself, never an ambient global or a vendor import. FAMILY: singleton. The census hypothesis ("import/export identity → canonical origin fact") does not
// hold: every existing `canonical-origin` family reader resolves a symbol's ORIGIN across module
// boundaries (is this the sealed X, does this re-export land on the same declaration); this policy's three
// arms never resolve an origin at all — the subject IS the AUTHORED alias syntax and a same-file/whole-
// population NAME census, not a resolved identity. No shared `lib/` reader applies.
// POPULATION PORT. Legacy `scanRoot` was `p.startsWith("packages/") && p.includes("/src/")` minus
// a test-file suffix — i.e. EVERY workspace package's `src/`, tests excluded. The final population is
// `@product` plus `@tests`, with no suffix filter: a test file is judged like any other authored module, and
// its pre-existing renames carry baselined waivers.
// THE ROOT MEMBERSHIP IS NOT RE-TYPED HERE. It was, as "the exact seven `packages/<pkg>/src/` roots", beside
// an UNDATED claim of byte-identity — and both rotted the moment a package landed: `packages/inference/src/`
// (`9a6061b487`) and `packages/default-content/src/` joined the tree, the legacy regex would have matched
// both, and the declaration admitted neither, so "byte-identical" described a tree that no longer existed
// (GATE-AUTHORING §7: quote a count only when something derives it at read time). Read the membership off
// `contract/population.ts`'s `PRODUCT_MEMBERSHIP`, which is tsc-exhaustive over the root list.
// WIDENED 2026-09-20 (lane cb-population-truth, #2488): `@packages` → `@product`, which restores the legacy
// regex's coverage of `packages/inference/src/` (+112 files: 3,316 → 3,428). NOT free, and the finding is
// the one worth reading: 4 findings, all in `packages/inference/src/contract/diagnostics.ts`, all the
// SANCTIONED distinct-alias-per-verb shape — a false positive this policy's own `mustPass` fixture path had
// been modelling at the pre-extraction path. Fixed at `isContractVocabHome` (below) rather than waived.
// The 2026-09-21 shipped-package decision admits both showcase and default-content through `@product`.
// Their inclusion is generic classification rather than a policy-local exception.
// LEGACY at (pruned from public history).
//
// THE IDENTIFIER-FREQUENCY CENSUS IS A VISITOR, NOT A DESCENDANT WALK (guide §3: gate modules cannot
// call `getDescendantsOfKind`). Rule (a)'s "is the original name otherwise present in this module" test
// used to walk every Identifier under the SourceFile per import candidate; it is now a single
// `SyntaxKind.Identifier` visitor accumulating a per-file frequency map once, read by every candidate.
//
// §4.6 DIFFERENTIAL (committed at tests/tooling/verify/gates/simple-visitors-1584.suite.test.ts): every legacy
// mustFlag/mustPass example replays byte-identically — same finding count, same reported original-name
// token. No finding or tool-error delta on this arm.
//
// THE ORDINARY DOOR IS REAL across all three arms: the reported position is always the ORIGINAL
// (unaliased) name — the import/export specifier's own bare identifier, or the type alias's own name node
// for rule (c) — never the synthetic `<arm> <name>` compound token the legacy descriptor used. A bare
// identifier is guaranteed authored text at its own offset (offset 0 on the reported node), so it carries
// no paren, no newline and no solidus. Driven (not merely claimed) in the family test's
// `assumes-single-replica` control, which exercises the shared position mechanism every ordinary policy in
// this lane uses.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-vanity-alias` descriptor at (pruned from public history), the parent of the conversion `ef163b8fce`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `(pruned from public history)` cited above
// is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations resolve to this
// source. Over the SAME 7,455 harness candidates at that tree (`git ls-tree` ∩
// `floor/compiler/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 3,387 and final `population` admits 3,387.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `scripts/codemods/__cbbhr_out_rename-roster-participants.ts` (virtual) rejected
// by both.
import type { ExportSpecifier, ImportSpecifier, Node as MorphNode, SourceFile, TypeAliasDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { renameBindingOf } from "../../floor/code-facts/rename-bindings.ts";
import { defineGate } from "../contract/policy.ts";

const DOC = "docs/law/Spine-TypeScript-and-Patterns.md";
const MIN_PRODUCERS = 2;
const DB_SCHEMA_DIR = "packages/db/src/schema/";

/** A workspace-internal specifier — the package cake (`@orb/*`), a contracts subpath (`#…`), or relative
 *  (`.`/`..`). Everything else is a vendor package (renames of which are always legal). */
function isWorkspaceSpecifier(spec: string): boolean {
  return spec.startsWith("@orb/") || spec.startsWith("#") || spec.startsWith(".");
}

function isOrbUiSpecifier(spec: string): boolean {
  return spec === "@orb/ui" || spec.startsWith("@orb/ui/");
}

/** The class-7 db/wire suffix convention: an `@orb/db` (or db-schema-relative) `X as XTable`, or an
 *  `@orb/contracts` `X as XWire` — a systematic disambiguation of the table/wire shape, exempt by exact suffix. */
function isDbWireSuffixRename(spec: string, rel: string, original: string, alias: string): boolean {
  const dbSource = spec.startsWith("@orb/db") || (spec.startsWith(".") && rel.startsWith(DB_SCHEMA_DIR));
  if (dbSource && alias === `${original}Table`) {
    return true;
  }
  return spec.startsWith("@orb/contracts") && alias === `${original}Wire`;
}

/** A file under any `/contract/` segment — the distinct-alias-per-verb doctrine's home, where several type
 *  aliases onto one shared shape is the convention (a verb's signature names its OWN request type).
 *
 *  THE SEGMENT IS THE SUBJECT, NOT A PACKAGE PREFIX, and that is a correction this policy paid for. The
 *  predicate used to read `rel.startsWith("packages/server/src/") && rel.includes("/contract/")`, and its own
 *  `mustPass` fixture models `…/infra/providers/contract/diagnostics.ts`. The inference extraction moved that
 *  exact file to `packages/inference/src/contract/diagnostics.ts`; the doctrine did not move, so the prefix
 *  silently stopped covering the file the proof row is about. Measured 2026-09-20 with `@product` (lane
 *  cb-population-truth, #2488): four findings on that one file, all four the sanctioned shape. The ruling
 *  survives — its INPUT changed. Both homes now carry a `mustPass` row, and rule (c)'s discriminating cut is
 *  unchanged: `packages/contracts/src/connection/index.ts` has no `/contract/` segment and still flags twice.
 *  `contract/` directories live in exactly two packages today (`packages/{server,inference}/src`), so the
 *  segment form admits nothing new on this tree while following the next extraction by construction. */
function isContractVocabHome(rel: string): boolean {
  return rel.includes("/contract/");
}

interface MaybeNamedExportable {
  isExported: () => boolean;
  getName: () => string | undefined;
}

/** The exported names among a set of (possibly-anonymous) exportable declarations. */
function exportedNames(nodes: readonly MaybeNamedExportable[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const name = n.getName();
    if (name !== undefined && n.isExported()) {
      out.push(name);
    }
  }
  return out;
}

/** The names this module DECLARES-and-exports (a "producer" of that name). Re-exports (`export { X } from`)
 *  are NOT declarations, so they don't count — a re-exported name's producer is its one true home. Every
 *  accessor here is a top-level SourceFile lookup, not a descendant walk. */
function exportedDeclarationNames(sf: SourceFile): string[] {
  const names: string[] = [
    ...exportedNames(sf.getFunctions()),
    ...exportedNames(sf.getClasses()),
    ...exportedNames(sf.getTypeAliases()),
    ...exportedNames(sf.getInterfaces()),
    ...exportedNames(sf.getEnums()),
  ];
  for (const vs of sf.getVariableStatements()) {
    if (vs.isExported()) {
      for (const d of vs.getDeclarations()) {
        names.push(d.getName());
      }
    }
  }
  return names;
}

/** Cross-population producer count of every exported declaration name, for rule (b)'s ≥2-producer test. */
function computeProducerCount(files: readonly SourceFile[]): Map<string, number> {
  const producerCount = new Map<string, number>();
  for (const sourceFile of files) {
    for (const name of new Set(exportedDeclarationNames(sourceFile))) {
      producerCount.set(name, (producerCount.get(name) ?? 0) + 1);
    }
  }
  return producerCount;
}

/** The module each name an import binds in this file comes from. */
function importedSpecifiers(sf: SourceFile): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const declaration of sf.getImportDeclarations()) {
    const spec = declaration.getModuleSpecifierValue();
    const names = [
      declaration.getDefaultImport()?.getText(),
      declaration.getNamespaceImport()?.getText(),
      ...declaration.getNamedImports().map((named) => (named.getAliasNode() ?? named.getNameNode()).getText()),
    ];
    for (const name of names) {
      if (name !== undefined) {
        out.set(name, spec);
      }
    }
  }
  return out;
}

/** The value names this module declares at its top level. */
function declaredValueNames(sf: SourceFile): ReadonlySet<string> {
  const names = [
    ...sf.getFunctions().map((n) => n.getName()),
    ...sf.getClasses().map((n) => n.getName()),
    ...sf.getEnums().map((n) => n.getName()),
    ...sf.getVariableDeclarations().map((n) => n.getName()),
  ];
  return new Set(names.filter((name) => name !== undefined));
}

/** The type names this module declares at its top level. */
function declaredTypeNames(sf: SourceFile): ReadonlySet<string> {
  const names = [...sf.getInterfaces(), ...sf.getTypeAliases(), ...sf.getClasses(), ...sf.getEnums()].map((n) => n.getName());
  return new Set(names.filter((name) => name !== undefined));
}

/** Does `name` denote an authored symbol: one this file declares, or one it imports from the workspace? An ambient
 *  global, a vendor import and an `@orb/ui` import are not a second name for something this repo owns. */
function namesAuthoredSymbol(name: string, imports: ReadonlyMap<string, string>, declared: ReadonlySet<string>): boolean {
  const spec = imports.get(name);
  return spec === undefined ? declared.has(name) : isWorkspaceSpecifier(spec) && !isOrbUiSpecifier(spec);
}

/** Rule (c), one file's worth: the bare type aliases that point at an authored identifier, grouped by target. */
function typeAliasGroups(sf: SourceFile, aliases: readonly TypeAliasDeclaration[]): ReadonlyMap<string, readonly MorphNode[]> {
  const imports = importedSpecifiers(sf);
  const declared = declaredTypeNames(sf);
  const byTarget = new Map<string, MorphNode[]>();
  for (const ta of aliases) {
    const targetName = renameBindingOf(ta)?.targetName;
    if (targetName === undefined || !Node.isIdentifier(targetName) || !namesAuthoredSymbol(targetName.getText(), imports, declared)) {
      continue;
    }
    const target = targetName.getText();
    const list = byTarget.get(target) ?? [];
    list.push(ta.getNameNode());
    byTarget.set(target, list);
  }
  return byTarget;
}

const MESSAGE =
  "vanity rename — one symbol, one name; rename at source or use the original. Sanctioned only for a " +
  "genuine in-module collision, a generic name (≥2 producer modules), an @orb/ui / db-`*Table` / " +
  `contracts-\`*Wire\` rename, or a /contract/ distinct-alias-per-verb home. ${DOC}`;
const FIX =
  "use the original name (import/re-export it un-renamed), or rename AT SOURCE. A rename is legal only to resolve a real in-module collision, for a generic ≥2-producer name, off @orb/ui / db-`*Table` / contracts-`*Wire`, or as a /contract/ verb-vocabulary alias. A deliberate exception waives with `@orb-waive no-vanity-alias(<name>): <reason + end condition>` — the reported position is the original (unaliased) name of an import/export specifier, and the alias's own name for a `const` or a type alias, the literal text the report passes explicitly at that node's own offset.";

interface ImportCandidate {
  readonly node: ImportSpecifier;
  readonly rel: string;
  readonly spec: string;
  readonly original: string;
  readonly alias: string;
}

interface ExportCandidate {
  readonly node: ExportSpecifier;
  readonly original: string;
}

type Report = (node: MorphNode, name: string, detail: string) => void;

function reportRenameImports(candidates: readonly ImportCandidate[], freqByFile: ReadonlyMap<string, ReadonlyMap<string, number>>, report: Report): void {
  for (const candidate of candidates) {
    const freq = freqByFile.get(candidate.rel)?.get(candidate.original) ?? 0;
    if (freq > 1 || isDbWireSuffixRename(candidate.spec, candidate.rel, candidate.original, candidate.alias)) {
      continue; // genuine collision, or the sanctioned db/wire suffix convention
    }
    report(
      candidate.node,
      candidate.original,
      `A workspace rename-import whose original "${candidate.original}" is not otherwise present — the \`as\` alias is cosmetic; import the original directly.`,
    );
  }
}

function reportRenameExports(candidates: readonly ExportCandidate[], producerCount: ReadonlyMap<string, number>, report: Report): void {
  for (const candidate of candidates) {
    if ((producerCount.get(candidate.original) ?? 0) >= MIN_PRODUCERS) {
      continue; // generic name (≥2 producers) — barrel disambiguation, legal
    }
    report(
      candidate.node,
      candidate.original,
      `A workspace rename-export of "${candidate.original}", which has ONE producer module — the alias is a synonym; re-export it under its own name.`,
    );
  }
}

function reportTypeAliases(files: readonly SourceFile[], relOf: (sf: SourceFile) => string, report: Report): void {
  for (const sourceFile of files) {
    if (isContractVocabHome(relOf(sourceFile))) {
      continue;
    }
    for (const [target, nameNodes] of typeAliasGroups(sourceFile, sourceFile.getTypeAliases())) {
      const detail =
        nameNodes.length < MIN_PRODUCERS
          ? `A bare type alias of "${target}" — one type, one name; use "${target}" directly.`
          : `Two or more bare type aliases in this file point at the same identifier ("${target}") — one type, one name.`;
      for (const nn of nameNodes) {
        report(nn, nn.getText(), detail);
      }
    }
  }
}

function reportConstRenames(files: readonly SourceFile[], report: Report): void {
  for (const sourceFile of files) {
    const imports = importedSpecifiers(sourceFile);
    const declared = declaredValueNames(sourceFile);
    for (const declaration of sourceFile.getVariableDeclarations()) {
      const rename = renameBindingOf(declaration);
      if (rename?.kind === "const-rename" && namesAuthoredSymbol(rename.original, imports, declared)) {
        report(
          declaration.getNameNode(),
          rename.alias,
          `\`const ${rename.alias} = ${rename.original}\` is a second name for "${rename.original}" — use the original.`,
        );
      }
    }
  }
}

export const gate = defineGate({
  id: "no-vanity-alias",
  family: "no-vanity-alias",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@product", "@tests"] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const freqByFile = new Map<string, Map<string, number>>();
    const importCandidates: ImportCandidate[] = [];
    const exportCandidates: ExportCandidate[] = [];

    const report = (node: MorphNode, name: string, detail: string): void => {
      ctx.report.node(node, { token: name, offset: 0, message: `${MESSAGE} ${detail}`, fix: FIX });
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node, sourceFile) => {
            const rel = ctx.relativePath(sourceFile);
            const freq = freqByFile.get(rel) ?? new Map<string, number>();
            const text = node.getText();
            freq.set(text, (freq.get(text) ?? 0) + 1);
            freqByFile.set(rel, freq);
          },
        },
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile) => {
            const rename = renameBindingOf(node);
            const spec = rename?.moduleSpecifier;
            if (
              rename?.kind !== "rename-import" ||
              !Node.isImportSpecifier(node) ||
              spec === undefined ||
              !isWorkspaceSpecifier(spec) ||
              isOrbUiSpecifier(spec)
            ) {
              return;
            }
            importCandidates.push({ node, rel: ctx.relativePath(sourceFile), spec, original: rename.original, alias: rename.alias });
          },
        },
        {
          kinds: [SyntaxKind.ExportSpecifier],
          visit: (node) => {
            const rename = renameBindingOf(node);
            if (rename?.kind !== "rename-export" || !Node.isExportSpecifier(node)) {
              return;
            }
            const spec = rename.moduleSpecifier;
            if (spec !== undefined && !isWorkspaceSpecifier(spec)) {
              return; // vendor-source rename-export (echarts-setup's OrbChartOption) — always legal
            }
            exportCandidates.push({ node, original: rename.original });
          },
        },
      ],
      evaluate: () => {
        const relOf = (sf: SourceFile): string => ctx.relativePath(sf);
        const producerCount = computeProducerCount(ctx.files);
        reportRenameImports(importCandidates, freqByFile, report);
        reportRenameExports(exportCandidates, producerCount, report);
        reportTypeAliases(ctx.files, relOf, report);
        reportConstRenames(ctx.files, report);
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.ts": 'import { Foo as Bar } from "@orb/kit/x";\nexport const use = Bar();\n' },
      expect: { count: 1, token: "Foo" },
      why: "a workspace rename-import whose original 'Foo' is not otherwise present — a cosmetic alias (rule a)",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/index.ts": 'export { Foo as Bar } from "@orb/kit/x";\n' },
      expect: { count: 1, token: "Foo" },
      why: "a rename-export of a uniquely-homed name (0 producers here) — a synonym, the ChatSource class (rule b)",
    },
    {
      mode: "source",
      files: {
        "packages/contracts/src/connection/index.ts":
          "interface RouteChatAssignment {\n  readonly chatId: string;\n}\nexport type RouteOverlay = RouteChatAssignment;\nexport type RoutableChat = RouteChatAssignment;\n",
      },
      expect: { count: 2, token: "RouteOverlay" },
      why: "two bare type aliases onto one identifier outside a /contract/ home — the RouteOverlay/RoutableChat case (rule c). Two findings, one per alias, each naming its OWN position — a marker must name which alias it forgives",
    },
    {
      mode: "source",
      files: { "tests/client/features/x/x.ct.tsx": 'import { Foo as Bar } from "@orb/kit/x";\nexport const use = Bar();\n' },
      expect: { count: 1, token: "Foo" },
      why: "THE TEST-PATH ARM: a cosmetic workspace rename-import in a `tests/**` file that is not a `.test.ts` is judged like product code (rule a)",
    },
    {
      mode: "source",
      files: { "tests/server/domain/x/x.test.ts": 'import { Foo as Bar } from "@orb/kit/x";\nexport const use = Bar();\n' },
      expect: { count: 1, token: "Foo" },
      why: "a `.test.ts` file is judged too: the suffix filter that once exempted test files is gone, so the same rename flags in a suite",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.ts": 'import { Foo } from "@orb/kit/x";\nexport const Bar = Foo;\n' },
      expect: { count: 1, token: "Bar" },
      why: "A CONST RENAME of a workspace import: the const is a second name for `Foo`, reported at the const's own name",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.ts": "export function foo(): number {\n  return 1;\n}\nexport const bar = foo;\n" },
      expect: { count: 1, token: "bar" },
      why: "A CONST RENAME of a function the same file declares",
    },
    {
      mode: "source",
      files: { "packages/contracts/src/x.ts": "interface Source {\n  readonly a: number;\n}\nexport type Alias = Source;\n" },
      expect: { count: 1, token: "Alias" },
      why: "A SINGLE bare type alias of a type the file declares, outside a /contract/ home: one alias is a second name too",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/waived.ts":
          '// @orb-waive no-vanity-alias(Foo): the proof\'s stand-in reason; ends when this fixture stops flagging.\nimport { Foo as Bar } from "@orb/kit/x";\nexport const use = Bar();\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of mustFlag[0], producing exactly one finding, waived by the one central marker at the position this policy actually reports (the original name `Foo`)",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/x.ts":
          'import { Foo as Bar } from "@orb/kit/x";\nexport function Foo(): number {\n  return 1;\n}\nexport const use = Bar();\n',
      },
      why: "a genuine collision — the original 'Foo' is also declared in-module, so the rename is necessary (rule a exempt)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/forms/editor/bound-fields/color-field.tsx":
          'import { ColorField as UiColorField } from "@orb/ui/color-field";\nexport const use = UiColorField();\n',
      },
      why: "an @orb/ui design-system rename (the sealed client vendor) — sanctioned like the Base-UI seal (rule a exempt)",
    },
    {
      mode: "source",
      files: { "packages/server/src/entry/compose/services.ts": 'import { messages as messagesTable } from "@orb/db";\nexport const t = messagesTable();\n' },
      why: "the db `*Table` suffix convention off @orb/db (exact suffix) — systematic, exempt (rule a class-7)",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/a/verbs/thing.ts": "export function createThing(): number {\n  return 1;\n}\n",
        "packages/server/src/domain/b/verbs/thing.ts": "export function createThing(): number {\n  return 2;\n}\n",
        "packages/server/src/domain/a/index.ts": 'export { createThing as createThingA } from "./verbs/thing";\n',
      },
      why: "a barrel rename of a GENERIC name (createThing declared by ≥2 producer modules) — disambiguation, legal (rule b exempt)",
    },
    {
      mode: "source",
      files: { "packages/ui/src/charts/chart/echarts-setup.ts": 'export type { EChartsOption as OrbChartOption } from "echarts";\n' },
      why: "a vendor-source rename-export (echarts-setup's OrbChartOption) — vendor renames are always legal (rule b exempt)",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/infra/providers/contract/diagnostics.ts":
          "interface DiagnosticRequestCommon {\n  readonly id: string;\n}\nexport type ProbeRequest = DiagnosticRequestCommon;\nexport type AccountCreditsRequest = DiagnosticRequestCommon;\n",
      },
      why: "distinct-alias-per-verb onto one shape in an infra /contract/ vocab home — contract doctrine, scoped out of rule c (class-8)",
    },
    {
      mode: "source",
      files: {
        "packages/inference/src/contract/diagnostics.ts":
          "interface DiagnosticRequestCommon {\n  readonly id: string;\n}\nexport type ProbeRequest = DiagnosticRequestCommon;\nexport type AccountCreditsRequest = DiagnosticRequestCommon;\n",
      },
      why: "THE SAME FILE AT ITS LIVE PATH, and the row that dies if `isContractVocabHome` goes back to a `packages/server/src/` prefix: the inference extraction moved this vocab home BELOW server, so the prefix form flagged all four of its real aliases (measured under `@product`, 2026-09-20) while the sibling row above stayed green — a fixture path is not a doctrine",
    },
    {
      mode: "source",
      files: { "packages/contracts/src/x.ts": "export type VariablesResult = ChatVariables;\n" },
      why: "a bare type alias of a name this file neither declares nor imports is ambient — no authored symbol gets a second name",
    },
    {
      mode: "source",
      files: { "tests/client/features/x/x.ct.tsx": 'import { Foo } from "@orb/kit/x";\nexport const use = Foo();\n' },
      why: "the pass control of the test-path arm: the un-renamed import under `tests/**` is clean, so the arm flags the alias and not the directory",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.ts": 'import { z } from "zod";\nexport const schemaBuilder = z;\n' },
      why: "a const alias of a vendor import renames nothing this repo owns, the const twin of the always-legal vendor import rename",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.ts": "export const nothing = undefined;\n" },
      why: "an initializer the file neither imports nor declares is an ambient global, not an authored symbol",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/x.ts":
          "declare const holder: { readonly a: number };\nexport function foo(): number {\n  return 1;\n}\nexport let mutable = foo;\nexport const { a } = holder;\nexport const called = foo();\n",
      },
      why: "a `let`, a destructuring pattern and a call initializer each bind a value, not a second name for one identifier",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.ts": 'import type { Row } from "drizzle-orm";\nexport type Mine = Row;\n' },
      why: "a type alias of a vendor import renames nothing this repo owns",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/contract/verbs.ts": "interface Common {\n  readonly a: number;\n}\nexport type Probe = Common;\n" },
      why: "one distinct alias per verb in a /contract/ home stays legal whether the home holds one alias or several",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/waived.ts":
          'import { Foo } from "@orb/kit/x";\n// @orb-waive no-vanity-alias(Bar): the proof\'s stand-in reason; ends when this fixture stops flagging.\nexport const Bar = Foo;\n',
      },
      why: "THE IDENTITY ARM for the const arm: the twin of the const mustFlag, waived by the one central marker at the const's own name",
    },
  ],
});
