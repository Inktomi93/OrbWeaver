// domain/automation/persistence/migrate-plugin-tool-wire-names — the #1391 rewrite of the `run_tool` arm's
// `name` inside `automation_rules.actions`, against a real libSQL db (the .int lane).
//
// The statement algebra it shares with its chat twin (per-index `json_set`, the loop, fail-open) is pinned at
// tests/server/domain/chat/persistence/migrate-plugin-tool-wire-names.int.test.ts. What THIS file exists for
// is the one difference: the ARM FILTER. `actions` is a heterogeneous arm list where `name` means something
// else on other arms, so a prefix-only predicate would silently rewrite an unrelated arm's field — the exact
// class of defect the `open-json-column` rule warns about. Both halves are asserted: a `run_tool` arm IS
// rewritten, and a non-`run_tool` arm carrying an identical `name` string is NOT.

import type { Db } from "@orb/db";
import { automationRules } from "@orb/db";
import type { AutomationRuleId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { migratePluginToolWireNames } from "@orb/server/domain/automation";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const RULE_ID = castId<AutomationRuleId>("arule_wirenames00000000001");
const AT = 1_700_000_000_000;
const RENAME = [{ from: "plugin_oracle_deck_", to: "plugin_oracle__deck_" }];

async function seedRule(db: Db, actions: readonly Record<string, unknown>[]): Promise<UserId> {
  const user = await seedUser(db, { handle: castId<Handle>("alice") });
  await db.insert(automationRules).values({
    id: RULE_ID,
    ownerId: user.id,
    chatId: null,
    name: "draw on entry",
    position: 0,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    actions: [...actions],
    createdAt: AT,
    updatedAt: AT,
  });
  return user.id;
}

async function readActions(db: Db): Promise<readonly Record<string, unknown>[]> {
  const rows = await db
    .select({ blob: sql<string | null>`cast(${automationRules.actions} as text)` })
    .from(automationRules)
    .where(eq(automationRules.id, RULE_ID));
  return JSON.parse(rows.at(0)?.blob ?? "[]") as Record<string, unknown>[];
}

test("a `run_tool` arm naming a legacy plugin tool is re-prefixed, and its sibling fields survive", async () => {
  const db = await freshDb();
  await seedRule(db, [{ type: "run_tool", name: "plugin_oracle_deck_draw", argsTemplate: '{"suit":"cups"}', resultScope: "chat" }]);

  expect(await migratePluginToolWireNames(db, RENAME)).toBe(1);

  expect(await readActions(db)).toEqual([{ type: "run_tool", name: "plugin_oracle__deck_draw", argsTemplate: '{"suit":"cups"}', resultScope: "chat" }]);
});

test("THE ARM FILTER: a non-`run_tool` arm carrying the identical `name` string is NEVER touched", async () => {
  // `name` is not a tool reference on every arm — a prefix-only predicate would rewrite this and silently
  // corrupt a rule the migration has no business reading.
  const db = await freshDb();
  await seedRule(db, [
    { type: "set_variable", name: "plugin_oracle_deck_draw", scope: "chat", value: "x" },
    { type: "run_tool", name: "plugin_oracle_deck_reveal", argsTemplate: "{}", resultScope: "chat" },
  ]);

  expect(await migratePluginToolWireNames(db, RENAME)).toBe(1);

  expect(await readActions(db)).toEqual([
    { type: "set_variable", name: "plugin_oracle_deck_draw", scope: "chat", value: "x" },
    { type: "run_tool", name: "plugin_oracle__deck_reveal", argsTemplate: "{}", resultScope: "chat" },
  ]);
});

test("every matching arm in one rule is rewritten, in order, and the pass is IDEMPOTENT", async () => {
  const db = await freshDb();
  await seedRule(db, [
    { type: "run_tool", name: "plugin_oracle_deck_draw", argsTemplate: "{}", resultScope: "chat" },
    { type: "run_tool", name: "plugin_mood_report", argsTemplate: "{}", resultScope: "chat" },
    { type: "run_tool", name: "plugin_oracle_deck_reveal", argsTemplate: "{}", resultScope: "chat" },
  ]);

  expect(await migratePluginToolWireNames(db, RENAME)).toBe(2);
  expect(await migratePluginToolWireNames(db, RENAME)).toBe(0);

  expect((await readActions(db)).map((arm) => arm["name"])).toEqual(["plugin_oracle__deck_draw", "plugin_mood_report", "plugin_oracle__deck_reveal"]);
});

test("PLANTED NEGATIVE CONTROL: an EMPTY rename set leaves a legacy arm exactly as it was", async () => {
  const db = await freshDb();
  await seedRule(db, [{ type: "run_tool", name: "plugin_oracle_deck_draw", argsTemplate: "{}", resultScope: "chat" }]);

  expect(await migratePluginToolWireNames(db, [])).toBe(0);

  expect((await readActions(db)).map((arm) => arm["name"])).toEqual(["plugin_oracle_deck_draw"]);
});
