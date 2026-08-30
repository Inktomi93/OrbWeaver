// engine/lore-write — the ONE rule→world-info write belt (CC-D). Pins: the consent gate splits on scope
// (chat attachment vs owner-global book ownership), NEITHER substitutes for the other, the per-rule
// ≤64-entries-per-book cap counts only NET-NEW titles, and every written title is ruleId-namespaced
// (`auto/<ruleId>:<key>`) — the idempotency handle a re-upsert relies on.

import type { Db } from "@orb/db";
import { chatBooks, worldBooks, worldEntries } from "@orb/db";
import type { AutomationRuleId, UserId, WorldBookId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import type { AutomationOps } from "@orb/server/domain/automation";
import { describe } from "vitest";
import { applyRuleLoreWrite } from "../../../../../packages/server/src/domain/automation/engine/lore-write.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { ruleFixture, seedUser } from "../_support.ts";

async function seedBook(db: Db, ownerId: UserId): Promise<WorldBookId> {
  const id = mintTypeId("world_book");
  await db.insert(worldBooks).values({ id, ownerId, name: "book" });
  return id;
}

type UpsertEntriesArgs = Parameters<AutomationOps["worldInfo"]["upsertEntries"]>[0];

/** A capturing `worldInfo.upsertEntries` swapped over the fixture's real ops — every other op is left as the
 *  shared harness's default. */
function capturingOps(base: AutomationOps): { ops: AutomationOps; calls: UpsertEntriesArgs[] } {
  const calls: UpsertEntriesArgs[] = [];
  const ops: AutomationOps = {
    ...base,
    worldInfo: {
      upsertEntries: (args): Promise<{ inserted: number; updated: number; skippedHandEdited: number }> => {
        calls.push(args);
        return Promise.resolve({ inserted: args.entries.length, updated: 0, skippedHandEdited: 0 });
      },
    },
  };
  return { ops, calls };
}

describe("chat-scoped consent (the attachment IS the room's consent)", () => {
  test("an attached book accepts the write, title-namespaced by the rule", async () => {
    const fixture = await ruleFixture();
    const bookId = await seedBook(fixture.db, fixture.host);
    await fixture.db.insert(chatBooks).values({ chatId: fixture.chatId, worldBookId: bookId });
    const ruleId = mintTypeId("automation_rule") as AutomationRuleId;
    const { ops, calls } = capturingOps(fixture.ctx.ops);

    const result = await applyRuleLoreWrite(
      { db: fixture.db, ops },
      { authorUserId: fixture.host, chatId: fixture.chatId, ruleId, bookId, entries: [{ entryKey: "k1", keys: ["trigger"], content: "text" }] },
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.entries[0]?.title).toBe(`auto/${ruleId}:k1`);
  });

  test("a book NOT attached to the chat is refused — room consent is re-read, never trusted from the mint", async () => {
    const fixture = await ruleFixture();
    const bookId = await seedBook(fixture.db, fixture.host);
    const ruleId = mintTypeId("automation_rule") as AutomationRuleId;
    const { ops, calls } = capturingOps(fixture.ctx.ops);

    const result = await applyRuleLoreWrite(
      { db: fixture.db, ops },
      { authorUserId: fixture.host, chatId: fixture.chatId, ruleId, bookId, entries: [{ entryKey: "k1", keys: [], content: "text" }] },
    );

    expect(result).toMatchObject({ ok: false, refused: expect.stringContaining("not attached") });
    expect(calls).toHaveLength(0);
  });
});

describe("owner-global consent (a library write into the author's OWN book — D23)", () => {
  test("a book the author OWNS accepts the write", async () => {
    const fixture = await ruleFixture();
    const bookId = await seedBook(fixture.db, fixture.host);
    const ruleId = mintTypeId("automation_rule") as AutomationRuleId;
    const { ops, calls } = capturingOps(fixture.ctx.ops);

    const result = await applyRuleLoreWrite(
      { db: fixture.db, ops },
      { authorUserId: fixture.host, chatId: null, ruleId, bookId, entries: [{ entryKey: "k1", keys: [], content: "text" }] },
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
  });

  test("a book the author does NOT own is refused, even if it is attached to one of their chats", async () => {
    const fixture = await ruleFixture();
    const stranger = await seedUser(fixture.db, "user_stranger");
    const bookId = await seedBook(fixture.db, stranger);
    await fixture.db.insert(chatBooks).values({ chatId: fixture.chatId, worldBookId: bookId });
    const ruleId = mintTypeId("automation_rule") as AutomationRuleId;
    const { ops, calls } = capturingOps(fixture.ctx.ops);

    // Attachment is the CHAT gate, not the owner-global one — a null chatId must still refuse.
    const result = await applyRuleLoreWrite(
      { db: fixture.db, ops },
      { authorUserId: fixture.host, chatId: null, ruleId, bookId, entries: [{ entryKey: "k1", keys: [], content: "text" }] },
    );

    expect(result).toMatchObject({ ok: false, refused: expect.stringContaining("owns") });
    expect(calls).toHaveLength(0);
  });
});

test("the per-rule ≤64-entries cap counts only NET-NEW titles — an update of an owned title never grows the count", async () => {
  const fixture = await ruleFixture();
  const bookId = await seedBook(fixture.db, fixture.host);
  await fixture.db.insert(chatBooks).values({ chatId: fixture.chatId, worldBookId: bookId });
  const ruleId = mintTypeId("automation_rule") as AutomationRuleId;
  // Pre-seed 64 owned entries for this rule.
  await fixture.db.insert(worldEntries).values(
    Array.from({ length: 64 }, (_, i) => ({
      id: mintTypeId("world_entry"),
      worldBookId: bookId,
      title: `auto/${ruleId}:seed${i}`,
      content: "x",
    })),
  );
  const { ops: opsA, calls: callsA } = capturingOps(fixture.ctx.ops);

  // Re-upserting an EXISTING title stays within the cap.
  const update = await applyRuleLoreWrite(
    { db: fixture.db, ops: opsA },
    { authorUserId: fixture.host, chatId: fixture.chatId, ruleId, bookId, entries: [{ entryKey: "seed0", keys: [], content: "y" }] },
  );
  expect(update).toEqual({ ok: true });
  expect(callsA).toHaveLength(1);

  const { ops: opsB, calls: callsB } = capturingOps(fixture.ctx.ops);
  // A genuinely NEW title breaches the cap and is refused.
  const overflow = await applyRuleLoreWrite(
    { db: fixture.db, ops: opsB },
    { authorUserId: fixture.host, chatId: fixture.chatId, ruleId, bookId, entries: [{ entryKey: "brand-new", keys: [], content: "y" }] },
  );
  expect(overflow).toMatchObject({ ok: false, refused: expect.stringContaining("64") });
  expect(callsB).toHaveLength(0);
});
