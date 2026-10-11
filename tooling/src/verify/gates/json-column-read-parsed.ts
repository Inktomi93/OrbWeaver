// Gate: json-column-read-parsed — a TYPED JSON column (`mode:"json"` + `$type<T>`) whose T has a zod twin is
// parsed on read in `persistence/**`. The `$type` is a cast: it states what the writer meant, not what the row
// holds after a schema change, a hand migration or an import. A read off a SELECT row (`row.col`, `row["col"]`,
// `const { col } = row`) must reach a parser declared by zod or the versioned-config codec, directly, through a
// helper handed the schema, or one hop into a helper that parses its parameter. Reader: `lib/json-column-read.ts`.
// TWIN: T's declaration is `z.infer`/`z.output<typeof X>` (twin X), or T's module exports `<lowerFirst(T)>Schema`.
// DECLARED LIMITS (mustPass rows): an open column is `open-json-column-key-parity`'s subject; a value written straight
// back (a write builder, an insert-model literal, an assignment) or only presence-tested is not consumed.
// FAMILY `open-json-column-key-parity`: the open-json-column family, reading the shared `drizzleSchemaFact`.
import type { Node, Type } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../floor/code-facts/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import type { ColumnRead } from "../lib/json-column-read.ts";
import { bindingUsesJudged, columnReadAt, isParsedValue, isPresenceTest, isWriteSink, readsSelectRow, rowModels } from "../lib/json-column-read.ts";
import { isBoundary } from "../lib/ordinary-waiver-carrier.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const ZOD_DERIVED_RE = /^z\.(?:infer|output)<typeof (?<schema>\w+)>$/u;

const MESSAGE =
  "typed JSON column read by cast — the `$type<T>` is the only check, so a row written before a schema change, " +
  "by a hand migration or by an import reaches the domain unvalidated. Parse it on read through its zod twin " +
  "(`schema.parse`/`safeParse`, a helper handed the schema, or the versioned-config `parseOutcome`), degrading to a reported " +
  "fallback where a throw is wrong. " +
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

interface UnparsedRead {
  readonly read: ColumnRead;
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
        other.read.column === read.read.column &&
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
    const candidates: ColumnRead[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression, SyntaxKind.BindingElement],
          visit: (node): void => {
            const read = columnReadAt(node);
            if (read !== undefined) {
              candidates.push(read);
            }
          },
        },
      ],
      evaluate: () => {
        const query = ctx.fact(drizzleSchemaFact);
        const schema = query.schema();
        recordReadySchemaFact(ctx, schema);
        const typed = typedColumns(schema.value);
        const models = rowModels(schema.value);
        ctx.receipt({ kind: "population", source: "typed-json-columns-with-twin", members: [...typed.values()].reduce((n, m) => n + m.size, 0) });
        const reads = candidates.flatMap((read) => {
          const twin = typed.get(read.column)?.get(namedType(read.value.getType()).compilerType);
          if (twin === undefined || !readsSelectRow(read, models, query)) {
            return [];
          }
          const judged = N.isBindingElement(read.value.getParent())
            ? bindingUsesJudged(read, models)
            : isWriteSink(read.value, models) || isPresenceTest(read.value) || isParsedValue(read.value);
          return judged ? [] : [{ read, twin, region: waiverRegion(read.value) }];
        });
        for (const { read, twin } of outermostPerRegion(reads)) {
          ctx.report.node(read.anchor, { token: read.column, offset: read.offset, message: `Twin: \`${twin}\`. ${MESSAGE}` });
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
    {
      mode: "types",
      files: proofFiles('export const keyed = (row: Row): string => row["manifest"].name;\n'),
      expect: { count: 1, token: "manifest" },
      why: "an element access with a literal key is the same read as the dotted one",
    },
    {
      mode: "types",
      files: proofFiles(
        "export const local = (row: Row): string => {\n  const { manifest } = row;\n  return manifest.name;\n};\n" +
          "export const param = ({ manifest: m }: Row): string => m.name;\n",
      ),
      expect: { count: 2, token: "manifest" },
      why: "a destructure (a local and a renamed parameter binding) takes the column off the row without a parse",
    },
    {
      mode: "types",
      files: proofFiles(
        "const selection = { manifest: plugins.manifest };\n" +
          "declare function select<S>(shape: S): { [K in keyof S]: S[K] extends { readonly value: infer U } ? U : never };\n" +
          "export const partial = (): string => select(selection).manifest.name;\n",
      ),
      expect: { count: 1, token: "manifest" },
      why: "a partial select is a row too: its key is declared by a column reference, not by `$inferSelect`",
    },
    {
      mode: "types",
      files: proofFiles(
        "declare function parseLoosely(value: unknown): PluginManifest;\n" +
          "export const named = (row: Row): string => parseLoosely(row.manifest).name;\n" +
          "function peek(value: PluginManifest): string {\n  return value.name;\n}\n" +
          "export const consumed = (row: Row): string => peek(row.manifest);\n",
      ),
      expect: { count: 2, token: "manifest" },
      why: "a parse is judged by the parser, not the callee's name: a `parse*`-named helper with no schema, and a helper that reads the raw value, both report",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/empty.ts": "export const NOT_A_TABLE = 1;\n",
        "packages/server/src/domain/plugin/persistence/plugins.ts": "export const read = (row: { readonly manifest: unknown }): unknown => row.manifest;\n",
      },
      expect: { messageIncludes: "drizzle schema fact empty" },
      why: "THE SUPPLY REFUSAL: a schema tree with no drizzle table gives the fact a zero-member receipt, and a clean pass would certify every read over no typed column at all",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: proofFiles(
        "export const parsed = (row: Row): string => pluginManifestSchema.parse(row.manifest).name;\n" +
          "export const safe = (row: Row): boolean => pluginManifestSchema.safeParse(row.manifest ?? null).success;\n" +
          "function parseCapabilities(value: unknown): PluginCapability {\n  return pluginCapabilitySchema.parse(value);\n}\n" +
          "export const helper = (row: Row): PluginCapability => parseCapabilities((row.grantedCapabilities));\n" +
          "function field<T>(schema: ZodType<T>, value: unknown): T {\n  return schema.parse(value);\n}\n" +
          "export const handed = (row: Row): string => field(pluginManifestSchema, row.manifest).name;\n" +
          "declare function heal(value: unknown): unknown;\n" +
          "export const healed = (row: Row): string => pluginManifestSchema.parse(heal(row.manifest)).name;\n" +
          "export const composed = (row: Row): unknown => pluginManifestSchema.parse({ ...{ name: 'x' }, manifest: row.manifest });\n" +
          "export const codec = (row: Row): string => manifestConfig.parseOutcome(row.manifest).value.name;\n",
      ),
      why: "the remedies, judged by the parser's declaration: zod `parse`/`safeParse` (through `??` and parentheses), a helper that parses its parameter, a helper handed the schema, a pre-parse heal, a composed parse argument, and the versioned-config codec",
    },
    {
      mode: "types",
      files: proofFiles(
        "export const local = (row: Row): string => {\n  const { manifest } = row;\n  return manifest === null ? '' : pluginManifestSchema.parse(manifest).name;\n};\n",
      ),
      why: "a destructured binding whose every use is a parse or a presence test is parsed",
    },
    {
      mode: "types",
      files: proofFiles(
        "declare const db: { insert(table: unknown): { values(value: object): void } };\n" +
          "export const write = (input: Row): void => db.insert(plugins).values({ manifest: input.manifest });\n" +
          "export const assign = (target: { manifest: PluginManifest }, input: PluginManifest): void => {\n  target.manifest = input;\n};\n" +
          "export const copy = (source: Row): Insert => ({ manifest: source.manifest, grantedCapabilities: source.grantedCapabilities });\n" +
          "export const present = (row: Row): boolean => row.manifest !== null && typeof row.manifest === 'object';\n",
      ),
      why: "DECLARED LIMIT: a write builder argument, an assignment target, a row copied into an insert-model literal and a presence test consume no field",
    },
    {
      mode: "types",
      files: proofFiles(
        "export const fromInput = (input: { readonly manifest: PluginManifest }): string => input.manifest.name;\n" +
          "export const nested = (input: { readonly draft: { readonly manifest: PluginManifest } }): string => input.draft.manifest.name;\n",
      ),
      why: "a same-named, same-typed property on a value that is not a select row (a verb input, a domain shape) is not a column read",
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

/** Drizzle and zod stubs, a contracts module with twins and a versioned-config codec, the plugins schema, and one
 *  persistence module holding `body`. */
function proofFiles(body: string): Readonly<Record<string, string>> {
  return {
    "node_modules/drizzle-orm/sqlite-core/index.d.ts":
      "export interface Column<T> { readonly value: T; $type<U>(): Column<U>; notNull(): Column<T> }\n" +
      "export declare function text(name: string, options?: { mode?: string }): Column<unknown>;\n" +
      "export declare function sqliteTable<const Columns extends Record<string, Column<unknown>>>(name: string, columns: Columns): Columns & " +
      '{ $inferSelect: { [Key in keyof Columns]: Columns[Key]["value"] }; $inferInsert: { [Key in keyof Columns]?: Columns[Key]["value"] } };\n',
    "node_modules/zod/index.d.ts": "export interface ZodType<T> { parse(value: unknown): T; safeParse(value: unknown): { success: boolean } }\n",
    "packages/contracts/src/versioned-config/index.ts":
      "export interface VersionedConfig<T> { parse(raw: unknown): T; parseOutcome(raw: unknown): { readonly value: T } }\n",
    "packages/contracts/src/plugin/index.ts":
      'import type { ZodType } from "zod";\n' +
      'import type { VersionedConfig } from "../versioned-config/index.ts";\n' +
      "export interface PluginManifest { readonly name: string }\nexport type PluginCapability = 'net' | 'kv';\nexport interface Note { readonly text: string }\n" +
      "export declare const pluginManifestSchema: ZodType<PluginManifest>;\nexport declare const pluginCapabilitySchema: ZodType<PluginCapability>;\n" +
      "export declare const manifestConfig: VersionedConfig<PluginManifest>;\n",
    "packages/db/src/schema/plugin.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
      'import type { Note, PluginCapability, PluginManifest } from "../../../contracts/src/plugin/index.ts";\n' +
      'export const plugins = sqliteTable("plugins", {\n  manifest: text("manifest", { mode: "json" }).$type<PluginManifest>().notNull(),\n' +
      '  grantedCapabilities: text("granted_capabilities", { mode: "json" }).$type<PluginCapability[]>().notNull(),\n' +
      '  note: text("note", { mode: "json" }).$type<Note>().notNull(),\n});\n',
    "packages/server/src/domain/plugin/persistence/plugins.ts":
      'import type { ZodType } from "zod";\n' +
      'import { plugins } from "../../../../../db/src/schema/plugin.ts";\n' +
      'import { manifestConfig, pluginCapabilitySchema, pluginManifestSchema, type PluginCapability, type PluginManifest } from "../../../../../contracts/src/plugin/index.ts";\n' +
      "type Row = typeof plugins.$inferSelect;\n" +
      "type Insert = typeof plugins.$inferInsert;\n" +
      body,
  };
}
