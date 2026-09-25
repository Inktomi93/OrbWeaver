// support/factories/user — the identity-root factory (docs/law/Spine-Testing.md §4). Every single-owned table
// FKs `users.id`, so the character/persona/chat factories funnel their owner seeding through here (the
// neo `seedCharacter` FK-chain lesson: user → owned row, never an orphan insert against FK PRAGMA ON).
// `X` is the SELECT row (`$inferSelect`) so every field is present + non-optional on the built value —
// fully-valid deterministic defaults per the factory contract (gate: test-factory-contract).
//
// A test fixture may write `users` directly — the `no-direct-users-read` gate scopes only
// `packages/server/src/domain`, never `tests/` (the per-domain `_support.ts` precedent).

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../clock.ts";
import { createSeededIds } from "../ids.ts";

/** The full `users` row (derived from the live schema — the factory `X`). */
export type UserRow = typeof users.$inferSelect;

// Module-scoped seeded counter: deterministic within a test file (isolate:true = a fresh module graph
// per file, so the sequence always starts at user_000001).
const ids = createSeededIds();

/** Pure builder: a fully-valid human user row. `handle` defaults to the id (both unique per counter). */
export function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  const id = overrides.id ?? castId<UserId>(ids.next("user"));
  const handle = overrides.handle ?? castId<Handle>(id);
  return {
    id,
    handle,
    handleKey: handleKey(handle),
    externalId: null,
    email: null,
    role: "user",
    enabled: true,
    passwordHash: null,
    kind: "human",
    ownerUserId: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** `makeUser` then insert. Returns the built row (its `.id` is the FK target for owned seeds). */
export async function seedUser(db: Db, overrides: Partial<UserRow> = {}): Promise<UserRow> {
  const row = makeUser(overrides);
  await db.insert(users).values(row);
  return row;
}
