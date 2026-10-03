// Persistence: automation_rules query functions directly (the verbs wrap these). Pins position ordering,
// the total reorder (chat-scoped), and the lazy-parse fault isolation of `toRuleView`.

import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { describe } from "vitest";
import {
  applyReorder,
  insertRule,
  insertRuleForCreationRequest,
  insertRules,
  listRuleIdsForChat,
  listRuleRowsForChat,
  listRuleRowsForOwnerGlobal,
  selectRuleByCreationRequest,
  selectRuleRow,
  selectRuleRowsByIds,
  toRuleView,
} from "../../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FIXED_NOW_MS, seedHostChat, seedUser } from "../_support.ts";

const SET_ARM = { type: "set_variable" as const, scope: "chat" as const, key: "k", op: "set" as const, value: "v" };

/** One planned rule. `position` is NOT a parameter — the INSERT allocates it from the scope (#1427), so a
 *  fixture's ORDER is what decides its position, exactly as a caller's is. */
function plannedRule(opts: { ownerId: UserId; chatId: ChatId | null; name: string }): Parameters<typeof insertRule>[1] {
  return {
    id: mintTypeId("automation_rule"),
    ownerId: opts.ownerId,
    creationRequestId: null,
    chatId: opts.chatId,
    name: opts.name,
    description: null,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    predicateCel: null,
    actions: [SET_ARM],
    rulePresetId: null,
    rulePresetKnobs: null,
    matchAutomationEvents: false,
    cooldownSeconds: 0,
    maxFiresPerHour: 30,
    timeZone: UTC_TIME_ZONE,
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  };
}

async function seedRule(db: Parameters<typeof insertRule>[0], opts: { ownerId: UserId; chatId: ChatId; name: string }): Promise<AutomationRuleId> {
  const planned = plannedRule(opts);
  await insertRule(db, planned);
  return planned.id;
}

describe("automation_rules persistence", () => {
  test("birth conflict targets only owner/request; NULL legacy keys and other owners remain independent", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const other = await seedUser(db, "other");
    const request = mintTypeId(ID_PREFIX.automationRuleCreation);
    const first = { ...plannedRule({ ownerId: owner, chatId: null, name: "private marker" }), creationRequestId: request };
    expect(await insertRuleForCreationRequest(db, first)).toBe(true);
    expect(await insertRuleForCreationRequest(db, { ...first, id: mintTypeId(ID_PREFIX.automationRule), name: "not an edit" })).toBe(false);
    const otherBirth = { ...plannedRule({ ownerId: other, chatId: null, name: "other owner" }), creationRequestId: request };
    expect(await insertRuleForCreationRequest(db, otherBirth)).toBe(true);
    expect(await selectRuleByCreationRequest(db, owner, request, null)).toMatchObject({ id: first.id, name: first.name });
    expect(await selectRuleByCreationRequest(db, other, request, null)).toMatchObject({ id: otherBirth.id, name: otherBirth.name });
    await insertRules(db, [plannedRule({ ownerId: owner, chatId: null, name: "legacy a" }), plannedRule({ ownerId: owner, chatId: null, name: "legacy b" })]);
    expect((await listRuleRowsForOwnerGlobal(db, owner)).map((row) => row.creationRequestId)).toEqual([request, null, null]);
  });

  test("birth recovery cannot turn PK, FK or CHECK failures into a successful conflict loser", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const row = { ...plannedRule({ ownerId: owner, chatId: null, name: "existing" }), creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation) };
    expect(await insertRuleForCreationRequest(db, row)).toBe(true);
    await expect(insertRuleForCreationRequest(db, { ...row, creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation) })).rejects.toThrow();
    await expect(
      insertRuleForCreationRequest(db, {
        ...row,
        id: mintTypeId(ID_PREFIX.automationRule),
        creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation),
        ownerId: castId<UserId>("missing-owner"),
      }),
    ).rejects.toThrow();
    await expect(
      insertRuleForCreationRequest(db, {
        ...row,
        id: mintTypeId(ID_PREFIX.automationRule),
        creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation),
        name: "n".repeat(121),
      }),
    ).rejects.toThrow();
    expect(await listRuleRowsForOwnerGlobal(db, owner)).toHaveLength(1);
  });

  test("SQL exact-set global reorder scopes both admission and writes to the owner and preserves rejected rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const other = await seedUser(db, "other");
    const a = plannedRule({ ownerId: owner, chatId: null, name: "a" });
    const b = plannedRule({ ownerId: owner, chatId: null, name: "b" });
    const foreign = plannedRule({ ownerId: other, chatId: null, name: "foreign marker" });
    await insertRules(db, [a, b, foreign]);
    const before = await selectRuleRowsByIds(db, [a.id, b.id, foreign.id]);
    expect(await applyReorder(db, { chatId: null, ownerId: owner }, [b.id, foreign.id], FIXED_NOW_MS + 1)).toBe(false);
    expect(await selectRuleRowsByIds(db, [a.id, b.id, foreign.id])).toEqual(before);
    expect(await applyReorder(db, { chatId: null, ownerId: owner }, [b.id, a.id], FIXED_NOW_MS + 1)).toBe(true);
    expect((await listRuleRowsForOwnerGlobal(db, owner)).map((row) => [row.id, row.position])).toEqual([
      [b.id, 0],
      [a.id, 1],
    ]);
    expect(await selectRuleRow(db, foreign.id)).toEqual(before.find((row) => row.id === foreign.id));
    expect(await applyReorder(db, { chatId: null, ownerId: owner }, [], FIXED_NOW_MS + 2)).toBe(false);
    const emptyOwner = await seedUser(db, "empty");
    expect(await applyReorder(db, { chatId: null, ownerId: emptyOwner }, [], FIXED_NOW_MS + 2)).toBe(true);
  });

  test("concurrent complete reorder statements never leave a mixed order", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const rows = ["a", "b", "c"].map((name) => plannedRule({ ownerId: owner, chatId: null, name }));
    await insertRules(db, rows);
    const ids = rows.map((row) => row.id);
    expect(
      await Promise.all([
        applyReorder(db, { chatId: null, ownerId: owner }, ids, FIXED_NOW_MS + 1),
        applyReorder(db, { chatId: null, ownerId: owner }, ids.toReversed(), FIXED_NOW_MS + 2),
      ]),
    ).toEqual([true, true]);
    const current = await listRuleRowsForOwnerGlobal(db, owner);
    expect([ids, ids.toReversed()]).toContainEqual(current.map((row) => row.id));
    expect(current.map((row) => row.position)).toEqual([0, 1, 2]);
    expect(new Set(current.map((row) => row.updatedAt)).size).toBe(1);
  });
  test("insertRule forces enabled=false and ALLOCATES position from the scope — the first rule lands at 0", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const first = await seedRule(db, { ownerId: owner, chatId, name: "a" });
    const second = await seedRule(db, { ownerId: owner, chatId, name: "b" });
    const row = await selectRuleRow(db, first);
    expect(row?.enabled).toBe(false);
    expect(row?.position).toBe(0);
    expect((await selectRuleRow(db, second))?.position).toBe(1);
  });

  // #1427 — the allocation is a subquery ON the INSERT, so it cannot be interleaved with by a concurrent
  // create the way a JS `max+1` read followed by a separate write can be.
  test("CONCURRENT creates in one scope get DISTINCT positions — the allocation is atomic with the write", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);

    // A real interleaving: five inserts issued together against one db, none awaited before the next starts.
    await Promise.all(["a", "b", "c", "d", "e"].map((name) => insertRule(db, plannedRule({ ownerId: owner, chatId, name }))));

    const rows = await listRuleRowsForChat(db, chatId);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.position).toSorted((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]);
  });

  test("positions are PER SCOPE — a second owner's global lane starts at 0, not past the first owner's", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const other = await seedUser(db, "other");
    await insertRule(db, plannedRule({ ownerId: owner, chatId: null, name: "mine-1" }));
    await insertRule(db, plannedRule({ ownerId: owner, chatId: null, name: "mine-2" }));
    const theirs = plannedRule({ ownerId: other, chatId: null, name: "theirs" });
    await insertRule(db, theirs);

    expect((await selectRuleRowsByIds(db, [theirs.id]))[0]?.position).toBe(0);
  });

  test("insertRules commits a SET in one batch, at ascending positions off one snapshot", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    await seedRule(db, { ownerId: owner, chatId, name: "existing" });

    const set = [
      plannedRule({ ownerId: owner, chatId, name: "set-1" }),
      plannedRule({ ownerId: owner, chatId, name: "set-2" }),
      plannedRule({ ownerId: owner, chatId, name: "set-3" }),
    ];
    await insertRules(db, set);

    // Each statement in the batch sees the ones before it, so the set continues the scope's order.
    const rows = await selectRuleRowsByIds(
      db,
      set.map((rule) => rule.id),
    );
    expect(rows.map((r) => r.name)).toEqual(["set-1", "set-2", "set-3"]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  test("insertRules is ALL-OR-NOTHING — one refused member leaves NONE of the set behind", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const already = plannedRule({ ownerId: owner, chatId, name: "already" });
    await insertRule(db, already);

    // The third member re-uses a committed id, so the db refuses it. The two ahead of it are in the same
    // batch — the whole statement list rolls back with it.
    const set = [
      plannedRule({ ownerId: owner, chatId, name: "set-1" }),
      plannedRule({ ownerId: owner, chatId, name: "set-2" }),
      { ...already, name: "collides" },
    ];
    await expect(insertRules(db, set)).rejects.toThrow();

    const rows = await listRuleRowsForChat(db, chatId);
    expect(rows.map((r) => r.name)).toEqual(["already"]);
  });

  test("applyReorder rewrites position as a total order; listRuleRowsForChat reads it", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const a = await seedRule(db, { ownerId: owner, chatId, name: "a" });
    const b = await seedRule(db, { ownerId: owner, chatId, name: "b" });
    await applyReorder(db, { chatId }, [b, a], FIXED_NOW_MS);
    const rows = await listRuleRowsForChat(db, chatId);
    expect(rows.map((r) => r.name)).toEqual(["b", "a"]);
  });

  test("toRuleView lazy-parses actions, degrading a corrupt blob to []", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const id = await seedRule(db, { ownerId: owner, chatId, name: "good" });
    const good = await selectRuleRow(db, id);
    expect(good).toBeDefined();
    if (good === undefined) {
      return;
    }
    // A hand-built corrupt row projects to [] without throwing (an arm shape zod can't parse).
    const corrupt = { ...good, actions: [{ not: "an arm" }] };
    expect(toRuleView(good).actions).toEqual([SET_ARM]);
    expect(toRuleView(corrupt).actions).toEqual([]);
    // #1422 — the empty list is FLAGGED, not fabricated. Without this a rule nothing can read projects
    // identically to a rule whose author has not added an arm yet: same `[]`, same `enabled: true`, same
    // clean error ledger (the disable-on-corrupt is dispatch-time), so the management surface reads it as
    // benign until an event happens to arrive.
    expect(toRuleView(corrupt).actionsCorrupt).toBe(true);
    expect(toRuleView(good).actionsCorrupt).toBe(false);
    // The fault isolation itself is unchanged: nothing threw, and every other field passes through.
    expect(toRuleView(corrupt).enabled).toBe(good.enabled);
  });

  // #1429's read — the reorder verb's totality check compares against the chat's COMPLETE current id set.
  test("listRuleIdsForChat returns exactly that chat's rule ids, and no other chat's", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const chatId = await seedHostChat(db, owner);
    const otherChat = await seedHostChat(db, owner, "other");
    const a = await seedRule(db, { ownerId: owner, chatId, name: "a" });
    const b = await seedRule(db, { ownerId: owner, chatId, name: "b" });
    await seedRule(db, { ownerId: owner, chatId: otherChat, name: "elsewhere" });

    expect((await listRuleIdsForChat(db, chatId)).toSorted()).toEqual([a, b].toSorted());
    expect(await listRuleIdsForChat(db, otherChat)).toHaveLength(1);
  });
});
