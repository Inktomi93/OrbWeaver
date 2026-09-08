// Gate: no-vanity-alias — one symbol, one name; rename at source or use the original (a needless second
// name is the amnesiac agent's insider-knowledge trap). Sanctioned: a genuine in-module collision (rename-
// import); a rename-EXPORT of a GENERIC name (declared by ≥2 producer modules — barrel disambiguation); an
// @orb/ui / @orb/db-`*Table` / @orb/contracts-`*Wire` rename; a `/contract/` distinct-alias-per-verb home.
// Vendor-package renames are always legal. All three rules are NODE-anchored and carry their arm+name as
// the finding's token, so `// @orb-gate-ignore no-vanity-alias(rename-import Foo): <reason>` works AND
// names its position (§4.3a — one `import { A as B, C as D }` line carries two guarded things).
// core/Spine-TypeScript-and-Patterns.md.
import type { ImportSpecifier, Node, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";

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

/** Only prod `packages/<pkg>/src/**` — tests/** and scripts/** are out of scope (a rename in a test is
 *  fine; the gate corpus's own example strings are not real declarations). */
function inScope(p: string): boolean {
  if (!(p.startsWith("packages/") && p.includes("/src/"))) {
    return false;
  }
  return !TEST_FILE.test(p);
}

function relOf(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** The three ARMS' token prefixes. The token is `<arm> <original name>`: the arm says WHICH rule bit, the
 *  name is the position an `@orb-gate-ignore` must name (§4.3a). Until 2026-08-08 this helper reported
 *  through the explicit-`Finding` overload with a per-finding message — which bypasses `hasGateIgnore`
 *  (GATE-AUTHORING §1), so every marker on all three rules was inert AND the author got the hostile
 *  double-red (the gate, plus `gate-ignore-inventory` calling the correct marker stale). The per-rule prose
 *  moved onto the group `message`, which is where the harness homes a reason. */
const ARM = { renameImport: "rename-import", renameExport: "rename-export", doubleAlias: "double-alias" } as const;

function reportAt(ctx: GateRunCtx, node: Node, token: string): void {
  ctx.report(node, { token, offset: 0 });
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
 *  are NOT declarations, so they don't count — a re-exported name's producer is its one true home. */
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

/** The class-7 db/wire suffix convention: an `@orb/db` (or db-schema-relative) `X as XTable`, or an
 *  `@orb/contracts` `X as XWire` — a systematic disambiguation of the table/wire shape, exempt by exact suffix. */
function isDbWireSuffixRename(spec: string, rel: string, original: string, alias: string): boolean {
  const dbSource = spec.startsWith("@orb/db") || (spec.startsWith(".") && rel.startsWith(DB_SCHEMA_DIR));
  if (dbSource && alias === `${original}Table`) {
    return true;
  }
  return spec.startsWith("@orb/contracts") && alias === `${original}Wire`;
}

/** Frequency of every identifier text in the file — the "otherwise present in the module" (collision) test. */
function identifierFreq(sf: SourceFile): Map<string, number> {
  const freq = new Map<string, number>();
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const t = id.getText();
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return freq;
}

interface ImportScan {
  readonly spec: string;
  readonly rel: string;
  readonly freq: ReadonlyMap<string, number>;
}

/** One named rename-import specifier: flag it unless it's a genuine collision or the db/wire suffix convention. */
function checkRenameImportSpecifier(named: ImportSpecifier, scan: ImportScan, ctx: GateRunCtx): void {
  const aliasNode = named.getAliasNode();
  if (aliasNode === undefined) {
    return;
  }
  const original = named.getName();
  const alias = aliasNode.getText();
  if ((scan.freq.get(original) ?? 0) > 1 || isDbWireSuffixRename(scan.spec, scan.rel, original, alias)) {
    return; // genuine collision, or the sanctioned db/wire suffix convention
  }
  reportAt(ctx, named, `${ARM.renameImport} ${original}`);
}

/** Rule (a): a workspace rename-IMPORT whose original name is not otherwise present in the module — the
 *  `as` alias is cosmetic. Exempt: `@orb/ui`, the db/wire suffix convention, and genuine collisions. */
function checkRenameImports(sf: SourceFile, ctx: GateRunCtx, rel: string): void {
  const freq = identifierFreq(sf);
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (!isWorkspaceSpecifier(spec) || isOrbUiSpecifier(spec)) {
      continue;
    }
    for (const named of imp.getNamedImports()) {
      checkRenameImportSpecifier(named, { spec, rel, freq }, ctx);
    }
  }
}

/** Rule (b): a workspace rename-EXPORT of a UNIQUELY-homed symbol (the ChatSource class) gives it a second
 *  public name. Exempt: a vendor-source re-export, and a GENERIC name declared by ≥2 producer modules
 *  (barrel disambiguation — verb barrels, domain barrels, rewording alike). */
function checkRenameExports(sf: SourceFile, ctx: GateRunCtx, producerCount: ReadonlyMap<string, number>): void {
  for (const exp of sf.getExportDeclarations()) {
    const spec = exp.getModuleSpecifierValue();
    if (spec !== undefined && !isWorkspaceSpecifier(spec)) {
      continue; // vendor-source rename-export (echarts-setup's OrbChartOption) — always legal
    }
    for (const named of exp.getNamedExports()) {
      const aliasNode = named.getAliasNode();
      if (aliasNode === undefined) {
        continue;
      }
      const original = named.getName();
      if ((producerCount.get(original) ?? 0) >= MIN_PRODUCERS) {
        continue; // generic name (≥2 producers) — barrel disambiguation, legal
      }
      reportAt(ctx, named, `${ARM.renameExport} ${original}`);
    }
  }
}

/** A file under any `/contract/` segment in `packages/server/src` — the distinct-alias-per-verb doctrine's
 *  home (domain + infra contract dirs), where several type aliases onto one shared shape is the convention. */
function isContractVocabHome(rel: string): boolean {
  return rel.startsWith("packages/server/src/") && rel.includes("/contract/");
}

/** Rule (c): two or more BARE type aliases (`type A = T`) in one file pointing at the SAME identifier —
 *  the double-alias smell (RouteOverlay/RoutableChat). A single bare alias stays legal (verb vocabulary). */
function checkDoubleTypeAliases(sf: SourceFile, ctx: GateRunCtx, rel: string): void {
  if (isContractVocabHome(rel)) {
    return;
  }
  const byTarget = new Map<string, Node[]>();
  for (const ta of sf.getTypeAliases()) {
    const tn = ta.getTypeNode();
    if (tn === undefined || !TsNode.isTypeReference(tn) || tn.getTypeArguments().length > 0) {
      continue;
    }
    const name = tn.getTypeName();
    if (!TsNode.isIdentifier(name)) {
      continue;
    }
    const target = name.getText();
    const list = byTarget.get(target);
    if (list === undefined) {
      byTarget.set(target, [ta.getNameNode()]);
    } else {
      list.push(ta.getNameNode());
    }
  }
  for (const nameNodes of byTarget.values()) {
    if (nameNodes.length < MIN_PRODUCERS) {
      continue;
    }
    for (const nn of nameNodes) {
      reportAt(ctx, nn, `${ARM.doubleAlias} ${nn.getText()}`);
    }
  }
}

export const gate: GateDescriptor = {
  name: "no-vanity-alias",
  docRow: "core/Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // rule (b)'s generic-name test counts producer modules across the tree
  // THE ONE REASON, carrying all three arms by token (their per-finding messages folded in here when they
  // stopped riding the Finding overload). Each token is `<arm> <name>`.
  message:
    "vanity rename — one symbol, one name; rename at source or use the original. A `rename-import <name>` " +
    "token: the original is not otherwise used in this module, so the `as` alias is cosmetic — import the " +
    "original directly. A `rename-export <name>` token: the original has ONE producer module, so the alias " +
    "is a synonym (the ChatSource class) — re-export it under its own name. A `double-alias <name>` token: " +
    "two or more bare type aliases in one file point at the SAME identifier (RouteOverlay/RoutableChat) — " +
    "one type, one name. Sanctioned only for a genuine in-module collision, a generic name (≥2 producer " +
    `modules), an @orb/ui / db-\`*Table\` / contracts-\`*Wire\` rename, or a /contract/ distinct-alias-per-verb home. ${DOC}`,
  fix: "use the original name (import/re-export it un-renamed), or rename AT SOURCE. A rename is legal only to resolve a real in-module collision, for a generic ≥2-producer name, off @orb/ui / db-`*Table` / contracts-`*Wire`, or as a /contract/ verb-vocabulary alias.",
  scanRoot: inScope,
  run: (ctx) => {
    const producerCount = new Map<string, number>();
    const scoped: { readonly sf: SourceFile; readonly rel: string }[] = [];
    for (const sf of ctx.files) {
      const rel = relOf(ctx.root, sf.getFilePath());
      if (!inScope(rel)) {
        continue;
      }
      scoped.push({ sf, rel });
      for (const name of new Set(exportedDeclarationNames(sf))) {
        producerCount.set(name, (producerCount.get(name) ?? 0) + 1);
      }
    }
    for (const { sf, rel } of scoped) {
      checkRenameImports(sf, ctx, rel);
      checkRenameExports(sf, ctx, producerCount);
      checkDoubleTypeAliases(sf, ctx, rel);
    }
  },
  mustFlag: [
    {
      files: 'import { Foo as Bar } from "@orb/kit/x";\nexport const use = Bar;\n',
      at: "packages/server/src/domain/x/x.ts",
      expect: { count: 1, token: "rename-import Foo" },
      why: "a workspace rename-import whose original 'Foo' is not otherwise present — a cosmetic alias (rule a)",
    },
    {
      files: 'export { Foo as Bar } from "@orb/kit/x";\n',
      at: "packages/server/src/domain/x/index.ts",
      expect: { count: 1, token: "rename-export Foo" },
      why: "a rename-export of a uniquely-homed name (0 producers here) — a synonym, the ChatSource class (rule b)",
    },
    {
      files: "export type RouteOverlay = RouteChatAssignment;\nexport type RoutableChat = RouteChatAssignment;\n",
      at: "packages/contracts/src/connection/index.ts",
      expect: { count: 2, token: "double-alias RouteOverlay" },
      why: "two bare type aliases onto one identifier outside a /contract/ home — the RouteOverlay/RoutableChat case (rule c). Two findings, one per alias, each naming its OWN position — a §4.3a marker must name which alias it forgives",
    },
  ],
  mustPass: [
    {
      files: 'import { Foo as Bar } from "@orb/kit/x";\nexport function Foo(): number {\n  return 1;\n}\nexport const use = Bar;\n',
      at: "packages/server/src/domain/x/x.ts",
      why: "a genuine collision — the original 'Foo' is also declared in-module, so the rename is necessary (rule a exempt)",
    },
    {
      files: 'import { ColorField as UiColorField } from "@orb/ui/color-field";\nexport const use = UiColorField;\n',
      at: "packages/client/src/forms/editor/bound-fields/color-field.tsx",
      why: "an @orb/ui design-system rename (the sealed client vendor) — sanctioned like the Base-UI seal (rule a exempt)",
    },
    {
      files: 'import { messages as messagesTable } from "@orb/db";\nexport const t = messagesTable;\n',
      at: "packages/server/src/entry/compose/services.ts",
      why: "the db `*Table` suffix convention off @orb/db (exact suffix) — systematic, exempt (rule a class-7)",
    },
    {
      files: {
        "packages/server/src/domain/a/verbs/thing.ts": "export function createThing(): number {\n  return 1;\n}\n",
        "packages/server/src/domain/b/verbs/thing.ts": "export function createThing(): number {\n  return 2;\n}\n",
        "packages/server/src/domain/a/index.ts": 'export { createThing as createThingA } from "./verbs/thing";\n',
      },
      why: "a barrel rename of a GENERIC name (createThing declared by ≥2 producer modules) — disambiguation, legal (rule b exempt)",
    },
    {
      files: 'export type { EChartsOption as OrbChartOption } from "echarts";\n',
      at: "packages/ui/src/charts/chart/echarts-setup.ts",
      why: "a vendor-source rename-export (echarts-setup's OrbChartOption) — vendor renames are always legal (rule b exempt)",
    },
    {
      files: "export type ProbeRequest = DiagnosticRequestCommon;\nexport type AccountCreditsRequest = DiagnosticRequestCommon;\n",
      at: "packages/server/src/infra/providers/contract/diagnostics.ts",
      why: "distinct-alias-per-verb onto one shape in an infra /contract/ vocab home — contract doctrine, scoped out of rule c (class-8)",
    },
    {
      files: "export type VariablesResult = ChatVariables;\n",
      at: "packages/contracts/src/x.ts",
      why: "a single bare type alias — the verb-vocabulary doctrine keeps one-off aliases legal (rule c needs 2+)",
    },
  ],
};
