// verb: detachFromChat (PD-30) — idempotent removal under the INJECTED host gate. Load-bearing: only a REAL
// removal emits `wiBookDetached` + audits (`detached:false` is silent); the book owner is NOT re-checked
// (host authority over room config — a prior host's book stays cleanable after a handoff).

import { chatBooks } from "@orb/db";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedChat, seedUser } from "../../_support.ts";

describe("detachFromChat", () => {
  test("removes the join (idempotent) — ONE wiBookDetached emit + ONE audit on the real removal", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, { requireChatHost: () => Promise.resolve() });
    const svc = createWorldInfoService(harness.ctx);
    const host = await seedUser(db, { handle: "host" });
    const chatId = await seedChat(db);
    const book = await svc.createBook({ principal: principal(host), input: { name: "B" } });
    await svc.attachToChat({ principal: principal(host), chatId, bookId: book.id });

    const first = await svc.detachFromChat({ principal: principal(host), chatId, bookId: book.id });
    const again = await svc.detachFromChat({ principal: principal(host), chatId, bookId: book.id });

    expect(first).toEqual({ detached: true });
    expect(again).toEqual({ detached: false });
    expect(await db.select().from(chatBooks)).toHaveLength(0);
    // attach emitted once; the ONE real detach emitted once; the no-op detach was silent.
    expect(harness.wiEvents).toEqual([
      { type: "wiBookAttached", chatId, surface: "chat", bookId: book.id },
      { type: "wiBookDetached", chatId, surface: "chat", bookId: book.id },
    ]);
    expect(
      harness.audits.filter((a) => a.entry.action === "worldInfo.detachFromChat"),
    ).toHaveLength(1);
  });

  test("a NON-owned attached book is still detachable by the host (room authority, not book ownership)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, { requireChatHost: () => Promise.resolve() });
    const svc = createWorldInfoService(harness.ctx);
    const host = await seedUser(db, { handle: "host" });
    const other = await seedUser(db, { handle: "other" });
    const chatId = await seedChat(db);
    // Attached under the OTHER user's authority (e.g. the pre-handoff host).
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "T" } });
    await svc.attachToChat({ principal: principal(other), chatId, bookId: theirs.id });

    const out = await svc.detachFromChat({ principal: principal(host), chatId, bookId: theirs.id });
    expect(out).toEqual({ detached: true });
    expect(await db.select().from(chatBooks)).toHaveLength(0);
  });

  test("a chat-guard rejection propagates — nothing removed, no emit", async () => {
    const db = await freshDb();
    const refusal = new Error("not_host");
    // Grant the FIRST guard call (the seeding attach); refuse every later one (the detach under test).
    let guardCalls = 0;
    const harness = makeHarness(db, {
      requireChatHost: (): Promise<void> => {
        guardCalls += 1;
        return guardCalls === 1 ? Promise.resolve() : Promise.reject(refusal);
      },
    });
    const svc = createWorldInfoService(harness.ctx);
    const host = await seedUser(db, { handle: "host" });
    const chatId = await seedChat(db);
    const book = await svc.createBook({ principal: principal(host), input: { name: "B" } });
    await svc.attachToChat({ principal: principal(host), chatId, bookId: book.id });
    harness.wiEvents.length = 0;
    await expect(
      svc.detachFromChat({ principal: principal(host), chatId, bookId: book.id }),
    ).rejects.toBe(refusal);
    expect(await db.select().from(chatBooks)).toHaveLength(1);
    expect(harness.wiEvents).toEqual([]);
  });
});
