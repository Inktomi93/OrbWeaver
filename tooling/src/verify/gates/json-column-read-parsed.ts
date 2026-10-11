// Gate: json-column-read-parsed — a TYPED JSON column (`mode:"json"` + `$type<T>`) whose T has a zod twin is
// parsed on read in `persistence/**`. The `$type` is a cast: it states what the writer meant, not what the row
// holds after a schema change, a hand migration or an import. A read `<row>.<column>` must reach the twin
// through a parse call (`schema.parse`/`safeParse`, a `parse*` helper, `parseOutcome`) before it is used.
// TWIN: T's declaration is `z.infer`/`z.output<typeof X>` (twin X), or T's module exports `<lowerFirst(T)>Schema`.
// A read is a member access named like the column whose resolved type is T. DECLARED LIMITS (mustPass rows): an
// open column is `open-json-column-key-parity`'s subject; a write builder (`.values`/`.set`) is not a read.
// FAMILY `open-json-column-key-parity`: the open-json-column family, reading the shared `drizzleSchemaFact`.
import type { Node, PropertyAccessExpression, SourceFile, Type } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../floor/code-facts/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { isBoundary } from "../lib/ordinary-waiver-carrier.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const PARSE_CALLEE_RE = /parse/iu;
const ZOD_DERIVED_RE = /^z\.(?:infer|output)<typeof (?<schema>\w+)>$/u;
const WRITE_BUILDERS: ReadonlySet<string> = new Set(["values", "set", "onConflictDoUpdate"]);

const MESSAGE =
  "typed JSON column read by cast — the `$type<T>` is the only check, so a row written before a schema change, " +
  "by a hand migration or by an import reaches the domain unvalidated. Parse it on read through its zod twin " +
  "(`schema.parse`/`safeParse`, a `parse*` helper or `parseOutcome`), degrading to a reported fallback where a throw is wrong. " +
  "See docs/law/Spine-TypeScript-and-Patterns.md §7.4.";
const FIX =
  "pass the column value through its zod twin at the persistence read. A baselined site is waived with " +
  "`@orb-waive json-column-read-parsed(<position>): <reason naming its burn-down item>` on the line above, where " +
  "<position> is the column name as read (`manifest` in `row.manifest`).";

const lowerFirst = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);

/** The named type a column holds: T, or the element of `T[]`/`readonly T[]`. */
function namedType(type: Type): Type {
  const bare = type.getNonNullableType();
  return bare.getArrayElementType() ?? bare;
}

/** The `$type<T>` argument with array and `readonly` wrappers removed. */
function namedTypeNode(node: Node): Node {
  if (N.isTypeOperatorTypeNode(node)) {
    return namedTypeNode(node.getTypeNode());
  }
  return N.isArrayTypeNode(node) ? namedTypeNode(node.getElementTypeNode()) : node;
}

/** The zod twin's name for one `$type<T>` argument, or undefined when T has none. */
function twinOf(typeNode: Node): string | undefined {
  const named = namedTypeNode(typeNode);
  const origin = N.isTypeReference(named) ? resolveModuleMemberOrigin(named.getTypeName()) : undefined;
  if (origin?.kind !== "resolved") {
    return;
  }
  const { declaration, exportedName } = origin.value;
  if (N.isTypeAliasDeclaration(declaration)) {
    const derived = ZOD_DERIVED_RE.exec(declaration.getTypeNode()?.getText() ?? "")?.groups?.["schema"];
    if (derived !== undefined) {
      return derived;
    }
  }
  const expected = `${lowerFirst(exportedName)}Schema`;
  return declaration.getSourceFile().getExportedDeclarations().has(expected) ? expected : undefined;
}

/** Column property name to (T's compiler type to twin name), for every typed JSON column whose T has a twin. */
function typedColumns(model: SchemaModel): Map<string, Map<unknown, string>> {
  const typed = new Map<string, Map<unknown, string>>();
  for (const column of model.tables.flatMap((table) => table.columns)) {
    const override = column.typeOverride;
    const twin = column.json === null || column.json.shape.kind === "open" || override === null ? undefined : twinOf(override.node);
    if (twin !== undefined && override !== null) {
      const byType = typed.get(column.identity.propertyName) ?? new Map<unknown, string>();
      byType.set(namedType(override.type).compilerType, twin);
      typed.set(column.identity.propertyName, byType);
    }
  }
  return typed;
}

/** Climb wrappers that keep the value itself: parentheses, `!`, and the left side of `??`/`||`. */
function valueSite(access: Node): Node {
  let node = access;
  for (let parent = node.getParent(); parent !== undefined; parent = node.getParent()) {
    const keepsValue =
      N.isParenthesizedExpression(parent) ||
      N.isNonNullExpression(parent) ||
      (N.isBinaryExpression(parent) && parent.getLeft() === node && ["??", "||"].includes(parent.getOperatorToken().getText()));
    if (!keepsValue) {
      return node;
    }
    node = parent;
  }
  return node;
}

function calleeName(call: Node): string {
  if (!N.isCallExpression(call)) {
    return "";
  }
  const callee = call.getExpression();
  return N.isPropertyAccessExpression(callee) ? callee.getName() : callee.getText();
}

function isParsedRead(access: Node): boolean {
  const site = valueSite(access);
  const parent = site.getParent();
  return parent !== undefined && N.isCallExpression(parent) && parent.getArguments().includes(site as never) && PARSE_CALLEE_RE.test(calleeName(parent));
}

function isWrite(access: PropertyAccessExpression): boolean {
  const parent = access.getParent();
  if (N.isBinaryExpression(parent) && parent.getLeft() === access && parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
    return true;
  }
  return access.getFirstAncestor((ancestor) => N.isCallExpression(ancestor) && WRITE_BUILDERS.has(calleeName(ancestor))) !== undefined;
}

interface UnparsedRead {
  readonly access: PropertyAccessExpression;
  readonly twin: string;
  readonly region: Node;
}

/** The region a waiver marker binds for this read: its nearest carrier boundary. */
function waiverRegion(access: Node): Node {
  return access.getFirstAncestor((ancestor) => isBoundary(ancestor.compilerNode)) ?? access.getSourceFile();
}

/** One finding per column per region: a read inside a region that already holds a read of the same column is the
 *  same read site, and reporting both would make the region's one marker over-broad. Outer regions win. */
function outermostPerRegion(reads: readonly UnparsedRead[]): readonly UnparsedRead[] {
  const outerFirst = reads.toSorted((left, right) => left.region.getStart() - right.region.getStart() || right.region.getEnd() - left.region.getEnd());
  const kept: UnparsedRead[] = [];
  for (const read of outerFirst) {
    const covered = kept.some(
      (other) =>
        other.access.getName() === read.access.getName() &&
        other.region.getSourceFile() === read.region.getSourceFile() &&
        other.region.getStart() <= read.region.getStart() &&
        read.region.getEnd() <= other.region.getEnd(),
    );
    if (!covered) {
      kept.push(read);
    }
  }
  return kept;
}

export const gate = defineGate({
  id: "json-column-read-parsed",
  family: "open-json-column-key-parity",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@server"], under: ["**/persistence/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const accesses: { readonly access: PropertyAccessExpression; readonly sourceFile: SourceFile }[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAccessExpression],
          visit: (node, sourceFile): void => {
            if (N.isPropertyAccessExpression(node)) {
              accesses.push({ access: node, sourceFile });
            }
          },
        },
      ],
      evaluate: () => {
        const schema = ctx.fact(drizzleSchemaFact).schema();
        recordReadySchemaFact(ctx, schema);
        const typed = typedColumns(schema.value);
        ctx.receipt({ kind: "population", source: "typed-json-columns-with-twin", members: [...typed.values()].reduce((n, m) => n + m.size, 0) });
        const reads = accesses.flatMap(({ access }) => {
          const twin = typed.get(access.getName())?.get(namedType(access.getType()).compilerType);
          return twin === undefined || isWrite(access) || isParsedRead(access) ? [] : [{ access, twin, region: waiverRegion(access) }];
        });
        for (const { access, twin } of outermostPerRegion(reads)) {
          const name = access.getNameNode();
          ctx.report.node(name, { token: name.getText(), offset: 0, message: `Twin: \`${twin}\`. ${MESSAGE}` });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: proofFiles("export const capabilities = (row: Row): string => row.manifest.name;\n"),
      expect: { count: 1, token: "manifest", messageIncludes: "Twin: `pluginManifestSchema`" },
      why: "the founding read: `plugins.manifest` feeds the grant decision straight off the `$type` cast",
    },
    {
      mode: "types",
      files: proofFiles("export const first = (row: Row): string | undefined => row.grantedCapabilities[0];\n"),
      expect: { count: 1, token: "grantedCapabilities", messageIncludes: "Twin: `pluginCapabilitySchema`" },
      why: "an ARRAY column finds its twin through the element type (`PluginCapability[]` → `pluginCapabilitySchema`)",
    },
    {
      mode: "types",
      files: proofFiles("export const casted = (row: Row): string => (row.manifest as PluginManifest).name;\n"),
      expect: { count: 1, token: "manifest" },
      why: "an `as` cast is not a parse: the wrapper climb stops at it, so the cast read still reports",
    },
    {
      mode: "types",
      files: proofFiles(
        "export const both = (row: Row): unknown => ({\n  ...row.manifest,\n  nested: { name: row.manifest.name },\n  again: row.manifest,\n});\n" +
          "export const other = (row: Row): string => row.manifest.name;\n",
      ),
      expect: { count: 2, token: "manifest" },
      why: "one finding per column per waivable region: three reads inside one declaration are one read site (the outer region wins, so its one marker stays exact), and a second declaration is a second site",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: proofFiles(
        "export const parsed = (row: Row): string => pluginManifestSchema.parse(row.manifest).name;\n" +
          "export const safe = (row: Row): boolean => pluginManifestSchema.safeParse(row.manifest ?? null).success;\n" +
          "declare function parseCapabilities(value: unknown): readonly string[];\n" +
          "export const helper = (row: Row): readonly string[] => parseCapabilities((row.grantedCapabilities));\n",
      ),
      why: "the remedies: `parse`, `safeParse` through `??`, and a `parse*` helper through parentheses",
    },
    {
      mode: "types",
      files: proofFiles(
        "declare const db: { insert(table: unknown): { values(value: object): void } };\n" +
          "export const write = (input: Row): void => db.insert(plugins).values({ manifest: input.manifest });\n" +
          "export const assign = (target: { manifest: PluginManifest }, input: PluginManifest): void => {\n  target.manifest = input;\n};\n",
      ),
      why: "DECLARED LIMIT: a write builder argument and an assignment target are writes, not reads",
    },
    {
      mode: "types",
      files: proofFiles("export const note = (row: Row): string => row.note.text;\n"),
      why: "a typed column whose T has no zod twin (`Note`, no `noteSchema`) has nothing to parse against",
    },
    {
      mode: "types",
      files: {
        ...proofFiles("export const parsed = (row: Row): string => pluginManifestSchema.parse(row.manifest).name;\n"),
        "packages/server/src/domain/plugin/verbs/read.ts":
          'import type { plugins } from "../../../../../db/src/schema/plugin.ts";\nexport const read = (row: typeof plugins.$inferSelect): string => row.manifest.name;\n',
      },
      why: "the population: a read outside `persistence/**` is not this gate's subject",
    },
    {
      mode: "types",
      files: proofFiles(
        "// @orb-waive json-column-read-parsed(manifest): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export const capabilities = (row: Row): string => row.manifest.name;\n",
      ),
      why: "POSITIONAL IDENTITY: the position is the column name as read, built on the founding one-finding row",
    },
  ],
});

/** A drizzle stub, a contracts module with twins, the plugins schema and one persistence module holding `body`. */
function proofFiles(body: string): Readonly<Record<string, string>> {
  return {
    "node_modules/drizzle-orm/sqlite-core/index.d.ts":
      "export interface Column<T> { readonly value: T; $type<U>(): Column<U>; notNull(): Column<T> }\n" +
      "export declare function text(name: string, options?: { mode?: string }): Column<unknown>;\n" +
      'export declare function sqliteTable<const Columns extends Record<string, Column<unknown>>>(name: string, columns: Columns): Columns & { $inferSelect: { [Key in keyof Columns]: Columns[Key]["value"] } };\n',
    "packages/contracts/src/plugin/index.ts":
      "export interface PluginManifest { readonly name: string }\nexport type PluginCapability = 'net' | 'kv';\nexport interface Note { readonly text: string }\n" +
      "interface Parser<T> { parse(value: unknown): T; safeParse(value: unknown): { success: boolean } }\n" +
      "export declare const pluginManifestSchema: Parser<PluginManifest>;\nexport declare const pluginCapabilitySchema: Parser<PluginCapability>;\n",
    "packages/db/src/schema/plugin.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
      'import type { Note, PluginCapability, PluginManifest } from "../../../contracts/src/plugin/index.ts";\n' +
      'export const plugins = sqliteTable("plugins", {\n  manifest: text("manifest", { mode: "json" }).$type<PluginManifest>().notNull(),\n' +
      '  grantedCapabilities: text("granted_capabilities", { mode: "json" }).$type<PluginCapability[]>().notNull(),\n' +
      '  note: text("note", { mode: "json" }).$type<Note>().notNull(),\n});\n',
    "packages/server/src/domain/plugin/persistence/plugins.ts":
      'import { plugins } from "../../../../../db/src/schema/plugin.ts";\n' +
      'import { pluginManifestSchema, type PluginManifest } from "../../../../../contracts/src/plugin/index.ts";\n' +
      "type Row = typeof plugins.$inferSelect;\n" +
      body,
  };
}
