// verb: resolveSpeakerIdentity — the RESOLVE-phase product for a seated agent (D60, doc 04 §5). Owner-keyed:
// the hatched buddy's SOUL → {displayName, systemPrompt (the soul prompt, no tools), avatarAssetId:null}.
// No buddy → null. Only `ctx.db` is used (a minimal ctx suffices).

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { BuddyContext } from "../../../../../packages/server/src/domain/buddy/contract/service.ts";
import { insertBuddy } from "../../../../../packages/server/src/domain/buddy/persistence/queries.ts";
import { roll } from "../../../../../packages/server/src/domain/buddy/substrate/roll.ts";
import { createResolveSpeakerIdentity } from "../../../../../packages/server/src/domain/buddy/verbs/resolve-speaker-identity.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;

describe("buddy.resolveSpeakerIdentity — the seated-agent RESOLVE product (D60)", () => {
  test("a hatched buddy resolves to {displayName, soul systemPrompt, no avatar}", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    const { bones } = roll(owner);
    await insertBuddy(db, {
      userId: owner,
      name: "Pip",
      personality: "small and curious",
      rarity: bones.rarity,
      species: bones.species,
      eye: bones.eye,
      hat: bones.hat,
      shiny: bones.shiny,
      stats: bones.stats,
      createdAt: NOW,
    });

    const resolve = createResolveSpeakerIdentity({ db } as BuddyContext);
    const identity = await resolve(owner);

    expect(identity).not.toBeNull();
    expect(identity?.displayName).toBe("Pip"); // the soul name — no card
    expect(identity?.avatarAssetId).toBeNull(); // v1: sprites are client-side
    // The soul prompt carries the identity (name + personality) — the "card-shape minus the card".
    expect(identity?.systemPrompt).toContain("Pip");
    expect(identity?.systemPrompt).toContain("small and curious");
  });

  test("an owner with no hatched buddy resolves to null (chat skips voicing it)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    const resolve = createResolveSpeakerIdentity({ db } as BuddyContext);
    expect(await resolve(castId<UserId>(owner))).toBeNull();
  });
});
