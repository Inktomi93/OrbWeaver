// D257 — the handle writes other tiers make through sessions: admin's local-account mint statement and boot's
// owner seed-key rename. Each stores the handle's key beside the handle, and a key another row holds is a
// unique violation the caller sees, never an absorbed no-op.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import { handleKey } from "@orb/kit/handle-key";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

const AT = 1_750_000_000_000;
const MINTED = castId<UserId>("user_minted");

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

async function rowOf(id: UserId): Promise<typeof users.$inferSelect | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

const isUniqueViolation = (err: unknown): boolean => isConstraintViolation(err)?.kind === "unique";

describe("sessions.localUserInsertStatement", () => {
  test("the executed mint stores a human with the hash and the handle's key, the handle unfolded", async () => {
    const statement = svc.localUserInsertStatement({ id: MINTED, handle: castId<Handle>("Émile"), role: "admin", passwordHash: "scrypt$x", at: AT });
    expect(await statement).toEqual([{ id: MINTED }]);
    expect(await rowOf(MINTED)).toEqual(
      expect.objectContaining({ handle: "Émile", handleKey: handleKey("Émile"), role: "admin", kind: "human", passwordHash: "scrypt$x", createdAt: AT }),
    );
  });

  test("a handle whose key another row holds is a unique violation, and nothing is written", async () => {
    await seedUser(db, { handle: castId<Handle>("host") });
    const statement = svc.localUserInsertStatement({ id: MINTED, handle: castId<Handle>("HOST"), role: "user", passwordHash: "scrypt$x", at: AT });
    await expect(Promise.resolve(statement)).rejects.toSatisfy(isUniqueViolation);
    expect(await rowOf(MINTED)).toBeUndefined();
  });
});

describe("sessions.renameUserHandle", () => {
  test("the key moves with the handle, so the old handle is free for another account", async () => {
    const owner = await seedUser(db, { handle: castId<Handle>("owner-old") });
    await svc.renameUserHandle(owner.id, castId<Handle>("Owner-New"), AT);
    expect(await rowOf(owner.id)).toEqual(expect.objectContaining({ handle: "Owner-New", handleKey: handleKey("Owner-New"), updatedAt: AT }));

    const reuse = svc.localUserInsertStatement({ id: MINTED, handle: castId<Handle>("owner-old"), role: "user", passwordHash: "scrypt$x", at: AT });
    expect(await reuse).toEqual([{ id: MINTED }]);
  });

  test("a rename onto a key another row holds is a unique violation, and the row keeps its handle and key", async () => {
    await seedUser(db, { handle: castId<Handle>("root") });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await expect(svc.renameUserHandle(owner.id, castId<Handle>("ROOT"), AT)).rejects.toSatisfy(isUniqueViolation);
    expect(await rowOf(owner.id)).toEqual(expect.objectContaining({ handle: "owner", handleKey: handleKey("owner") }));
  });
});
