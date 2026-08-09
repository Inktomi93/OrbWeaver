// B5 — the bind-once linking CAPABILITY (domain/sessions `linkExternalId`). Proves the identity invariant it
// enforces (spine U1 — the ONE externalId-linking site): it BINDS an unbound row, is idempotent on a re-link,
// and REFUSES the two takeover shapes — a row already bound to a DIFFERENT subject (bind-once, reusing
// `isSubjectMismatch`) and a subject already bound to ANOTHER row (duplicate binding). No write escapes on a
// refusal. The admin gate + audit around this live in the admin verb (tested separately).

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

const EXT_A = castId<ExternalId>("authentik|aaa");
const EXT_B = castId<ExternalId>("authentik|bbb");
const T = 1_700_000_000_000;

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

async function seedRow(id: string, handle: Handle, externalId: ExternalId | null): Promise<UserId> {
  const uid = castId<UserId>(id);
  await db.insert(users).values({
    id: uid,
    handle,
    externalId,
    role: "user",
    enabled: true,
    createdAt: T,
    updatedAt: T,
  });
  return uid;
}

async function externalIdOf(id: UserId): Promise<string | null> {
  const row = (await db.select({ externalId: users.externalId }).from(users).where(eq(users.id, id)))[0];
  return row?.externalId ?? null;
}

describe("sessions.linkExternalId — bind-once linking capability (B5)", () => {
  test("BINDS an unbound row: externalId is stamped, outcome `linked`", async () => {
    const id = await seedRow("user_a", castId<Handle>("alice"), null);
    const result = await svc.linkExternalId(id, EXT_A);
    expect(result).toEqual({ outcome: "linked", userId: id });
    expect(await externalIdOf(id)).toBe(EXT_A);
  });

  test("idempotent: re-linking the SAME subject is `already-linked`, no error", async () => {
    const id = await seedRow("user_a", castId<Handle>("alice"), EXT_A);
    const result = await svc.linkExternalId(id, EXT_A);
    expect(result).toEqual({ outcome: "already-linked", userId: id });
    expect(await externalIdOf(id)).toBe(EXT_A);
  });

  test("not-found: an unknown row id returns `not-found` and writes nothing", async () => {
    const result = await svc.linkExternalId(castId<UserId>("user_ghost"), EXT_A);
    expect(result).toEqual({ outcome: "not-found" });
  });

  test("REFUSES rebinding a row already bound to a DIFFERENT subject (bind-once) — row untouched", async () => {
    const id = await seedRow("user_a", castId<Handle>("alice"), EXT_A);
    const result = await svc.linkExternalId(id, EXT_B);
    expect(result).toEqual({ outcome: "target-bound" });
    // The existing binding is NOT overwritten — fail-closed, no write.
    expect(await externalIdOf(id)).toBe(EXT_A);
  });

  test("REFUSES a subject already bound to ANOTHER row (duplicate binding) — target untouched", async () => {
    await seedRow("user_a", castId<Handle>("alice"), EXT_A);
    const b = await seedRow("user_b", castId<Handle>("bob"), null);
    const result = await svc.linkExternalId(b, EXT_A);
    expect(result).toEqual({ outcome: "subject-taken" });
    expect(await externalIdOf(b)).toBeNull();
  });
});
