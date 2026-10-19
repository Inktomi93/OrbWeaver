// verb: sessions.provisionIdentity — collision denial, subject-less logins, rename stability, identityChanged, email and the insert race.
// @subject packages/server/src/domain/sessions/verbs/provision-identity.ts

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsRolePolicyConfig, SessionsService } from "@orb/server/domain/sessions";
import { env } from "@orb/server/foundation/env";
import { logger } from "@orb/server/foundation/observability";
import { freshDb, freshHeldDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq, sql } from "drizzle-orm";
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

// MS-W1 — the mode-switch collision hard-deny (owner-ruled 2026-08-09). A subject-bearing NON-OWNER identity
// that collides with an existing account (handle OR email) is DENIED with the `account-exists` reason, never
// auto-linked (W1) and never minted as a duplicate. Owner paths are unaffected; forward-header (null subject)
// still binds/mints as the proxy is the authority.
describe("sessions.provisionIdentity — MS-W1 collision hard-deny (mode-switch orphan guard)", () => {
  test("HANDLE collision (unbound non-owner row, signup ON) ⇒ DENIED with reason account-exists, no bind", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const local = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("alice") }), PROVEN));
    const result = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|alice"), handle: castId<Handle>("alice") }), {
      ownerClaimProven: true,
      allowJitProvision: true,
    });
    expect(result).toEqual({ outcome: "denied", reason: "account-exists" });
    const row = (await db.select().from(users).where(eq(users.id, local.userId)))[0];
    expect(row?.externalId).toBeNull();
  });

  test("a LOOK-ALIKE of a held handle at the mint path (signup ON) ⇒ DENIED account-exists, NO look-alike row", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    asProvisioned(await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|host"), handle: castId<Handle>("host") }), PROVEN));
    const before = await rowCount();
    const result = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|spoof"), handle: castId<Handle>("h0st") }), {
      ownerClaimProven: true,
      allowJitProvision: true,
    });
    expect(result).toEqual({ outcome: "denied", reason: "account-exists" });
    expect(await rowCount()).toBe(before);
  });

  test("a MIXED-SCRIPT handle at the mint path (signup ON) ⇒ DENIED, no row", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const before = await rowCount();
    const result = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|mixed"), handle: castId<Handle>("гoot") }), {
      ownerClaimProven: true,
      allowJitProvision: true,
    });
    expect(result.outcome).toBe("denied");
    expect(await rowCount()).toBe(before);
  });

  test("EMAIL collision at the mint path (new handle, signup ON) ⇒ DENIED account-exists, NO duplicate row", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    // An existing account carries alice@corp.com (created via a prior login).
    asProvisioned(
      await svc.provisionIdentity(
        identity({ externalId: castId<ExternalId>("authentik|alice"), handle: castId<Handle>("alice"), email: "alice@corp.com" }),
        PROVEN,
      ),
    );
    const before = await rowCount();
    // A DIFFERENT IdP identity (new subject + new handle) presents the SAME email → would mint a duplicate.
    const result = await svc.provisionIdentity(
      identity({ externalId: castId<ExternalId>("authentik|alias"), handle: castId<Handle>("alice-new"), email: "alice@corp.com" }),
      { ownerClaimProven: true, allowJitProvision: true },
    );
    expect(result).toEqual({ outcome: "denied", reason: "account-exists" });
    expect(await rowCount()).toBe(before); // no duplicate minted
  });

  test("a genuinely-new NON-colliding identity still JITs under signup ON", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const before = await rowCount();
    const result = asProvisioned(
      await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|bob"), handle: castId<Handle>("bob"), email: "bob@corp.com" }), {
        ownerClaimProven: true,
        allowJitProvision: true,
      }),
    );
    expect(result.outcome).toBe("provisioned");
    expect(await rowCount()).toBe(before + 1);
  });

  test("the collision deny reason is DISTINCT from the plain signup-off deny", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    // signup-off deny for a brand-new identity carries NO account-exists reason: it is the JIT gate's own
    // `jit-closed`, the one reason the OIDC callback may answer with a pending join (D259).
    const signupOff = await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|new"), handle: castId<Handle>("new") }), {
      ownerClaimProven: true,
      allowJitProvision: false,
    });
    expect(signupOff).toEqual({ outcome: "denied", reason: "jit-closed" });
  });

  test("forward-header (NULL subject) still binds an unbound row by handle — the proxy is the authority (not a collision)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const local = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("carol") }), PROVEN));
    const again = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("carol") }), PROVEN));
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
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const bound = asProvisioned(await svc.provisionIdentity(identity({ externalId: EXTERNAL, handle: castId<Handle>("alice") }), PROVEN));
    const spy = vi.spyOn(logger, "warn");
    // The same handle arrives with NO subject — the guard that would have refused an IMPOSTOR here can't run.
    const nullSubject = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("alice") }), PROVEN));
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
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("proxied") }), PROVEN));
    const spy = vi.spyOn(logger, "warn");
    const again = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("proxied") }), PROVEN));
    expect(again.userId).toBe(first.userId);
    expect(spy).not.toHaveBeenCalled();
  });

  // And the subject-BEARING path is silent too — that is the login the guard actually protects.
  test("a subject-bearing login onto its own bound row is SILENT", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    await svc.provisionIdentity(identity(), PROVEN);
    const spy = vi.spyOn(logger, "warn");
    await svc.provisionIdentity(identity(), PROVEN);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("sessions.provisionIdentity — rename stability (externalId is the key)", () => {
  test("a handle rename updates the SAME row (no duplicate tenant)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("old-name") }), PROVEN));
    const second = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("new-name") }), PROVEN));
    expect(second.userId).toBe(first.userId);
    expect(await rowCount()).toBe(1);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.handle).toBe("new-name");
  });

  test("an IdP rename onto a look-alike of another row's handle keeps the current handle", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    await svc.provisionIdentity(identity({ externalId: castId<ExternalId>("authentik|host"), handle: castId<Handle>("host") }), PROVEN);
    const first = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("old-name") }), PROVEN));
    const renamed = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("h0st") }), PROVEN));
    expect(renamed.userId).toBe(first.userId);
    expect(renamed.identityChanged).toBe(false);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.handle).toBe("old-name");
  });

  test("an IdP rename onto a mixed-script handle keeps the current handle", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("old-name") }), PROVEN));
    const renamed = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("hσst") }), PROVEN));
    expect(renamed.userId).toBe(first.userId);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.handle).toBe("old-name");
  });

  test("externalId null keys on handle (single-user / non-SSO path)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("solo") }), PROVEN));
    const second = asProvisioned(await svc.provisionIdentity(identity({ externalId: null, handle: castId<Handle>("solo") }), PROVEN));
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
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("old-name") }), PROVEN));
    expect(first.identityChanged).toBe(false); // the INSERT — no other device holds a read of a row that did not exist
    const renamed = asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("new-name") }), PROVEN));
    expect(renamed.identityChanged).toBe(true);
    // The NEXT login writes nothing, so it must not fan again — this is the assertion that keeps the
    // per-request forward-header arm quiet.
    expect(asProvisioned(await svc.provisionIdentity(identity({ handle: castId<Handle>("new-name") }), PROVEN)).identityChanged).toBe(false);
  });

  test("a login-time role DEMOTION reports identityChanged (the security-relevant half)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    policyConfig = { ...policyConfig, ["OIDC_ADMIN_GROUPS"]: "Orb Admins" };
    ({ svc } = makeService(db, policyConfig, clock));
    const promoted = asProvisioned(await svc.provisionIdentity(identity({ groups: ["Orb Admins"] }), PROVEN));
    expect(promoted.role).toBe("admin");
    const demoted = asProvisioned(await svc.provisionIdentity(identity({ groups: ["eng"] }), PROVEN));
    expect(demoted.role).toBe("user");
    expect(demoted.identityChanged).toBe(true);
  });

  test("an EMAIL-only refresh does NOT report identityChanged — no identity read projects email", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    await svc.provisionIdentity(identity({ email: "old@example.com" }), PROVEN);
    const refreshed = asProvisioned(await svc.provisionIdentity(identity({ email: "new@example.com" }), PROVEN));
    // The row DID change (see the email describe below) — the flag is about what `sessions.me` projects
    // (userId/handle/globalRole), not about whether any column moved.
    expect(refreshed.identityChanged).toBe(false);
  });
});

describe("sessions.provisionIdentity — email (mutable attribute, keep-on-null)", () => {
  test("persists the email claim on INSERT", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    const result = asProvisioned(await svc.provisionIdentity(identity({ email: "alice@example.com" }), PROVEN));
    const row = (await db.select().from(users).where(eq(users.id, result.userId)))[0];
    expect(row?.email).toBe("alice@example.com");
  });

  test("refreshes a CHANGED email on UPDATE", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ email: "old@example.com" }), PROVEN));
    await svc.provisionIdentity(identity({ email: "new@example.com" }), PROVEN);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.email).toBe("new@example.com");
  });

  test("keep-on-null: a login carrying NO email never wipes a stored one", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "x" };
    ({ svc } = makeService(db, policyConfig, clock));
    const first = asProvisioned(await svc.provisionIdentity(identity({ email: "keep@example.com" }), PROVEN));
    await svc.provisionIdentity(identity({ email: null }), PROVEN);
    const row = (await db.select().from(users).where(eq(users.id, first.userId)))[0];
    expect(row?.email).toBe("keep@example.com");
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
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const held = await freshHeldDb();
    const service = makeService(held.db, policyConfig, clock).svc;
    const warn = vi.spyOn(logger, "warn");
    const parked = held.hold(/insert into "users"/i);

    const pending = service.provisionIdentity(identity(), PROVEN);
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
    const call = warn.mock.calls.find(([bindings]) => (bindings as Record<string, unknown>)["event"] === "sso_insert_lost_race");
    const line = call?.[0] as Record<string, unknown> | undefined;
    expect(line?.["security"]).toBe(true);
    // An exact handle match is an account an admin may link to this subject, so the line says how.
    expect(line?.["match"]).toBe("exact");
    expect(String(call?.[1])).toContain("admin.linkSsoIdentity");
  });

  test("a concurrent writer taking only the handle's KEY ⇒ denied; the line says key-only and never advises a link", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const held = await freshHeldDb();
    const service = makeService(held.db, policyConfig, clock).svc;
    const warn = vi.spyOn(logger, "warn");
    const parked = held.hold(/insert into "users"/i);

    const pending = service.provisionIdentity(identity(), PROVEN);
    await parked.reached;
    await held.db.run(
      sql.raw(`insert into users (id, handle, handle_key, external_id, role, enabled, created_at, updated_at)
               values ('user_lookalike', 'ALICE', '${handleKey("alice")}', 'authentik|someone-else', 'user', 1, 1, 1)`),
    );
    parked.release();

    expect(await pending).toEqual({ outcome: "denied", reason: "account-exists" });
    // A key-only match is a DIFFERENT account that merely looks alike: linking it to this subject would hand
    // the look-alike's row to the wrong person, so the operator line must not suggest it.
    const call = warn.mock.calls.find(([bindings]) => (bindings as Record<string, unknown>)["event"] === "sso_insert_lost_race");
    expect((call?.[0] as Record<string, unknown> | undefined)?.["match"]).toBe("key-only");
    expect(String(call?.[1])).not.toContain("linkSsoIdentity");
  });

  test("the SAME-subject race still resolves onto the winner's row (the shape the insert absorbs by design)", async () => {
    policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "someone-else" };
    ({ svc } = makeService(db, policyConfig, clock));
    const held = await freshHeldDb();
    const service = makeService(held.db, policyConfig, clock).svc;
    const parked = held.hold(/insert into "users"/i);

    const pending = service.provisionIdentity(identity(), PROVEN);
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
