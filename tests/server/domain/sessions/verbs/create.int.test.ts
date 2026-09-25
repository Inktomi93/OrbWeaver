import type { Db } from "@orb/db";
import { auditLogs, sessions, users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createTokenHasher } from "../../../../../packages/server/src/domain/sessions/tokens/tokens.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService, PEPPER } from "../_support.ts";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USER_ID = castId<UserId>("user_alice");
const SESSION_ID_RE = /^session_/u;
/** #141 — a compact ID-token stand-in. Nothing under test parses it; its BYTES are the assertion. */
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.sig-not-verified-here";

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
  await db.insert(users).values({ id: USER_ID, handle: castId<Handle>("alice"), handleKey: handleKey(castId<Handle>("alice")) });
});

describe("sessions.create", () => {
  test("returns an opaque token + row id + the 30-day expiry", async () => {
    const result = await svc.create({ userId: USER_ID });
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.sessionId).toMatch(SESSION_ID_RE);
    expect(result.expiresAt).toBe(FROZEN_AT_MS + SESSION_TTL_MS);
  });

  test("persists ONLY the peppered hash — never the raw token (invariant #3)", async () => {
    const { token, sessionId } = await svc.create({ userId: USER_ID });
    const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    const row = rows[0];
    expect(row).toBeDefined();
    expect(row?.tokenHash).toBe(createTokenHasher(PEPPER)(token));
    expect(row?.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  test("captures the user-agent when supplied, null otherwise", async () => {
    const a = await svc.create({ userId: USER_ID, userAgent: "Firefox/1.0" });
    const b = await svc.create({ userId: USER_ID });
    const rowA = (await db.select().from(sessions).where(eq(sessions.id, a.sessionId)))[0];
    const rowB = (await db.select().from(sessions).where(eq(sessions.id, b.sessionId)))[0];
    expect(rowA?.userAgent).toBe("Firefox/1.0");
    expect(rowB?.userAgent).toBeNull();
  });

  test("audits AUTH_LOGIN attributed to the session owner", async () => {
    const { sessionId } = await svc.create({ userId: USER_ID });
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, "AUTH_LOGIN"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorUserId).toBe(USER_ID);
    expect(audits[0]?.entityId).toBe(sessionId);
  });
});

// #141 — THE OIDC id_token AT REST. The owner ruled (2026-08-30) that the id_token is persisted so logout
// can send `id_token_hint`; the whole point of that ruling being safe is that the token is SEALED, bound to
// its own row, and invisible to every read but the logout revoke's. These pins are the at-rest half.
describe("sessions.create — the sealed OIDC id_token (#141)", () => {
  test("the raw id_token NEVER reaches the database — only its AES-256-GCM ciphertext does", async () => {
    const { sessionId } = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];

    // The same shape as the token-hash pin above: search the WHOLE row, so a future column that copies the
    // plaintext somewhere else is caught by this assertion rather than by a reviewer.
    expect(JSON.stringify(row)).not.toContain(ID_TOKEN);
    expect(row?.oidcIdTokenCiphertext).not.toBe(ID_TOKEN);
    // All three GCM parts are written together — two thirds of a seal is an unopenable blob.
    expect(row?.oidcIdTokenCiphertext).toEqual(expect.any(String));
    expect(row?.oidcIdTokenIv).toEqual(expect.any(String));
    expect(row?.oidcIdTokenTag).toEqual(expect.any(String));
  });

  test("a non-OIDC mint (local login / first-run) stores nothing in the three columns", async () => {
    const { sessionId } = await svc.create({ userId: USER_ID });
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(row?.oidcIdTokenCiphertext).toBeNull();
    expect(row?.oidcIdTokenIv).toBeNull();
    expect(row?.oidcIdTokenTag).toBeNull();
  });

  test("an empty id_token seals nothing rather than sealing the empty string", async () => {
    const { sessionId } = await svc.create({ userId: USER_ID, oidcIdToken: "" });
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(row?.oidcIdTokenCiphertext).toBeNull();
  });

  test("the seal is bound to ITS OWN ROW — two sessions holding the same id_token get different ciphertext", async () => {
    // The AAD is the session row id, so identical plaintext under the same key still produces distinct
    // blobs, and a blob lifted onto the other row cannot be opened (proven in the revoke suite).
    const a = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    const b = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    const rowA = (await db.select().from(sessions).where(eq(sessions.id, a.sessionId)))[0];
    const rowB = (await db.select().from(sessions).where(eq(sessions.id, b.sessionId)))[0];
    expect(rowA?.oidcIdTokenCiphertext).not.toBe(rowB?.oidcIdTokenCiphertext);
  });

  test("the id_token is not projected by any session READ — not `validate`, not the admin device list", async () => {
    // The negative pin for the whole feature: the blob has exactly ONE reader (the logout revoke). If a
    // later `select()` widening sweeps it into a projection, this reds.
    const { token, sessionId } = await svc.create({ userId: USER_ID, oidcIdToken: ID_TOKEN });
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    const sealed = row?.oidcIdTokenCiphertext ?? "";
    expect(sealed.length).toBeGreaterThan(0); // the positive control: there IS something to leak

    const validated = await svc.validate(token);
    const listed = await svc.listForUser(USER_ID);
    for (const projection of [JSON.stringify(validated), JSON.stringify(listed)]) {
      expect(projection).not.toContain(ID_TOKEN); // the plaintext
      expect(projection).not.toContain(sealed); // ...and the ciphertext, which is still secret material
      expect(projection).not.toContain("oidcIdToken");
    }
  });
});
