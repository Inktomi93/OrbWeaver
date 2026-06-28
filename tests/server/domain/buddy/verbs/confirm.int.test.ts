// verb: confirm — the SOLE executor of a proposed action (buddy.md invariant #3). Pins: a propose tool
// alone mutates NOTHING (only confirm does); confirm executes both proposal kinds (rename → row write,
// workload → injected env op); the agencyEnabled kill switch + the hourly rate-limit gate every mutation;
// cancel/expiry apply nothing. The propose path runs through the real `ask` (the harness simulates the
// model calling the tool).

import { buddies } from "@orb/db";
import { DomainConflictError } from "@orb/kit/errors";
import { createBuddyService } from "@orb/server/domain/buddy";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

async function proposeRename(
  svc: ReturnType<typeof createBuddyService>,
  h: ReturnType<typeof makeHarness>,
  owner: Parameters<typeof principal>[0],
  newName: string,
): Promise<string> {
  h.setToolCall({ name: "propose_rename", args: { newName } });
  const res = await svc.ask({ principal: principal(owner), message: "rename" });
  h.setToolCall(null);
  return res.proposal?.id ?? "";
}

describe("confirm — the sole executor", () => {
  test("a propose tool ALONE mutates nothing; only confirm renames", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });
    const proposalId = await proposeRename(svc, h, owner, "Zigzag");

    // After the propose (the agent turn), the name is UNCHANGED — nothing executed yet.
    const before = await db.select().from(buddies).where(eq(buddies.userId, owner));
    expect(before[0]?.name).not.toBe("Zigzag");

    const result = await svc.confirm({ principal: principal(owner), proposalId, confirmed: true });
    expect(result.applied).toBe(true);
    const after = await db.select().from(buddies).where(eq(buddies.userId, owner));
    expect(after[0]?.name).toBe("Zigzag");
  });

  test("cancelling (confirmed:false) applies nothing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });
    const proposalId = await proposeRename(svc, h, owner, "Zigzag");

    const result = await svc.confirm({ principal: principal(owner), proposalId, confirmed: false });
    expect(result.applied).toBe(false);
    const row = await db.select().from(buddies).where(eq(buddies.userId, owner));
    expect(row[0]?.name).not.toBe("Zigzag");
  });

  test("an unknown / expired proposal id applies nothing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });

    const result = await svc.confirm({
      principal: principal(owner),
      proposalId: "nope",
      confirmed: true,
    });
    expect(result.applied).toBe(false);
    expect(result.detail).toContain("expired");
  });

  test("the kill switch gates a confirmed mutation (hands off → not applied)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });
    const proposalId = await proposeRename(svc, h, owner, "Zigzag");
    await svc.setAgency({ principal: principal(owner), enabled: false });

    const result = await svc.confirm({ principal: principal(owner), proposalId, confirmed: true });
    expect(result.applied).toBe(false);
    expect(result.detail).toContain("switched off");
  });

  test("the workload arm calls the injected env op; a single-active conflict is caught", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });

    h.setToolCall({ name: "propose_workload", args: { kind: "embed-corpus" } });
    const res = await svc.ask({ principal: principal(owner), message: "embed my stuff" });
    h.setToolCall(null);
    const proposalId = res.proposal?.id ?? "";

    const ok = await svc.confirm({ principal: principal(owner), proposalId, confirmed: true });
    expect(ok.applied).toBe(true);
    expect(h.startWorkloadCalls).toEqual([{ ownerId: owner, kind: "embed-corpus" }]);

    // A second proposal that collides with a running job → caught into a friendly, not-applied detail.
    h.setToolCall({ name: "propose_workload", args: { kind: "embed-corpus" } });
    const res2 = await svc.ask({ principal: principal(owner), message: "again" });
    h.setToolCall(null);
    h.setStartWorkloadError(new DomainConflictError("already running"));
    const conflict = await svc.confirm({
      principal: principal(owner),
      proposalId: res2.proposal?.id ?? "",
      confirmed: true,
    });
    expect(conflict.applied).toBe(false);
    expect(conflict.detail).toContain("already");
  });

  test("the hourly rate-limit refuses mutations past the budget", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_rl" });
    await svc.hatch({ principal: principal(owner) });

    // 12 confirmed renames are allowed; the 13th in the same hour is refused.
    let lastApplied = false;
    for (let i = 0; i < 13; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: the rate-limit window is stateful — each confirm must run AFTER the prior one to spend the budget in order (Promise.all would race).
      const proposalId = await proposeRename(svc, h, owner, `Name${i}`);
      const result = await svc.confirm({
        principal: principal(owner),
        proposalId,
        confirmed: true,
      });
      lastApplied = result.applied;
    }
    expect(lastApplied).toBe(false);
  });
});
