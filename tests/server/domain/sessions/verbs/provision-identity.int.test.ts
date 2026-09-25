import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { userConnections, users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { logger } from "@orb/server/foundation/observability";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

const EXTERNAL = castId<ExternalId>("authentik|abc-123");

let db: Db;
let svc: SessionsService;

function identity(over: Partial<ResolvedIdentity> = {}): ResolvedIdentity {
  return {
    externalId: EXTERNAL,
    handle: castId<Handle>("alice"),
    groups: [],
    email: null,
    ...over,
  };
}

type ProvisionOut = Awaited<ReturnType<SessionsService["provisionIdentity"]>>;
type Provisioned = Extract<ProvisionOut, { outcome: "provisioned" }>;

/** Narrow a provision result to the `provisioned` arm (fails the test loudly on `denied`). */
function asProvisioned(result: ProvisionOut): Provisioned {
  if (result.outcome !== "provisioned") {
    throw new Error(`expected provisioned, got ${result.outcome}`);
  }
  return result;
}

async function rowCount(): Promise<number> {
  return await rowCountOn(db);
}

/** `rowCount` against an explicit handle — the race tests below drive their own held db. */
async function rowCountOn(on: Db): Promise<number> {
  return (await on.select().from(users)).length;
}

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessions.provisionIdentity — INSERT (first SSO login) + JIT", () => {
  test("creates an enabled user keyed on externalId; default role user", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const result = asProvisioned(await svc.provisionIdentity(identity()));
    expect(result.enabled).toBe(true);
    expect(result.role).toBe("user");
    const row = (await db.select().from(users).where(eq(users.id, result.userId)))[0];
    expect(row?.externalId).toBe(EXTERNAL);
    expect(row?.handle).toBe("alice");
  });

  test("seeds owner from OWNER_GROUP membership on insert", async () => {
    vi.stubEnv("OWNER_GROUP", "owners");
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] })));
    expect(result.role).toBe("owner");
  });

  test("JIT-creates an admin from OIDC_ADMIN_GROUPS membership (group→admin, D17 via IdP)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const before = await rowCount();
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] })));
    expect(result.role).toBe("admin");
    expect(await rowCount()).toBe(before + 1);
  });

  test("a SECOND owner-group member provisions as `user` — the D17 singleton, not a UNIQUE crash", async () => {
    vi.stubEnv("OWNER_GROUP", "owners");
    const first = asProvisioned(
      await svc.provisionIdentity(
        identity({
          externalId: castId<ExternalId>("authentik|alice"),
          handle: castId<Handle>("alice"),
          groups: ["owners"],
        }),
      ),
    );
    expect(first.role).toBe("owner");
    const second = asProvisioned(
      await svc.provisionIdentity(
        identity({
          externalId: castId<ExternalId>("authentik|bob"),
          handle: castId<Handle>("bob"),
          groups: ["owners"],
        }),
      ),
    );
    expect(second.role).toBe("user");
    const bobRow = (await db.select().from(users).where(eq(users.id, second.userId)))[0];
    expect(bobRow?.role).toBe("user");
    const owners = (await db.select().from(users)).filter((u) => u.role === "owner");
    expect(owners).toHaveLength(1);
  });

  test("the SAME owner re-logging in keeps owner (singleton reconcile excludes its own row)", async () => {
    vi.stubEnv("OWNER_GROUP", "owners");
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] })));
    expect(first.role).toBe("owner");
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] })));
    expect(again.role).toBe("owner");
  });
});

// #2481 — the SSO/JIT first login is the second user-create site the local-light convenience seed rides
// (inference program §7.2 / §5.3b). Before this the seed was a boot sweep only, so every account provisioned
// after the listener bound resolved `embed`/`rerank` to `no-connection` until the next restart. The seed is an
// INJECTED op (`domain/sessions` may not import `domain/connection`), runs only once the row has SETTLED, and
// never runs for a login the gate refuses.
describe("sessions.provisionIdentity — the new account's vector floor (#2481)", () => {
  test("a first SSO login seeds the local-light rows", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const result = asProvisioned(await svc.provisionIdentity(identity()));
    expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, result.userId))).toHaveLength(2);
  });

  test("a DENIED login seeds nothing (no row to seed for)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "Orb Users");
    expect((await svc.provisionIdentity(identity({ groups: ["outsiders"] }))).outcome).toBe("denied");
    expect(await db.select().from(userConnections)).toHaveLength(0);
  });

  test("a RETURNING user's login re-seeds nothing new", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const first = asProvisioned(await svc.provisionIdentity(identity()));
    await svc.provisionIdentity(identity());
    expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, first.userId))).toHaveLength(2);
  });
});

describe("sessions.provisionIdentity — OIDC_ALLOWED_GROUPS login gate (fail-closed)", () => {
  test("gate UNSET ⇒ any authenticated identity is allowed (backward-compat)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const result = await svc.provisionIdentity(identity({ groups: ["whatever"] }));
    expect(result.outcome).toBe("provisioned");
  });

  test("in NONE of the allowed groups ⇒ DENIED, and NO row is created (JIT refused)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "Orb Users");
    const before = await rowCount();
    const result = await svc.provisionIdentity(identity({ groups: ["outsiders"] }));
    expect(result.outcome).toBe("denied");
    // Fail-closed: a denied login never provisions a tenant row.
    expect(await rowCount()).toBe(before);
  });

  test("in an allowed group ⇒ provisioned as user", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "Orb Users");
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Users"] })));
    expect(result.role).toBe("user");
  });

  test("an admin-group member passes the gate implicitly (not separately allow-listed)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "Orb Users");
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] })));
    expect(result.role).toBe("admin");
  });

  test("an EXISTING user removed from all allowed groups is denied next login (row survives)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "Orb Users");
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Users"] })));
    expect(first.role).toBe("user");
    const again = await svc.provisionIdentity(identity({ groups: ["outsiders"] }));
    expect(again.outcome).toBe("denied");
    // The row is not deleted — the user simply can't authenticate.
    expect(await rowCount()).toBe(1);
  });
});

describe("sessions.provisionIdentity — the OWNER exemption invariant (D17)", () => {
  test("the owner is NEVER denied by the allowed-groups gate, even in no allowed group", async () => {
    // alice is the owner (OWNER_HANDLES) and the gate is set to a group she is NOT in.
    vi.stubEnv("OWNER_HANDLES", "alice");
    const seed = asProvisioned(await svc.provisionIdentity(identity({ groups: [] })));
    expect(seed.role).toBe("owner");
    // Now turn the gate on; alice is in NONE of the allowed groups → still allowed, still owner.
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "Orb Users");
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: [] })));
    expect(again.outcome).toBe("provisioned");
    expect(again.role).toBe("owner");
  });

  test("the owner is NEVER re-derived downward even with governance active + no matching group", async () => {
    // Seed the owner by handle, then flip to a config where the owner matches NO group and governance is on.
    vi.stubEnv("OWNER_HANDLES", "alice");
    const seed = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] })));
    expect(seed.role).toBe("owner");
    // OWNER_GROUP now points elsewhere; OIDC_ADMIN_GROUPS active ⇒ re-derive on. The owner row must stay owner.
    vi.stubEnv("OWNER_HANDLES", undefined);
    vi.stubEnv("OWNER_GROUP", "different-owners");
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Users"] })));
    expect(again.role).toBe("owner");
    const owners = (await db.select().from(users)).filter((u) => u.role === "owner");
    expect(owners).toHaveLength(1);
  });
});

describe("sessions.provisionIdentity — OIDC owner-flip reconciliation (#8, D17/D135)", () => {
  test("an owner-by-policy OIDC login BINDS onto the existing unbound (single-user seeded) owner row — no second owner, no downgrade", async () => {
    // Seed the single-user/local owner: externalId null, handle 'owner', role owner (the seed/fallback shape).
    vi.stubEnv("OWNER_HANDLES", "owner");
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] })));
    expect(seeded.role).toBe("owner");
    expect(await rowCount()).toBe(1);

    // Flip to OIDC: the owner signs in via authentik with a DIFFERENT handle + a stable subject, owner-by-policy
    // through OWNER_GROUP (so it does NOT resolve to the seeded row by handle or externalId).
    vi.stubEnv("OWNER_GROUP", "owners");
    const oidc = asProvisioned(
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] })),
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
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] })),
    );
    expect(again.userId).toBe(seeded.userId);
    expect(again.role).toBe("owner");
    expect(await rowCount()).toBe(1);
  });

  // The adopted owner row's handle is the `OWNER_HANDLES` SEED KEY — boot's `seedOwner` → `ensureUser` and the
  // auth seam's owner fallback both resolve the owner ROW through it. Pre-fix the SECOND login resolved by
  // externalId into the owner-exemption branch, whose `updateExisting` renamed the row to the IdP handle; the
  // next boot then found no row at "owner", its `insertUser` collided with `users_single_owner_unique`, and
  // `ensureUser` returned a PHANTOM id (see the cascade test in tests/server/entry/boot/seed-owner.int.test.ts).
  test("the adopted owner row keeps its OWNER_HANDLES handle across the 2nd login and N more (no IdP rename)", async () => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] })));
    vi.stubEnv("OWNER_GROUP", "owners");
    const oidc = identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] });

    /** One OIDC login → the owner row's handle afterwards (the value that must never drift). */
    async function loginAndReadHandle(): Promise<string | undefined> {
      const result = asProvisioned(await svc.provisionIdentity(oidc));
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
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] })));
    vi.stubEnv("OWNER_GROUP", "owners");
    const oidc = identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] });
    await svc.provisionIdentity(oidc);
    // The operator moves the owner key to the IdP handle; the next login renames the row onto it.
    vi.stubEnv("OWNER_HANDLES", "alex");
    const migrated = asProvisioned(await svc.provisionIdentity(oidc));
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
      const seeded = asProvisioned(await service.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] })));
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
      const both = Promise.all([service.provisionIdentity(alex), service.provisionIdentity(bob)]);
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
      const both = Promise.all([service.provisionIdentity(alex), service.provisionIdentity(alex)]);
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
    test("the uncontended adoption still binds AND still refreshes the email claim", async () => {
      vi.stubEnv("OWNER_HANDLES", "owner");
      const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] })));
      vi.stubEnv("OWNER_GROUP", "owners");
      const adopted = asProvisioned(await svc.provisionIdentity({ ...alex, email: "alex@example.test" }));
      expect(adopted.userId).toBe(seeded.userId);
      expect(adopted.role).toBe("owner");
      const row = (await db.select().from(users).where(eq(users.id, seeded.userId)))[0];
      expect(row?.externalId).toBe("authentik|alex");
      expect(row?.email).toBe("alex@example.test");
      expect(await rowCount()).toBe(1);
    });
  });

  test("once the owner is BOUND, another OWNER_GROUP member does NOT adopt it — downgraded to `user` (singleton holds)", async () => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner") })));
    vi.stubEnv("OWNER_GROUP", "owners");
    await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] }));
    // The owner row is now BOUND (externalId set) → a different member is NOT adopted; the singleton downgrades it.
    const other = asProvisioned(
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|bob"), handle: castId<Handle>("bob"), groups: ["owners"] })),
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
describe("sessions.provisionIdentity — a handle match onto a BOUND row is an impostor, not a rename", () => {
  test("OWNER takeover: a different subject presenting the owner's handle is DENIED (row untouched)", async () => {
    vi.stubEnv("OWNER_HANDLES", "owner");
    const seeded = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("owner"), groups: [] })));
    vi.stubEnv("OWNER_GROUP", "owners");
    // The real owner adopts the row with their stable subject.
    await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alex"), handle: castId<Handle>("alex"), groups: ["owners"] }));

    // mallory registers the (now stable, publicly guessable) OWNER_HANDLES handle in the IdP and signs in.
    const attack = await svc.provisionIdentity(
      identity({ externalId: castId<ExternalId>("authentik|mallory"), handle: castId<Handle>("owner"), groups: ["owners"] }),
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
    const victim = asProvisioned(await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alice"), handle: castId<Handle>("alice") })));

    // alice renames herself in the IdP; our row still stores "alice", so the username is free to be re-taken.
    const attack = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|mallory"), handle: castId<Handle>("alice") }));

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
    const local = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("alice") })));
    const attempt = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alice"), handle: castId<Handle>("alice") }));
    expect(attempt.outcome).toBe("denied");
    const row = (await db.select().from(users).where(eq(users.id, local.userId)))[0];
    expect(row?.externalId).toBeNull(); // NOT auto-linked
    expect(await rowCount()).toBe(1); // no duplicate minted
  });
});

// MS-W1 — the mode-switch collision hard-deny (owner-ruled 2026-08-09). A subject-bearing NON-OWNER identity
// that collides with an existing account (handle OR email) is DENIED with the `account-exists` reason, never
// auto-linked (W1) and never minted as a duplicate. Owner paths are unaffected; forward-header (null subject)
// still binds/mints as the proxy is the authority.
describe("sessions.provisionIdentity — MS-W1 collision hard-deny (mode-switch orphan guard)", () => {
  test("HANDLE collision (unbound non-owner row, signup ON) ⇒ DENIED with reason account-exists, no bind", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const local = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("alice") })));
    const result = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alice"), handle: castId<Handle>("alice") }), {
      allowJitProvision: true,
    });
    expect(result).toEqual({ outcome: "denied", reason: "account-exists" });
    const row = (await db.select().from(users).where(eq(users.id, local.userId)))[0];
    expect(row?.externalId).toBeNull();
  });

  test("a LOOK-ALIKE of a held handle at the mint path (signup ON) ⇒ DENIED account-exists, NO look-alike row", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    asProvisioned(await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|host"), handle: castId<Handle>("host") })));
    const before = await rowCount();
    const result = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|spoof"), handle: castId<Handle>("Нost") }), {
      allowJitProvision: true,
    });
    expect(result).toEqual({ outcome: "denied", reason: "account-exists" });
    expect(await rowCount()).toBe(before);
  });

  test("EMAIL collision at the mint path (new handle, signup ON) ⇒ DENIED account-exists, NO duplicate row", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    // An existing account carries alice@corp.com (created via a prior login).
    asProvisioned(
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alice"), handle: castId<Handle>("alice"), email: "alice@corp.com" })),
    );
    const before = await rowCount();
    // A DIFFERENT IdP identity (new subject + new handle) presents the SAME email → would mint a duplicate.
    const result = await svc.provisionIdentity(
      identity({ externalId: castId<ExternalId>("authentik|alias"), handle: castId<Handle>("alice-new"), email: "alice@corp.com" }),
      { allowJitProvision: true },
    );
    expect(result).toEqual({ outcome: "denied", reason: "account-exists" });
    expect(await rowCount()).toBe(before); // no duplicate minted
  });

  test("a genuinely-new NON-colliding identity still JITs under signup ON", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const before = await rowCount();
    const result = asProvisioned(
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|bob"), handle: castId<Handle>("bob"), email: "bob@corp.com" }), {
        allowJitProvision: true,
      }),
    );
    expect(result.outcome).toBe("provisioned");
    expect(await rowCount()).toBe(before + 1);
  });

  test("the collision deny reason is DISTINCT from the plain signup-off deny", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    // signup-off deny for a brand-new identity carries NO account-exists reason: it is the JIT gate's own
    // `jit-closed`, the one reason the OIDC callback may answer with a pending join (D254).
    const signupOff = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|new"), handle: castId<Handle>("new") }), {
      allowJitProvision: false,
    });
    expect(signupOff).toEqual({ outcome: "denied", reason: "jit-closed" });
  });

  test("forward-header (NULL subject) still binds an unbound row by handle — the proxy is the authority (not a collision)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const local = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("carol") })));
    const again = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("carol") })));
    expect(again.userId).toBe(local.userId);
    expect(await rowCount()).toBe(1);
  });
});

// #34 — THE STATE HALF of the null-subject signal (the config half is the claim mapper's warn in
// entry/http/auth-routes). A login carrying NO stable subject has resolved BY HANDLE onto a row that IS
// bound to one: `isSubjectMismatch` is structurally unable to speak (it needs a subject to contradict), so
// the bind-once takeover refusal is INERT for this login and the handle alone authorizes the row — which is
// precisely the precondition the handle-re-registration attack rides. Observability only: the login
// proceeds byte-identically, because refusing null-subject logins would break `forward-header`, where null
// is the normal shape.
describe("sessions.provisionIdentity — a null-subject login onto a BOUND row is operator-visible (#34)", () => {
  test("WARNS naming the row, and the login still succeeds onto the same row (no behavior change)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const bound = asProvisioned(await svc.provisionIdentity(identity({ externalId: EXTERNAL, handle: castId<Handle>("alice") })));
    const spy = vi.spyOn(logger, "warn");
    // The same handle arrives with NO subject — the guard that would have refused an IMPOSTOR here can't run.
    const nullSubject = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("alice") })));
    expect(nullSubject.userId).toBe(bound.userId); // unchanged outcome — this is a signal, not a gate
    expect(spy).toHaveBeenCalledOnce();
    const [bindings] = spy.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(bindings["security"]).toBe(true);
    expect(bindings["event"]).toBe("sso_null_subject_on_bound_row");
    expect(bindings["handle"]).toBe("alice");
    expect(bindings["userId"]).toBe(bound.userId);
    // The row's binding is NOT moved or cleared by the subject-less login.
    const row = (await db.select().from(users).where(eq(users.id, bound.userId)))[0];
    expect(row?.externalId).toBe(EXTERNAL);
  });

  // THE SILENT-PATH CONTROL. In `forward-header` (Authelia's `Remote-User`, the generic `X-Forwarded-User`)
  // every login is subject-less by construction and the rows it provisions are UNBOUND — the proxy is the
  // identity authority. That shape must stay silent or the signal is a per-login siren nobody reads.
  test("a null-subject login onto an UNBOUND row is SILENT (the normal forward-header / single-user shape)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const first = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("proxied") })));
    const spy = vi.spyOn(logger, "warn");
    const again = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("proxied") })));
    expect(again.userId).toBe(first.userId);
    expect(spy).not.toHaveBeenCalled();
  });

  // And the subject-BEARING path is silent too — that is the login the guard actually protects.
  test("a subject-bearing login onto its own bound row is SILENT", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    await svc.provisionIdentity(identity());
    const spy = vi.spyOn(logger, "warn");
    await svc.provisionIdentity(identity());
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("sessions.provisionIdentity — rename stability (externalId is the key)", () => {
  test("a handle rename updates the SAME row (no duplicate tenant)", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("old-name") })));
    const second = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("new-name") })));
    expect(second.userId).toBe(first.userId);
    expect(await rowCount()).toBe(1);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.handle).toBe("new-name");
  });

  test("an IdP rename onto a look-alike of another row's handle keeps the current handle", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|host"), handle: castId<Handle>("host") }));
    const first = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("old-name") })));
    const renamed = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("Нost") })));
    expect(renamed.userId).toBe(first.userId);
    expect(renamed.identityChanged).toBe(false);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.handle).toBe("old-name");
  });

  test("externalId null keys on handle (single-user / non-SSO path)", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("solo") })));
    const second = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("solo") })));
    expect(second.userId).toBe(first.userId);
    expect(await rowCount()).toBe(1);
  });
});

// W7b — `identityChanged` is the fact the ENTRY callers turn into a user-bus fan (`entry/auth/seam.ts`,
// `entry/http/auth-routes.ts`), so an IdP rename or a login-time role demotion reaches the human's OTHER live
// devices instead of sitting behind `staleTime: Infinity` until a reload. The precision matters in both
// directions: too eager and the forward-header seam — which re-provisions on EVERY request — becomes a
// per-request storm on the plane W8 exists to keep quiet; too shy and a demotion is invisible.
describe("sessions.provisionIdentity — identityChanged (W7b: what the entry callers fan on)", () => {
  test("a handle RENAME reports identityChanged; the idempotent re-login right after does NOT", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("old-name") })));
    expect(first.identityChanged).toBe(false); // the INSERT — no other device holds a read of a row that did not exist
    const renamed = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("new-name") })));
    expect(renamed.identityChanged).toBe(true);
    // The NEXT login writes nothing, so it must not fan again — this is the assertion that keeps the
    // per-request forward-header arm quiet.
    expect(asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("new-name") }))).identityChanged).toBe(false);
  });

  test("a login-time role DEMOTION reports identityChanged (the security-relevant half)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const promoted = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] })));
    expect(promoted.role).toBe("admin");
    const demoted = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] })));
    expect(demoted.role).toBe("user");
    expect(demoted.identityChanged).toBe(true);
  });

  test("an EMAIL-only refresh does NOT report identityChanged — no identity read projects email", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    await svc.provisionIdentity(identity({ email: "old@example.com" }));
    const refreshed = asProvisioned(await svc.provisionIdentity(identity({ email: "new@example.com" })));
    // The row DID change (see the email describe below) — the flag is about what `sessions.me` projects
    // (userId/handle/globalRole), not about whether any column moved.
    expect(refreshed.identityChanged).toBe(false);
  });
});

describe("sessions.provisionIdentity — email (mutable attribute, keep-on-null)", () => {
  test("persists the email claim on INSERT", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const result = asProvisioned(await svc.provisionIdentity(identity({ email: "alice@example.com" })));
    const row = (await db.select().from(users).where(eq(users.id, result.userId)))[0];
    expect(row?.email).toBe("alice@example.com");
  });

  test("refreshes a CHANGED email on UPDATE", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = asProvisioned(await svc.provisionIdentity(identity({ email: "old@example.com" })));
    await svc.provisionIdentity(identity({ email: "new@example.com" }));
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.email).toBe("new@example.com");
  });

  test("keep-on-null: a login carrying NO email never wipes a stored one", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = asProvisioned(await svc.provisionIdentity(identity({ email: "keep@example.com" })));
    await svc.provisionIdentity(identity({ email: null }));
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.email).toBe("keep@example.com");
  });
});

describe("sessions.provisionIdentity — UPDATE role policy", () => {
  test("role is PRESERVED on update by default (no governance, no flag — manual grant survives)", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = asProvisioned(await svc.provisionIdentity(identity()));
    await db.update(users).set({ role: "admin" }).where(eq(users.id, first.userId));
    const again = asProvisioned(await svc.provisionIdentity(identity()));
    expect(again.role).toBe("admin");
  });

  test("role RE-DERIVES admin↔user on every login when group governance is active", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    // First login in the admin group → admin.
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] })));
    expect(first.role).toBe("admin");
    // Next login WITHOUT the admin group → demoted to user (group change takes effect next login).
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] })));
    expect(again.role).toBe("user");
    // And back up when re-added.
    const promoted = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] })));
    expect(promoted.role).toBe("admin");
  });

  test("legacy RE_DERIVE_ROLE_ON_LOGIN still re-derives when set (no group governance)", async () => {
    vi.stubEnv("OWNER_GROUP", "owners");
    vi.stubEnv("RE_DERIVE_ROLE_ON_LOGIN", "true");
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] })));
    // First login mints owner (no owner yet); this row IS the owner now.
    expect(first.role).toBe("owner");
    // The owner is exempt from re-derivation — losing the group does NOT demote (owner invariant).
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: [] })));
    expect(again.role).toBe("owner");
  });

  test("enabled is NEVER reset on update (a disabled user can't re-enable by logging in)", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = asProvisioned(await svc.provisionIdentity(identity()));
    await db.update(users).set({ enabled: false }).where(eq(users.id, first.userId));
    const again = asProvisioned(await svc.provisionIdentity(identity()));
    expect(again.enabled).toBe(false);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.enabled).toBe(false);
  });
});

// #140 — DOES THE GROUP GATE ACTUALLY ENGAGE? `reDeriveRoleOnLogin()` is unit-pinned in
// substrate/role-policy.test.ts, but a pure predicate returning `true` proves nothing about the VERB: the
// matrix below drives fixture claims through `provisionIdentity` itself, which is the code an owner's live
// login runs. Three claim states × the configured knob:
//   groups PRESENT + MATCHING   → elevation (and it BEATS a stored role, in both directions)
//   groups PRESENT + NON-MATCH  → no elevation / demotion (OIDC_ADMIN_GROUPS) · DENY (OIDC_ALLOWED_GROUPS)
//   groups ABSENT               → the configured fallback: `user` under OIDC_ADMIN_GROUPS (so a broken
//                                 property mapping DEMOTES every group-derived admin), DENY under the
//                                 fail-closed OIDC_ALLOWED_GROUPS.
// The owner arm is covered by the D17 exemption describe above and is deliberately NOT re-derived here.
describe("sessions.provisionIdentity — the group gate ENGAGES at the verb (#140 matrix)", () => {
  test("PRESENT + MATCHING on an UPDATE ⇒ ELEVATION (an existing `user` row is promoted to admin)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] })));
    expect(first.role).toBe("user");
    const elevated = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng", "Orb Admins"] })));
    expect(elevated.userId).toBe(first.userId);
    expect(elevated.role).toBe("admin");
    expect(elevated.identityChanged).toBe(true); // the other devices re-read the viewer
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.role).toBe("admin"); // the ELEVATION is persisted, not just reported
  });

  // D65: "when group governance is active, roles RE-DERIVE from groups each login (a `setRole` grant to a
  // non-group-member is wiped next login)". The IdP is the source of truth while it governs — a manual grant
  // that outlived it would be a permanent privilege the operator's group config cannot revoke.
  test("PRESENT + NON-MATCHING wipes a manual `setRole` admin grant on the next login (D65)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] })));
    await db.update(users).set({ role: "admin" }).where(eq(users.id, first.userId)); // an out-of-band grant
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] })));
    expect(again.role).toBe("user");
    expect((await db.select().from(users).where(eq(users.id, first.userId)))[0]?.role).toBe("user");
  });

  // THE SILENT-BREAKAGE ARM. An authentik property mapping that stops emitting `groups` looks like nothing
  // at all: every login still succeeds, and every group-derived admin quietly becomes a `user`. This is
  // exactly why the mapper's `oidc_groups_claim_missing` securityEvent exists (entry/http/auth-routes).
  test("ABSENT groups + OIDC_ADMIN_GROUPS ⇒ the fallback is `user` — an existing admin is DEMOTED", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const admin = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] })));
    expect(admin.role).toBe("admin");
    const claimGone = asProvisioned(await svc.provisionIdentity(identity({ groups: [] })));
    expect(claimGone.role).toBe("user");
    expect((await db.select().from(users).where(eq(users.id, admin.userId)))[0]?.role).toBe("user");
  });

  test("ABSENT groups + OIDC_ALLOWED_GROUPS ⇒ DENIED (fail-closed; the gate cannot be dodged by omission)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "Orb Users");
    const before = await rowCount();
    expect((await svc.provisionIdentity(identity({ groups: [] }))).outcome).toBe("denied");
    expect(await rowCount()).toBe(before);
  });

  // Governance OFF is the control: with neither var set the SAME claim states must move nothing, or every
  // deployment that never configured groups silently inherits IdP-driven role churn.
  test("governance INACTIVE ⇒ the same claim states change no role (the gate is genuinely opt-in)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ADMIN_GROUPS", undefined);
    vi.stubEnv("OIDC_ALLOWED_GROUPS", undefined);
    vi.stubEnv("RE_DERIVE_ROLE_ON_LOGIN", undefined);
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] })));
    expect(first.role).toBe("user"); // no configured group grants anything
    await db.update(users).set({ role: "admin" }).where(eq(users.id, first.userId));
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: [] })));
    expect(again.role).toBe("admin"); // the manual grant SURVIVES — removal does not auto-demote
  });
});

// #140 — the groups that DECIDED the role ride the provisioning log lines. Before this the path logged
// handle + externalId only, so a login-time demotion was un-auditable (you could see the role move and never
// see what moved it) and the fail-closed deny named the gate without naming what the identity carried.
describe("sessions.provisionIdentity — the groups claim is on the log line (#140)", () => {
  test("the provisioned line carries the group NAMES + a truthful groupCount", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const spy = vi.spyOn(logger, "info");
    await svc.provisionIdentity(identity({ groups: ["Orb Admins", "eng"] }));
    const line = spy.mock.calls.map(([bindings]) => bindings as Record<string, unknown>).find((b) => b["handle"] === "alice");
    expect(line?.["groups"]).toEqual(["Orb Admins", "eng"]);
    expect(line?.["groupCount"]).toBe(2);
  });

  test("the OIDC_ALLOWED_GROUPS deny names the groups the identity DID carry (the diagnosis half)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "Orb Users");
    const spy = vi.spyOn(logger, "warn");
    expect((await svc.provisionIdentity(identity({ groups: ["outsiders"] }))).outcome).toBe("denied");
    const [bindings] = spy.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(bindings["groups"]).toEqual(["outsiders"]);
    expect(bindings["handle"]).toBe("alice");
  });
});

// A1 — the JIT admission gate is a CALLER-resolved boolean (`allowJitProvision`), NOT an env read in the
// verb: the verb is mode-agnostic and the oidc callback passes OIDC_SIGNUP while forward-header passes the
// default (true). When false, a NEW identity (no existing row) is refused; the box OWNER by policy is exempt;
// an EXISTING user still logs in. Ordered after the bind-once guard, before the allowed-groups gate.
describe("sessions.provisionIdentity — allowJitProvision gate (A1, OIDC_SIGNUP)", () => {
  test("allowJitProvision:false ⇒ a brand-new identity is DENIED and NO row is created", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const before = await rowCount();
    const result = await svc.provisionIdentity(identity(), { allowJitProvision: false });
    expect(result.outcome).toBe("denied");
    expect(await rowCount()).toBe(before); // fail-closed — no JIT row
  });

  test("allowJitProvision:false ⇒ an EXISTING user still logs in (the gate is on NEW rows only)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const first = asProvisioned(await svc.provisionIdentity(identity())); // created with the default (true)
    const again = asProvisioned(await svc.provisionIdentity(identity(), { allowJitProvision: false }));
    expect(again.userId).toBe(first.userId);
  });

  test("allowJitProvision:false ⇒ the box OWNER by handle is EXEMPT (a first owner login still provisions)", async () => {
    vi.stubEnv("OWNER_HANDLES", "alice");
    const result = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("alice") }), { allowJitProvision: false }));
    expect(result.role).toBe("owner");
  });

  test("allowJitProvision:false ⇒ an owner-by-GROUP first login is EXEMPT too (not just by handle)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    vi.stubEnv("OWNER_GROUP", "owners");
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] }), { allowJitProvision: false }));
    expect(result.role).toBe("owner");
  });

  test("default (omitted, e.g. forward-header) ⇒ a brand-new non-owner identity is provisioned", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const result = asProvisioned(await svc.provisionIdentity(identity()));
    expect(result.outcome).toBe("provisioned");
    expect(result.enabled).toBe(true);
  });
});

// A2 — the approval gate is a CALLER-resolved boolean (`requireApproval`). When true a first-time NON-OWNER
// SSO user provisions enabled:false (awaiting admin approval); the owner is never gated. Reuses the `enabled`
// control (no new role).
describe("sessions.provisionIdentity — requireApproval gate (A2, OIDC_REQUIRE_APPROVAL)", () => {
  test("requireApproval:true ⇒ a first-time non-owner user is created DISABLED (enabled:false)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const result = asProvisioned(await svc.provisionIdentity(identity(), { requireApproval: true }));
    expect(result.enabled).toBe(false);
    const row = (await db.select().from(users).where(eq(users.id, result.userId)))[0];
    expect(row?.enabled).toBe(false);
  });

  test("requireApproval:true ⇒ the OWNER is never gated (a first owner login is enabled)", async () => {
    vi.stubEnv("OWNER_HANDLES", "alice");
    const result = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("alice") }), { requireApproval: true }));
    expect(result.role).toBe("owner");
    expect(result.enabled).toBe(true);
  });

  test("requireApproval:true ⇒ once enabled by an admin, the user's next login is admitted (enabled preserved)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const created = asProvisioned(await svc.provisionIdentity(identity(), { requireApproval: true }));
    expect(created.enabled).toBe(false);
    // Admin approves (enable); update never re-derives enabled, so the next login stays enabled even if the
    // approval flag is still on.
    await db.update(users).set({ enabled: true }).where(eq(users.id, created.userId));
    const again = asProvisioned(await svc.provisionIdentity(identity(), { requireApproval: true }));
    expect(again.enabled).toBe(true);
  });

  test("default (omitted) ⇒ a first-time user is enabled immediately", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const result = asProvisioned(await svc.provisionIdentity(identity()));
    expect(result.enabled).toBe(true);
  });
});

// #1478 — THE INSERT RACE. `insertUser` is a bare `onConflictDoNothing()`, so a concurrent writer that took
// this HANDLE makes our insert a silent no-op; the re-read then keys on `externalId`, which the WINNER does
// not carry, and the verb used to throw a raw Error whose own comment called that state "Unreachable" (a
// 500 on the login path, and a comment asserting the case away). The refusal is the same operator-actionable
// `account-exists` the sequential collision path (MS-W1) returns — never an adoption of the winner's row.
describe("sessions.provisionIdentity — the first-login INSERT race (#1478)", () => {
  /** Plant a colliding row while the provisioning INSERT is parked before the driver. RAW sql on purpose:
   *  drizzle quotes the table name, so this statement does not match the hold pattern and is not itself
   *  held. */
  const plantOtherSubject = `insert into users (id, handle, handle_key, external_id, role, enabled, created_at, updated_at)
                               values ('user_winner', 'alice', '${handleKey("alice")}', 'authentik|someone-else', 'user', 1, 1, 1)`;

  test("a concurrent writer taking the HANDLE ⇒ denied account-exists; the winner's row is untouched", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const held = await freshHeldDb();
    const service = makeService(held.db).svc;
    const warn = vi.spyOn(logger, "warn");
    const parked = held.hold(/insert into "users"/i);

    const pending = service.provisionIdentity(identity());
    await parked.reached;
    await held.db.run(sql.raw(plantOtherSubject));
    parked.release();

    // The login is REFUSED with the collision reason the OIDC callback maps to its own authError…
    expect(await pending).toEqual({ outcome: "denied", reason: "account-exists" });
    // …no second row was minted, and the winner keeps its own subject (no rebind, no adoption).
    const rows = await held.db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe("authentik|someone-else");
    // …and the refusal rides the security trail, naming the collision rather than a stack trace.
    const line = warn.mock.calls.map(([bindings]) => bindings as Record<string, unknown>).find((b) => b["event"] === "sso_insert_lost_race");
    expect(line?.["security"]).toBe(true);
    expect(line?.["handleTaken"]).toBe(true);
  });

  test("the SAME-subject race still resolves onto the winner's row (the shape the insert absorbs by design)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const held = await freshHeldDb();
    const service = makeService(held.db).svc;
    const parked = held.hold(/insert into "users"/i);

    const pending = service.provisionIdentity(identity());
    await parked.reached;
    // The concurrent first login of the SAME identity: same handle AND same stable subject.
    await held.db.run(
      sql.raw(`insert into users (id, handle, handle_key, external_id, role, enabled, created_at, updated_at)
               values ('user_twin', 'alice', '${handleKey("alice")}', '${EXTERNAL}', 'user', 1, 1, 1)`),
    );
    parked.release();

    const result = asProvisioned(await pending);
    expect(result.userId).toBe("user_twin");
    expect(await rowCountOn(held.db)).toBe(1);
  });
});
