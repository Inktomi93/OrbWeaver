// .int tests for `listSessions` — the D62 roster: newest-updated first, the latestVerdict badge (null
// before the first analyze; the NEWEST analyze wins), owner-scoped (a stranger sees an empty roster —
// a list is never an oracle).

import { characters } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { seedAsset } from "../../../../support/factories/asset.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { analyzeReply, makeRefineryHarness, principal, rewriteReply, seedOwnedCharacter, seedUser } from "../_support.ts";

test("roster: newest-updated first, latestVerdict from the newest analyze, stranger sees []", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ls_a" });
  const stranger = await seedUser(db, { id: "user_ls_b", handle: castId<Handle>("ls-stranger") });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ls-card-a");
  const first = await h.svc.startSession({ principal: principal(owner), characterId, name: "first" });
  h.advance(10);
  const second = await h.svc.startSession({ principal: principal(owner), characterId, name: "second" });

  // Verdict badge: null before any analyze…
  const before = await h.svc.listSessions({ principal: principal(owner) });
  expect(before.map((s) => s.id)).toEqual([second.id, first.id]);
  expect(before[0]?.latestVerdict).toBeNull();

  // …then the NEWEST analyze run's verdict (two analyzes on the first session; the later wins), and the
  // freshly-run session moves to the top of the roster (updatedAt ordering).
  h.advance(10);
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: first.id, stage: "rewrite" });
  h.advance(10);
  h.queueReply(analyzeReply({ verdict: "NEEDS_REFINEMENT" }));
  await h.svc.runStage({ principal: principal(owner), sessionId: first.id, stage: "analyze" });
  h.advance(10);
  h.queueReply(analyzeReply({ verdict: "ACCEPT", issues: [] }));
  await h.svc.runStage({ principal: principal(owner), sessionId: first.id, stage: "analyze" });

  const after = await h.svc.listSessions({ principal: principal(owner) });
  expect(after.map((s) => s.id)).toEqual([first.id, second.id]);
  expect(after[0]?.latestVerdict).toBe("ACCEPT");
  expect(after[1]?.latestVerdict).toBeNull();

  expect(await h.svc.listSessions({ principal: principal(stranger) })).toEqual([]);
});

test("every roster row NAMES its card server-side, avatar hash and all — no client-side join, so no page ceiling", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ls_c" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ls-card-named");
  await h.svc.startSession({ principal: principal(owner), characterId, name: "named" });

  // Avatar-less arm: the `assets` join is a LEFT one, so a card with no avatar is a normal roster row.
  const bare = await h.svc.listSessions({ principal: principal(owner) });
  expect(bare[0]?.characterName).toBe("Aria the Archivist");
  expect(bare[0]?.characterAvatarHash).toBeNull();

  // Avatar arm: the hash is the JOINED `assets.hash`, not the character's `avatar_asset_id` — a wrong
  // join column would leave the nullable field null forever and read as "this card has no avatar".
  const asset = await seedAsset(db, { ownerId: owner });
  await db.update(characters).set({ avatarAssetId: asset.id }).where(eq(characters.id, characterId));
  const withAvatar = await h.svc.listSessions({ principal: principal(owner) });
  expect(withAvatar[0]?.characterAvatarHash).toBe(asset.hash);
  expect(withAvatar[0]?.characterName).toBe("Aria the Archivist");
});
