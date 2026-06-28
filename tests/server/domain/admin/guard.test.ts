// The can() GUARD SEAM — the unit matrix (no db; pure on the Principal). Proves owner ⊇ admin lives HERE:
// `requireAdmin` passes owner ∪ admin, `requireOwner` is owner-only, `user` is denied everything; every
// deny throws DomainForbiddenError; the wrappers return the gated userId (chainable). This is the contract
// the W1 leaf domains inject — if this matrix is wrong, every gated surface is wrong.

import type { UserRole } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { can, requireAdmin, requireOwner } from "@orb/server/domain/admin";
import { describe, expect, test } from "vitest";
import { principal } from "./_support.ts";

/** A Principal carrying the given role, with a deterministic per-role userId. */
function pr(role: UserRole): ReturnType<typeof principal> {
  return principal(castId<UserId>(`user_${role}`), role);
}

describe("can(global)", () => {
  test("action 'admin' passes owner and admin, denies user", () => {
    expect(() => can(pr("owner"), "admin", { kind: "global" })).not.toThrow();
    expect(() => can(pr("admin"), "admin", { kind: "global" })).not.toThrow();
    expect(() => can(pr("user"), "admin", { kind: "global" })).toThrow(DomainForbiddenError);
  });

  test("action 'owner' passes ONLY owner — admin and user denied", () => {
    expect(() => can(pr("owner"), "owner", { kind: "global" })).not.toThrow();
    expect(() => can(pr("admin"), "owner", { kind: "global" })).toThrow(DomainForbiddenError);
    expect(() => can(pr("user"), "owner", { kind: "global" })).toThrow(DomainForbiddenError);
  });
});

describe("requireAdmin (owner ∪ admin)", () => {
  test("returns the gated userId for owner and admin", () => {
    const owner = pr("owner");
    const admin = pr("admin");
    expect(requireAdmin(owner)).toBe(owner.userId);
    expect(requireAdmin(admin)).toBe(admin.userId);
  });

  test("denies a plain user", () => {
    expect(() => requireAdmin(pr("user"))).toThrow(DomainForbiddenError);
  });
});

describe("requireOwner (owner-only)", () => {
  test("returns the gated userId for the owner", () => {
    const owner = pr("owner");
    expect(requireOwner(owner)).toBe(owner.userId);
  });

  test("denies a delegated admin and a plain user", () => {
    expect(() => requireOwner(pr("admin"))).toThrow(DomainForbiddenError);
    expect(() => requireOwner(pr("user"))).toThrow(DomainForbiddenError);
  });
});
