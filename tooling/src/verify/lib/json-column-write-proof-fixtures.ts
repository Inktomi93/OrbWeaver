// Real producer/body scaffolding for the JSON write policy's founding fixtures. Undefined load/view/
// merge names are not evidence. The virtual SDK declarations identify methods; authored bodies do reads.

const SQLITE = `
export interface Column<T> { readonly value: T; $type<U>(): Column<U>; notNull(): Column<T>; primaryKey(): Column<T> }
export declare function text(name: string, options?: { mode?: string }): Column<unknown>;
export declare function sqliteTable<const Columns extends Record<string, Column<unknown>>>(name: string, columns: Columns): Columns & { $inferSelect: { [Key in keyof Columns]: Columns[Key]["value"] } };
`;
const CLIENT = `
type Project<Fields> = { [Key in keyof Fields]: Fields[Key] extends { $inferSelect: infer Row } ? Row : Fields[Key] extends { value: infer Value } ? Value : never };
export interface Query<Row> extends PromiseLike<readonly Row[]> { where(value: object): Query<Row>; limit(value: number): Query<Row>; get(): Promise<Row | undefined> }
export interface Select<Fields> { from<Table extends { $inferSelect: object }>(table: Table): Query<Fields extends undefined ? Table["$inferSelect"] : Project<Fields>> }
export interface Write { set(value: object): Write; where(value: object): Promise<void>; values(value: object): Write; onConflictDoUpdate(value: object): Promise<void> }
export interface Client { select<const Fields = undefined>(fields?: Fields): Select<Fields>; update(table: object): Write; insert(table: object): Write }
`;
const ZOD = `
export interface RefinementCtx { addIssue(issue: { readonly code: "custom"; readonly message: string }): void }
export interface ZodType<T = unknown, Input = unknown> { readonly _output: T; readonly _input: Input; parse(value: unknown): T; int(): ZodType<T, Input>; min(n: number): ZodType<T, Input>; max(n: number): ZodType<T, Input>; optional(): ZodType<T | undefined, Input>; nullable(): ZodType<T | null, Input>; catch(value: T | (() => T)): ZodType<T, Input>; refine(check: (value: T) => boolean, message?: string): ZodType<T, Input>; transform<U>(map: (value: T, ctx: RefinementCtx) => U): ZodType<U, Input> }
type ObjectOutput<Shape extends Record<string, ZodType>> = { [Key in keyof Shape as undefined extends Shape[Key]["_output"] ? never : Key]: Shape[Key]["_output"] } & { [Key in keyof Shape as undefined extends Shape[Key]["_output"] ? Key : never]?: Shape[Key]["_output"] };
export declare function object<const Shape extends Record<string, ZodType>>(shape: Shape): ZodType<ObjectOutput<Shape>>;
export declare function array<T>(schema: ZodType<T>): ZodType<T[]>;
export declare function number(): ZodType<number>;
export declare function string(): ZodType<string, string>;
export declare function literal<const Value extends string | number | boolean>(value: Value): ZodType<Value>;
export declare const NEVER: never;
export declare function boolean(): ZodType<boolean>;
export declare function record<Key extends string, Value>(key: ZodType<Key>, value: ZodType<Value>): ZodType<Record<Key, Value>>;
export declare function union<const Members extends readonly ZodType[]>(members: Members): ZodType<Members[number]["_output"]>;
export type output<Schema extends ZodType> = Schema["_output"];
export declare function preprocess<T>(map: (value: unknown) => unknown, schema: ZodType<T>): ZodType<T>;
export declare function enum_<const Members extends readonly string[]>(members: Members): ZodType<Members[number]>;
export { enum_ as enum };
`;
const SELECTION = `
/// <reference lib="es2022" />
import * as z from "zod";
export const fields = z.array(z.enum(["description", "greetings"])).refine((items) => new Set(items).size === items.length);
export const indexes = z.array(z.number().int().min(0)).refine((items) => new Set(items).size === items.length);
export const refinerySelectionSchema = z.object({ fields, greetingIndexes: indexes.optional() });
export const refinerySelectionPatchSchema = z.object({ fields: fields.optional(), greetingIndexes: indexes.nullable().optional() });
export type Selection = { fields: ("description" | "greetings")[]; greetingIndexes?: number[] | undefined };
`;
const REFINERY = `
import { refinerySessions } from "../../../../../db/src/schema/refinery.ts";
import { refinerySelectionSchema, refinerySelectionPatchSchema } from "../../../../../contracts/src/refinery/index.ts";
import type { Client } from "drizzle-orm/libsql";
type Row = typeof refinerySessions.$inferSelect;
async function loadOwnedSessionRow(db: Client, sessionId: string): Promise<Row> {
  const rows = await db.select({ session: refinerySessions }).from(refinerySessions).where({ sessionId }).limit(1);
  const row = rows[0]?.session;
  if (row === undefined) throw new Error("missing session");
  return row;
}
const selectionParser = refinerySelectionSchema.catch(() => ({ fields: [] }));
function sessionViewOf(row: Row) { return { selection: selectionParser.parse(row.selection) }; }
async function resolveApplyBasis(ctx: { db: Client }, id: string) { const row = await loadOwnedSessionRow(ctx.db, id); return { session: sessionViewOf(row) }; }
function remapSelection(selection: import("../../../../../contracts/src/refinery/index.ts").Selection, removed: readonly number[]) {
  const indexes = selection.greetingIndexes;
  if (indexes === undefined) return selection;
  return { ...selection, greetingIndexes: indexes.filter((index) => !removed.includes(index)).map((index) => index - removed.filter((drop) => drop < index).length) };
}
function mergeSelection(current: import("../../../../../contracts/src/refinery/index.ts").Selection, patch: { fields?: import("../../../../../contracts/src/refinery/index.ts").Selection["fields"]; greetingIndexes?: number[] | null }) {
  const greetingIndexes = patch.greetingIndexes === undefined ? current.greetingIndexes : patch.greetingIndexes ?? undefined;
  return refinerySelectionSchema.parse({ fields: patch.fields ?? current.fields, ...(greetingIndexes === undefined ? {} : { greetingIndexes }) });
}
`;

const RPG_SHEET = `
export interface RpgSheet { readonly className: string; readonly attributes: Readonly<Record<string, number>>; readonly flavor: string; readonly level: number | null; readonly trackerGrants: readonly string[]; readonly trackerRevokes: readonly string[] }
`;

function tableFor(path: string): string | undefined {
  const tables = [
    ["/chat/", "chats"],
    ["/rpg/", "rpgSheets"],
    ["/preset/", "presets"],
    ["/settings/", "userSettings"],
  ] as const;
  return tables.find(([segment]) => path.includes(segment))?.[1];
}

function schemaFile(table: string): string {
  switch (table) {
    case "chats":
      return "chat";
    case "rpgSheets":
      return "rpg";
    case "presets":
      return "preset";
    default:
      return "settings";
  }
}

function loadBody(table: string): string {
  return `
async function readStored(db: import("drizzle-orm/libsql").Client): Promise<typeof ${table}.$inferSelect> {
  const row = await db.select().from(${table}).get();
  if (row === undefined) throw new Error("missing row");
  return row;
}
`;
}

function producerPrelude(table: string, source: string): string {
  let prelude = `import { ${table} } from "../../../../../db/src/schema/${schemaFile(table)}.ts";\n${loadBody(table)}`;
  if (source.includes("loadChat(")) {
    prelude += `async function loadChat(ctx: { db: import("drizzle-orm/libsql").Client }, id: string) { return await readStored(ctx.db); }\n`;
  }
  if (source.includes("loadPreset(")) {
    prelude += `async function loadPreset(ctx: { db: import("drizzle-orm/libsql").Client }, id: string) { return await readStored(ctx.db); }\n`;
  }
  if (source.includes("loadSettings(")) {
    prelude += `async function loadSettings(ctx: { db: import("drizzle-orm/libsql").Client }, id: string) { return await readStored(ctx.db); }\n`;
  }
  if (source.includes("loadRow(")) {
    prelude += `async function loadRow(db: import("drizzle-orm/libsql").Client, id: string) { return await readStored(db); }\n`;
  }
  if (source.includes("await load(")) {
    prelude += `async function load(ctx: { db: import("drizzle-orm/libsql").Client }, id: string) { return await readStored(ctx.db); }\n`;
  }
  if (source.includes("patchSheet(")) {
    prelude += `
import type { RpgSheet } from "../../../../../contracts/src/rpg/index.ts";
function mergeAttributes(current: Readonly<Record<string, number>>, patch: Readonly<Record<string, number | null>>): Record<string, number> {
  const next: Record<string, number> = { ...current };
  for (const [key, value] of Object.entries(patch)) { if (value === null) { delete next[key]; } else { next[key] = value; } }
  return next;
}
function patchSheet(current: RpgSheet, patch: { className?: string; attributes?: Readonly<Record<string, number | null>>; flavor?: string; level?: number | null; trackerGrants?: readonly string[]; trackerRevokes?: readonly string[] }) {
  return { className: patch.className ?? current.className, attributes: patch.attributes !== undefined ? mergeAttributes(current.attributes, patch.attributes) : current.attributes, trackerGrants: patch.trackerGrants !== undefined ? [...patch.trackerGrants] : current.trackerGrants, trackerRevokes: patch.trackerRevokes !== undefined ? [...patch.trackerRevokes] : current.trackerRevokes, flavor: patch.flavor ?? current.flavor, level: "level" in patch ? (patch.level ?? null) : current.level };
}\n`;
  }
  if (source.includes("await build(")) {
    prelude += `async function build(ctx: { db: import("drizzle-orm/libsql").Client }, id: string) { const row = await readStored(ctx.db); return { ...row.metadata, seen: true }; }\n`;
  }
  if (source.includes("sql`")) {
    prelude += `import { sql } from "drizzle-orm";\n`;
  }
  return prelude;
}

function sourceBody(path: string, source: string): string {
  const typedSource = path.includes("/domain/chat/") ? source.replaceAll("(ctx, parsed, chatId)", "(ctx, parsed: object, chatId)") : source;
  if (path.includes("/domain/refinery/")) {
    return `${REFINERY}\n${typedSource}`;
  }
  const table = tableFor(path);
  return table === undefined || !path.includes("/domain/") ? typedSource : `${producerPrelude(table, typedSource)}\n${typedSource}`;
}

/** Upgrade only producer scaffolding; founding write expressions, paths, subjects and assertions stay authored. */
export function jsonWriteProofFiles(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const upgraded = Object.fromEntries(
    Object.entries(files).map(([path, source]) => {
      if (path.includes("/schema/") && source.includes('text("sheet", { mode: "json" })')) {
        source = `import type { RpgSheet } from "../../../contracts/src/rpg/index.ts";\n${source}`.replaceAll(
          'text("sheet", { mode: "json" })',
          'text("sheet", { mode: "json" }).$type<RpgSheet>()',
        );
      }
      if (path.includes("/schema/") && source.includes('text("selection", { mode: "json" })')) {
        source = `import type { Selection } from "../../../contracts/src/refinery/index.ts";\n${source}`.replaceAll(
          'text("selection", { mode: "json" })',
          'text("selection", { mode: "json" }).$type<Selection>()',
        );
      }
      return [path, sourceBody(path, source)];
    }),
  );
  return {
    "node_modules/drizzle-orm/sqlite-core/index.d.ts": SQLITE,
    "node_modules/drizzle-orm/libsql/index.d.ts": CLIENT,
    "node_modules/drizzle-orm/index.d.ts": "export declare function sql(template: TemplateStringsArray, ...values: readonly unknown[]): object;\n",
    "node_modules/zod/index.d.ts": ZOD,
    "packages/contracts/src/refinery/index.ts": SELECTION,
    "packages/contracts/src/rpg/index.ts": RPG_SHEET,
    ...upgraded,
  };
}

const TYPE_ID_FACTORY = `
import { fromString } from "typeid-js";
import * as z from "zod";
export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const;
export type TypeIdOf<P extends string> = string & { readonly idPrefix: P };
export function typeIdSchema<P extends string>(prefix: P): z.ZodType<TypeIdOf<P>, string> {
  return z.string().transform((value, ctx): TypeIdOf<P> => {
    try { return fromString(value, prefix) as string as TypeIdOf<P>; }
    catch { ctx.addIssue({ code: "custom", message: \`Invalid \${prefix} id\` }); return z.NEVER; }
  });
}
`;
const STAGE_CONFIG = `
import { ID_PREFIX, typeIdSchema } from "../../../kit/src/ids/index.ts";
export const custom = z.object({ kind: z.literal("custom"), schemaId: typeIdSchema(ID_PREFIX.refinerySchema) });
export const fixed = z.object({ kind: z.literal("fixed"), mode: z.enum(["full", "balanced"]) });
export const stageConfigSchema = z.object({ score: z.union([fixed, custom]), rewrite: fixed, analyze: z.union([fixed, custom]) });
export type StageConfig = z.output<typeof stageConfigSchema>;
export const DEFAULT_STAGE_CONFIG = { score: { kind: "fixed", mode: "full" }, rewrite: { kind: "fixed", mode: "balanced" }, analyze: { kind: "fixed", mode: "full" } } as const;
`;

/** The actual stage-config constructor/factory/read-heal chain, with deliberate per-control overrides. */
export function jsonStageConfigProofFiles(source: string, overrides: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return jsonWriteProofFiles({
    "node_modules/typeid-js/index.d.ts": "export declare function fromString<T extends string>(typeId: string, prefix?: T): string;\n",
    "packages/kit/src/ids/index.ts": TYPE_ID_FACTORY,
    "packages/contracts/src/refinery/index.ts": SELECTION + STAGE_CONFIG,
    "packages/db/src/schema/refinery.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; import type { StageConfig } from "../../../contracts/src/refinery/index.ts"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }), stageConfig: text("stage_config", { mode: "json" }).$type<StageConfig>() });',
    "packages/server/src/domain/refinery/verbs/stage-proof.ts":
      'import { stageConfigSchema, DEFAULT_STAGE_CONFIG } from "../../../../../contracts/src/refinery/index.ts"; const stageParser = stageConfigSchema.catch(() => { addSpanEvent("refinery.read.heal", { arm: "stageConfig" }); return DEFAULT_STAGE_CONFIG; }); function stageViewOf(row: Row) { return { stageConfig: stageParser.parse(row.stageConfig) }; }\n' +
      source,
    ...overrides,
  });
}
