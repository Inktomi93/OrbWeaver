// B5 — the bind-once linking CAPABILITY (domain/sessions), now the PAIR a caller commits: the unexecuted
// claim `linkExternalIdStatement` and the settlement read `settleUnclaimedLink` (#1707). Proves the identity
// invariant it enforces (spine U1 — the ONE externalId-linking site): the claim BINDS an unbound row, and
// every non-binding case is named from SETTLED durable state — idempotent re-link, unknown row, a row bound
// to a DIFFERENT subject (bind-once), and a subject already held by ANOTHER row (the unique index is the
// arbiter). No write escapes on a refusal, and a rejection durable state cannot explain is RETHROWN rather
// than laundered into an identity outcome. The admin gate + the audited batch that commits the claim live in
// the admin verb (tested separately).

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

const EXT_A = castId<ExternalId>("authentik|aaa");
const EXT_B = castId<ExternalId>("authentik|bbb");
const T = 1_700_000_000_000;

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

async function seedRow(id: string, handle: Handle, externalId: ExternalId | null): Promise<UserId> {
  const uid = castId<UserId>(id);
  await db.insert(users).values({
    id: uid,
    handle,
    externalId,
    role: "user",
    enabled: true,
    createdAt: T,
    updatedAt: T,
  });
  return uid;
}

async function externalIdOf(id: UserId): Promise<string | null> {
  const row = (await db.select({ externalId: users.externalId }).from(users).where(eq(users.id, id)))[0];
  return row?.externalId ?? null;
}

/** What the ADMIN caller does, minus its audit statement: run the claim, and when it bound nothing ask
 *  durable state why. Spelled out here rather than hidden in a helper because the ORDER is the contract —
 *  the claim first, the explanation only after it settled. */
async function claimThenSettle(userId: UserId, externalId: ExternalId): Promise<{ readonly outcome: string; readonly userId?: UserId }> {
  const bound = await svc.linkExternalIdStatement(userId, externalId, T);
  const first = bound[0];
  if (first !== undefined) {
    return { outcome: "linked", userId: first.id };
  }
  return await svc.settleUnclaimedLink(userId, externalId);
}

describe("sessions link capability — the bind-once claim + its settlement (B5, #1707)", () => {
  test("BINDS an unbound row: the claim RETURNS the row and externalId is stamped", async () => {
    const id = await seedRow("user_a", castId<Handle>("alice"), null);
    const bound = await svc.linkExternalIdStatement(id, EXT_A, T);
    expect(bound).toEqual([{ id }]);
    expect(await externalIdOf(id)).toBe(EXT_A);
  });

  test("the claim is UNEXECUTED until it is awaited — building it writes nothing", async () => {
    const id = await seedRow("user_a", castId<Handle>("alice"), null);
    // The whole point of the statement seam: admin hands this to its own `db.batch` beside the audit insert,
    // so merely BUILDING it must not touch the row (otherwise the bind could outlive a failed audit).
    svc.linkExternalIdStatement(id, EXT_A, T);
    expect(await externalIdOf(id)).toBeNull();
  });

  test("idempotent: re-claiming the SAME subject binds nothing and settles `already-linked`", async () => {
    const id = await seedRow("user_a", castId<Handle>("alice"), EXT_A);
    expect(await claimThenSettle(id, EXT_A)).toEqual({ outcome: "already-linked", userId: id });
    expect(await externalIdOf(id)).toBe(EXT_A);
  });

  test("not-found: an unknown row id binds nothing and settles `not-found`", async () => {
    expect(await claimThenSettle(castId<UserId>("user_ghost"), EXT_A)).toEqual({ outcome: "not-found" });
  });

  test("REFUSES rebinding a row already bound to a DIFFERENT subject (bind-once) — row untouched", async () => {
    const id = await seedRow("user_a", castId<Handle>("alice"), EXT_A);
    expect(await claimThenSettle(id, EXT_B)).toEqual({ outcome: "target-bound" });
    // The existing binding is NOT overwritten — the claim's own `external_id IS NULL` matched nothing.
    expect(await externalIdOf(id)).toBe(EXT_A);
  });

  test("REFUSES a subject already bound to ANOTHER row (duplicate binding) — target untouched", async () => {
    await seedRow("user_a", castId<Handle>("alice"), EXT_A);
    const b = await seedRow("user_b", castId<Handle>("bob"), null);
    // The claim REJECTS here (`users_external_id_unique` is the arbiter, not a pre-read), and the settlement
    // converts that rejection into the typed refusal.
    await expect(svc.linkExternalIdStatement(b, EXT_A, T)).rejects.toThrow();
    expect(await svc.settleUnclaimedLink(b, EXT_A, new Error("unique violation"))).toEqual({ outcome: "subject-taken" });
    expect(await externalIdOf(b)).toBeNull();
  });

  test("a failure durable state cannot explain is RETHROWN, never laundered into an identity outcome", async () => {
    // The bindable case: the row exists, is unbound, and nobody holds the subject — so a rejection did NOT
    // come from the identity invariant. This is the path a failed audit insert riding the caller's batch
    // takes, and turning it into a refusal code would report an identity decision that never happened.
    const id = await seedRow("user_a", castId<Handle>("alice"), null);
    const failure = new Error("audit_logs FK violation");
    await expect(svc.settleUnclaimedLink(id, EXT_A, failure)).rejects.toBe(failure);
  });

  test("two concurrent unbound targets converge on one durable subject holder with a typed loser", async () => {
    const a = await seedRow("user_a", castId<Handle>("alice"), null);
    const b = await seedRow("user_b", castId<Handle>("bob"), null);

    // Both claims are issued before either is settled — the database arbitrates, no read holds a row unbound.
    const claims = await Promise.allSettled([svc.linkExternalIdStatement(a, EXT_A, T), svc.linkExternalIdStatement(b, EXT_A, T)]);
    const outcomes = await Promise.all(
      claims.map(async (claim, index) => {
        const target = index === 0 ? a : b;
        if (claim.status === "fulfilled" && claim.value.length > 0) {
          return "linked";
        }
        const settled = await svc.settleUnclaimedLink(target, EXT_A, claim.status === "rejected" ? claim.reason : undefined);
        return settled.outcome;
      }),
    );

    expect([...outcomes].sort()).toEqual(["linked", "subject-taken"]);
    const holders = await db.select({ id: users.id }).from(users).where(eq(users.externalId, EXT_A));
    expect(holders).toHaveLength(1);
    expect(holders[0]?.id).toBe(outcomes[0] === "linked" ? a : b);
  });
});
