// entry/compose/admin — the seam that wires the admin surfaces. "Owns no business logic" is true of the
// SHAPE and false of the CONSEQUENCES: four of the ops it assembles are decisions no domain can make,
// because each spans a boundary a domain may not cross. Those four are what this file pins.
//
//   W7a — EVERY ADMIN REVOKE ENDS THE STREAMS, NOT JUST THE COOKIE. The socket registry is transport state
//         and `domain/admin`/`domain/sessions` may not import transport, so the eviction lives in THIS
//         wrapper. If it is lost, an admin "kick" leaves the kicked user's live SSE/WS sockets reading the
//         box until they reconnect — a revoke that revokes nothing. Both arms are pinned, including the
//         `owner === null` arm (an already-revoked/unknown session must NOT evict a phantom user).
//   D135 — the identity plane: `listSessions` re-stamps the OWNER onto each row (SessionView omits userId),
//         and it must stamp the user that was ASKED for, never the acting admin.
//   the vLLM read-model — a status key with no deployment fact resolves to the honest `port:0`/`storePath:""`
//         guard rather than being asserted present; a disabled supervisor answers `{}` / a no-op message
//         instead of throwing at the admin panel.
//   the LIVE embed model — `embedModel` is a THUNK over `roleClients.embedModel` because that binding
//         follows a role re-point; reading it at compose would re-freeze exactly what role-clients stopped
//         freezing, and every future card would be embedded with a stale model tag.
//
// Every op is driven THROUGH the real `AdminService` the seam returns, so the admin gate (`requireAdmin`)
// is exercised on the same path — a non-admin must be refused before any injected port is touched.

import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import type { CharacterId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
// The compose SEAMS are not on the `entry/compose` barrel — `services.ts` (the keystone) is their only
// production importer, by path; the seam tests follow it (the `chat-tools.test.ts` precedent).
import type { AdminComposeDeps } from "../../../../packages/server/src/entry/compose/admin.ts";
import { buildAdmin } from "../../../../packages/server/src/entry/compose/admin.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";

const ADMIN = principal(castId<UserId>("usr_admin"), { role: "admin", handle: castId<Handle>("admin") });
const PLAIN = principal(castId<UserId>("usr_plain"));
const TARGET = castId<UserId>("usr_target");
const SESSION = castId<SessionId>("ses_1");
const CHARACTER = castId<CharacterId>("chr_1");

// @orb-waive no-test-fabrication(unknown): never dereferenced — this seam only threads `db` into the service factories it builds. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const NO_DB = {} as unknown as Db;

const VIEW: SessionView = { id: SESSION, createdAt: 1, lastSeenAt: 2, expiresAt: 3, revokedAt: null, userAgent: "curl" };

interface Fakes {
  readonly listForUser: ReturnType<typeof vi.fn>;
  readonly revoke: ReturnType<typeof vi.fn>;
  readonly revokeAllForUser: ReturnType<typeof vi.fn>;
  readonly linkExternalIdStatement: ReturnType<typeof vi.fn>;
  readonly settleUnclaimedLink: ReturnType<typeof vi.fn>;
  readonly evictUser: ReturnType<typeof vi.fn>;
  readonly evictSession: ReturnType<typeof vi.fn>;
  readonly getCard: ReturnType<typeof vi.fn>;
  readonly loadCardText: ReturnType<typeof vi.fn>;
  readonly store: ReturnType<typeof vi.fn>;
  readonly audit: ReturnType<typeof vi.fn>;
  readonly status: ReturnType<typeof vi.fn>;
  readonly deployment: ReturnType<typeof vi.fn>;
  readonly restart: ReturnType<typeof vi.fn>;
  /** The in-process local-light warm-up handle: its rows ride the SAME engine read, and its `retry` is what
   *  a Restart on one of those rows means. */
  readonly localLightStatus: ReturnType<typeof vi.fn>;
  readonly localLightRetry: ReturnType<typeof vi.fn>;
  /** The MUTABLE active embed-model tag — `roleClientsFor(...).resolved("embed")` must read it per call
   *  (§7.5-1b — the six per-role getters collapsed into one `resolved(task)` read), not at compose. */
  embedModel: string;
}

function fakes(): Fakes {
  return {
    listForUser: vi.fn(() => Promise.resolve([VIEW])),
    revoke: vi.fn(() => Promise.resolve<UserId | null>(TARGET)),
    revokeAllForUser: vi.fn(() => Promise.resolve(3)),
    linkExternalIdStatement: vi.fn(() => ({})),
    settleUnclaimedLink: vi.fn(() => Promise.resolve({ outcome: "not-found" })),
    evictUser: vi.fn(() => 1),
    evictSession: vi.fn(() => 1),
    getCard: vi.fn(() => Promise.resolve({ name: "Aria" })),
    loadCardText: vi.fn(() => Promise.resolve("card text")),
    store: vi.fn(() => Promise.resolve(undefined)),
    audit: vi.fn(() => Promise.resolve(undefined)),
    status: vi.fn(() => ({})),
    deployment: vi.fn(() => ({})),
    restart: vi.fn(() => Promise.resolve("restarted")),
    localLightStatus: vi.fn(() => ({})),
    localLightRetry: vi.fn(() => Promise.resolve("retrying")),
    embedModel: "model-v1",
  };
}

function build(f: Fakes, withEngine = true): ReturnType<typeof buildAdmin> {
  const noopStop = (): void => undefined;
  const start = (): (() => void) => noopStop;
  const engine = withEngine ? { start, status: f.status, deployment: f.deployment, restart: f.restart } : null;
  // @orb-waive no-test-fabrication(unknown): inert structural stand-ins for the vLLM/export/CAS ports — only the ops the pins Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // below drive are ever called, and `db` is never dereferenced.
  const deps = {
    db: NO_DB,
    now: () => 1000,
    newUserId: () => castId<UserId>("usr_new"),
    hashPassword: () => Promise.resolve("hashed"),
    audit: f.audit,
    sessions: {
      listForUser: f.listForUser,
      revoke: f.revoke,
      revokeAllForUser: f.revokeAllForUser,
      linkExternalIdStatement: f.linkExternalIdStatement,
      settleUnclaimedLink: f.settleUnclaimedLink,
    },
    sockets: { evictUser: f.evictUser, evictSession: f.evictSession },
    vllmEngine: engine,
    localLightPrefetch: { start, status: f.localLightStatus, retry: f.localLightRetry },
    character: { getCard: f.getCard, loadCardText: f.loadCardText },
    embeddings: { store: f.store },
    // The per-FUNDER binder (§8.5b): only `resolved("embed")` is read here — the model reply itself is the
    // MUTABLE `f.embedModel`, closed over live so a re-point reaches the very next call.
    roleClientsFor: (_funderUserId: UserId) =>
      Promise.resolve({ resolved: (task: string) => Promise.resolve(task === "embed" ? { model: f.embedModel } : null) }),
    cas: {},
    imageTransform: {},
    exportCardScripts: () => Promise.resolve([]),
    exportRpgGame: () => Promise.resolve(null),
  } as unknown as AdminComposeDeps;
  return buildAdmin(deps);
}

describe("buildAdmin — W7a: an admin revoke ends the STREAMS, not just the cookie", () => {
  test("revokeSession evicts the sockets of the user the revoked session belonged to", async () => {
    const f = fakes();

    await build(f).admin.revokeSession({ principal: ADMIN, sessionId: SESSION });

    expect(f.revoke).toHaveBeenCalledWith(SESSION);
    expect(f.evictUser).toHaveBeenCalledWith(TARGET);
  });

  test("an unknown/already-revoked session (owner null) evicts NOBODY", async () => {
    const f = fakes();
    f.revoke.mockResolvedValue(null);

    await build(f).admin.revokeSession({ principal: ADMIN, sessionId: SESSION });

    expect(f.evictUser).not.toHaveBeenCalled();
  });

  test("revokeUserSessions evicts the target's sockets and reports the revoked count", async () => {
    const f = fakes();

    const result = await build(f).admin.revokeUserSessions({ principal: ADMIN, userId: TARGET });

    expect(result).toStrictEqual({ revoked: 3 });
    expect(f.evictUser).toHaveBeenCalledWith(TARGET);
  });

  test("the eviction is PER-USER, never per-session (owner ruling F4 — it reaches session-less sockets too)", async () => {
    const f = fakes();

    await build(f).admin.revokeSession({ principal: ADMIN, sessionId: SESSION });

    expect(f.evictSession).not.toHaveBeenCalled();
  });

  test("a NON-admin is refused before either port is reached", async () => {
    const f = fakes();
    const { admin } = build(f);

    await expect(admin.revokeSession({ principal: PLAIN, sessionId: SESSION })).rejects.toThrow();
    await expect(admin.revokeUserSessions({ principal: PLAIN, userId: TARGET })).rejects.toThrow();

    expect(f.revoke).not.toHaveBeenCalled();
    expect(f.revokeAllForUser).not.toHaveBeenCalled();
    expect(f.evictUser).not.toHaveBeenCalled();
  });
});

describe("buildAdmin — listSessions re-stamps the ASKED-FOR owner onto every row", () => {
  test("each row carries the queried userId (SessionView omits it) — never the acting admin's", async () => {
    const f = fakes();

    const rows = await build(f).admin.listSessions({ principal: ADMIN, userId: TARGET });

    expect(f.listForUser).toHaveBeenCalledWith(TARGET);
    expect(rows).toStrictEqual([{ ...VIEW, userId: TARGET }]);
    expect(rows.every((r) => r.userId !== ADMIN.userId)).toBe(true);
  });

  test("an empty session list stays empty (no phantom row is stamped into existence)", async () => {
    const f = fakes();
    f.listForUser.mockResolvedValue([]);

    expect(await build(f).admin.listSessions({ principal: ADMIN, userId: TARGET })).toStrictEqual([]);
  });
});

describe("buildAdmin — the inline card embed reads the LIVE embed model and fails leak-free", () => {
  test("embeds the card text under the requested character with the CURRENT embed-model tag", async () => {
    const f = fakes();

    await build(f).admin.embedCharacterCard({ principal: ADMIN, characterId: CHARACTER });

    expect(f.store).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "card", lens: "card-text", characterId: CHARACTER, content: "card text", model: "model-v1" }),
    );
  });

  test("a role RE-POINT after compose reaches the next embed (the thunk is not a captured string)", async () => {
    const f = fakes();
    const { admin } = build(f);

    await admin.embedCharacterCard({ principal: ADMIN, characterId: CHARACTER });
    f.embedModel = "model-v2";
    await admin.embedCharacterCard({ principal: ADMIN, characterId: CHARACTER });

    expect(f.store.mock.calls.map((c) => (c[0] as { model: string }).model)).toStrictEqual(["model-v1", "model-v2"]);
  });

  test("a missing/foreign card and a TEXTLESS card both collapse to the same not-found (no existence oracle)", async () => {
    const gone = fakes();
    gone.getCard.mockResolvedValue(null);
    const textless = fakes();
    textless.loadCardText.mockResolvedValue("");

    await expect(build(gone).admin.embedCharacterCard({ principal: ADMIN, characterId: CHARACTER })).rejects.toThrow();
    await expect(build(textless).admin.embedCharacterCard({ principal: ADMIN, characterId: CHARACTER })).rejects.toThrow();
    expect(gone.store).not.toHaveBeenCalled();
    expect(textless.store).not.toHaveBeenCalled();
  });
});

describe("buildAdmin — the two singletons built alongside admin", () => {
  test("returns the ONE process-lifetime tool-use registry and the export service", () => {
    const built = build(fakes());

    expect(typeof built.toolUse.register).toBe("function");
    expect(typeof built.exportService.exportCharacter).toBe("function");
  });
});
