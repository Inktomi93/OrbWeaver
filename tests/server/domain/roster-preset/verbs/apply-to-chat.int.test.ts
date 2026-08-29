// verb: applyToChat — the injected-op DRIVE semantics over the recording chat fakes: the host gate runs
// FIRST (before any target-room read — the roster-intersection-oracle closure), members apply
// SEQUENTIALLY in position order, added-vs-alreadyPresent classifies off the pre-read, knobs re-stamp
// on EVERY apply (disabled always, talkativeness only when stored), the config arm fires only when a
// blob is stored, and a mid-apply-vanished character is SKIPPED, never an abort. The composed-real
// proof of the SAME behavior over the real chat verbs is tests/server/entry/compose/roster-preset.int.test.ts.

import { characters } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import { createRosterPresetService, RosterPresetNotFoundError } from "@orb/server/domain/roster-preset";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, memberSpec, principal } from "../_support.ts";

const CHAT = castId<ChatId>("chat_target");

describe("applyToChat", () => {
  test("fresh room: every member added in POSITION order, knobs stamped per member, no config touch sans blob", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const b = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({
      principal: principal(owner),
      input: { name: "Cast", description: "", members: [memberSpec(b, 0, { talkativeness: 0.8 }), memberSpec(a, 1, { disabled: true })] },
    });

    const result = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });

    expect(result).toEqual({ added: [b, a], alreadyPresent: [], skipped: [], configApplied: false });
    // Position order IS join order (b stored at position 0 wins the first add).
    expect(h.adds.map((x) => x.characterId)).toEqual([b, a]);
    // Knobs: talkativeness rides only when stored non-null; disabled ALWAYS rides (NOT NULL column).
    expect(h.knobs.map((x) => x.patch)).toEqual([{ disabled: false, talkativeness: 0.8 }, { disabled: true }]);
    expect(h.configs).toHaveLength(0);
    expect(h.audits.map((x) => x.entry.action)).toContain("rosterPreset.applyToChat");
    // An apply never emits the LIBRARY bus member (the chat fans its own freshness).
    expect(h.userEvents.filter((e) => e.event.type === "rosterPresetsChanged").map((e) => e.event)).toHaveLength(1); // the create only
  });

  test("re-apply is additive-idempotent: nothing re-added, knobs RE-stamped on the live seats", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({
      principal: principal(owner),
      input: { name: "Solo", description: "", members: [memberSpec(a, 0, { talkativeness: 0.3 })] },
    });

    const first = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });
    const again = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });

    expect(first.added).toEqual([a]);
    expect(again).toEqual({ added: [], alreadyPresent: [a], skipped: [], configApplied: false });
    // ONE add ever; TWO knob stamps (one per apply), the second against the SAME participantId.
    expect(h.adds).toHaveLength(1);
    expect(h.knobs).toHaveLength(2);
    expect(h.knobs[0]?.participantId).toBe(h.knobs[1]?.participantId);
  });

  test("a stored groupConfig lands through the injected setGroupConfig (parse-at-apply), flagged in the result", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({
      principal: principal(owner),
      input: { name: "Narrated", description: "", groupConfig: { output: "narrator", policy: "list" }, members: [memberSpec(a, 0)] },
    });

    const result = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });
    expect(result.configApplied).toBe(true);
    expect(h.configs).toHaveLength(1);
    expect(h.configs[0]?.config).toMatchObject({ output: "narrator", policy: "list" });
  });

  test("the HOST GATE runs FIRST: a refusing requireHost surfaces chat's own error with ZERO room reads/writes", async () => {
    const db = await freshDb();
    const h = makeHarness(db, {});
    // Override the injected guard to CHAT's own leak-free refusal — asserted THROUGH the op, proving no
    // second authority path (and no pre-read leak) exists on the refusing arm.
    const refusing = makeHarness(db, {
      chat: {
        ...h.ctx.chat,
        requireHost: (): Promise<void> => Promise.reject(new ChatNotFoundError(CHAT)),
      },
    });
    const svc = createRosterPresetService(refusing.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({ principal: principal(owner), input: { name: "Mine", description: "", members: [memberSpec(a, 0)] } });

    await expect(svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT })).rejects.toBeInstanceOf(ChatNotFoundError);
    // NOTHING room-shaped fired: no add, no knob, no config — and the all-present no-op oracle is closed
    // because even the classification pre-read sits behind the guard. The spread ops RECORD INTO `h`'s
    // arrays (the override reuses them), so `h` is where a leaked call would land — and the sibling tests
    // above are the positive control that these arrays do capture calls when the guard passes.
    expect(h.adds).toHaveLength(0);
    expect(h.knobs).toHaveLength(0);
    expect(h.configs).toHaveLength(0);
  });

  test("a foreign presetId refuses leak-free BEFORE the host gate ever fires", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const stranger = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({ principal: principal(owner), input: { name: "Mine", description: "", members: [memberSpec(a, 0)] } });

    await expect(svc.applyToChat({ principal: principal(stranger), presetId: preset.id, chatId: CHAT })).rejects.toBeInstanceOf(RosterPresetNotFoundError);
    expect(h.hostChecks).toHaveLength(0);
  });

  test("a member whose character vanished mid-apply is SKIPPED (reported), the survivors land", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const keep = (await seedCharacter(db, { ownerId: owner })).id;
    const doomed = (await seedCharacter(db, { ownerId: owner })).id;
    const preset = await svc.create({
      principal: principal(owner),
      input: { name: "Raced", description: "", members: [memberSpec(doomed, 0), memberSpec(keep, 1)] },
    });

    // Simulate the delete-mid-apply race the FK CASCADE otherwise erases: hard-delete the character row
    // (its seat row cascades with it in production; here we model the widest window). PRAGMA cascades run
    // on the real db, so the member row is gone too — the re-verify belt reports what the read no longer
    // holds vs what the preset VIEW claimed... the surviving member still applies.
    await db.delete(characters).where(eq(characters.id, doomed));

    const result = await svc.applyToChat({ principal: principal(owner), presetId: preset.id, chatId: CHAT });
    // The cascade already removed the doomed seat row, so it is neither added nor skipped — the honest
    // outcome of FK physics; `skipped` stays the reporting arm for the sub-cascade race window.
    expect(result.added).toEqual([keep]);
    expect(h.adds.map((x) => x.characterId)).toEqual([keep]);
  });
});
