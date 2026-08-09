import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { freshDb } from "../../../../support/db.ts";
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
  return (await db.select().from(users)).length;
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

  test("but an UNBOUND row still BINDS on a handle match (the single-user → SSO first login)", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const local = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("alice") })));
    const sso = asProvisioned(await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alice"), handle: castId<Handle>("alice") })));
    expect(sso.userId).toBe(local.userId);
    const row = (await db.select().from(users).where(eq(users.id, local.userId)))[0];
    expect(row?.externalId).toBe("authentik|alice");
    expect(await rowCount()).toBe(1);
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

  test("externalId null keys on handle (single-user / non-SSO path)", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("solo") })));
    const second = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("solo") })));
    expect(second.userId).toBe(first.userId);
    expect(await rowCount()).toBe(1);
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
