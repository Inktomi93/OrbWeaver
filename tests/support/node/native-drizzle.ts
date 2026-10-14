// Installed Drizzle compiler-world fixture: owned scratch tree, native declarations, no miniature ORM.
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { observeCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import { readCalledMember } from "@orb/tooling/floor/code-facts/drizzle-write-chain";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { CallExpression, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ToolFixtures } from "./tool-fixtures.ts";
import { expect } from "./tool-fixtures.ts";
export const PRODUCER = "packages/server/src/domain/persona/persistence/producer.ts";
const RECIPIENT = "packages/server/src/domain/persona/persistence/recipient.ts";
const CONFIG = "packages/server/tsconfig.json";
const SCHEMA = `import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const personas = sqliteTable("personas", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull() });
`;
const DATABASE = `export * from "./schema/persona.js";
import * as schema from "./schema/persona.js";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
export type Db = LibSQLDatabase<typeof schema>;
`;
const SCOPE_SCHEMA = `
export const users = sqliteTable("users", { id: text("id").primaryKey() });
export const assets = sqliteTable("assets", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), hash: text("hash") });
export const characters = sqliteTable("characters", { id: text("id").primaryKey(), name: text("name"), ownerId: text("owner_id").notNull(), avatarAssetId: text("avatar_asset_id").references(() => assets.id) });
export const tags = sqliteTable("tags", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull() });
export const characterTags = sqliteTable("character_tags", { characterId: text("character_id").references(() => characters.id), tagId: text("tag_id").references(() => tags.id) });
export const chatParticipants = sqliteTable("chat_participants", { id: text("id").primaryKey(), chatId: text("chat_id").references(() => chats.id), userId: text("user_id").references(() => users.id), leftSeq: text("left_seq"), characterId: text("character_id").references(() => characters.id), kind: text("kind"), role: text("role"), joinHistoryVisibility: text("join_history_visibility"), joinSeq: integer("join_seq") });
export const characterEmbeddings = sqliteTable("character_embeddings", { id: text("id").primaryKey(), characterId: text("character_id").references(() => characters.id), generationId: text("generation_id"), model: text("model"), dim: integer("dim") });
export const embedSpaceState = sqliteTable("embed_space_state", { ownerId: text("owner_id"), scope: text("scope"), activeGenerationId: text("active_generation_id") });
export const embedGenerationTargets = sqliteTable("embed_generation_targets", { ownerId: text("owner_id"), task: text("task"), generationId: text("generation_id") });
export const messages = sqliteTable("messages", { id: text("id").primaryKey(), chatId: text("chat_id").references(() => chats.id), selectedVariantId: text("selected_variant_id"), seq: integer("seq") });
export const messageVariants = sqliteTable("message_variants", { id: text("id").primaryKey(), content: text("content") });
export const imageEmbeddings = sqliteTable("image_embeddings", { id: text("id").primaryKey(), assetId: text("asset_id").references(() => assets.id), generationId: text("generation_id"), model: text("model"), dim: integer("dim"), lens: text("lens"), contentHash: text("content_hash") });
export const imageAnalyses = sqliteTable("image_analyses", { assetId: text("asset_id").references(() => assets.id), caption: text("caption"), captionMeta: text("caption_meta"), contentHash: text("content_hash") });
export const embedGenerations = sqliteTable("embed_generations", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), fingerprint: text("fingerprint") });
export const imageryGenerations = sqliteTable("imagery_generations", { id: text("id").primaryKey(), assetId: text("asset_id").references(() => assets.id), importHash: text("import_hash") });
`;
export const SCOPE_HEAD = `import { and, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";
import { assets, characters, characterTags, tags, chats, chatParticipants, type Db } from "@orb/db";
`;
export interface NativeFixture {
  readonly root: string;
  readonly project: Project;
  readonly source: SourceFile;
  readonly anchor: CallExpression;
}

/** One scratch native program whose SQL and table declarations resolve to the installed package. */
export async function nativeFixture(
  { plantedTree, repoRoot }: Pick<ToolFixtures, "plantedTree" | "repoRoot">,
  scenario: { readonly producer: string; readonly recipient: string },
): Promise<NativeFixture> {
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "node_modules\n",
    "tsconfig.base.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        types: ["node"],
        paths: { "@orb/db": ["./packages/db/src/index.ts"] },
      },
    }),
    [CONFIG]: '{"extends":"../../tsconfig.base.json","include":["src/**/*.ts"]}',
    "packages/server/src/native-foreign.d.ts": 'declare module "drizzle-orm-foreign" { export const max: typeof import("drizzle-orm").max; }',
    "packages/db/src/schema/persona.ts": `${SCHEMA}export const chats = sqliteTable("chats", {id: text("id").primaryKey(), anchorPersonaId: text("anchor_persona_id").references(() => personas.id), startedAt: integer("started_at")});${SCOPE_SCHEMA}`,
    "packages/db/src/index.ts": DATABASE,
    [PRODUCER]: scenario.producer,
    [RECIPIENT]: scenario.recipient,
  });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const view = createSemanticWorkspace({ root }).program(CONFIG);
  if (view === undefined) {
    throw new Error("the native fixture's server program was not admitted");
  }
  const project = view.project();
  expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  const source = view.sourceFile(PRODUCER);
  const anchor = source
    ?.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText().endsWith(".from") || call.getExpression().getText().endsWith(".findFirst"));
  if (source === undefined || anchor === undefined) {
    throw new Error("the genuine producer's table anchor was not loaded");
  }
  expect(readCalledMember(anchor).kind).toBe("resolved");
  const declarations = anchor.getExpression().getSymbol()?.getDeclarations() ?? [];
  expect(declarations).not.toHaveLength(0);
  expect(declarations.every((declaration) => declaration.getSourceFile().getFilePath().includes("/drizzle-orm/"))).toBe(true);
  return { root, project, source, anchor };
}

/** Complete authored native call closure from the same loaded compiler world. */
export function statementObservations(root: string, project: Project): ReturnType<typeof observeCallReturns> {
  const nodes = project
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile() && file.getFilePath().startsWith(root))
    .flatMap((file) => file.getDescendants());
  return observeCallReturns(nodes.filter(Node.isCallExpression), nodes);
}
