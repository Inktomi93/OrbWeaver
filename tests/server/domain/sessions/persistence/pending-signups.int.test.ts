// D259 — the pending-join rows: the upsert that keeps one per subject, the expiry-gated take, the account
// insert gated on that take, and the reaper.

import type { Db } from "@orb/db";
import { oidcPendingSignups, users } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  deleteExpiredPendingSignups,
  selectLivePendingSignup,
  takePendingSignupStatement,
  upsertPendingSignup,
} from "../../../../../packages/server/src/domain/sessions/persistence/pending-signups.ts";
import { insertPendingSignupUserStatement } from "../../../../../packages/server/src/domain/sessions/persistence/users.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_750_000_000_000;
const TTL = 600_000;
const ADMITS = sql`1 = 1`;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

async function seedPending(secretHash: string, name = "friend"): Promise<void> {
  await upsertPendingSignup(db, {
    subject: castId<ExternalId>(`idp|${name}`),
    secretHash,
    handle: castId<Handle>(name),
    email: `${name}@example.test`,
    groups: ["g"],
    inviteTokenHash: "invite",
    idToken: null,
    createdAt: AT,
    expiresAt: AT + TTL,
  });
}

function account(name: string, email: string | null): Parameters<typeof insertPendingSignupUserStatement>[1] {
  return {
    id: castId<UserId>(`usr_${name}`),
    handle: castId<Handle>(name),
    externalId: castId<ExternalId>(`idp|${name}`),
    email,
    role: "user",
    enabled: true,
    at: AT,
  };
}

describe("persistence/pending-signups", () => {
  test("one live row per subject, read by secret hash inside its window only", async () => {
    await seedPending("h1");
    await seedPending("h2");
    expect(await db.select().from(oidcPendingSignups)).toHaveLength(1);
    expect(await selectLivePendingSignup(db, "h1", AT)).toBeUndefined();
    expect((await selectLivePendingSignup(db, "h2", AT))?.groups).toEqual(["g"]);
    expect(await selectLivePendingSignup(db, "h2", AT + TTL)).toBeUndefined();
  });

  test("the take gates the account insert: a live take writes the account, a missed take writes nothing", async () => {
    await seedPending("h1");
    const hit = await db.batch(
      batchMany([takePendingSignupStatement(db, "h1", AT), insertPendingSignupUserStatement(db, account("friend", "friend@example.test"), ADMITS)]),
    );
    expect([(hit[0] as readonly object[]).length, (hit[1] as readonly object[]).length]).toEqual([1, 1]);
    const miss = await db.batch(batchMany([takePendingSignupStatement(db, "h1", AT), insertPendingSignupUserStatement(db, account("again", null), ADMITS)]));
    expect([(miss[0] as readonly object[]).length, (miss[1] as readonly object[]).length]).toEqual([0, 0]);
  });

  test("an email already on a row writes no account even after a live take", async () => {
    await seedPending("h1");
    await seedUser(db, { handle: castId<Handle>("other"), email: "friend@example.test" });
    const results = await db.batch(
      batchMany([takePendingSignupStatement(db, "h1", AT), insertPendingSignupUserStatement(db, account("friend", "friend@example.test"), ADMITS)]),
    );
    expect((results[1] as readonly object[]).length).toBe(0);
    expect(
      await db
        .select()
        .from(users)
        .where(eq(users.handle, castId<Handle>("friend"))),
    ).toHaveLength(0);
  });

  test("the reaper removes only rows past their window", async () => {
    await seedPending("h1", "old");
    await upsertPendingSignup(db, {
      subject: castId<ExternalId>("idp|young"),
      secretHash: "h2",
      handle: castId<Handle>("young"),
      email: null,
      groups: [],
      inviteTokenHash: "invite",
      idToken: null,
      createdAt: AT + TTL,
      expiresAt: AT + 2 * TTL,
    });
    expect(await deleteExpiredPendingSignups(db, AT + TTL)).toBe(1);
    expect((await db.select().from(oidcPendingSignups)).map((row) => row.secretHash)).toEqual(["h2"]);
  });
});
