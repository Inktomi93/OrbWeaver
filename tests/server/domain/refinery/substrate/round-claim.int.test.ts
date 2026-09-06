// .int tests for the LEASED round claim (#1568) against a real libSQL db: the take is a conditional UPDATE
// (a live claim refuses a second taker), a LAPSED claim is indistinguishable from no claim (the crash
// backstop — no reaper, no heartbeat), the release frees the session, and the release is GUARDED ON THE
// CLAIM'S OWN DEADLINE so a lapsed round cannot clear its successor's claim on its way out.
//
// The substrate module is imported by RELATIVE path — the package `./*` map only resolves a directory front
// door, not a flat file (the persistence-test convention one directory over).

import type { CharacterCard } from "@orb/contracts/character";
import { DEFAULT_REFINERY_STAGE_CONFIG } from "@orb/contracts/refinery";
import type { Db } from "@orb/db";
import { characters, refinerySessions } from "@orb/db";
import type { CharacterHandle, CharacterId, RefinerySessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { REFINERY_ROUND_LEASE_MS, releaseRoundClaim, takeRoundClaim } from "../../../../../packages/server/src/domain/refinery/substrate/round-claim.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const NOW = 1_700_000_000_000;

const CARD: CharacterCard = {
  name: "Aria",
  description: "calm",
  personality: null,
  scenario: null,
  greetings: [],
  exampleMessages: null,
  systemPrompt: null,
  postHistoryInstructions: null,
  depthPrompt: null,
  creatorNotes: null,
  creator: null,
  cardVersion: null,
  nickname: null,
  source: null,
  creationDate: null,
  modificationDate: null,
  extensions: null,
  residualData: null,
  avatarAssetId: null,
  refinery: null,
};

async function seedSession(db: Db, ownerId: UserId, tag: string): Promise<RefinerySessionId> {
  const characterId = castId<CharacterId>(`character_${tag}`);
  await db.insert(characters).values({ id: characterId, handle: castId<CharacterHandle>(`h-${tag}`), ownerId, contentHash: "h", name: "Aria" });
  const sessionId = castId<RefinerySessionId>(`refinery_session_${tag}`);
  await db
    .insert(refinerySessions)
    .values({ id: sessionId, characterId, originalCard: CARD, selection: { fields: [] }, stageConfig: DEFAULT_REFINERY_STAGE_CONFIG });
  return sessionId;
}

async function inflightUntilOf(db: Db, sessionId: RefinerySessionId): Promise<number | null> {
  const rows = await db.select({ at: refinerySessions.inflightUntil }).from(refinerySessions).where(eq(refinerySessions.id, sessionId));
  return rows[0]?.at ?? null;
}

test("an unclaimed session is claimable, and the claim STAMPS the lease deadline it hands back", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rc_a" });
  const sessionId = await seedSession(db, owner, "rc_free");

  expect(await inflightUntilOf(db, sessionId)).toBeNull();
  const claim = await takeRoundClaim(db, sessionId, NOW);
  expect(claim).toEqual({ leaseUntil: NOW + REFINERY_ROUND_LEASE_MS });
  expect(await inflightUntilOf(db, sessionId)).toBe(NOW + REFINERY_ROUND_LEASE_MS);
});

test("a LIVE claim refuses a second taker, and the refusal leaves the holder's deadline untouched", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rc_b" });
  const sessionId = await seedSession(db, owner, "rc_held");

  const first = await takeRoundClaim(db, sessionId, NOW);
  expect(first).toBeDefined();
  // A second round arriving a minute later — still inside the lease.
  expect(await takeRoundClaim(db, sessionId, NOW + 60_000)).toBeUndefined();
  // The loser wrote NOTHING: the holder's deadline is exactly what the holder stamped, not extended by the
  // attempt (an UPDATE whose predicate failed must not have touched the row).
  expect(await inflightUntilOf(db, sessionId)).toBe(NOW + REFINERY_ROUND_LEASE_MS);
});

test("a LAPSED claim is indistinguishable from no claim — the crash backstop, with no reaper", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rc_c" });
  const sessionId = await seedSession(db, owner, "rc_lapsed");

  const dead = await takeRoundClaim(db, sessionId, NOW);
  expect(dead).toBeDefined();
  // The holder crashed: nothing released, nothing swept. One millisecond past the deadline the session is
  // claimable again — which is the entire expiry mechanism.
  const after = NOW + REFINERY_ROUND_LEASE_MS + 1;
  const next = await takeRoundClaim(db, sessionId, after);
  expect(next).toEqual({ leaseUntil: after + REFINERY_ROUND_LEASE_MS });
});

test("release frees the session for the next round", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rc_d" });
  const sessionId = await seedSession(db, owner, "rc_release");

  const claim = await takeRoundClaim(db, sessionId, NOW);
  expect(claim).toBeDefined();
  await releaseRoundClaim(db, sessionId, claim as { leaseUntil: number });
  expect(await inflightUntilOf(db, sessionId)).toBeNull();
  // …and immediately re-claimable, without waiting out the lease.
  expect(await takeRoundClaim(db, sessionId, NOW + 1)).toBeDefined();
});

test("a LAPSED round's release cannot clear its SUCCESSOR's claim (the release is guarded on its own deadline)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rc_e" });
  const sessionId = await seedSession(db, owner, "rc_guarded");

  // Round A claims, hangs past its lease, and B legitimately takes the session over.
  const a = await takeRoundClaim(db, sessionId, NOW);
  const after = NOW + REFINERY_ROUND_LEASE_MS + 1;
  const b = await takeRoundClaim(db, sessionId, after);
  expect(b).toEqual({ leaseUntil: after + REFINERY_ROUND_LEASE_MS });

  // A finally finishes and releases. Ungated, this would hand the session to a THIRD round while B is still
  // running — the defect the deadline-as-identity guard exists to prevent.
  await releaseRoundClaim(db, sessionId, a as { leaseUntil: number });
  expect(await inflightUntilOf(db, sessionId)).toBe(after + REFINERY_ROUND_LEASE_MS);
  expect(await takeRoundClaim(db, sessionId, after + 1)).toBeUndefined();

  // B's own release still works — a planted positive control for the guard: it refuses A, not everybody.
  await releaseRoundClaim(db, sessionId, b as { leaseUntil: number });
  expect(await inflightUntilOf(db, sessionId)).toBeNull();
});
