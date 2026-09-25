import type { Db } from "@orb/db";
import { auditLogs, sessions, users } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import { handleKey } from "@orb/kit/handle-key";
import type { ExternalId, Handle, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { createLocalLightUserSeed } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService, PEPPER } from "../_support.ts";

const USER_ID = castId<UserId>("user_alice");
/** #141 — a compact ID-token stand-in. Nothing under test parses it; its BYTES are the assertion. */
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.sig-not-verified-here";

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
  await db.insert(users).values({ id: USER_ID, handle: castId<Handle>("alice"), handleKey: handleKey(castId<Handle>("alice")) });
});

async function logoutAudits(): Promise<number> {
  const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, "AUTH_LOGOUT"));
  return rows.length;
}

describe("sessions.revokeByToken (logout)", () => {
  test("revokes the session → validate returns null, audits AUTH_LOGOUT for the owner", async () => {
    const { token } = await svc.create({ userId: USER_ID });
    await svc.revokeByToken(token);
    expect(await svc.validate(token)).toBeNull();
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, "AUTH_LOGOUT"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorUserId).toBe(USER_ID);
  });

  test("is atomic — a second revoke matches nothing and does NOT double-audit", async () => {
    const { token } = await svc.create({ userId: USER_ID });
    await svc.revokeByToken(token);
    await svc.revokeByToken(token);
    expect(await logoutAudits()).toBe(1);
  });

  test("an unknown token is a no-op (no audit)", async () => {
    // The cast is what a forged cookie looks like AFTER the entry-tier brand: shaped like a token, matches
    // no `token_hash` row. The brand records provenance; the hash lookup is the authenticity gate.
    await svc.revokeByToken(castId<SessionToken>("nope"));
    expect(await logoutAudits()).toBe(0);
  });
});

describe("sessions.revoke (admin kick one device)", () => {
  test("revokes a specific session by id, and reports WHOSE it was", async () => {
    const { token, sessionId } = await svc.create({ userId: USER_ID });
    // The owner is what the entry tier evicts live sockets by (W7a) — the caller holds only a session id.
    expect(await svc.revoke(sessionId)).toBe(USER_ID);
    expect(await svc.validate(token)).toBeNull();
  });

  test("re-kicking an already-revoked session names nobody (so it evicts nobody)", async () => {
    const { sessionId } = await svc.create({ userId: USER_ID });
    await svc.revoke(sessionId);
    expect(await svc.revoke(sessionId)).toBeNull();
  });
});

describe("sessions.revokeAllForUser (kick-all)", () => {
  test("revokes every live session and returns the count flipped this call", async () => {
    const a = await svc.create({ userId: USER_ID });
    const b = await svc.create({ userId: USER_ID });
    expect(await svc.revokeAllForUser(USER_ID)).toBe(2);
    expect(await svc.validate(a.token)).toBeNull();
    expect(await svc.validate(b.token)).toBeNull();
    // Already-revoked sessions are not re-counted (atomic WHERE revokedAt IS NULL).
    expect(await svc.revokeAllForUser(USER_ID)).toBe(0);
  });

  test("returns 0 when the user has no live sessions", async () => {
    expect(await svc.revokeAllForUser(USER_ID)).toBe(0);
  });
});

// #1691 — the UNEXECUTED twin. It exists so a CALLER whose own privileged write must not outlive the kick
// (`admin.resetPassword`) can commit both in ONE batch; the property that matters here is that it is the
// SAME atomic UPDATE, so its `revokedAt IS NULL` guard and its clearing of the sealed id_token columns hold
// exactly as the executed verb's do.
describe("sessions.revokeAllForUserStatement (the batch-riding kick)", () => {
  test("run inside a caller's batch it revokes every live session, and re-running it flips nothing", async () => {
    const a = await svc.create({ userId: USER_ID });
    const b = await svc.create({ userId: USER_ID });

    const revoked = await db.batch(batchMany([svc.revokeAllForUserStatement(USER_ID, FROZEN_AT_MS)]));
    expect((revoked[0] as { id: SessionId }[]).map((r) => r.id).sort()).toEqual([a.sessionId, b.sessionId].sort());
    expect(await svc.validate(a.token)).toBeNull();
    expect(await svc.validate(b.token)).toBeNull();

    const again = await db.batch(batchMany([svc.revokeAllForUserStatement(USER_ID, FROZEN_AT_MS)]));
    expect(again[0]).toHaveLength(0);
  });

  test("it is UNEXECUTED until the caller runs it — building the statement revokes nothing", async () => {
    const live = await svc.create({ userId: USER_ID });
    svc.revokeAllForUserStatement(USER_ID, FROZEN_AT_MS);
    expect(await svc.validate(live.token)).not.toBeNull();
  });
});

// A5 — OIDC back-channel logout revokes by the stable external subject (`sub`), mapping sub→external_id→
// user→sessions. Idempotent (re-delivered logout tokens re-revoke nothing).
describe("sessions.revokeByExternalId (OIDC back-channel logout)", () => {
  const External = castId<ExternalId>("authentik|alice");

  beforeEach(async () => {
    // Bind alice's row to the external subject the logout_token will carry.
    await db.update(users).set({ externalId: External }).where(eq(users.id, USER_ID));
  });

  test("revokes every live session for the user bound to the subject → count, validate null", async () => {
    const a = await svc.create({ userId: USER_ID });
    const b = await svc.create({ userId: USER_ID });
    // W7a — the summary also names WHOSE sockets the entry tier must evict (one subject, one row here).
    expect(await svc.revokeByExternalId(External)).toEqual({ revoked: 2, userIds: [USER_ID] });
    expect(await svc.validate(a.token)).toBeNull();
    expect(await svc.validate(b.token)).toBeNull();
  });

  test("is idempotent — a re-delivered token re-revokes nothing (atomic WHERE revokedAt IS NULL)", async () => {
    await svc.create({ userId: USER_ID });
    expect(await svc.revokeByExternalId(External)).toEqual({ revoked: 1, userIds: [USER_ID] });
    // A re-delivered token names no users either — so the idempotent re-revoke evicts nothing.
    expect(await svc.revokeByExternalId(External)).toEqual({ revoked: 0, userIds: [] });
  });

  test("an UNKNOWN subject revokes nothing (0) — never another user's sessions", async () => {
    await svc.create({ userId: USER_ID });
    expect(await svc.revokeByExternalId(castId<ExternalId>("authentik|nobody"))).toEqual({ revoked: 0, userIds: [] });
  });

  test("only the SUBJECT's sessions are revoked, not a co-tenant's", async () => {
    const other = castId<UserId>("user_bob");
    await db
      .insert(users)
      .values({ id: other, handle: castId<Handle>("bob"), handleKey: handleKey(castId<Handle>("bob")), externalId: castId<ExternalId>("authentik|bob") });
    const aliceSession = await svc.create({ userId: USER_ID });
    const bobSession = await svc.create({ userId: other });
    expect(await svc.revokeByExternalId(External)).toEqual({ revoked: 1, userIds: [USER_ID] }); // alice only
    expect(await svc.validate(aliceSession.token)).toBeNull();
    expect(await svc.validate(bobSession.token)).not.toBeNull(); // bob untouched
  });
});

// #141 — THE OIDC END-SESSION HINT, consume-once. The logout revoke is the sealed id_token's ONLY reader:
// it opens the blob for the `id_token_hint` the route appends, and clears it in the same call so a dead row
// never keeps secret material at rest. A decrypt failure degrades to "no hint", never to a failed logout.
describe("sessions.revokeByToken — the OIDC end-session hint (#141)", () => {
  async function sealedColumnsOf(sessionId: SessionId): Promise<{ ciphertext: string | null; iv: string | null; tag: string | null }> {
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    return { ciphertext: row?.oidcIdTokenCiphertext ?? null, iv: row?.oidcIdTokenIv ?? null, tag: row?.oidcIdTokenTag ?? null };
  }

  test("returns the DECRYPTED id_token, byte-identical to what the callback handed create", async () => {
    const { token, sessionId } = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    // A mangled hint is one authentik rejects, so byte-equality is the assertion, not "is a string".
    expect(await svc.revokeByToken(token)).toEqual({ sessionId, oidcIdToken: ID_TOKEN });
  });

  test("CONSUMES it — the row's sealed columns are cleared, so a second logout gets no hint", async () => {
    const { token, sessionId } = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    expect((await sealedColumnsOf(sessionId)).ciphertext).toEqual(expect.any(String)); // positive control
    await svc.revokeByToken(token);
    expect(await sealedColumnsOf(sessionId)).toEqual({ ciphertext: null, iv: null, tag: null });
    // The row is already revoked, so the second call matches nothing at all — no row, no hint.
    expect(await svc.revokeByToken(token)).toBeNull();
  });

  test("a non-OIDC session reports no hint (the route then sends the BARE end-session URL)", async () => {
    const { token, sessionId } = await svc.create({ userId: USER_ID });
    expect(await svc.revokeByToken(token)).toEqual({ sessionId, oidcIdToken: null });
  });

  test("a blob LIFTED onto another session's row cannot be opened — the AAD binding, and it degrades to null", async () => {
    // THE ATTACK THE AAD EXISTS FOR: with write access to the table, move Alice's sealed id_token onto a
    // row you control and sign out, to have the IdP hand YOU her end-session hint. GCM's tag covers the AAD
    // (the session row id), so the open fails — and because a logout must never fail, the verb degrades to
    // "no hint" rather than throwing.
    const victim = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    const attacker = await svc.create({ userId: USER_ID });
    const stolen = await sealedColumnsOf(victim.sessionId);
    await db
      .update(sessions)
      .set({ oidcIdTokenCiphertext: stolen.ciphertext, oidcIdTokenIv: stolen.iv, oidcIdTokenTag: stolen.tag })
      .where(eq(sessions.id, attacker.sessionId));

    expect(await svc.revokeByToken(attacker.token)).toEqual({ sessionId: attacker.sessionId, oidcIdToken: null });
    // ...and the lifted copy is cleared off the row it was planted on, like any other consumed blob.
    expect(await sealedColumnsOf(attacker.sessionId)).toEqual({ ciphertext: null, iv: null, tag: null });
  });

  test("a ROTATED session secret degrades to no hint instead of breaking sign-out", async () => {
    // The realistic operational cause of a decrypt failure: SESSION_SECRET changed, so the HKDF key moved
    // and every id_token already at rest is unopenable. The session must still end.
    const stale = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    const rotated = createSessionsService({
      db,
      now: (): number => FROZEN_AT_MS,
      sessionSecret: `${PEPPER}-rotated`,
      seedUserConnections: createLocalLightUserSeed({ db, now: (): number => FROZEN_AT_MS, onEmbedSpaceBound: () => undefined }),
    });
    // Mint the cookie under the ROTATED service so its token hash resolves, then plant the OLD service's
    // sealed blob on that row — exactly the state a rotation leaves behind.
    const after = await rotated.create({ userId: USER_ID });
    const planted = await sealedColumnsOf(stale.sessionId);
    await db
      .update(sessions)
      .set({ oidcIdTokenCiphertext: planted.ciphertext, oidcIdTokenIv: planted.iv, oidcIdTokenTag: planted.tag })
      .where(eq(sessions.id, after.sessionId));

    expect(await rotated.revokeByToken(after.token)).toEqual({ sessionId: after.sessionId, oidcIdToken: null });
    expect(await rotated.validate(after.token)).toBeNull(); // the logout still happened
  });

  test("the ADMIN revoke paths clear the hint too — a dead session keeps no secret at rest", async () => {
    const kicked = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    await svc.revoke(kicked.sessionId);
    expect(await sealedColumnsOf(kicked.sessionId)).toEqual({ ciphertext: null, iv: null, tag: null });

    const swept = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    await svc.revokeAllForUser(USER_ID);
    expect(await sealedColumnsOf(swept.sessionId)).toEqual({ ciphertext: null, iv: null, tag: null });
  });

  test("the OIDC back-channel logout clears it as well (the IdP-initiated sweep)", async () => {
    await db
      .update(users)
      .set({ externalId: castId<ExternalId>("authentik|alice") })
      .where(eq(users.id, USER_ID));
    const live = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    await svc.revokeByExternalId(castId<ExternalId>("authentik|alice"));
    expect(await sealedColumnsOf(live.sessionId)).toEqual({ ciphertext: null, iv: null, tag: null });
  });
});
