// sessions.authenticate (PD-83) — the local password login resolution, against a real libSQL db and the
// REAL scrypt hasher (the same pepper the context binds). Pins the four leak-free-null failure shapes
// (unknown handle / SSO-only null hash / wrong password / disabled row), the happy path, and the trimmed
// handle (a stored row never carries whitespace — the ensureUser discipline).

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createPasswordHasher } from "@orb/server/infra/auth";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService, PEPPER } from "../_support.ts";

const PASSWORD = "correct horse battery";

let db: Db;
let svc: SessionsService;
let storedHash: string;

beforeAll(async () => {
  // One real scrypt hash for the suite (the KDF is deliberately slow — hash once, reuse per test).
  storedHash = await createPasswordHasher(PEPPER).hash(PASSWORD);
});

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

describe("sessions.authenticate", () => {
  test("the correct handle + password resolves the row id (and a trimmed handle matches)", async () => {
    const userId = await svc.ensureUser(castId<Handle>("alice"));
    await db.update(users).set({ passwordHash: storedHash }).where(eq(users.id, userId));

    expect(await svc.authenticate(castId<Handle>("alice"), PASSWORD)).toBe(userId);
    expect(await svc.authenticate(castId<Handle>("  alice  "), PASSWORD)).toBe(userId);
  });

  test("a wrong password is null", async () => {
    const userId = await svc.ensureUser(castId<Handle>("alice"));
    await db.update(users).set({ passwordHash: storedHash }).where(eq(users.id, userId));
    expect(await svc.authenticate(castId<Handle>("alice"), "not the password")).toBeNull();
  });

  test("an unknown handle is null (the dummy-hash burn — no fast reject, no throw)", async () => {
    expect(await svc.authenticate(castId<Handle>("nobody"), PASSWORD)).toBeNull();
  });

  test("an SSO-only row (null passwordHash) can never password-login", async () => {
    await svc.ensureUser(castId<Handle>("sso-user")); // ensureUser leaves passwordHash null
    expect(await svc.authenticate(castId<Handle>("sso-user"), PASSWORD)).toBeNull();
  });

  test("a DISABLED row is refused even with the correct password", async () => {
    const userId = await svc.ensureUser(castId<Handle>("alice"));
    await db.update(users).set({ passwordHash: storedHash, enabled: false }).where(eq(users.id, userId));
    expect(await svc.authenticate(castId<Handle>("alice"), PASSWORD)).toBeNull();
  });
});
