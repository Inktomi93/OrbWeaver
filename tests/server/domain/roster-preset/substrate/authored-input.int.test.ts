// substrate/authored-input — the create/update validation ladder's own mirror (test-presence). The
// belts are exercised end-to-end through the verbs; this file pins the arms a verb path can mask:
// parsedGroupConfig's strict refusal (garbage never reaches a row) and the ensure* belts' exact throw
// behavior against a real db.

import type { GroupConfigInput } from "@orb/contracts/chat";
import { RosterPresetCharacterNotFoundError, RosterPresetPersonaNotFoundError } from "@orb/server/domain/roster-preset";
import { describe } from "vitest";
import { ZodError } from "zod";
import { ensureAnchorOwned, ensureMembersOwned, parsedGroupConfig } from "../../../../../packages/server/src/domain/roster-preset/substrate/authored-input.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedPersona } from "../../../../support/factories/persona.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness } from "../_support.ts";

describe("authored-input belts", () => {
  test("parsedGroupConfig: null/undefined pass through; garbage throws ZodError; lenient input defaults", () => {
    expect(parsedGroupConfig(null)).toBeNull();
    expect(parsedGroupConfig(undefined)).toBeNull();
    // A stray key on chat's STRICT arms is REFUSED loudly, never stripped-and-healed.
    // @orb-waive no-test-fabrication(unknown): a deliberately MALFORMED blob — the strict-arm refusal is this assertion's subject. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    expect(() => parsedGroupConfig({ output: "narrator", bogusKnob: true } as unknown as GroupConfigInput)).toThrow(ZodError);
    expect(parsedGroupConfig({ output: "per-speaker" })).toMatchObject({ output: "per-speaker", cardScope: "merged" });
  });

  test("ensureMembersOwned throws on the FIRST foreign member; an all-owned list passes", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = (await seedUser(db)).id;
    const other = (await seedUser(db)).id;
    const mine = (await seedCharacter(db, { ownerId: owner })).id;
    const foreign = (await seedCharacter(db, { ownerId: other })).id;

    await expect(
      ensureMembersOwned(h.ctx, owner, [
        { characterId: mine, position: 0, talkativeness: null, disabled: false },
        { characterId: foreign, position: 1, talkativeness: null, disabled: false },
      ]),
    ).rejects.toBeInstanceOf(RosterPresetCharacterNotFoundError);
    await expect(ensureMembersOwned(h.ctx, owner, [{ characterId: mine, position: 0, talkativeness: null, disabled: false }])).resolves.toBeUndefined();
  });

  test("ensureAnchorOwned: null passes; a foreign persona throws", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = (await seedUser(db)).id;
    const other = (await seedUser(db)).id;
    const foreign = (await seedPersona(db, { ownerId: other })).id;

    await expect(ensureAnchorOwned(h.ctx, owner, null)).resolves.toBeUndefined();
    await expect(ensureAnchorOwned(h.ctx, owner, foreign)).rejects.toBeInstanceOf(RosterPresetPersonaNotFoundError);
  });
});
