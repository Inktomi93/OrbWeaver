// verb: sessions.provisionIdentity — first login, the login gates, role policy and the group claim.
// @subject packages/server/src/domain/sessions/verbs/provision-identity.ts

import type { Db } from "@orb/db";
import { userConnections, users } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsRolePolicyConfig, SessionsService } from "@orb/server/domain/sessions";
import { env } from "@orb/server/foundation/env";
import { logger } from "@orb/server/foundation/observability";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { makeService } from "../_support.ts";
import { asProvisioned, EXTERNAL, identity, PROVEN, rowCountOn } from "./_provision-identity-support.ts";

let db: Db;
let svc: SessionsService;
let policyConfig: SessionsRolePolicyConfig;
let clock: ReturnType<typeof makeService>["clock"];

async function rowCount(): Promise<number> {
  return await rowCountOn(db);
}

beforeEach(async () => {
  db = await freshDb();
  policyConfig = { ...env };
  ({ svc, clock } = makeService(db, policyConfig));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessions.provisionIdentity — INSERT (first SSO login) + JIT", () => {
  test("creates an enabled user keyed on externalId; default role user", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity(), PROVEN));
    expect(result.enabled).toBe(true);
    expect(result.role).toBe("user");
    const row = (await db.select().from(users).where(eq(users.id, result.userId)))[0];
    expect(row?.externalId).toBe(EXTERNAL);
    expect(row?.handle).toBe("alice");
  });

  test("seeds owner from OWNER_GROUP membership on insert", async () => {
    policyConfig = { ...policyConfig, ["OWNER_GROUP"]: "owners" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] }), PROVEN));
    expect(result.role).toBe("owner");
  });

  test("JIT-creates an admin from OIDC_ADMIN_GROUPS membership (group→admin, D17 via IdP)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: "Orb Admins" };
    ({ svc } = makeService(db, policyConfig, clock));
    const before = await rowCount();
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] }), PROVEN));
    expect(result.role).toBe("admin");
    expect(await rowCount()).toBe(before + 1);
  });

  test("a SECOND owner-group member provisions as `user` — the D17 singleton, not a UNIQUE crash", async () => {
    policyConfig = { ...policyConfig, ["OWNER_GROUP"]: "owners" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(
      await svc.provisionIdentity(
        identity({
          externalId: castId<ExternalId>("authentik|alice"),
          handle: castId<Handle>("alice"),
          groups: ["owners"],
        }),
        PROVEN,
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
        PROVEN,
      ),
    );
    expect(second.role).toBe("user");
    const bobRow = (await db.select().from(users).where(eq(users.id, second.userId)))[0];
    expect(bobRow?.role).toBe("user");
    const owners = (await db.select().from(users)).filter((u) => u.role === "owner");
    expect(owners).toHaveLength(1);
  });

  test("the SAME owner re-logging in keeps owner (singleton reconcile excludes its own row)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_GROUP"]: "owners" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] }), PROVEN));
    expect(first.role).toBe("owner");
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] }), PROVEN));
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
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity(), PROVEN));
    expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, result.userId))).toHaveLength(2);
  });

  test("a DENIED login seeds nothing (no row to seed for)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ALLOWED_GROUPS"]: "Orb Users" };
    ({ svc } = makeService(db, policyConfig, clock));
    expect((await svc.provisionIdentity(identity({ groups: ["outsiders"] }), PROVEN)).outcome).toBe("denied");
    expect(await db.select().from(userConnections)).toHaveLength(0);
  });

  test("a RETURNING user's login re-seeds nothing new", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity(), PROVEN));
    await svc.provisionIdentity(identity(), PROVEN);
    expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, first.userId))).toHaveLength(2);
  });
});

describe("sessions.provisionIdentity — OIDC_ALLOWED_GROUPS login gate (fail-closed)", () => {
  test("gate UNSET ⇒ any authenticated identity is allowed (backward-compat)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = await svc.provisionIdentity(identity({ groups: ["whatever"] }), PROVEN);
    expect(result.outcome).toBe("provisioned");
  });

  test("in NONE of the allowed groups ⇒ DENIED, and NO row is created (JIT refused)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ALLOWED_GROUPS"]: "Orb Users" };
    ({ svc } = makeService(db, policyConfig, clock));
    const before = await rowCount();
    const result = await svc.provisionIdentity(identity({ groups: ["outsiders"] }), PROVEN);
    expect(result.outcome).toBe("denied");
    // Fail-closed: a denied login never provisions a tenant row.
    expect(await rowCount()).toBe(before);
  });

  test("in an allowed group ⇒ provisioned as user", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ALLOWED_GROUPS"]: "Orb Users" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Users"] }), PROVEN));
    expect(result.role).toBe("user");
  });

  test("an admin-group member passes the gate implicitly (not separately allow-listed)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ALLOWED_GROUPS"]: "Orb Users" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: "Orb Admins" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] }), PROVEN));
    expect(result.role).toBe("admin");
  });

  test("an EXISTING user removed from all allowed groups is denied next login (row survives)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ALLOWED_GROUPS"]: "Orb Users" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Users"] }), PROVEN));
    expect(first.role).toBe("user");
    const again = await svc.provisionIdentity(identity({ groups: ["outsiders"] }), PROVEN);
    expect(again.outcome).toBe("denied");
    // The row is not deleted — the user simply can't authenticate.
    expect(await rowCount()).toBe(1);
  });
});

describe("sessions.provisionIdentity — the OWNER exemption invariant (D17)", () => {
  test("the owner is NEVER denied by the allowed-groups gate, even in no allowed group", async () => {
    // alice is the owner (OWNER_HANDLES) and the gate is set to a group she is NOT in.
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "alice" };
    ({ svc } = makeService(db, policyConfig, clock));
    const seed = asProvisioned(await svc.provisionIdentity(identity({ groups: [] }), PROVEN));
    expect(seed.role).toBe("owner");
    // Now turn the gate on; alice is in NONE of the allowed groups → still allowed, still owner.
    policyConfig = { ...policyConfig, ["OIDC_ALLOWED_GROUPS"]: "Orb Users" };
    ({ svc } = makeService(db, policyConfig, clock));
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: [] }), PROVEN));
    expect(again.outcome).toBe("provisioned");
    expect(again.role).toBe("owner");
  });

  test("the owner is NEVER re-derived downward even with governance active + no matching group", async () => {
    // Seed the owner by handle, then flip to a config where the owner matches NO group and governance is on.
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "alice" };
    ({ svc } = makeService(db, policyConfig, clock));
    const seed = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] }), PROVEN));
    expect(seed.role).toBe("owner");
    // OWNER_GROUP now points elsewhere; OIDC_ADMIN_GROUPS active ⇒ re-derive on. The owner row must stay owner.
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: undefined };
    policyConfig = { ...policyConfig, ["OWNER_GROUP"]: "different-owners" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: "Orb Admins" };
    ({ svc } = makeService(db, policyConfig, clock));
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Users"] }), PROVEN));
    expect(again.role).toBe("owner");
    const owners = (await db.select().from(users)).filter((u) => u.role === "owner");
    expect(owners).toHaveLength(1);
  });
});

describe("sessions.provisionIdentity — UPDATE role policy", () => {
  test("role is PRESERVED on update by default (no governance, no flag — manual grant survives)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity(), PROVEN));
    await db.update(users).set({ role: "admin" }).where(eq(users.id, first.userId));
    const again = asProvisioned(await svc.provisionIdentity(identity(), PROVEN));
    expect(again.role).toBe("admin");
  });

  test("role RE-DERIVES admin↔user on every login when group governance is active", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: "Orb Admins" };
    ({ svc } = makeService(db, policyConfig, clock));
    // First login in the admin group → admin.
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] }), PROVEN));
    expect(first.role).toBe("admin");
    // Next login WITHOUT the admin group → demoted to user (group change takes effect next login).
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] }), PROVEN));
    expect(again.role).toBe("user");
    // And back up when re-added.
    const promoted = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] }), PROVEN));
    expect(promoted.role).toBe("admin");
  });

  test("legacy RE_DERIVE_ROLE_ON_LOGIN still re-derives when set (no group governance)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_GROUP"]: "owners" };
    policyConfig = { ...policyConfig, ["RE_DERIVE_ROLE_ON_LOGIN"]: "true" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] }), PROVEN));
    // First login mints owner (no owner yet); this row IS the owner now.
    expect(first.role).toBe("owner");
    // The owner is exempt from re-derivation — losing the group does NOT demote (owner invariant).
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: [] }), PROVEN));
    expect(again.role).toBe("owner");
  });

  test("enabled is NEVER reset on update (a disabled user can't re-enable by logging in)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity(), PROVEN));
    await db.update(users).set({ enabled: false }).where(eq(users.id, first.userId));
    const again = asProvisioned(await svc.provisionIdentity(identity(), PROVEN));
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
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: "Orb Admins" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] }), PROVEN));
    expect(first.role).toBe("user");
    const elevated = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng", "Orb Admins"] }), PROVEN));
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
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: "Orb Admins" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] }), PROVEN));
    await db.update(users).set({ role: "admin" }).where(eq(users.id, first.userId)); // an out-of-band grant
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] }), PROVEN));
    expect(again.role).toBe("user");
    expect((await db.select().from(users).where(eq(users.id, first.userId)))[0]?.role).toBe("user");
  });

  // THE SILENT-BREAKAGE ARM. An authentik property mapping that stops emitting `groups` looks like nothing
  // at all: every login still succeeds, and every group-derived admin quietly becomes a `user`. This is
  // exactly why the mapper's `oidc_groups_claim_missing` securityEvent exists (entry/http/auth-routes).
  test("ABSENT groups + OIDC_ADMIN_GROUPS ⇒ the fallback is `user` — an existing admin is DEMOTED", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: "Orb Admins" };
    ({ svc } = makeService(db, policyConfig, clock));
    const admin = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] }), PROVEN));
    expect(admin.role).toBe("admin");
    const claimGone = asProvisioned(await svc.provisionIdentity(identity({ groups: [] }), PROVEN));
    expect(claimGone.role).toBe("user");
    expect((await db.select().from(users).where(eq(users.id, admin.userId)))[0]?.role).toBe("user");
  });

  test("ABSENT groups + OIDC_ALLOWED_GROUPS ⇒ DENIED (fail-closed; the gate cannot be dodged by omission)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ALLOWED_GROUPS"]: "Orb Users" };
    ({ svc } = makeService(db, policyConfig, clock));
    const before = await rowCount();
    expect((await svc.provisionIdentity(identity({ groups: [] }), PROVEN)).outcome).toBe("denied");
    expect(await rowCount()).toBe(before);
  });

  // Governance OFF is the control: with neither var set the SAME claim states must move nothing, or every
  // deployment that never configured groups silently inherits IdP-driven role churn.
  test("governance INACTIVE ⇒ the same claim states change no role (the gate is genuinely opt-in)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: undefined };
    policyConfig = { ...policyConfig, ["OIDC_ALLOWED_GROUPS"]: undefined };
    policyConfig = { ...policyConfig, ["RE_DERIVE_ROLE_ON_LOGIN"]: undefined };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] }), PROVEN));
    expect(first.role).toBe("user"); // no configured group grants anything
    await db.update(users).set({ role: "admin" }).where(eq(users.id, first.userId));
    const again = asProvisioned(await svc.provisionIdentity(identity({ groups: [] }), PROVEN));
    expect(again.role).toBe("admin"); // the manual grant SURVIVES — removal does not auto-demote
  });
});

// #140 — the groups that DECIDED the role ride the provisioning log lines. Before this the path logged
// handle + externalId only, so a login-time demotion was un-auditable (you could see the role move and never
// see what moved it) and the fail-closed deny named the gate without naming what the identity carried.
describe("sessions.provisionIdentity — the groups claim is on the log line (#140)", () => {
  test("the provisioned line carries the group NAMES + a truthful groupCount", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: "Orb Admins" };
    ({ svc } = makeService(db, policyConfig, clock));
    const spy = vi.spyOn(logger, "info");
    await svc.provisionIdentity(identity({ groups: ["Orb Admins", "eng"] }), PROVEN);
    const line = spy.mock.calls.map(([bindings]) => bindings as Record<string, unknown>).find((b) => b["handle"] === "alice");
    expect(line?.["groups"]).toEqual(["Orb Admins", "eng"]);
    expect(line?.["groupCount"]).toBe(2);
  });

  test("the OIDC_ALLOWED_GROUPS deny names the groups the identity DID carry (the diagnosis half)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ALLOWED_GROUPS"]: "Orb Users" };
    ({ svc } = makeService(db, policyConfig, clock));
    const spy = vi.spyOn(logger, "warn");
    expect((await svc.provisionIdentity(identity({ groups: ["outsiders"] }), PROVEN)).outcome).toBe("denied");
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
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const before = await rowCount();
    const result = await svc.provisionIdentity(identity(), { ownerClaimProven: true, allowJitProvision: false });
    expect(result.outcome).toBe("denied");
    expect(await rowCount()).toBe(before); // fail-closed — no JIT row
  });

  test("allowJitProvision:false ⇒ an EXISTING user still logs in (the gate is on NEW rows only)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity(), PROVEN)); // created with the default (true)
    const again = asProvisioned(await svc.provisionIdentity(identity(), { ownerClaimProven: true, allowJitProvision: false }));
    expect(again.userId).toBe(first.userId);
  });

  test("allowJitProvision:false ⇒ the box OWNER by handle is EXEMPT (a first owner login still provisions)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "alice" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(
      await svc.provisionIdentity(identity({ handle: castId<Handle>("alice") }), { ownerClaimProven: true, allowJitProvision: false }),
    );
    expect(result.role).toBe("owner");
  });

  test("allowJitProvision:false ⇒ an owner-by-GROUP first login is EXEMPT too (not just by handle)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OWNER_GROUP"]: "owners" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity({ groups: ["owners"] }), { ownerClaimProven: true, allowJitProvision: false }));
    expect(result.role).toBe("owner");
  });

  test("default (omitted, e.g. forward-header) ⇒ a brand-new non-owner identity is provisioned", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity(), PROVEN));
    expect(result.outcome).toBe("provisioned");
    expect(result.enabled).toBe(true);
  });
});

// A2 — the approval gate is a CALLER-resolved boolean (`requireApproval`). When true a first-time NON-OWNER
// SSO user provisions enabled:false (awaiting admin approval); the owner is never gated. Reuses the `enabled`
// control (no new role).
describe("sessions.provisionIdentity — requireApproval gate (A2, OIDC_REQUIRE_APPROVAL)", () => {
  test("requireApproval:true ⇒ a first-time non-owner user is created DISABLED (enabled:false)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity(), { ownerClaimProven: true, requireApproval: true }));
    expect(result.enabled).toBe(false);
    const row = (await db.select().from(users).where(eq(users.id, result.userId)))[0];
    expect(row?.enabled).toBe(false);
  });

  test("requireApproval:true ⇒ the OWNER is never gated (a first owner login is enabled)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "alice" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("alice") }), { ownerClaimProven: true, requireApproval: true }));
    expect(result.role).toBe("owner");
    expect(result.enabled).toBe(true);
  });

  test("requireApproval:true ⇒ once enabled by an admin, the user's next login is admitted (enabled preserved)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const created = asProvisioned(await svc.provisionIdentity(identity(), { ownerClaimProven: true, requireApproval: true }));
    expect(created.enabled).toBe(false);
    // Admin approves (enable); update never re-derives enabled, so the next login stays enabled even if the
    // approval flag is still on.
    await db.update(users).set({ enabled: true }).where(eq(users.id, created.userId));
    const again = asProvisioned(await svc.provisionIdentity(identity(), { ownerClaimProven: true, requireApproval: true }));
    expect(again.enabled).toBe(true);
  });

  test("default (omitted) ⇒ a first-time user is enabled immediately", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity(), PROVEN));
    expect(result.enabled).toBe(true);
  });
});
