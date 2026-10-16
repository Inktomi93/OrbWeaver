import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";

export const SCHEMA = "packages/db/src/schema/persona.ts";
export const ENTRY = "packages/server/src/domain/persona/persistence/read.ts";
export const HELPER = "packages/server/src/domain/persona/persistence/predicate.ts";

/** Installed-package NodeNext worlds shared by owner-read delivery controls. */
export function nativeOwnerReadFixture(root: string, repoRoot: string, entry?: string): void {
  const put = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  put(".gitignore", "node_modules\n.cache\nreports\n");
  put(
    SCHEMA,
    'import{sqliteTable,text}from"drizzle-orm/sqlite-core";export const personas=sqliteTable("personas",{id:text("id").primaryKey(),ownerId:text("owner_id").notNull()});',
  );
  put(
    HELPER,
    'import{eq}from"drizzle-orm";import{personas}from"../../../../../db/src/schema/persona.ts";export function owned(owner:string){return eq(personas.ownerId,owner);}',
  );
  put(
    ENTRY,
    entry ??
      'import type{BaseSQLiteDatabase}from"drizzle-orm/sqlite-core";import{and,eq}from"drizzle-orm";import{personas}from"../../../../../db/src/schema/persona.ts";import{owned}from"./predicate.ts";declare const db:BaseSQLiteDatabase<"async",void>;export async function load(id:string,principal:{userId:string}){return db.select().from(personas).where(and(eq(personas.id,id),owned(principal.userId)));}',
  );
  const compilerOptions = {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    types: [],
  };
  put("package.json", '{"type":"module"}');
  put("tsconfig.json", JSON.stringify({ compilerOptions, files: [SCHEMA, ENTRY, HELPER] }));
  put("packages/db/tsconfig.json", JSON.stringify({ compilerOptions, files: ["src/schema/persona.ts"] }));
  put(
    "packages/server/tsconfig.json",
    JSON.stringify({ compilerOptions, files: ["src/domain/persona/persistence/read.ts", "src/domain/persona/persistence/predicate.ts"] }),
  );
  execFixtureGit(root, ["init", "-q"]);
}
