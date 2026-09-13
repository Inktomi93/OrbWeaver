// Policy: no-vanity-alias — one symbol, one name; rename at source or use the original (a needless second
// name is the amnesiac agent's insider-knowledge trap). Sanctioned: a genuine in-module collision (rename-
// import); a rename-EXPORT of a GENERIC name (declared by ≥2 producer modules — barrel disambiguation); an
// @orb/ui / @orb/db-`*Table` / @orb/contracts-`*Wire` rename; a `/contract/` distinct-alias-per-verb home.
// Vendor-package renames are always legal.
// core/Spine-TypeScript-and-Patterns.md.
//
// FAMILY: singleton. The census hypothesis ("import/export identity → canonical origin fact") does not
// hold: every existing `canonical-origin` family reader resolves a symbol's ORIGIN across module
// boundaries (is this the sealed X, does this re-export land on the same declaration); this policy's three
// arms never resolve an origin at all — the subject IS the AUTHORED alias syntax and a same-file/whole-
// population NAME census, not a resolved identity. No shared `lib/` reader applies.
// POPULATION PORT: byte-identical. Legacy `scanRoot` was `p.startsWith("packages/") && p.includes("/src/")`
// minus `TEST_FILE` — i.e. every workspace package's `src/`, tests excluded. The final population is the
// exact seven `packages/<pkg>/src/` roots (`["@packages", "@showcase"]`; `@packages` covers client/ui/
// server/db/contracts/kit, `@showcase` is the seventh — §12.4's showcase root is deliberately OUTSIDE
// `@packages`); the `TEST_FILE` suffix exclusion is not expressible in the population algebra (a content
// suffix, not a path prefix) and stays a code-level filter, ported verbatim.
// LEGACY at 86ce80b6c.
//
// THE IDENTIFIER-FREQUENCY CENSUS IS A VISITOR, NOT A DESCENDANT WALK (guide §3: gate modules cannot
// call `getDescendantsOfKind`). Rule (a)'s "is the original name otherwise present in this module" test
// used to walk every Identifier under the SourceFile per import candidate; it is now a single
// `SyntaxKind.Identifier` visitor accumulating a per-file frequency map once, read by every candidate.
//
// §4.6 DIFFERENTIAL (committed at tests/tooling/verify/gates/simple-visitors-1584.test.ts): every legacy
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
import type { ExportSpecifier, ImportSpecifier, Node as MorphNode, SourceFile, TypeAliasDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const DOC = "core/Spine-TypeScript-and-Patterns.md";
const MIN_PRODUCERS = 2;
const DB_SCHEMA_DIR = "packages/db/src/schema/";
const TEST_FILE = /\.(?:test|test-d|spec)\.[cm]?tsx?$/;

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

/** A file under any `/contract/` segment in `packages/server/src` — the distinct-alias-per-verb doctrine's
 *  home (domain + infra contract dirs), where several type aliases onto one shared shape is the convention. */
function isContractVocabHome(rel: string): boolean {
  return rel.startsWith("packages/server/src/") && rel.includes("/contract/");
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

function inScope(rel: string): boolean {
  return !TEST_FILE.test(rel);
}

/** Cross-population producer count of every exported declaration name, for rule (b)'s ≥2-producer test. */
function computeProducerCount(files: readonly SourceFile[], relOf: (sf: SourceFile) => string): Map<string, number> {
  const producerCount = new Map<string, number>();
  for (const sourceFile of files) {
    if (!inScope(relOf(sourceFile))) {
      continue;
    }
    for (const name of new Set(exportedDeclarationNames(sourceFile))) {
      producerCount.set(name, (producerCount.get(name) ?? 0) + 1);
    }
  }
  return producerCount;
}

/** Rule (c), one file's worth: two or more bare type aliases pointing at the same identifier. */
function doubleAliasGroups(rel: string, aliases: readonly TypeAliasDeclaration[]): ReadonlyMap<string, readonly MorphNode[]> {
  if (isContractVocabHome(rel)) {
    return new Map();
  }
  const byTarget = new Map<string, MorphNode[]>();
  for (const ta of aliases) {
    const tn = ta.getTypeNode();
    if (tn === undefined || !Node.isTypeReference(tn) || tn.getTypeArguments().length > 0) {
      continue;
    }
    const targetName = tn.getTypeName();
    if (!Node.isIdentifier(targetName)) {
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
  "use the original name (import/re-export it un-renamed), or rename AT SOURCE. A rename is legal only to resolve a real in-module collision, for a generic ≥2-producer name, off @orb/ui / db-`*Table` / contracts-`*Wire`, or as a /contract/ verb-vocabulary alias. A deliberate exception waives with `@orb-waive no-vanity-alias(<name>): <reason + end condition>` — the reported position is always the original (unaliased) name, the literal text the report passes explicitly at the specifier's/type-alias-name's own offset.";

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

function reportDoubleAliases(files: readonly SourceFile[], relOf: (sf: SourceFile) => string, report: Report): void {
  for (const sourceFile of files) {
    const rel = relOf(sourceFile);
    if (!inScope(rel)) {
      continue;
    }
    for (const [target, nameNodes] of doubleAliasGroups(rel, sourceFile.getTypeAliases())) {
      if (nameNodes.length < MIN_PRODUCERS) {
        continue;
      }
      for (const nn of nameNodes) {
        report(nn, nn.getText(), `Two or more bare type aliases in this file point at the same identifier ("${target}") — one type, one name.`);
      }
    }
  }
}

export const gate = defineGate({
  id: "no-vanity-alias",
  family: "no-vanity-alias",
  authority: "ordinary",
  severity: "error",
  population: ["@packages", "@showcase"],
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
            if (!inScope(rel)) {
              return;
            }
            const freq = freqByFile.get(rel) ?? new Map<string, number>();
            const text = node.getText();
            freq.set(text, (freq.get(text) ?? 0) + 1);
            freqByFile.set(rel, freq);
          },
        },
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile) => {
            if (!Node.isImportSpecifier(node)) {
              return;
            }
            const rel = ctx.relativePath(sourceFile);
            if (!inScope(rel)) {
              return;
            }
            const aliasNode = node.getAliasNode();
            const decl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
            if (aliasNode === undefined || decl === undefined) {
              return;
            }
            const spec = decl.getModuleSpecifierValue();
            if (!isWorkspaceSpecifier(spec) || isOrbUiSpecifier(spec)) {
              return;
            }
            importCandidates.push({ node, rel, spec, original: node.getName(), alias: aliasNode.getText() });
          },
        },
        {
          kinds: [SyntaxKind.ExportSpecifier],
          visit: (node) => {
            if (!Node.isExportSpecifier(node)) {
              return;
            }
            const aliasNode = node.getAliasNode();
            const decl = node.getFirstAncestorByKind(SyntaxKind.ExportDeclaration);
            if (aliasNode === undefined || decl === undefined) {
              return;
            }
            const spec = decl.getModuleSpecifierValue();
            if (spec !== undefined && !isWorkspaceSpecifier(spec)) {
              return; // vendor-source rename-export (echarts-setup's OrbChartOption) — always legal
            }
            exportCandidates.push({ node, original: node.getName() });
          },
        },
      ],
      evaluate: () => {
        const relOf = (sf: SourceFile): string => ctx.relativePath(sf);
        const producerCount = computeProducerCount(ctx.files, relOf);
        reportRenameImports(importCandidates, freqByFile, report);
        reportRenameExports(exportCandidates, producerCount, report);
        reportDoubleAliases(ctx.files, relOf, report);
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.ts": 'import { Foo as Bar } from "@orb/kit/x";\nexport const use = Bar;\n' },
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
        "packages/contracts/src/connection/index.ts": "export type RouteOverlay = RouteChatAssignment;\nexport type RoutableChat = RouteChatAssignment;\n",
      },
      expect: { count: 2, token: "RouteOverlay" },
      why: "two bare type aliases onto one identifier outside a /contract/ home — the RouteOverlay/RoutableChat case (rule c). Two findings, one per alias, each naming its OWN position — a marker must name which alias it forgives",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/waived.ts":
          '// @orb-waive no-vanity-alias(Foo): the proof\'s stand-in reason; ends when this fixture stops flagging.\nimport { Foo as Bar } from "@orb/kit/x";\nexport const use = Bar;\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of mustFlag[0], producing exactly one finding, waived by the one central marker at the position this policy actually reports (the original name `Foo`)",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/x.ts":
          'import { Foo as Bar } from "@orb/kit/x";\nexport function Foo(): number {\n  return 1;\n}\nexport const use = Bar;\n',
      },
      why: "a genuine collision — the original 'Foo' is also declared in-module, so the rename is necessary (rule a exempt)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/forms/editor/bound-fields/color-field.tsx":
          'import { ColorField as UiColorField } from "@orb/ui/color-field";\nexport const use = UiColorField;\n',
      },
      why: "an @orb/ui design-system rename (the sealed client vendor) — sanctioned like the Base-UI seal (rule a exempt)",
    },
    {
      mode: "source",
      files: { "packages/server/src/entry/compose/services.ts": 'import { messages as messagesTable } from "@orb/db";\nexport const t = messagesTable;\n' },
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
          "export type ProbeRequest = DiagnosticRequestCommon;\nexport type AccountCreditsRequest = DiagnosticRequestCommon;\n",
      },
      why: "distinct-alias-per-verb onto one shape in an infra /contract/ vocab home — contract doctrine, scoped out of rule c (class-8)",
    },
    {
      mode: "source",
      files: { "packages/contracts/src/x.ts": "export type VariablesResult = ChatVariables;\n" },
      why: "a single bare type alias — the verb-vocabulary doctrine keeps one-off aliases legal (rule c needs 2+)",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.test.ts": 'import { Foo as Bar } from "@orb/kit/x";\nexport const use = Bar;\n' },
      why: "THE POPULATION FENCE, pinned: a `.test.ts` file inside `@server` is admitted to the population but excluded by the `TEST_FILE`-suffix content filter — the same rename that would flag in a prod file is invisible here. Deleting the `inScope` filter leaves every other row green; this is the row that dies without it",
    },
  ],
});
