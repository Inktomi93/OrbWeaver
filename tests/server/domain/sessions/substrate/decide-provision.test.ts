import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, beforeEach, describe, vi } from "vitest";
import type { ProvisionCandidate } from "../../../../../packages/server/src/domain/sessions/contract/results.ts";
import { decideProvision } from "../../../../../packages/server/src/domain/sessions/substrate/decide-provision.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// The pure provision decision (D254). The precedence cases the verb suite drives through a db are pinned
// here without one, so the batch-shaped signup statement and the verb read one rule.

const SUBJECT = castId<ExternalId>("idp|alice");
const OWNER_ID = castId<UserId>("owner-row");
const ALICE_ID = castId<UserId>("alice-row");

function identity(over: Partial<ResolvedIdentity> = {}): ResolvedIdentity {
  return { externalId: SUBJECT, handle: castId<Handle>("alice"), groups: [], email: null, ...over };
}

function row(over: Partial<ProvisionCandidate> = {}): ProvisionCandidate {
  return { id: ALICE_ID, handle: castId<Handle>("alice"), externalId: SUBJECT, email: null, role: "user", enabled: true, ...over };
}

beforeEach(() => {
  vi.stubEnv("OWNER_HANDLES", "boss");
  vi.stubEnv("OWNER_GROUP", undefined);
  vi.stubEnv("OIDC_ADMIN_GROUPS", undefined);
  vi.stubEnv("OIDC_ALLOWED_GROUPS", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("decideProvision — refusals, in the ruled precedence", () => {
  test("a handle match onto a row bound to another subject is subject-mismatch, even for the owner row", () => {
    const decision = decideProvision(row({ id: OWNER_ID, externalId: castId<ExternalId>("idp|other") }), identity(), OWNER_ID, {});
    expect(decision).toEqual({ kind: "deny", cause: "subject-mismatch" });
  });

  test("the access gate refuses before the collision and JIT checks", () => {
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "friends");
    expect(decideProvision(row({ externalId: null }), identity(), OWNER_ID, { allowJitProvision: false })).toEqual({ kind: "deny", cause: "access-gate" });
  });

  test("an unbound row reached by handle is a handle-collision for a subject-bearing identity", () => {
    expect(decideProvision(row({ externalId: null }), identity(), OWNER_ID, {})).toEqual({ kind: "deny", cause: "handle-collision" });
  });

  test("a null-subject identity binds the unbound row (forward-header), never a collision", () => {
    const existing = row({ externalId: null });
    expect(decideProvision(existing, identity({ externalId: null }), OWNER_ID, {})).toMatchObject({ kind: "update", existing });
  });

  test("the email check comes before the JIT gate, and JIT closed is its fallback", () => {
    const decision = decideProvision(undefined, identity({ email: "a@example.test" }), OWNER_ID, { allowJitProvision: false });
    expect(decision).toEqual({ kind: "require-free-email", email: "a@example.test", otherwise: { kind: "deny", cause: "jit-closed" } });
  });

  test("JIT closed without an email is a bare jit-closed refusal", () => {
    expect(decideProvision(undefined, identity(), OWNER_ID, { allowJitProvision: false })).toEqual({ kind: "deny", cause: "jit-closed" });
  });
});

describe("decideProvision — writes", () => {
  test("a new identity inserts as user, enabled unless approval is required", () => {
    expect(decideProvision(undefined, identity(), OWNER_ID, {})).toEqual({
      kind: "insert",
      resolvedRole: "user",
      enabled: true,
      ownerSingletonDowngrade: false,
    });
    expect(decideProvision(undefined, identity(), OWNER_ID, { requireApproval: true })).toMatchObject({ kind: "insert", enabled: false });
  });

  test("the owner row is updated as the bootstrap owner with its own role", () => {
    const owner = row({ id: OWNER_ID, role: "owner", handle: castId<Handle>("boss") });
    expect(decideProvision(owner, identity({ handle: castId<Handle>("boss") }), OWNER_ID, {})).toEqual({
      kind: "update",
      existing: owner,
      resolvedRole: "owner",
      isBootstrapOwner: true,
      ownerSingletonDowngrade: false,
    });
  });

  test("an owner-by-policy identity tries the unbound owner row first and is never JIT-gated", () => {
    const decision = decideProvision(undefined, identity({ handle: castId<Handle>("boss") }), OWNER_ID, { allowJitProvision: false, requireApproval: true });
    expect(decision).toEqual({
      kind: "adopt-unbound-owner",
      ownerId: OWNER_ID,
      externalId: SUBJECT,
      otherwise: { kind: "insert", resolvedRole: "user", enabled: false, ownerSingletonDowngrade: true },
    });
  });

  test("the first owner-by-policy identity on an ownerless box inserts the owner, enabled", () => {
    const decision = decideProvision(undefined, identity({ handle: castId<Handle>("boss") }), undefined, { requireApproval: true });
    expect(decision).toEqual({ kind: "insert", resolvedRole: "owner", enabled: true, ownerSingletonDowngrade: false });
  });
});

// The owner claim: a handle match to OWNER_HANDLES alone never makes a subject the owner. The caller's proof (a
// loopback callback or the boot claim code) or OWNER_GROUP membership does. Each claim path is pinned unproven.
describe("decideProvision — the owner claim needs proof", () => {
  const boss = (over: Partial<ResolvedIdentity> = {}): ResolvedIdentity => identity({ handle: castId<Handle>("boss"), ...over });
  const unboundOwner = row({ id: OWNER_ID, role: "owner", handle: castId<Handle>("boss"), externalId: null });
  const unproven = { ownerClaimProven: false } as const;
  const proven = { ownerClaimProven: true } as const;

  test("binding the unbound owner row by a handle match, unproven, is refused (the mode-flip box)", () => {
    expect(decideProvision(unboundOwner, boss(), OWNER_ID, unproven)).toEqual({ kind: "deny", cause: "owner-claim-unproven" });
  });

  test("minting the owner on an ownerless box by a handle match, unproven, is refused (the fresh oidc box)", () => {
    expect(decideProvision(undefined, boss(), undefined, unproven)).toEqual({ kind: "deny", cause: "owner-claim-unproven" });
  });

  test("adopting the owner row by a handle match, unproven, is refused", () => {
    expect(decideProvision(undefined, boss(), OWNER_ID, unproven)).toEqual({ kind: "deny", cause: "owner-claim-unproven" });
  });

  test("an unproven handle claimant with its own row is an ordinary login: no owner role", () => {
    const own = row();
    expect(decideProvision(own, boss(), undefined, unproven)).toEqual({
      kind: "update",
      existing: own,
      resolvedRole: "user",
      isBootstrapOwner: false,
      ownerSingletonDowngrade: false,
    });
  });

  test("an unproven handle claimant gets no owner exemption from OIDC_ALLOWED_GROUPS", () => {
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "friends");
    expect(decideProvision(row(), boss(), OWNER_ID, unproven)).toEqual({ kind: "deny", cause: "access-gate" });
  });

  test("with the caller's proof, a handle match binds, mints and adopts", () => {
    expect(decideProvision(unboundOwner, boss(), OWNER_ID, proven)).toMatchObject({ kind: "update", existing: unboundOwner, isBootstrapOwner: true });
    expect(decideProvision(undefined, boss(), undefined, proven)).toMatchObject({ kind: "insert", resolvedRole: "owner" });
    expect(decideProvision(undefined, boss(), OWNER_ID, proven)).toMatchObject({ kind: "adopt-unbound-owner", ownerId: OWNER_ID });
  });

  test("an OWNER_GROUP member claims with no proof from the caller", () => {
    vi.stubEnv("OWNER_GROUP", "owners");
    const member = identity({ groups: ["owners"] });
    expect(decideProvision(undefined, member, OWNER_ID, unproven)).toMatchObject({ kind: "adopt-unbound-owner", ownerId: OWNER_ID });
    expect(decideProvision(undefined, member, undefined, unproven)).toMatchObject({ kind: "insert", resolvedRole: "owner" });
    expect(decideProvision(unboundOwner, boss({ groups: ["owners"] }), OWNER_ID, unproven)).toMatchObject({ kind: "update", isBootstrapOwner: true });
  });

  test("the bound owner's own login and a null-subject login claim nothing, so they need no proof", () => {
    const boundOwner = row({ id: OWNER_ID, role: "owner", handle: castId<Handle>("boss") });
    expect(decideProvision(boundOwner, boss(), OWNER_ID, unproven)).toMatchObject({ kind: "update", isBootstrapOwner: true });
    expect(decideProvision(unboundOwner, boss({ externalId: null }), OWNER_ID, unproven)).toMatchObject({ kind: "update", isBootstrapOwner: true });
  });
});
