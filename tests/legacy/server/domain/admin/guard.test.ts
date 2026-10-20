// The can() GUARD SEAM — the unit matrix (pure on the Principal; the principals and seat roles are rows in an in-memory db). Proves owner ⊇ admin lives HERE:
// `requireAdmin` passes owner ∪ admin, `requireOwner` is owner-only, `user` is denied everything; every
// deny throws DomainForbiddenError; the wrappers return the gated userId (chainable). This is the contract
// the W1 leaf domains inject — if this matrix is wrong, every gated surface is wrong.

import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { can, isAdmin, isOwner, requireAdmin, requireOwner } from "#server/domain/admin/index.ts";
import { seatRoles } from "../chat/_support.ts";
import { principal } from "./_support.ts";

/** A Principal carrying the given role, with a deterministic per-role userId. */
async function pr(db: Db, role: UserRole): ReturnType<typeof principal> {
  return await principal(db, castId<UserId>(`user_${role}`), role);
}

describe("can(global)", () => {
  test("action 'admin' passes owner and admin, denies user", async () => {
    const db = await freshDb();
    const [owner, admin, user] = [await pr(db, "owner"), await pr(db, "admin"), await pr(db, "user")];
    expect(() => can(owner, "admin", { kind: "global" })).not.toThrow();
    expect(() => can(admin, "admin", { kind: "global" })).not.toThrow();
    expect(() => can(user, "admin", { kind: "global" })).toThrow(DomainForbiddenError);
  });

  test("action 'owner' passes ONLY owner — admin and user denied", async () => {
    const db = await freshDb();
    const [owner, admin, user] = [await pr(db, "owner"), await pr(db, "admin"), await pr(db, "user")];
    expect(() => can(owner, "owner", { kind: "global" })).not.toThrow();
    expect(() => can(admin, "owner", { kind: "global" })).toThrow(DomainForbiddenError);
    expect(() => can(user, "owner", { kind: "global" })).toThrow(DomainForbiddenError);
  });
});

describe("requireAdmin (owner ∪ admin)", () => {
  test("returns the gated userId for owner and admin", async () => {
    const db = await freshDb();
    const owner = await pr(db, "owner");
    const admin = await pr(db, "admin");
    expect(requireAdmin(owner)).toBe(owner.userId);
    expect(requireAdmin(admin)).toBe(admin.userId);
  });

  test("denies a plain user", async () => {
    const user = await pr(await freshDb(), "user");
    expect(() => requireAdmin(user)).toThrow(DomainForbiddenError);
  });
});

// The BOOLEAN forms (F3 role-aware scoping) — the same `can()` decisions, caught into verdicts. Both go
// through the ONE kernel, so this matrix is also the pin that the two booleans do not collapse onto each
// other: the `admin` row is where `isAdmin` and `isOwner` MUST disagree, and it is the whole reason
// `/api/_debug` can be owner-only while the app's admin surfaces stay delegated (D17).
describe("isAdmin (owner ∪ admin, boolean)", () => {
  test("true for owner and admin, false for a plain user", async () => {
    const db = await freshDb();
    expect(isAdmin(await pr(db, "owner"))).toBe(true);
    expect(isAdmin(await pr(db, "admin"))).toBe(true);
    expect(isAdmin(await pr(db, "user"))).toBe(false);
  });
});

describe("isOwner (owner-only, boolean)", () => {
  test("true for the owner ONLY — a delegated admin is false, which is where it parts from isAdmin", async () => {
    const db = await freshDb();
    expect(isOwner(await pr(db, "owner"))).toBe(true);
    expect(isOwner(await pr(db, "admin"))).toBe(false);
    expect(isOwner(await pr(db, "user"))).toBe(false);
    // The disagreement, asserted as such: a collapse in either direction is what this row catches.
    expect(isAdmin(await pr(db, "admin"))).not.toBe(isOwner(await pr(db, "admin")));
  });
});

describe("requireOwner (owner-only)", () => {
  test("returns the gated userId for the owner", async () => {
    const db = await freshDb();
    const owner = await pr(db, "owner");
    expect(requireOwner(owner)).toBe(owner.userId);
  });

  test("denies a delegated admin and a plain user", async () => {
    const db = await freshDb();
    const [admin, user] = [await pr(db, "admin"), await pr(db, "user")];
    expect(() => requireOwner(admin)).toThrow(DomainForbiddenError);
    expect(() => requireOwner(user)).toThrow(DomainForbiddenError);
  });
});

// The CHAT resource arm — a PURE verdict over the roster chat feeds in (admin reads no chat db). The
// global role is irrelevant to the chat resource axis; the authority signal is the roster's `host|member`.
describe("can({kind:'chat', membership}) — the resource-role arm", () => {
  test("'read' allows any present member (the seam floor; presence is chat's pre-check)", async () => {
    const db = await freshDb();
    const [member, roles] = [await pr(db, "user"), await seatRoles(db)];
    expect(() => can(member, "read", { kind: "chat", membership: { role: roles.member } })).not.toThrow();
    expect(() => can(member, "read", { kind: "chat", membership: { role: roles.host } })).not.toThrow();
  });

  test("'host' passes the room host, denies a plain member", async () => {
    const db = await freshDb();
    const [member, roles] = [await pr(db, "user"), await seatRoles(db)];
    expect(() => can(member, "host", { kind: "chat", membership: { role: roles.host } })).not.toThrow();
    expect(() => can(member, "host", { kind: "chat", membership: { role: roles.member } })).toThrow(DomainForbiddenError);
  });

  test("the global role does NOT grant chat-host authority (resource axis is orthogonal)", async () => {
    const db = await freshDb();
    const [owner, roles] = [await pr(db, "owner"), await seatRoles(db)];
    // An owner who is only a plain MEMBER of the room is not the host — owner⊇admin is the GLOBAL axis only.
    expect(() => can(owner, "host", { kind: "chat", membership: { role: roles.member } })).toThrow(DomainForbiddenError);
  });
});
