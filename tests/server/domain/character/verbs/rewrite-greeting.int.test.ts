// verb: rewriteGreeting — greeting studio (audit §3). Owner-gated bounded completion that RETURNS text and
// NEVER writes. Pins: owner ok (ONE completion, prompt carries the resolved template + neutralized base +
// steer), non-owner → leak-free CharacterNotFoundError BEFORE any template read / completion, and no DB write.

import { ZWSP } from "@orb/kit/guided";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("rewriteGreeting", () => {
  test("owner: runs ONE bounded completion and returns its text", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });

    const result = await svc.rewriteGreeting({ principal: principal(owner), characterId: created.id, greeting: "hey there", steer: "make it formal" });

    // Exactly ONE completion; the template was resolved for the CALLER + the rewrite kind.
    expect(harness.greetingTextCalls).toHaveLength(1);
    expect(harness.greetingTemplateCalls).toEqual([{ caller: principal(owner), kind: "greeting_rewrite" }]);
    // The default fake echoes the prompt; assert the returned text is the completion's.
    const promptSeen = harness.greetingTextCalls[0]?.prompt;
    expect(result.text).toBe(`GEN(${promptSeen})`);
    expect(result.costUsd).toBeNull();
  });

  test("owner: the completion prompt carries the resolved template with base + steer spliced (base neutralized)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    harness.setGreetingTemplate("Revise {{base}} per {{input}} for {{char}}");
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });

    // The base greeting carries a macro — it MUST be ZWSP-neutralized (other-author content), never resolved.
    await svc.rewriteGreeting({ principal: principal(owner), characterId: created.id, greeting: "{{user}} waves", steer: "warmer" });

    const prompt = harness.greetingTextCalls[0]?.prompt;
    // {{char}} (template) resolves to the card name; {{input}} = steer; {{base}} = neutralized greeting.
    expect(prompt).toBe(`Revise {${ZWSP}{user}${ZWSP}} waves per warmer for Nyx`);
    expect(prompt).not.toContain("{{user}} waves"); // proof the base did not re-trigger macro eval
  });

  test("non-owner: throws leak-free CharacterNotFoundError BEFORE any template read or completion", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const created = await svc.create({ principal: principal(owner), input: { handle: "nyx", name: "Nyx", description: "d" } });

    await expect(svc.rewriteGreeting({ principal: principal(stranger), characterId: created.id, greeting: "hey", steer: "x" })).rejects.toBeInstanceOf(
      CharacterNotFoundError,
    );
    // The owner gate fired FIRST — neither the template read nor the completion ran (no LLM spend on a stranger).
    expect(harness.greetingTemplateCalls).toHaveLength(0);
    expect(harness.greetingTextCalls).toHaveLength(0);
  });

  test("missing id: throws CharacterNotFoundError (never a completion)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await expect(
      svc.rewriteGreeting({ principal: principal(owner), characterId: castId<CharacterId>("character_ghost"), greeting: "h", steer: "s" }),
    ).rejects.toBeInstanceOf(CharacterNotFoundError);
    expect(harness.greetingTextCalls).toHaveLength(0);
  });

  test("NEVER writes: the card's greetings are unchanged after a rewrite", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d", greetings: [{ text: "original" }] },
    });
    const emitsBefore = harness.events.length;

    await svc.rewriteGreeting({ principal: principal(owner), characterId: created.id, greeting: "original", steer: "make it grand" });

    const after = await svc.getCard({ principal: principal(owner), characterId: created.id });
    expect(after?.greetings).toEqual([{ text: "original" }]);
    // The verb writes nothing — it emits no NEW domain event beyond what create already fired.
    expect(harness.events.length).toBe(emitsBefore);
  });
});
