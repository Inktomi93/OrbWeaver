// entry/compose/roster-preset — the saved-party apply, COMPOSED-REAL (real createServices, vLLM
// disabled — the `services` fixture). The compose-stub antidote: every harness-level applyToChat pin
// (tests/server/domain/roster-preset/verbs/apply-to-chat.int.test.ts) is re-proven here through the REAL
// injected ops — chat's actual addCharacterToChat present-seat floor, the actual setSeatKnobs write, the
// actual setGroupConfig parse-and-persist, and chat's actual requireHost refusal — so a stubbed or
// mis-mapped compose op cannot pass on fakes alone. SERIAL_INT: full-createServices class (cold graph
// import on the first test flakes the parallel 5s timeout).

import { chatParticipants } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import { describe } from "vitest";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedUser } from "../../domain/chat/_support.ts";

describe("roster-preset applyToChat — composed-real (createServices)", () => {
  test("apply drives the REAL chat verbs: adds in position order, stamps knobs, lands the config; re-apply mints nothing", async ({ services, db }) => {
    const host = await seedUser(db, castId<Handle>("rphost"));
    const hostP = principal(host);
    const c1 = await seedCharacter(db, host, "rp_founding");
    const c2 = await seedCharacter(db, host, "rp_second");
    const c3 = await seedCharacter(db, host, "rp_third");

    // A real room with c1 as the founding cast (the REAL startChat — no draft plane).
    const started = await services.chat.startChat({ principal: hostP, characterIds: [c1], opening: "none" });
    const chatId = started.chat.id;

    const preset = await services.rosterPreset.create({
      principal: hostP,
      input: {
        name: "The Troupe",
        description: "",
        groupConfig: { output: "narrator", policy: "list" },
        members: [
          { kind: "character", characterId: c2, position: 0, talkativeness: 0.8 },
          { kind: "character", characterId: c1, position: 1, disabled: true },
          { kind: "character", characterId: c3, position: 2 },
        ],
      },
    });

    const result = await services.rosterPreset.applyToChat({ principal: hostP, presetId: preset.id, chatId });
    expect(result.added).toEqual([c2, c3]);
    expect(result.alreadyPresent).toEqual([c1]);
    expect(result.skipped).toEqual([]);
    expect(result.configApplied).toBe(true);

    // The REAL roster: exactly three PRESENT character seats, knobs stamped by the real setSeatKnobs.
    const seats = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
    expect(seats).toHaveLength(3);
    const byCharacter = new Map(seats.map((s) => [s.characterId, s]));
    expect(byCharacter.get(c2)?.talkativeness).toBe(0.8);
    expect(byCharacter.get(c2)?.disabled).toBe(false);
    expect(byCharacter.get(c1)?.disabled).toBe(true);
    expect(byCharacter.get(c3)?.disabled).toBe(false);

    // The config landed through the REAL setGroupConfig — fully defaulted (chat's own invariant).
    const config = await services.chat.getGroupConfigForChat({ principal: hostP, chatId });
    expect(config).toMatchObject({ output: "narrator", policy: "list", speakerTags: true });

    // Re-apply: chat's present-seat floor holds — no duplicate seats, classification flips.
    const again = await services.rosterPreset.applyToChat({ principal: hostP, presetId: preset.id, chatId });
    expect(again.added).toEqual([]);
    expect(again.alreadyPresent).toEqual([c2, c1, c3]); // position order, all live
    const seatsAfter = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
    expect(seatsAfter).toHaveLength(3);
  });

  test("a NON-HOST apply is chat's own leak-free NOT_FOUND through the injected guard, and the room is untouched", async ({ services, db }) => {
    const host = await seedUser(db, castId<Handle>("rphost2"));
    const stranger = await seedUser(db, castId<Handle>("rpstranger"));
    const hostP = principal(host);
    const strangerP = principal(stranger);
    const hc = await seedCharacter(db, host, "rp_hosted");
    const sc = await seedCharacter(db, stranger, "rp_strangers");

    const started = await services.chat.startChat({ principal: hostP, characterIds: [hc], opening: "none" });
    const chatId = started.chat.id;
    // The stranger's OWN valid preset (their own character) — so the refusal under probe is the CHAT
    // authority, not the preset ownership arm.
    const theirPreset = await services.rosterPreset.create({
      principal: strangerP,
      input: { name: "Invaders", description: "", members: [{ kind: "character", characterId: sc, position: 0 }] },
    });

    await expect(services.rosterPreset.applyToChat({ principal: strangerP, presetId: theirPreset.id, chatId })).rejects.toBeInstanceOf(DomainNotFoundError);

    // The room is byte-untouched: still exactly the founding seat, no config written.
    const seats = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
    expect(seats.map((s) => s.characterId)).toEqual([hc]);
  });
});
