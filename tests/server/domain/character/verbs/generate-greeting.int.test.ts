// verb: generateGreeting — greeting studio (audit §3). Owner-gated bounded completion that RETURNS a fresh
// greeting and NEVER writes. Pins: owner ok (ONE completion, greeting_new template, NO {{base}}), non-owner →
// leak-free CharacterNotFoundError BEFORE any template read / completion, and no DB write.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("generateGreeting", () => {
  test("owner: runs ONE bounded completion under the greeting_new template and returns its text", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    harness.setGreetingTemplate("Write a greeting for {{char}}: {{input}}");
    harness.setGreetingText({ text: "Hello, traveller.", costUsd: 0.001 });
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });

    const result = await svc.generateGreeting({ principal: principal(owner), characterId: created.id, steer: "cheerful and short" });

    expect(harness.greetingTextCalls).toHaveLength(1);
    expect(harness.greetingTemplateCalls).toEqual([{ caller: principal(owner), kind: "greeting_new" }]);
    // {{char}} resolves to the card name; {{input}} = steer; there is NO {{base}} token for a new greeting.
    expect(harness.greetingTextCalls[0]?.prompt).toBe("Write a greeting for Nyx: cheerful and short");
    expect(result).toEqual({ text: "Hello, traveller.", costUsd: 0.001 });
  });

  test("non-owner: throws leak-free CharacterNotFoundError BEFORE any template read or completion", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const created = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });

    await expect(svc.generateGreeting({ principal: principal(stranger), characterId: created.id, steer: "x" })).rejects.toBeInstanceOf(CharacterNotFoundError);
    expect(harness.greetingTemplateCalls).toHaveLength(0);
    expect(harness.greetingTextCalls).toHaveLength(0);
  });

  test("missing id: throws CharacterNotFoundError (never a completion)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await expect(svc.generateGreeting({ principal: principal(owner), characterId: castId<CharacterId>("character_ghost"), steer: "s" })).rejects.toBeInstanceOf(
      CharacterNotFoundError,
    );
    expect(harness.greetingTextCalls).toHaveLength(0);
  });

  test("NEVER writes: the card's greetings are unchanged after a generate", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d", greetings: [{ text: "original" }] },
    });
    const emitsBefore = harness.events.length;

    await svc.generateGreeting({ principal: principal(owner), characterId: created.id, steer: "a new one" });

    const after = await svc.getCard({ principal: principal(owner), characterId: created.id });
    expect(after?.greetings).toEqual([{ text: "original" }]);
    // The verb writes nothing — it emits no NEW domain event beyond what create already fired.
    expect(harness.events.length).toBe(emitsBefore);
  });
});
