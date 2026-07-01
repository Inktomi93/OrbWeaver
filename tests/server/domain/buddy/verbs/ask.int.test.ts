// verb: ask — the agent-mode composition. Pins: the agentTurn runs via the INJECTED op (no second agent
// system); THE FIREWALL (no chatId on the request + the buddy writes buddy_turns, NEVER chat messages);
// the agencyEnabled kill switch; the resolved-connection pieces + the derived context cap; the proposal
// surface; and owner-scoping.

import { messages } from "@orb/db";
import { createBuddyService } from "@orb/server/domain/buddy";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

const CONTEXT_CAP = Math.floor(32_768 * 0.85);

describe("ask", () => {
  test("runs the turn via the injected agentTurn and persists user + assistant lines (buddy_turns)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });
    h.setTurnText("hello from your buddy");

    const result = await svc.ask({ principal: principal(owner), message: "hi" });

    expect(result.reply).toBe("hello from your buddy");
    expect(h.turns).toHaveLength(1);
    const turns = await svc.history({ principal: principal(owner) });
    expect(turns.map((t) => [t.role, t.text])).toEqual([
      ["you", "hi"],
      ["buddy", "hello from your buddy"],
    ]);
  });

  test("THE FIREWALL: the agent request has no chatId and the buddy writes ZERO chat messages", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });

    await svc.ask({ principal: principal(owner), message: "hi" });

    expect(Object.keys(h.turns[0] ?? {})).not.toContain("chatId");
    const chatMessages = await db.select().from(messages);
    expect(chatMessages).toHaveLength(0);
  });

  test("the agencyEnabled kill switch: hands off → no turn runs at all", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });
    await svc.setAgency({ principal: principal(owner), enabled: false });

    const result = await svc.ask({ principal: principal(owner), message: "do a thing" });

    expect(h.turns).toHaveLength(0);
    expect(result.reply).toContain("switched off");
  });

  test("passes the resolved credential + model + the descriptor-derived context cap to the turn", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });

    await svc.ask({ principal: principal(owner), message: "hi" });

    const req = h.turns[0];
    expect(req?.credential.source).toBe("vllm");
    expect(req?.model).toBe("claude-haiku-4-5");
    expect(req?.maxContextTokens).toBe(CONTEXT_CAP);
  });

  test("surfaces a proposal when a propose_* tool fired during the turn", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });
    h.setToolCall({ name: "propose_rename", args: { newName: "Sparkle" } });

    const result = await svc.ask({ principal: principal(owner), message: "rename yourself" });

    expect(result.proposal?.kind).toBe("rename");
    expect(result.proposal?.summary).toContain("Sparkle");
  });

  test("owner-scoping: the transcript is scoped to the acting principal", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const alice = await seedUser(db, { id: "user_a" });
    const bob = await seedUser(db, { id: "user_b" });
    await svc.hatch({ principal: principal(alice) });
    await svc.hatch({ principal: principal(bob) });

    await svc.ask({ principal: principal(alice), message: "alice talks" });

    expect(await svc.history({ principal: principal(bob) })).toHaveLength(0);
    expect(await svc.history({ principal: principal(alice) })).toHaveLength(2);
  });
});
