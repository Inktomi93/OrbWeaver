import type { Db } from "@orb/db";
import { sessions, users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  insertSession,
  listForUser,
  revokeAllForUser,
  revokeById,
  revokeByTokenHash,
  selectForValidation,
  slideExpiry,
} from "../../../../../packages/server/src/domain/sessions/persistence/sessions.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const USER_ID = castId<UserId>("user_alice");
const HANDLE = castId<Handle>("alice");
const T0 = 1_750_000_000_000;
const TTL = 1000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
  await db.insert(users).values({ id: USER_ID, handle: HANDLE, handleKey: handleKey(HANDLE), role: "owner" });
});

async function seedSession(id: string, tokenHash: string, createdAt: number = T0): Promise<SessionId> {
  const sessionId = castId<SessionId>(id);
  await insertSession(db, {
    id: sessionId,
    userId: USER_ID,
    tokenHash,
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: createdAt + TTL,
    userAgent: null,
    oidcIdToken: null,
  });
  return sessionId;
}

describe("persistence/sessions", () => {
  test("insertSession + selectForValidation joins the owning user (userId/role/handle/enabled)", async () => {
    await seedSession("session_a", "hash-a");
    const row = await selectForValidation(db, "hash-a");
    expect(row?.userId).toBe(USER_ID);
    expect(row?.role).toBe("owner");
    expect(row?.handle).toBe(HANDLE);
    expect(row?.enabled).toBe(true);
    expect(row?.revokedAt).toBeNull();
  });

  test("selectForValidation returns undefined for an unknown hash", async () => {
    expect(await selectForValidation(db, "missing")).toBeUndefined();
  });

  test("slideExpiry bumps lastSeenAt + expiresAt together", async () => {
    const id = await seedSession("session_a", "hash-a");
    await slideExpiry(db, id, T0 + 500, T0 + 500 + TTL);
    const row = await selectForValidation(db, "hash-a");
    expect(row?.lastSeenAt).toBe(T0 + 500);
    expect(row?.expiresAt).toBe(T0 + 500 + TTL);
  });

  test("revokeByTokenHash is atomic — returns the owner ONCE, then nothing", async () => {
    const id = await seedSession("session_a", "hash-a");
    const first = await revokeByTokenHash(db, "hash-a", T0 + 1);
    // #141 — the winner also reports the row's sealed OIDC end-session hint (null here: seedSession stores none).
    expect(first).toStrictEqual({ id, userId: USER_ID, oidcIdToken: null });
    expect(await revokeByTokenHash(db, "hash-a", T0 + 2)).toBeUndefined();
  });

  // #141 — `sealedIdTokenOf`'s ALL-OR-NONE refusal, previously unpinned. Two thirds of an AES-GCM seal is
  // not a seal: handing a `{ciphertext, iv: "", tag: ""}` shape upward would only produce a decrypt throw one
  // layer up, inside a logout that must never fail. The three partial shapes are the ones the table can
  // actually hold — a crash between `revokeByTokenHash`'s two statements, or a hand-patched row.
  // The ARRANGE+ACT half lives OUTSIDE the loop: a per-iteration closure would capture the file-scope `db`
  // that `beforeEach` reassigns, which is a real footgun (noLoopFunc) even where this one runs in order.
  async function revokeCarrying(cols: {
    oidcIdTokenCiphertext: string | null;
    oidcIdTokenIv: string | null;
    oidcIdTokenTag: string | null;
  }): Promise<{ id: SessionId; revoked: Awaited<ReturnType<typeof revokeByTokenHash>> }> {
    const id = await seedSession("session_a", "hash-a");
    await db.update(sessions).set(cols).where(eq(sessions.id, id));
    return { id, revoked: await revokeByTokenHash(db, "hash-a", T0 + 1) };
  }

  // The three partial shapes the table can actually hold, shared by the two loops below (what the call
  // REPORTS, and what it LEAVES ON THE ROW).
  const partialSeals = [
    { label: "ciphertext only", cols: { oidcIdTokenCiphertext: "ct", oidcIdTokenIv: null, oidcIdTokenTag: null } },
    { label: "missing the iv", cols: { oidcIdTokenCiphertext: "ct", oidcIdTokenIv: null, oidcIdTokenTag: "tag" } },
    { label: "missing the tag", cols: { oidcIdTokenCiphertext: "ct", oidcIdTokenIv: "iv", oidcIdTokenTag: null } },
  ];

  for (const partial of partialSeals) {
    test(`revokeByTokenHash reports NO hint for a half-written seal (${partial.label})`, async () => {
      const { id, revoked } = await revokeCarrying(partial.cols);
      // `null`, not a partial `Sealed` — the caller gets nothing to attempt an open on, so the logout
      // degrades to a bare end-session URL instead of throwing inside a sign-out that must always complete.
      expect(revoked).toStrictEqual({ id, userId: USER_ID, oidcIdToken: null });
    });
  }

  // #1578 — REPORTING nothing is not the same as LEAVING nothing. The clear used to be gated on
  // `sealedIdTokenOf(row) !== null`, which is exactly the predicate a half-written seal fails, so the stray
  // ciphertext survived on the dead row for the life of the deployment — contradicting this file's own rule
  // that a revoked session keeps no end-session hint at rest. Inert (a GCM ciphertext without its iv can
  // never be opened), so this is hygiene, not a live leak: the residue must go the way a whole seal does.
  // Same shape as `revokeCarrying` and for the same reason (noLoopFunc): the db read stays OUT of the loop
  // body so no per-iteration closure captures the `db` binding `beforeEach` reassigns.
  async function rowAfterRevokingCarrier(cols: {
    oidcIdTokenCiphertext: string | null;
    oidcIdTokenIv: string | null;
    oidcIdTokenTag: string | null;
  }): Promise<{ ciphertext: string | null; iv: string | null; tag: string | null; revokedAt: number | null }> {
    const { id } = await revokeCarrying(cols);
    const row = (await db.select().from(sessions).where(eq(sessions.id, id)))[0];
    return {
      ciphertext: row?.oidcIdTokenCiphertext ?? null,
      iv: row?.oidcIdTokenIv ?? null,
      tag: row?.oidcIdTokenTag ?? null,
      revokedAt: row?.revokedAt ?? null,
    };
  }

  for (const partial of partialSeals) {
    test(`revokeByTokenHash CLEARS a half-written seal off the dead row (${partial.label})`, async () => {
      // …and the revocation itself still happened: the clear is a SECOND statement, not a replacement.
      expect(await rowAfterRevokingCarrier(partial.cols)).toEqual({ ciphertext: null, iv: null, tag: null, revokedAt: T0 + 1 });
    });
  }

  test("revokeByTokenHash DOES report + consume a complete seal (the positive control for the arm above)", async () => {
    // Without this arm the three tests above would pass just as well against a function that always returns
    // null — this is what proves they are measuring the partial-ness and not a dead read.
    const id = await seedSession("session_a", "hash-a");
    const whole = { oidcIdTokenCiphertext: "ct", oidcIdTokenIv: "iv", oidcIdTokenTag: "tag" };
    await db.update(sessions).set(whole).where(eq(sessions.id, id));

    expect(await revokeByTokenHash(db, "hash-a", T0 + 1)).toStrictEqual({ id, userId: USER_ID, oidcIdToken: { ciphertext: "ct", iv: "iv", tag: "tag" } });
    // …and consumed: a dead row keeps no end-session hint at rest.
    const row = (await db.select().from(sessions).where(eq(sessions.id, id)))[0];
    expect(row).toMatchObject({ oidcIdTokenCiphertext: null, oidcIdTokenIv: null, oidcIdTokenTag: null });
  });

  test("revokeById flips one device", async () => {
    const id = await seedSession("session_a", "hash-a");
    await revokeById(db, id, T0 + 1);
    expect(await selectForValidation(db, "hash-a")).toMatchObject({ revokedAt: T0 + 1 });
  });

  test("revokeAllForUser returns the ids flipped this call (and not already-revoked ones)", async () => {
    const a = await seedSession("session_a", "hash-a");
    const b = await seedSession("session_b", "hash-b");
    const revoked = await revokeAllForUser(db, USER_ID, T0 + 1);
    expect(revoked.toSorted()).toStrictEqual([a, b].toSorted());
    expect(await revokeAllForUser(db, USER_ID, T0 + 2)).toStrictEqual([]);
  });

  test("listForUser projects the secret-free view, newest-first", async () => {
    const older = await seedSession("session_a", "hash-a", T0);
    const newer = await seedSession("session_b", "hash-b", T0 + 1000);
    const views = await listForUser(db, USER_ID);
    expect(views.map((v) => v.id)).toStrictEqual([newer, older]);
    expect(views[0]).not.toHaveProperty("tokenHash");
    expect(views[0]).not.toHaveProperty("userId");
  });

  test("listForUser caps at the hard ceiling (DoS floor), keeping the newest window", async () => {
    // One over the cap; the STALEST row (created earliest) must be the one dropped by the newest-first cap.
    const cap = 200;
    await Promise.all(Array.from({ length: cap + 1 }, (_, i) => seedSession(`session_${i}`, `hash-${i}`, T0 + i)));
    const views = await listForUser(db, USER_ID);
    expect(views).toHaveLength(cap);
    expect(views.some((v) => v.id === castId<SessionId>("session_0"))).toBe(false);
    expect(views.some((v) => v.id === castId<SessionId>(`session_${cap}`))).toBe(true);
  });
});
