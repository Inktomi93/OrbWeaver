import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";

const PEPPER = "test-session-secret-at-least-32-chars-long";
const EXTERNAL = castId<ExternalId>("authentik|abc-123");

let db: Db;
let svc: SessionsService;
const clock = createFrozenClock();

function identity(over: Partial<ResolvedIdentity> = {}): ResolvedIdentity {
  return { externalId: EXTERNAL, handle: castId<Handle>("alice"), groups: [], ...over };
}

async function rowCount(): Promise<number> {
  return (await db.select().from(users)).length;
}

beforeEach(async () => {
  db = await freshDb();
  svc = createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessions.provisionIdentity — INSERT (first SSO login)", () => {
  test("creates an enabled user keyed on externalId; default role user", async () => {
    vi.stubEnv("OWNER_HANDLES", "someone-else");
    const result = await svc.provisionIdentity(identity());
    expect(result.enabled).toBe(true);
    expect(result.role).toBe("user");
    const row = (await db.select().from(users).where(eq(users.id, result.userId)))[0];
    expect(row?.externalId).toBe(EXTERNAL);
    expect(row?.handle).toBe("alice");
  });

  test("REFUSES the reserved __agent__ handle namespace — no SSO match/create (FLAG[PD-17])", async () => {
    const before = await rowCount();
    await expect(
      svc.provisionIdentity(
        identity({ handle: castId<Handle>("__agent__buddy__x"), externalId: null }),
      ),
    ).rejects.toThrow();
    expect(await rowCount()).toBe(before);
  });

  test("seeds owner from OWNER_GROUP membership on insert", async () => {
    vi.stubEnv("OWNER_GROUP", "owners");
    const result = await svc.provisionIdentity(identity({ groups: ["owners"] }));
    expect(result.role).toBe("owner");
  });

  test("a SECOND owner-group member provisions as `user` — the D17 singleton, not a UNIQUE crash", async () => {
    vi.stubEnv("OWNER_GROUP", "owners");
    // First owner-group member logs in → owner.
    const first = await svc.provisionIdentity(
      identity({
        externalId: castId<ExternalId>("authentik|alice"),
        handle: castId<Handle>("alice"),
        groups: ["owners"],
      }),
    );
    expect(first.role).toBe("owner");
    // A DIFFERENT owner-group member logs in → downgraded to user (an owner already exists), never a raw
    // users_single_owner_unique violation. `admin` is NOT auto-granted (D17: admin is granted via setRole).
    const second = await svc.provisionIdentity(
      identity({
        externalId: castId<ExternalId>("authentik|bob"),
        handle: castId<Handle>("bob"),
        groups: ["owners"],
      }),
    );
    expect(second.role).toBe("user");
    const bobRow = (await db.select().from(users).where(eq(users.id, second.userId)))[0];
    expect(bobRow?.role).toBe("user");
    // Exactly one owner row survived.
    const owners = (await db.select().from(users)).filter((u) => u.role === "owner");
    expect(owners).toHaveLength(1);
  });

  test("the SAME owner re-logging in keeps owner (singleton reconcile excludes its own row)", async () => {
    vi.stubEnv("OWNER_GROUP", "owners");
    vi.stubEnv("RE_DERIVE_ROLE_ON_LOGIN", "true");
    const first = await svc.provisionIdentity(identity({ groups: ["owners"] }));
    expect(first.role).toBe("owner");
    const again = await svc.provisionIdentity(identity({ groups: ["owners"] }));
    expect(again.role).toBe("owner");
  });
});

describe("sessions.provisionIdentity — rename stability (externalId is the key)", () => {
  test("a handle rename updates the SAME row (no duplicate tenant)", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = await svc.provisionIdentity(identity({ handle: castId<Handle>("old-name") }));
    const second = await svc.provisionIdentity(identity({ handle: castId<Handle>("new-name") }));
    expect(second.userId).toBe(first.userId);
    expect(await rowCount()).toBe(1);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.handle).toBe("new-name");
  });

  test("externalId null keys on handle (single-user / non-SSO path)", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = await svc.provisionIdentity(
      identity({ externalId: null, handle: castId<Handle>("solo") }),
    );
    const second = await svc.provisionIdentity(
      identity({ externalId: null, handle: castId<Handle>("solo") }),
    );
    expect(second.userId).toBe(first.userId);
    expect(await rowCount()).toBe(1);
  });
});

describe("sessions.provisionIdentity — UPDATE policy (invariant #6)", () => {
  test("role is PRESERVED on update by default (a manual grant survives next login)", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = await svc.provisionIdentity(identity());
    await db.update(users).set({ role: "admin" }).where(eq(users.id, first.userId));
    const again = await svc.provisionIdentity(identity());
    expect(again.role).toBe("admin");
  });

  test("role is RE-DERIVED on update when RE_DERIVE_ROLE_ON_LOGIN is set (group removal demotes)", async () => {
    vi.stubEnv("OWNER_GROUP", "owners");
    vi.stubEnv("RE_DERIVE_ROLE_ON_LOGIN", "true");
    const first = await svc.provisionIdentity(identity({ groups: ["owners"] }));
    expect(first.role).toBe("owner");
    const again = await svc.provisionIdentity(identity({ groups: [] }));
    expect(again.role).toBe("user");
  });

  test("enabled is NEVER reset on update (a disabled user can't re-enable by logging in)", async () => {
    vi.stubEnv("OWNER_HANDLES", "x");
    const first = await svc.provisionIdentity(identity());
    await db.update(users).set({ enabled: false }).where(eq(users.id, first.userId));
    const again = await svc.provisionIdentity(identity());
    expect(again.enabled).toBe(false);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.enabled).toBe(false);
  });
});
