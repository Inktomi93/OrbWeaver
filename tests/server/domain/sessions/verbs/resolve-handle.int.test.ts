// sessions.resolveHandle (PD-66) — the EXACT handle→userId lookup for targeted chat invites. Proves
// against a real libSQL db: a known handle resolves its id; an unknown handle is null; a DISABLED row
// collapses to null (an un-invitable account is indistinguishable from an unknown handle — leak-free).

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeService } from "../_support.ts";

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

describe("sessions.resolveHandle", () => {
  test("a known handle resolves to its user id; an unknown handle is null", async () => {
    const userId = await svc.ensureUser(castId<Handle>("alice"));
    expect(await svc.resolveHandle(castId<Handle>("alice"))).toBe(userId);
    expect(await svc.resolveHandle(castId<Handle>("nobody"))).toBeNull();
  });

  test("a DISABLED row collapses to null (un-invitable == unknown — leak-free)", async () => {
    const userId = await svc.ensureUser(castId<Handle>("alice"));
    await db.update(users).set({ enabled: false }).where(eq(users.id, userId));
    expect(await svc.resolveHandle(castId<Handle>("alice"))).toBeNull();
  });
});
