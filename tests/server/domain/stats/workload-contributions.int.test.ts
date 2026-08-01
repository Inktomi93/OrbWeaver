// Contribution test: `reconcile-stats`. The contribution calls the domain's OWN `reconcileStats` rebuild
// directly (no injected env hub), so this is an .int over a real db: it pins the SCOPE resolution the
// contribution owns — a SINGULAR row (ownerId set) reconciles that one owner, a BULK row (ownerId null)
// sweeps every owner — plus the projection into `ReconcileStatsWorkloadResult`.

import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { beforeEach, describe, vi } from "vitest";
import { createStatsWorkloadContributions } from "../../../../packages/server/src/domain/stats/workload-contributions.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { seedCharacter, seedChat, seedMessage, seedUser, T0 } from "./_support.ts";

let db: Db;
let ownerId: UserId;
let characterId: CharacterId;

const sig = (): AbortSignal => new AbortController().signal;

function contribution(database: Db): ReturnType<typeof createStatsWorkloadContributions>[0] {
  const [only] = createStatsWorkloadContributions({ db: database, now: () => T0 });
  return only;
}

function ctxFor(owner: UserId | null): WorkloadRunContext {
  return { userId: ownerId, ownerId: owner, now: () => T0 };
}

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
  characterId = await seedCharacter(db, ownerId, { name: "Aria" });
  const chatId = await seedChat(db, characterId);
  await seedMessage(db, { chatId, seq: 0, role: "user", variants: [{ content: "hello there" }] });
  await seedMessage(db, {
    chatId,
    seq: 1,
    role: "assistant",
    characterId,
    variants: [{ content: "hi", model: "m", provider: "p", tokensIn: 10, tokensOut: 4 }],
  });
});

describe("reconcile-stats contribution", () => {
  test("a SINGULAR row rebuilds THAT owner's rollups and projects the counts", async () => {
    const result = await contribution(db).run(ctxFor(ownerId), {}, vi.fn(), sig());
    expect(result.owners).toBe(1);
    expect(result.characters).toBeGreaterThanOrEqual(1);
  });

  test("a BULK row (ownerId null) sweeps every owner, not just the acting one", async () => {
    const second = await seedUser(db, "user_other", "user");
    const otherCharacter = await seedCharacter(db, second, { id: "character_b", name: "Bo" });
    const otherChat = await seedChat(db, otherCharacter, { id: "chat_b" });
    await seedMessage(db, { chatId: otherChat, seq: 0, role: "user", variants: [{ content: "yo" }] });

    const singular = await contribution(db).run(ctxFor(ownerId), {}, vi.fn(), sig());
    expect(singular.owners).toBe(1);

    const bulk = await contribution(db).run(ctxFor(null), {}, vi.fn(), sig());
    expect(bulk.owners).toBe(2);
  });

  test("declares the sweep lane + idempotent-restart resume policy", () => {
    const only = contribution(db);
    expect(only.kind).toBe("reconcile-stats");
    expect(only.lane).toBe("sweep");
    expect(only.resume).toBe("idempotent-restart");
  });
});
