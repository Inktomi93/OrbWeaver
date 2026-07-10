// Self-test for the DORMANT `no-untyped-soft-ref` gate (scripts/check/gates/no-untyped-soft-ref.ts —
// D24 typed-FK / the sole audit_logs.entityId soft-ref; held out of ALL_CHECKS pending doc reconciliation).
// Proves: an id-shaped column with no `.references()` fires, a column WITH an FK passes, an allowlisted
// no-FK column passes, and the stale-arm (an allowlisted pair that gains an FK) is RED.
import { createNoUntypedSoftRef } from "../../scripts/check/gates/no-untyped-soft-ref.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const SCHEMA = "packages/db/src/schema/thing.ts";

function table(sqlName: string, cols: string): string {
  return `export const t = sqliteTable("${sqlName}", { ${cols} });\n`;
}

test("fires on an id-shaped column with no .references() FK", () => {
  const gate = createNoUntypedSoftRef({});
  const v = gate.run(ctxFor({ [SCHEMA]: table("widgets", 'chatId: text("chat_id")') }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D24");
});

test("passes an id column carrying a .references() FK", () => {
  const gate = createNoUntypedSoftRef({});
  const cols = 'chatId: text("chat_id").references(() => chats.id)';
  expect(gate.run(ctxFor({ [SCHEMA]: table("widgets", cols) }))).toEqual([]);
});

test("passes an allowlisted no-FK id column", () => {
  const gate = createNoUntypedSoftRef({ "audit_logs.entityId": "the sole soft ref" });
  const v = gate.run(ctxFor({ [SCHEMA]: table("audit_logs", 'entityId: text("entity_id")') }));
  expect(v).toEqual([]);
});

test("ignores a primary-key id and a non-id column", () => {
  const gate = createNoUntypedSoftRef({});
  const cols = 'id: text("id").primaryKey(), name: text("name")';
  expect(gate.run(ctxFor({ [SCHEMA]: table("widgets", cols) }))).toEqual([]);
});

test("ratchet stale-arm: an allowlisted pair that now has an FK is RED", () => {
  const gate = createNoUntypedSoftRef({ "audit_logs.entityId": "stale" });
  const cols = 'entityId: text("entity_id").references(() => x.id)';
  const v = gate.run(ctxFor({ [SCHEMA]: table("audit_logs", cols) }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});
