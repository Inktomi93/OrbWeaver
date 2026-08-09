// B4 — the first-run owner-password verbs (domain/sessions). `ownerNeedsPassword` reports a passwordless
// owner row (drives the localFirstRun config flag); `claimOwnerPassword` is the ONE-SHOT write that can only
// set a NULL password and never overwrite an existing one (the security invariant the unauthenticated
// first-run route rests on).

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

const T = 1_700_000_000_000;
const HASH_A = "scrypt$aaa$bbb";
const HASH_B = "scrypt$ccc$ddd";

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

async function seedOwnerRow(passwordHash: string | null): Promise<UserId> {
  const id = castId<UserId>("user_owner");
  await db.insert(users).values({
    id,
    handle: castId<Handle>("owner"),
    role: "owner",
    enabled: true,
    passwordHash,
    createdAt: T,
    updatedAt: T,
  });
  return id;
}

async function passwordHashOf(id: UserId): Promise<string | null> {
  const row = (await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, id)))[0];
  return row?.passwordHash ?? null;
}

describe("sessions owner-password (B4 first-run)", () => {
  test("ownerNeedsPassword: TRUE for a passwordless owner row", async () => {
    await seedOwnerRow(null);
    expect(await svc.ownerNeedsPassword()).toBe(true);
  });

  test("ownerNeedsPassword: FALSE once the owner has a password", async () => {
    await seedOwnerRow(HASH_A);
    expect(await svc.ownerNeedsPassword()).toBe(false);
  });

  test("ownerNeedsPassword: FALSE when there is no owner row at all", async () => {
    expect(await svc.ownerNeedsPassword()).toBe(false);
  });

  test("claimOwnerPassword: sets a NULL owner password once, returns the owner id", async () => {
    const id = await seedOwnerRow(null);
    const claimed = await svc.claimOwnerPassword(HASH_A);
    expect(claimed).toBe(id);
    expect(await passwordHashOf(id)).toBe(HASH_A);
  });

  test("claimOwnerPassword: ONE-SHOT — a second claim NEVER overwrites, returns null", async () => {
    const id = await seedOwnerRow(HASH_A);
    const claimed = await svc.claimOwnerPassword(HASH_B);
    expect(claimed).toBeNull();
    // The original password is untouched — the one-shot cannot become a reset.
    expect(await passwordHashOf(id)).toBe(HASH_A);
  });

  test("claimOwnerPassword: null when there is no owner row", async () => {
    expect(await svc.claimOwnerPassword(HASH_A)).toBeNull();
  });
});
