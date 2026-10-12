// verb: sessions.provisionIdentity — the owner row: OIDC owner-flip, the bind claim, handle rename and impostor refusals.
// @subject packages/server/src/domain/sessions/verbs/provision-identity.ts

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { logger } from "@orb/server/foundation/observability";
import { freshDb, freshHeldDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { makeService } from "../_support.ts";
import { asProvisioned, identity, PROVEN, rowCountOn } from "./_provision-identity-support.ts";

let db: Db;
let svc: SessionsService;

async function rowCount(): Promise<number> {
  return await rowCountOn(db);
}

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessions.provisionIdentity — OIDC owner-flip reconciliation (#8, D17/D135)", () => {
  test("an owner-by-policy OIDC login BINDS onto the existing unbound (single-user seeded) owner row — no second owner, no downgrade", async () => {
    // Seed the single-user/local owner: externalId null, handle 'owner', role owner (the seed/fallback shape).
    vi.stubEnv("OWNER_HANDLES", "owner");
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] }), PROVEN));
    expect(seeded.role).toBe("owner");
    expect(await rowCount()).toBe(1);

    // Flip to OIDC: the owner signs in via authentik with a DIFFERENT handle + a stable subject, owner-by-policy
    // through OWNER_GROUP (so it does NOT resolve to the seeded row by handle or externalId).
    vi.stubEnv("OWNER_GROUP", "owners");
    const oidc = asProvisioned(
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] }), PROVEN),
    );

    // Bound onto the SAME row — pre-fix this minted a second row and downgraded the OIDC owner to `user`.
    expect(oidc.userId).toBe(seeded.userId);
    expect(oidc.role).toBe("owner");
    expect(await rowCount()).toBe(1);
    const row = (await db.select().from(users).where(eq(users.id, seeded.userId)))[0];
    expect(row?.externalId).toBe("authentik|alex"); // subject bound → future logins key on it
    expect(row?.handle).toBe("owner"); // handle left as the OWNER_HANDLES key (re-seed / mode-flip idempotency)
    expect(row?.role).toBe("owner");
    expect((await db.select().from(users)).filter((u) => u.role === "owner")).toHaveLength(1);

    // A subsequent OIDC login now resolves the SAME row directly (by externalId → owner exemption).
    const again = asProvisioned(
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] }), PROVEN),
    );
    expect(again.userId).toBe(seeded.userId);
    expect(again.role).toBe("owner");
    expect(await rowCount()).toBe(1);
  });

  // The adopted owner row's handle is the `OWNER_HANDLES` SEED KEY — boot's `seedOwner` → `ensureUser` and the
  // auth seam's owner fallback both resolve the owner ROW through it. Pre-fix the SECOND login resolved by
  // externalId into the owner-exemption branch, whose `updateExisting` renamed the row to the IdP handle; the
  // next boot then found no row at "owner", its `insertUser` collided with `users_single_owner_unique`, and
  // `ensureUser` returned a PHANTOM id (see the cascade test in tests/legacy/server/entry/boot/seed-owner.int.test.ts).
  test("the adopted owner row keeps its OWNER_HANDLES handle across the 2nd login and N more (no IdP rename)", async () => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] }), PROVEN));
    vi.stubEnv("OWNER_GROUP", "owners");
    const oidc = identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] });

    /** One OIDC login → the owner row's handle afterwards (the value that must never drift). */
    async function loginAndReadHandle(): Promise<string | undefined> {
      const result = asProvisioned(await svc.provisionIdentity(oidc, PROVEN));
      expect(result.userId).toBe(seeded.userId);
      expect(result.role).toBe("owner");
      return (await db.select().from(users).where(eq(users.id, seeded.userId)))[0]?.handle;
    }

    expect(await loginAndReadHandle()).toBe("owner"); // #1 ADOPTS (binds the subject onto the seeded row)
    expect(await loginAndReadHandle()).toBe("owner"); // #2 — resolves by externalId into the owner exemption
    expect(await loginAndReadHandle()).toBe("owner"); // #3
    expect(await loginAndReadHandle()).toBe("owner"); // #4

    const row = (await db.select().from(users).where(eq(users.id, seeded.userId)))[0];
    expect(row?.externalId).toBe("authentik|alex");
    expect(row?.role).toBe("owner");
    expect(await rowCount()).toBe(1);
  });

  // The guard is scoped to the SEED KEY, not to "the owner is frozen forever": an operator who MOVES
  // OWNER_HANDLES is migrating the key, and the login lands the row back on the new one (so the next boot's
  // `ensureUser(ownerHandles()[0])` finds it instead of colliding).
  test("an owner row whose handle is NOT an OWNER_HANDLES key still tracks the IdP rename (key migration)", async () => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] }), PROVEN));
    vi.stubEnv("OWNER_GROUP", "owners");
    const oidc = identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] });
    await svc.provisionIdentity(oidc, PROVEN);
    // The operator moves the owner key to the IdP handle; the next login renames the row onto it.
    vi.stubEnv("OWNER_HANDLES", "alex");
    const migrated = asProvisioned(await svc.provisionIdentity(oidc, PROVEN));
    expect(migrated.userId).toBe(seeded.userId);
    const row = (await db.select().from(users).where(eq(users.id, seeded.userId)))[0];
    expect(row?.handle).toBe("alex");
    expect(row?.role).toBe("owner");
    expect(await rowCount()).toBe(1);
  });

  // #1451 — THE OWNER BIND IS A CLAIM, NOT AN UPDATE. `tryAdoptUnboundOwner` decides adoptability by READING
  // the owner row (`externalId === null`), and a read cannot hold a row unbound. Two concurrent owner-by-policy
  // logins carrying DIFFERENT stable subjects both passed that read; the bind was a plain `updateUser`, so the
  // second write silently overwrote `external_id` and BOTH callers were told they were the owner — the loser of
  // that write then had no way back into a box it had just been provisioned into, and the winner's ownership
  // depended on statement order. The bind now goes through `claimExternalIdIfUnbound`
  // (`UPDATE … WHERE external_id IS NULL`), the same primitive the admin link capability (B5) claims through,
  // so the DATABASE arbitrates and the loser gets the `account-exists` refusal rather than an adoption.
  describe("the owner-bind CLAIM race (#1451)", () => {
    /** Seed the single-user/local owner (unbound, handle = the OWNER_HANDLES key) on an explicit db. */
    async function seedUnboundOwner(service: SessionsService): Promise<string> {
      vi.stubEnv("OWNER_HANDLES", "owner");
      const seeded = asProvisioned(await service.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] }), PROVEN));
      expect(seeded.role).toBe("owner");
      return seeded.userId;
    }

    const alex = identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] });
    const bob = identity({ externalId: castId<ExternalId>("authentik|bob"), handle: castId<Handle>("bob"), groups: ["owners"] });

    test("two owner-policy logins with DIFFERENT subjects: exactly ONE binds, the loser is DENIED account-exists", async () => {
      const held = await freshHeldDb();
      const service = makeService(held.db).svc;
      const ownerId = await seedUnboundOwner(service);
      vi.stubEnv("OWNER_GROUP", "owners");
      const warn = vi.spyOn(logger, "warn");

      // Both logins park at their claim statement, so both have already read the row as UNBOUND — the exact
      // interleaving the read-then-write bind lost. Releasing lets SQLite serialize the two claims.
      const parked = held.hold(/update "users"/i, 2);
      const both = Promise.all([service.provisionIdentity(alex, PROVEN), service.provisionIdentity(bob, PROVEN)]);
      await parked.reached;
      parked.release();
      const results = await both;

      const outcomes = results.map((r) => r.outcome).sort();
      expect(outcomes).toEqual(["denied", "provisioned"]);
      expect(results.find((r) => r.outcome === "denied")).toEqual({ outcome: "denied", reason: "account-exists" });

      // The row is bound to the WINNER and to nobody else; the loser minted no second row and stole none.
      const rows = await held.db.select().from(users);
      expect(rows).toHaveLength(1);
      const bound = rows[0]?.externalId;
      expect(["authentik|alex", "authentik|bob"]).toContain(bound);
      expect(rows[0]?.id).toBe(ownerId);
      expect(rows[0]?.role).toBe("owner");
      // The winner's own result names the row it actually holds.
      const winner = results.find((r) => r.outcome === "provisioned");
      expect(winner).toMatchObject({ userId: ownerId, role: "owner" });

      // The refusal rides the security trail naming WHICH subject lost and which one holds the row.
      // @orb-waive no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
      const line = warn.mock.calls.map(([bindings]) => bindings as Record<string, unknown>).find((b) => b["event"] === "sso_owner_bind_lost_race");
      expect(line?.["security"]).toBe(true);
      expect(line?.["boundTo"]).toBe(bound);
      expect(line?.["externalId"]).not.toBe(bound);
    });

    // The idempotent arm: the claim loser whose SETTLED row already carries ITS OWN subject is the owner's
    // second concurrent login (or a retry), not a takeover — it must resolve onto the row, never be denied.
    test("two concurrent logins of the SAME owner subject both succeed onto the one row — no spurious deny", async () => {
      const held = await freshHeldDb();
      const service = makeService(held.db).svc;
      const ownerId = await seedUnboundOwner(service);
      vi.stubEnv("OWNER_GROUP", "owners");

      const parked = held.hold(/update "users"/i, 2);
      const both = Promise.all([service.provisionIdentity(alex, PROVEN), service.provisionIdentity(alex, PROVEN)]);
      await parked.reached;
      parked.release();
      const results = await both;

      expect(results.map((r) => r.outcome)).toEqual(["provisioned", "provisioned"]);
      for (const result of results) {
        expect(asProvisioned(result)).toMatchObject({ userId: ownerId, role: "owner" });
      }
      expect(await rowCountOn(held.db)).toBe(1);
    });

    // The UNCONTENDED arm (the good input, unchanged): the claim still binds, and the email refresh that now
    // rides a SECOND statement after the won claim still lands. Splitting the write is where that could have
    // been dropped silently.
    // D258: the handle-matched bind (the login reaches the unbound owner row BY HANDLE, not by adoption) is the same
    // claim and gets the same compare-and-swap. Both logins carry proof; only the database may pick the winner.
    test("two PROVEN logins matching the unbound owner row by handle, with different subjects: exactly ONE binds", async () => {
      const held = await freshHeldDb();
      const service = makeService(held.db).svc;
      const ownerId = await seedUnboundOwner(service);
      const first = identity({ externalId: castId<ExternalId>("authentik|first"), handle: castId<Handle>("owner"), groups: [] });
      const second = identity({ externalId: castId<ExternalId>("authentik|second"), handle: castId<Handle>("owner"), groups: [] });

      const parked = held.hold(/update "users"/i, 2);
      const both = Promise.all([service.provisionIdentity(first, PROVEN), service.provisionIdentity(second, PROVEN)]);
      await parked.reached;
      parked.release();
      const results = await both;

      expect(results.map((r) => r.outcome).sort()).toEqual(["denied", "provisioned"]);
      expect(results.find((r) => r.outcome === "denied")).toEqual({ outcome: "denied", reason: "account-exists" });
      const rows = await held.db.select().from(users);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: ownerId, role: "owner", handle: "owner" });
      const winner = results.find((r) => r.outcome === "provisioned");
      expect(winner).toMatchObject({ userId: ownerId, role: "owner" });
      // The row carries the winner's subject; the loser was told it is not bound.
      const winnerSubject = winner === results[0] ? "authentik|first" : "authentik|second";
      expect(rows[0]?.externalId).toBe(winnerSubject);
    });

    test("the uncontended adoption still binds AND still refreshes the email claim", async () => {
      vi.stubEnv("OWNER_HANDLES", "owner");
      const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] }), PROVEN));
      vi.stubEnv("OWNER_GROUP", "owners");
      const adopted = asProvisioned(await svc.provisionIdentity({ ...alex, email: "alex@example.test" }, PROVEN));
      expect(adopted.userId).toBe(seeded.userId);
      expect(adopted.role).toBe("owner");
      const row = (await db.select().from(users).where(eq(users.id, seeded.userId)))[0];
      expect(row?.externalId).toBe("authentik|alex");
      expect(row?.email).toBe("alex@example.test");
      expect(await rowCount()).toBe(1);
    });
  });

  // The owner claim needs proof: the oidc callback passes `ownerClaimProven:false` for a login from off the box
  // with no boot claim code, and a handle match to OWNER_HANDLES alone must then bind, adopt and create nothing.
  describe("an unproven OWNER_HANDLES claim takes nothing", () => {
    const unproven = { ownerClaimProven: false } as const;
    const stranger = identity({ externalId: castId<ExternalId>("authentik|stranger"), handle: castId<Handle>("owner"), groups: [] });

    function claimWarn(calls: readonly (readonly unknown[])[]): Record<string, unknown> | undefined {
      // @orb-waive no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
      return calls.map(([bindings]) => bindings as Record<string, unknown>).find((b) => b["event"] === "sso_owner_claim_unproven");
    }

    test("on a box flipped from single-user, the unbound owner row stays unbound", async () => {
      vi.stubEnv("OWNER_HANDLES", "owner");
      const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] }), PROVEN));
      const warn = vi.spyOn(logger, "warn");
      expect(await svc.provisionIdentity(stranger, unproven)).toEqual({ outcome: "denied" });
      const row = (await db.select().from(users).where(eq(users.id, seeded.userId)))[0];
      expect(row?.externalId).toBeNull();
      expect(row?.role).toBe("owner");
      expect(await rowCount()).toBe(1);
      expect(claimWarn(warn.mock.calls)).toMatchObject({ security: true, handle: "owner", externalId: "authentik|stranger" });
    });

    test("on a fresh oidc box with no owner row, no owner row is created", async () => {
      vi.stubEnv("OWNER_HANDLES", "owner");
      expect(await svc.provisionIdentity(stranger, { ...unproven, allowJitProvision: true })).toEqual({ outcome: "denied" });
      expect(await rowCount()).toBe(0);
    });

    test("with proof the same login binds the unbound owner row", async () => {
      vi.stubEnv("OWNER_HANDLES", "owner");
      const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] }), PROVEN));
      const claimed = asProvisioned(await svc.provisionIdentity(stranger, { ownerClaimProven: true }));
      expect(claimed).toMatchObject({ userId: seeded.userId, role: "owner" });
      expect((await db.select().from(users).where(eq(users.id, seeded.userId)))[0]?.externalId).toBe("authentik|stranger");
    });

    test("an OWNER_GROUP member still binds the unbound owner row with no proof from the caller", async () => {
      vi.stubEnv("OWNER_HANDLES", "owner");
      const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] }), PROVEN));
      vi.stubEnv("OWNER_GROUP", "owners");
      const member = identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] });
      expect(asProvisioned(await svc.provisionIdentity(member, unproven))).toMatchObject({ userId: seeded.userId, role: "owner" });
      expect((await db.select().from(users).where(eq(users.id, seeded.userId)))[0]?.externalId).toBe("authentik|alex");
    });
  });

  test("once the owner is BOUND, another OWNER_GROUP member does NOT adopt it — downgraded to `user` (singleton holds)", async () => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner") }), PROVEN));
    vi.stubEnv("OWNER_GROUP", "owners");
    await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] }), PROVEN);
    // The owner row is now BOUND (externalId set) → a different member is NOT adopted; the singleton downgrades it.
    const other = asProvisioned(
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|bob"), handle: castId<Handle>("bob"), groups: ["owners"] }), PROVEN),
    );
    expect(other.role).toBe("user");
    expect(other.userId).not.toBe(seeded.userId);
    expect((await db.select().from(users)).filter((u) => u.role === "owner")).toHaveLength(1);
  });
});

// THE HANDLE FALLBACK BINDS, IT NEVER REBINDS. `findExisting` falls back to `handle` so a pre-existing
// UNBOUND row (single-user/local) gets linked to its SSO subject on first login. Applied to an already-BOUND
// row it is an account takeover: the attacker only needs the victim's stored handle in the IdP, and
// `updateExisting` would move `external_id` onto their subject — locking the victim out of their own row.
// D258: boot's seedOwner resolves the owner row by the OWNER_HANDLES seed key, so a member row holding that key becomes
// the owner at the next mode flip. A member's IdP rename onto the key, or a look-alike of it, keeps the old handle.
describe("sessions.provisionIdentity — a member's IdP rename onto the owner seed key is refused", () => {
  test.each(["owner", "Owner", "0wner"])("an unclaimed box: a member renamed at the IdP to %j keeps its handle and role", async (renamed) => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const member = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("alice") }), PROVEN));
    const warn = vi.spyOn(logger, "warn");
    const again = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>(renamed) }), PROVEN));
    expect(again).toMatchObject({ userId: member.userId, role: "user", identityChanged: false });
    const row = (await db.select().from(users).where(eq(users.id, member.userId)))[0];
    expect(row?.handle).toBe("alice");
    expect(row?.role).toBe("user");
    // @orb-waive no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
    const line = warn.mock.calls.map(([bindings]) => bindings as Record<string, unknown>).find((b) => b["event"] === "sso_rename_onto_reserved_handle");
    expect(line).toMatchObject({ security: true, userId: member.userId });
  });

  // The JIT insert is the other writer of a new handle. A look-alike is not an exact OWNER_HANDLES match, so it is no
  // owner claim, but its row would hold the seed key: the owner's own claim would then meet `users_handle_key_unique`.
  test.each(["Owner", "OWNER", "0wner"])("an unclaimed box: a stranger signing in as %j creates no row, and the owner still claims", async (lookalike) => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const stranger = identity({ externalId: castId<ExternalId>("authentik|stranger"), handle: castId<Handle>(lookalike) });
    expect(await svc.provisionIdentity(stranger, { ownerClaimProven: false, allowJitProvision: true })).toEqual({ outcome: "denied" });
    expect(await rowCount()).toBe(0);
    const owner = identity({ externalId: castId<ExternalId>("authentik|owner"), handle: castId<Handle>("owner") });
    expect(asProvisioned(await svc.provisionIdentity(owner, PROVEN))).toMatchObject({ role: "owner" });
  });

  test("control: the same member's IdP rename to an ordinary handle still lands", async () => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const member = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("alice") }), PROVEN));
    await svc.provisionIdentity(identity({ handle: castId<Handle>("alicia") }), PROVEN);
    expect((await db.select().from(users).where(eq(users.id, member.userId)))[0]?.handle).toBe("alicia");
  });
});

describe("sessions.provisionIdentity — a handle match onto a BOUND row is an impostor, not a rename", () => {
  test("OWNER takeover: a different subject presenting the owner's handle is DENIED (row untouched)", async () => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] }), PROVEN));
    vi.stubEnv("OWNER_GROUP", "owners");
    // The real owner adopts the row with their stable subject.
    await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] }), PROVEN);

    // mallory registers the (now stable, publicly guessable) OWNER_HANDLES handle in the IdP and signs in.
    const attack = await svc.provisionIdentity(
      identity({ externalId: castId<ExternalId>("authentik|mallory"), handle: castId<Handle>("owner"), groups: ["owners"] }),
      PROVEN,
    );

    expect(attack.outcome).toBe("denied");
    const row = (await db.select().from(users).where(eq(users.id, seeded.userId)))[0];
    expect(row?.externalId).toBe("authentik|alex");
    expect(row?.handle).toBe("owner");
    expect(row?.role).toBe("owner");
    expect(await rowCount()).toBe(1);
  });

  test("USER takeover: a different subject presenting a bound user's handle is DENIED (row untouched)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const victim = asProvisioned(
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alice"), handle: castId<Handle>("alice") }), PROVEN),
    );

    // alice renames herself in the IdP; our row still stores "alice", so the username is free to be re-taken.
    const attack = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|mallory"), handle: castId<Handle>("alice") }), PROVEN);

    expect(attack.outcome).toBe("denied");
    const row = (await db.select().from(users).where(eq(users.id, victim.userId)))[0];
    expect(row?.externalId).toBe("authentik|alice");
    expect(await rowCount()).toBe(1);
  });

  test("MS-W1: a NON-OWNER unbound row is NOT auto-bound on a handle match — HARD-DENIED (admin links via B5)", async () => {
    // Owner-ruled 2026-08-09: auto-linking a subject onto an existing row by the mutable handle IS the W1
    // takeover. A non-owner unbound row reached by a subject-bearing handle match is DENIED, not bound — the
    // row stays unbound until an admin links it with the stable subject (admin.linkSsoIdentity).
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const local = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("alice") }), PROVEN));
    const attempt = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alice"), handle: castId<Handle>("alice") }), PROVEN);
    expect(attempt.outcome).toBe("denied");
    const row = (await db.select().from(users).where(eq(users.id, local.userId)))[0];
    expect(row?.externalId).toBeNull(); // NOT auto-linked
    expect(await rowCount()).toBe(1); // no duplicate minted
  });
});
