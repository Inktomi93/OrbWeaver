// createDefaultPersonaSeeder — the idempotent default-"You"-persona seeder over the REAL persona + assets
// services with the REAL bundled `persona-you.png`. Proves: a fresh user gets exactly ONE persona, born with a
// NON-NULL `avatarAssetId` (the bundled PNG stored through `assets.store({enforceMagic:true})` — the sniff
// accepts the real bytes); the persisted latch makes a re-run a no-op (no duplicate persona); `markSeeded` is
// handed the seeded persona id (so the composition root can point seeds.defaultPersonaId at it); and the
// seeder never throws on a create failure (latch stays unset → the next touch retries).

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

async function makeHarness(): Promise<{
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
  test("seeds exactly one 'You' persona, born with a non-null avatarAssetId (real bundled PNG)", async () => {
    const h = await makeHarness();
    await h.runSeed();

    const list = await h.persona.list({ principal: h.actor });
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("You");
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
    expect(seededInput?.name).toBe("You");
    expect((seededInput?.description ?? "").length).toBeGreaterThan(0);
  });
});
