import { join } from "node:path";
import { TABLE_SCOPING } from "@orb/db/tenancy";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/membership-write-fan";
const VERB = "packages/server/src/domain/databank/verbs/attach/probe.ts";

async function findings(source: string, path = VERB): Promise<readonly Linter.LintMessage[]> {
  const config = await new ESLint({ cwd: ROOT }).calculateConfigForFile(join(ROOT, path));
  const messages = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      plugins: config.plugins,
      settings: config.settings,
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages.filter(({ ruleId }) => ruleId === RULE);
}

const ATTACH =
  'import { chatDocuments } from "@orb/db";\nexport function attach(ctx: C) {\n  return async ({ ownerId, chatId, documentId }: P) => {\n    await ctx.db.insert(chatDocuments).values({ chatId, documentId }).returning({ documentId: chatDocuments.documentId });\n    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });\n  };\n}\n';

const FLAGGED: readonly { readonly source: string; readonly token: string; readonly why: string }[] = [
  { source: ATTACH, token: "emitUserEvent", why: "the founding shape: a room-visible attach announced only to its actor" },
  {
    source:
      'import * as schema from "@orb/db"; export async function write(ctx, id) { await ctx.db["insert"](schema["chatDocuments"])["values"]({ chatId: id }); ctx.emitUserEvent("owner", { type: "databankChanged" }); }\n',
    token: "emitUserEvent",
    why: "static brackets on the namespace, the write verb and the chain",
  },
  {
    source:
      'import * as schema from "@orb/db"; export async function write(ctx, id) { await ctx.db["update"](schema["chatDocuments"])["set"]({ chatId: id }); ctx.emitUserEvent("owner", { type: "databankChanged" }); }\n',
    token: "emitUserEvent",
    why: "the update verb in static brackets",
  },
  {
    source:
      'import * as schema from "@orb/db"; export async function write(ctx, id) { await ctx.db["delete"](schema["chatDocuments"])["where"](id); ctx.emitUserEvent("owner", { type: "databankChanged" }); }\n',
    token: "emitUserEvent",
    why: "the delete verb in static brackets",
  },
  {
    source:
      'import * as schema from "@orb/db"; export async function write(ctx, id) { await ctx.db.update(schema.chatDocuments).set({ chatId: id }); ctx?.emitUserEvent("owner", { type: "databankChanged" }); }\n',
    token: "emitUserEvent",
    why: "the update verb through a namespace member and an optional-call emit",
  },
  {
    source:
      'import { chatDocuments as rack } from "@orb/db";\nexport async function detach(ctx, chatId) {\n  await ctx.db.delete(rack).where(eq(rack.chatId, chatId));\n  ctx.emitUserEvent("owner", { type: "databankChanged" });\n}\n',
    token: "emitUserEvent",
    why: "the delete verb through an import alias: renaming the local binding cannot change the table's class",
  },
  {
    source: ATTACH.replace(
      'ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId })',
      'ctx.emitNotification(ownerId, { kind: "databank-attached" })',
    ),
    token: "emitNotification",
    why: "the durable inbox is the second per-person channel",
  },
  {
    source: ATTACH.replace("    ctx.emitUserEvent(", '    void ctx.fanDatabankRoomsForDocument("doc");\n    ctx.emitUserEvent('),
    token: "emitUserEvent",
    why: "an unawaited document fan cannot certify that co-member invalidation completed",
  },
];

const ACQUITTED: readonly { readonly source: string; readonly why: string; readonly path?: string }[] = [
  {
    source: ATTACH.replace("    ctx.emitUserEvent(", "    ctx.emitRoomDatabankChanged(chatId);\n    ctx.emitUserEvent("),
    why: "a room fan beside the per-person emit",
  },
  {
    source: ATTACH.replace("    ctx.emitUserEvent(", '    await ctx["fanDatabankRoomsForDocument"]("doc");\n    ctx.emitUserEvent('),
    why: "an awaited document room fan",
  },
  {
    source:
      'import { characterDocuments } from "@orb/db";\nexport async function attach(ctx, characterId, documentId) {\n  await ctx.db.insert(characterDocuments).values({ characterId, documentId });\n  ctx.emitUserEvent("owner", { type: "databankChanged" });\n}\n',
    why: "a junction on a single-owned card: the per-person emit reaches the one human who can see it",
  },
  {
    source: 'import * as schema from "@orb/db"; export function drop(ctx) { ctx.cache["delete"](schema["chatDocuments"]); ctx.emitUserEvent("owner", {}); }\n',
    why: "a chain-free cache delete is not a drizzle write",
  },
  {
    source:
      'import { chatDocuments } from "@orb/db";\nexport async function purge(db, chatId) {\n  return db.delete(chatDocuments).where(eq(chatDocuments.chatId, chatId));\n}\n',
    why: "a membership write with no emit at all is the per-domain freshness question",
  },
  {
    source:
      'export function attach(ctx) {\n  return async ({ ownerId, table, row }) => {\n    await ctx.db.insert(table).values(row);\n    ctx.emitUserEvent(ownerId, { type: "databankChanged" });\n  };\n}\n',
    why: "an unresolvable write target is outside this rule",
  },
];

// The first config load builds the whole flat config, so it carries the cold-start cost.
test("the membership class set is the schema registry's membership rows", { timeout: scaledBudget(60_000) }, async () => {
  const config = await new ESLint({ cwd: ROOT }).calculateConfigForFile(join(ROOT, VERB));
  const membership = Object.entries(TABLE_SCOPING)
    .filter(([, row]) => row.scope === "membership")
    .map(([name]) => name);
  expect(membership).toContain("chatDocuments");
  expect(config.settings["orb/membership-tables"]).toEqual(membership);
});

test("native membership-write-fan flags every actor-only spelling and acquits every shared-plane shape", async () => {
  for (const row of FLAGGED) {
    const messages = await findings(row.source);
    expect(messages, row.why).toHaveLength(1);
    const [message] = messages;
    const line = row.source.split("\n")[(message?.line ?? 0) - 1] ?? "";
    expect(line.slice((message?.column ?? 1) - 1).startsWith(row.token), row.why).toBe(true);
  }
  for (const row of ACQUITTED) {
    expect(await findings(row.source, row.path), row.why).toEqual([]);
  }
});

test("the rule owns server domains outside the chat domain only", async () => {
  const eslint = new ESLint({ cwd: ROOT });
  for (const path of [VERB, "packages/server/src/domain/regex/verbs/attachments/probe.ts", "packages/server/src/domain/databank/persistence/probe.ts"]) {
    expect((await eslint.calculateConfigForFile(join(ROOT, path))).rules[RULE], path).toEqual([2]);
  }
  for (const path of ["packages/server/src/domain/chat/verbs/probe.ts", "packages/server/src/transport/trpc/probe.ts", "packages/client/src/probe.ts"]) {
    expect((await eslint.calculateConfigForFile(join(ROOT, path))).rules[RULE], path).toBeUndefined();
  }
});
