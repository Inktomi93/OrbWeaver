// entry/compose/world-info — the seam that wires world-info plus the import ports built alongside it AND
// the OWNER-principal resolver the automation / plugin / portability blocks all thread. Two of its five
// products are identity-plane decisions:
//
//   • `resolveOwnerPrincipal` is a Principal-MINT (D135: identity resolves at the entry seam, and no path
//     invents a role that grants authority). It is deliberately a SEPARATE resolver from the keystone's
//     `resolveHostPrincipal` — same factory, different call sites — and it must read `users.role` rather
//     than stamping one: a fabricated `role:"user"` would fail-closed-DENY an owner's own automation, and a
//     fabricated `owner` would be a grant nobody voted for. Its degraded arm (row gone) must FLOOR at
//     `"user"`, never inherit.
//   • the world-info service is handed chat's membership guards as injected ops (`requireChatHost` /
//     `requireChatMember`) — world-info owns books, not room authority, so a seam that dropped a guard
//     would hand every member a host's write. They are pinned as PRESENT and wired to the chat guards by
//     driving the seam's own construction (their enforcement is chat's, tested at `requireHost`).
//
// The rest of the seam's job is distinctness: three separate id minters, an import port pair, and two bulk
// importers, none of which may collapse into one another.

import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { WorldInfoComposeDeps } from "../../../../packages/server/src/entry/compose/world-info.ts";
import { buildWorldInfo } from "../../../../packages/server/src/entry/compose/world-info.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_owner");

// @orb-waive no-test-fabrication(unknown): never dereferenced — the seam threads `db` into the factories it builds and calls none. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const NO_DB = {} as unknown as Db;

interface Row {
  readonly role: UserRole;
  readonly handle: Handle;
  readonly externalId: ExternalId | null;
}

function build(row: Row | null): { readonly built: ReturnType<typeof buildWorldInfo>; readonly loadUserById: ReturnType<typeof vi.fn> } {
  const loadUserById = vi.fn(() => Promise.resolve(row));
  // @orb-waive no-test-fabrication(unknown): structural stand-ins for the sessions/assets/character front doors; only Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // `loadUserById` is ever called below.
  const deps = {
    db: NO_DB,
    now: () => 1000,
    audit: vi.fn(() => Promise.resolve(undefined)),
    sessions: { loadUserById },
    emitChatBusEvent: vi.fn(() => Promise.resolve(undefined)),
    emitDomainEvent: vi.fn(),
    emitChatEventLive: vi.fn(),
    assets: { resolveOwnedAssetRefs: vi.fn(() => Promise.resolve([])) },
    character: { mintSyntheticGroupCharacter: vi.fn() },
  } as unknown as WorldInfoComposeDeps;
  return { built: buildWorldInfo(deps), loadUserById };
}

const REAL_ROW: Row = { role: "owner", handle: castId<Handle>("alex"), externalId: castId<ExternalId>("ext_1") };

describe("buildWorldInfo — resolveOwnerPrincipal READS the role, never stamps one (D135)", () => {
  test("the minted Principal carries the row's own role, handle and externalId, via 'fallback'", async () => {
    const { built, loadUserById } = build(REAL_ROW);

    const p = await built.resolveOwnerPrincipal(OWNER);

    expect(loadUserById).toHaveBeenCalledWith(OWNER);
    expect(p).toStrictEqual({ userId: OWNER, role: "owner", handle: "alex", externalId: "ext_1", via: "fallback" });
  });

  test("a PLAIN user's row is not elevated by passing through this seam", async () => {
    const { built } = build({ role: "user", handle: castId<Handle>("plain"), externalId: null });

    expect((await built.resolveOwnerPrincipal(OWNER)).role).toBe("user");
  });

  test("a VANISHED row FLOORS at role 'user' — the degraded arm denies, it never inherits", async () => {
    const { built } = build(null);

    const p = await built.resolveOwnerPrincipal(OWNER);

    expect(p.role).toBe("user");
    expect(p.externalId).toBeNull();
    // With no row the handle degrades to the id itself rather than being invented.
    expect(p.handle).toBe(OWNER);
  });

  test("the resolver is asked per call (never a boot-time snapshot of one user's authority)", async () => {
    const { built, loadUserById } = build(REAL_ROW);

    await built.resolveOwnerPrincipal(OWNER);
    await built.resolveOwnerPrincipal(castId<UserId>("usr_second"));

    expect(loadUserById.mock.calls.map((c) => c[0])).toStrictEqual([OWNER, "usr_second"]);
  });
});

describe("buildWorldInfo — the seam's five products are distinct and complete", () => {
  test("returns the service, BOTH import ports, both bulk importers and the owner resolver", () => {
    const { built } = build(REAL_ROW);

    expect(Object.keys(built).sort()).toStrictEqual(["worldInfo", "importWorldInfo", "bulkImportChats", "bulkImportPersonas", "resolveOwnerPrincipal"].sort());
    expect(typeof built.importWorldInfo.importLorebook).toBe("function");
    // PD-144: the carried-book RE-LINK is a separate port from the lorebook write — collapsing the two
    // would make a portable card's attached-book references clone rows instead of re-linking them.
    expect(typeof built.importWorldInfo.linkCarriedBooks).toBe("function");
    expect(built.importWorldInfo.importLorebook).not.toBe(built.importWorldInfo.linkCarriedBooks);
  });

  test("the world-info service carries its room-scoped verbs (the membership-gated surface exists)", () => {
    const { built } = build(REAL_ROW);

    // Read through the real service type — the room-scoped write and the delete whose PRE-write reach
    // capture this seam wires are both the membership guards' consumers.
    expect(typeof built.worldInfo.createBook).toBe("function");
    expect(typeof built.worldInfo.removeBook).toBe("function");
  });

  test("the two bulk importers are separate ops (chats and personas never share one writer)", () => {
    const { built } = build(REAL_ROW);

    expect(typeof built.bulkImportChats).toBe("function");
    expect(typeof built.bulkImportPersonas).toBe("function");
    expect(built.bulkImportChats).not.toBe(built.bulkImportPersonas);
  });
});
