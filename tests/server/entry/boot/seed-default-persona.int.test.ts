// createDefaultPersonaSeeder — the idempotent default-persona seeder over the REAL persona + assets services
// with the REAL bundled `persona-you.png`. Proves: a fresh user gets exactly ONE persona, born with a
// NON-NULL `avatarAssetId` (the bundled PNG stored through `assets.store({enforceMagic:true})` — the sniff
// accepts the real bytes); the persisted latch makes a re-run a no-op (no duplicate persona); `markSeeded` is
// handed the seeded persona id (so the composition root can point seeds.defaultPersonaId at it); and the
// seeder never throws on a create failure (latch stays unset → the next touch retries).
//
// The NAME is asserted as a LITERAL, never imported from the seeder — an imported constant would make the
// assertion a tautology, and this name is owner-ruled copy (it is what a model sees as `{{user}}`).

import type { Principal } from "@orb/contracts/identity";
import type { CreatePersonaInput } from "@orb/contracts/persona";
import type { AssetId, PersonaId, UserId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { createPersonaService } from "@orb/server/domain/persona";
import { describe, onTestFinished } from "vitest";
import { readSeedAvatar } from "../../../../packages/server/src/entry/boot/seed-assets/index.ts";
import { createDefaultPersonaSeeder } from "../../../../packages/server/src/entry/boot/seed-default-persona.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { makeHarness as makeAssetsHarness } from "../../domain/assets/_support.ts";
import { makeHarness as makePersonaHarness, principal, seedUser } from "../../domain/persona/_support.ts";

interface MarkCall {
  readonly userId: UserId;
  readonly seededPersonaId: PersonaId | null;
}

/** In-memory settings latch + recorder for the seeded persona id (the real settings wiring is a compose
 *  concern; here we only need one-run + the mark id). */
function fakeLatch(): {
  readonly isSeeded: (p: Principal) => Promise<boolean>;
  readonly markSeeded: (p: Principal, id: PersonaId | null) => Promise<void>;
  readonly marks: MarkCall[];
} {
  const seeded = new Set<UserId>();
  const marks: MarkCall[] = [];
  return {
    marks,
    isSeeded: (p): Promise<boolean> => Promise.resolve(seeded.has(p.userId)),
    markSeeded: (p, seededPersonaId): Promise<void> => {
      seeded.add(p.userId);
      marks.push({ userId: p.userId, seededPersonaId });
      return Promise.resolve();
    },
  };
}

async function makeHarness(autoSeedEnabled = true): Promise<{
  readonly owner: UserId;
  readonly actor: Principal;
  readonly persona: ReturnType<typeof createPersonaService>;
  readonly latch: ReturnType<typeof fakeLatch>;
  readonly runSeed: () => Promise<void>;
}> {
  const db = await freshDb();
  const assetsHarness = await makeAssetsHarness(db);
  onTestFinished(assetsHarness.cleanup);
  const assets = createAssetsService(assetsHarness.ctx);
  const persona = createPersonaService(makePersonaHarness(db).ctx);
  const owner = await seedUser(db, { handle: "owner" });
  const actor = principal(owner);
  const latch = fakeLatch();

  const seeder = createDefaultPersonaSeeder({
    autoSeedEnabled: (): boolean => autoSeedEnabled,
    createPersona: async ({ principal: p, input }): Promise<{ id: PersonaId }> => {
      const detail = await persona.create({ principal: p, input });
      return { id: detail.id };
    },
    storeAvatar: async (p): Promise<AssetId | null> => {
      const art = await readSeedAvatar("persona-you");
      if (art === null) {
        return null;
      }
      const stored = await assets.store({
        principal: p,
        bytes: art.bytes,
        kind: "avatar",
        mime: art.mime,
        enforceMagic: true,
      });
      return stored.assetId;
    },
    ...latch,
  });

  return { owner, actor, persona, latch, runSeed: () => seeder.ensureSeeded(actor) };
}

describe("createDefaultPersonaSeeder", () => {
  test("seeds exactly one 'Traveler' persona, born with a non-null avatarAssetId (real bundled PNG)", async () => {
    const h = await makeHarness();
    await h.runSeed();

    const list = await h.persona.list({ principal: h.actor });
    expect(list).toHaveLength(1);
    // NOT "You": the literal second-person pronoun as a persona NAME is what made models write vocatives
    // like "Goodnight, You." — and it collided with the no-persona display fallback, which is itself "You"
    // (owner ruling 2026-07-27, `entry/compose/rpg.ts` PLAYER_SEMANTIC_REF docstring).
    expect(list[0]?.name).toBe("Traveler");
    expect(list[0]?.avatarAssetId).not.toBeNull();
    // The seeded id is handed to markSeeded (so the root can point seeds.defaultPersonaId at it).
    expect(h.latch.marks).toHaveLength(1);
    expect(h.latch.marks[0]?.seededPersonaId).toBe(list[0]?.id);
  });

  test("the persisted latch makes a re-run a no-op (no duplicate persona)", async () => {
    const h = await makeHarness();
    await h.runSeed();
    await h.runSeed();

    const list = await h.persona.list({ principal: h.actor });
    expect(list).toHaveLength(1);
    expect(h.latch.marks).toHaveLength(1);
  });

  test("never throws on a create failure + leaves the latch unset (retry next touch)", async () => {
    const latch = fakeLatch();
    const seeder = createDefaultPersonaSeeder({
      autoSeedEnabled: (): boolean => true,
      createPersona: (): Promise<{ id: PersonaId }> => Promise.reject(new Error("db is on fire")),
      storeAvatar: (): Promise<AssetId | null> => Promise.resolve(null),
      ...latch,
    });
    const actor = principal("user_fresh" as UserId);

    await expect(seeder.ensureSeeded(actor)).resolves.toBeUndefined();
    expect(latch.marks).toHaveLength(0);
  });

  test("passthrough input carries the default persona name + description", async () => {
    // Prove the authored input shape reaches createPersona (a regression guard on the default copy).
    const captured: CreatePersonaInput[] = [];
    const latch = fakeLatch();
    const seeder = createDefaultPersonaSeeder({
      autoSeedEnabled: (): boolean => true,
      createPersona: ({ input }): Promise<{ id: PersonaId }> => {
        captured.push(input);
        return Promise.resolve({ id: "persona_seeded" as PersonaId });
      },
      storeAvatar: (): Promise<AssetId | null> => Promise.resolve(null),
      ...latch,
    });
    await seeder.ensureSeeded(principal("user_x" as UserId));

    expect(captured).toHaveLength(1);
    const seededInput = captured[0];
    expect(seededInput?.name).toBe("Traveler");
    expect((seededInput?.description ?? "").length).toBeGreaterThan(0);
  });

  // ── The rename's GATING arms. The gate is the persisted `onboarding.defaultPersonaSeeded` latch itself —
  // there is no separate "first-run complete" flag (it was deleted in D107 as dead), and none is needed: a
  // user who has ever been seeded never enters `seed()` again, so their existing persona is untouched by
  // construction. These two tests pin that construction so the rename can never grow a backfill arm.

  test("an ALREADY-SEEDED user keeps the persona they have — the rename never touches an existing 'You'", async () => {
    const h = await makeHarness();
    // Stand in for a user seeded before the rename: their own "You" persona, latch already set.
    const existing = await h.persona.create({ principal: h.actor, input: { name: "You", description: "the pre-rename default" } });
    await h.latch.markSeeded(h.actor, existing.id);

    await h.runSeed();

    const list = await h.persona.list({ principal: h.actor });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(existing.id);
    expect(list[0]?.name).toBe("You");
    // …and the seeder wrote nothing of its own — the only mark is the one this test planted.
    expect(h.latch.marks).toHaveLength(1);
  });

  test("an UN-SEEDED user gets the new name even with personas already in the library", async () => {
    const h = await makeHarness();
    // The latch is the ONLY gate: owning personas does not suppress the seed (it never did — the deletion-
    // respect guard is the latch, not a count), so the fresh-user arm must still produce the new name.
    await h.persona.create({ principal: h.actor, input: { name: "Sarah", description: "a persona I made myself" } });

    await h.runSeed();

    const names = (await h.persona.list({ principal: h.actor })).map((p) => p.name);
    expect(names).toContain("Sarah");
    expect(names).toContain("Traveler");
  });

  // ── THE FIRST-RUN DISCRIMINATOR (owner ruling 2026-08-03). Auto-creation is what made the shipped forced
  // dialog dead by construction, and it must stay ON for automation-started stacks (a dev regen or an e2e
  // boot landing on a blocking modal is exactly the constraint that kept the forced ask from shipping) and
  // OFF everywhere else, so a REAL first sign-in reaches D107's zero-personas trigger. Both call sites (boot
  // owner + per-user first authed request) route through `ensureSeeded`, so this one arm covers both.

  test("REAL stack (auto-seed off): creates NOTHING and latches NOTHING — the zero-personas first-run trigger holds", async () => {
    const h = await makeHarness(false);

    await h.runSeed();

    // The user's library is EMPTY, which is precisely the FirstRunPersonaDialog's trigger.
    expect(await h.persona.list({ principal: h.actor })).toHaveLength(0);
    // …and the latch is untouched, so flipping the stack to an automation posture still seeds later (and a
    // user who creates their own persona is never re-seeded, because the dialog writes the seeds pointers).
    expect(h.latch.marks).toHaveLength(0);
  });

  test("REAL stack: a re-run is still a no-op (no accumulating state, no eventual surprise seed)", async () => {
    const h = await makeHarness(false);

    await h.runSeed();
    await h.runSeed();

    expect(await h.persona.list({ principal: h.actor })).toHaveLength(0);
  });

  test("AUTOMATION stack (harness/dev): auto-creates, so no spec or dev regen ever meets the forced ask", async () => {
    const h = await makeHarness(true);

    await h.runSeed();

    // One persona ⇒ `personas.length > 0` ⇒ the dialog's trigger cannot hold on a harness boot.
    expect(await h.persona.list({ principal: h.actor })).toHaveLength(1);
  });
});
