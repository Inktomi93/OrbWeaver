// The id-cast arms read Drizzle write tables and comparison operators through the floor readers in every native
// world: the declared verb or operator decides, never its spelling, and a world that cannot answer casts nothing.

import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { vi } from "vitest";
import { castIdInComparisons, castIdInObjectLiterals } from "../../../../tooling/src/codemod/index.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { withTree } from "../_kit-tree.ts";

const SEMANTIC_TIMEOUT_MS = scaledBudget(30_000);
vi.setConfig({ testTimeout: SEMANTIC_TIMEOUT_MS });

const DRIZZLE = {
  "node_modules/drizzle-orm/package.json": JSON.stringify({ name: "drizzle-orm", types: "index.d.ts" }),
  "node_modules/drizzle-orm/index.d.ts":
    "export declare class Builder { values(v: unknown): Builder; set(v: unknown): Builder; where(w: unknown): Builder; }\n" +
    "export declare class Db { insert(t: unknown): Builder; update(t: unknown): Builder; }\n" +
    "export declare function eq(left: unknown, right: unknown): unknown;\n" +
    "export declare function inArray(left: unknown, right: readonly unknown[]): unknown;\n",
};

const DB_IMPORT = 'import type { Db } from "drizzle-orm";\n';
const DECLARATIONS = "declare const db: Db;\ndeclare const chats: { readonly id: string };\ndeclare const characters: { readonly id: string };\n";
const PRELUDE = `${DB_IMPORT}${DECLARATIONS}`;

const CAST = { brand: "ChatId", castFn: "castId", importModule: "#ids" } as const;
// addNamedImport merges both names into one declaration after the file's last import.
const CAST_IMPORT = 'import { castId, type ChatId } from "#ids";\n\n';

function wrapped(literal: string): string {
  return `castId<ChatId>(${literal})`;
}

test("table-scoped object casts keep direct insert, multi-row and update sites and still skip other tables", async () => {
  const body =
    'db.insert(chats).values({ id: "c1", chatId: "c2" });\n' +
    'db.insert(chats).values([{ id: "c3" }]);\n' +
    'db.update(chats).set({ id: "c4" }).where(true);\n' +
    'db.insert(characters).values({ id: "x1" });\n';
  await withTree({ ...DRIZZLE, "tests/seed.test.ts": `${PRELUDE}${body}` }, async ({ run }) => {
    const { output } = await run((ctx) => {
      ctx.plan(castIdInObjectLiterals(ctx, { ...CAST, alwaysProps: ["chatId"], tableScopedIdProps: [{ table: "chats", prop: "id" }] }));
      expect(ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "tests/seed.test.ts")).getFullText()).toBe(
        `${DB_IMPORT}${CAST_IMPORT}${DECLARATIONS}` +
          `db.insert(chats).values({ id: ${wrapped('"c1"')}, chatId: ${wrapped('"c2"')} });\n` +
          `db.insert(chats).values([{ id: ${wrapped('"c3"')} }]);\n` +
          `db.update(chats).set({ id: ${wrapped('"c4"')} }).where(true);\n` +
          'db.insert(characters).values({ id: "x1" });\n',
      );
    });
    expect(output).toContain("cast {chatId, chats.id} literals → castId<ChatId> (4 site(s) across 1 file(s))");
  });
});

test("table-scoped object casts follow a hoisted Drizzle builder and refuse an insert Drizzle does not declare", async () => {
  const body =
    "const store = { insert: (_t: unknown) => ({ values: (_v: unknown) => undefined }) };\n" +
    "const pending = db.insert(chats);\n" +
    'pending.values({ id: "c5" });\n' +
    'store.insert(chats).values({ id: "f1" });\n';
  await withTree({ ...DRIZZLE, "tests/seed.test.ts": `${PRELUDE}${body}` }, async ({ run }) => {
    await run((ctx) => {
      ctx.plan(castIdInObjectLiterals(ctx, { ...CAST, alwaysProps: [], tableScopedIdProps: [{ table: "chats", prop: "id" }] }));
      const text = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "tests/seed.test.ts")).getFullText();
      expect(text).toContain(`pending.values({ id: ${wrapped('"c5"')} });`);
      expect(text).toContain('store.insert(chats).values({ id: "f1" });');
    });
  });
});

test("comparison casts keep direct drizzle operators and inArray elements", async () => {
  const body = 'import { eq, inArray } from "drizzle-orm";\neq(chats.id, "c6");\ninArray(chats.id, ["c7", "c8"]);\neq(characters.id, "x2");\n';
  await withTree({ ...DRIZZLE, "tests/where.test.ts": `${PRELUDE}${body}` }, async ({ run }) => {
    const { output } = await run((ctx) => {
      ctx.plan(castIdInComparisons(ctx, { ...CAST, columns: ["chats.id"] }));
      expect(ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "tests/where.test.ts")).getFullText()).toBe(
        `${PRELUDE}import { eq, inArray } from "drizzle-orm";\n${CAST_IMPORT}` +
          `eq(chats.id, ${wrapped('"c6"')});\ninArray(chats.id, [${wrapped('"c7"')}, ${wrapped('"c8"')}]);\neq(characters.id, "x2");\n`,
      );
    });
    expect(output).toContain("cast {chats.id} comparison literals → castId<ChatId> (3 site(s) across 1 file(s))");
  });
});

test("comparison casts follow the drizzle import binding, not the callee spelling", async () => {
  const aliased = 'import { eq as equals } from "drizzle-orm";\nequals(chats.id, "c9");\n';
  const foreign = 'const eq = (_left: unknown, _right: unknown): boolean => true;\neq(chats.id, "f2");\n';
  await withTree({ ...DRIZZLE, "tests/aliased.test.ts": `${PRELUDE}${aliased}`, "tests/foreign.test.ts": `${PRELUDE}${foreign}` }, async ({ run }) => {
    await run((ctx) => {
      ctx.plan(castIdInComparisons(ctx, { ...CAST, columns: ["chats.id"] }));
      expect(ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "tests/aliased.test.ts")).getFullText()).toContain(`equals(chats.id, ${wrapped('"c9"')});`);
      expect(ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "tests/foreign.test.ts")).getFullText()).toBe(`${PRELUDE}${foreign}`);
    });
  });
});

test("a file outside every native world keeps its always-branded casts and gains no table or operator cast", async () => {
  const seed = `${PRELUDE}import { eq } from "drizzle-orm";\ndb.insert(chats).values({ id: "o1", chatId: "o2" });\neq(chats.id, "o3");\n`;
  const config = JSON.stringify({ compilerOptions: { module: "esnext", moduleResolution: "bundler", strict: true, noEmit: true }, exclude: ["tests/outside"] });
  const files = { ...DRIZZLE, "tsconfig.json": config, "tests/owned.test.ts": "export const owned = 1;\n", "tests/outside/seed.test.ts": seed };
  await withTree(files, async ({ run }) => {
    await run((ctx) => {
      ctx.plan(castIdInObjectLiterals(ctx, { ...CAST, alwaysProps: ["chatId"], tableScopedIdProps: [{ table: "chats", prop: "id" }] }));
      ctx.plan(castIdInComparisons(ctx, { ...CAST, columns: ["chats.id"] }));
      const text = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "tests/outside/seed.test.ts")).getFullText();
      expect(text).toContain(`db.insert(chats).values({ id: "o1", chatId: ${wrapped('"o2"')} });`);
      expect(text).toContain('eq(chats.id, "o3");');
    });
  });
});
