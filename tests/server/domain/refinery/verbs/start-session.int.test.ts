// .int tests for `startSession`: the anti-drift anchor snapshot (through the injected character card
// read), the populated-fields default selection, the born config, the name belt, and the leak-free
// ownership collapse on a foreign/absent character.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ZodError } from "zod";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedOwnedCharacter, seedUser } from "../_support.ts";

const NAME_MAX = 200;

test("a session is born on the owned card: anchor snapshot, populated-field selection, default config", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ss_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ss-card-a");
  const session = await h.svc.startSession({ principal: principal(owner), characterId, name: "First polish" });

  expect(session.characterId).toBe(characterId);
  expect(session.name).toBe("First polish");
  expect(session.status).toBe("active");
  expect(session.iterationCount).toBe(0);
  // The anchor holds the card AS OF session start (the character service's own projection).
  expect(session.originalCard.name).toBe("Aria the Archivist");
  expect(session.originalCard.description).toContain("{{char}} likes {{user}}");
  // The default selection = exactly the populated refinable fields (card-schema order).
  expect(session.selection).toEqual({ fields: ["description", "personality", "greetings"] });
  expect(session.stageConfig).toEqual({
    score: { kind: "fixed", mode: "full" },
    rewrite: { kind: "fixed", mode: "balanced" },
    analyze: { kind: "fixed", mode: "full" },
  });
  // The freshness plane (survey H1): the roster gained a row, so every device hears it. Without this the
  // second tab sat on the pre-write roster forever (staleTime: Infinity).
  expect(h.userEvents).toEqual([{ userId: owner, event: { type: "refineryChanged", sessionId: session.id } }]);
});

test("a foreign character and an absent character collapse to the same NOT_FOUND", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ss_b" });
  const stranger = await seedUser(db, { id: "user_ss_c", handle: castId<Handle>("ss-stranger") });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ss-card-b");

  const foreign = await h.svc.startSession({ principal: principal(stranger), characterId }).catch((e: unknown) => e);
  const absent = await h.svc.startSession({ principal: principal(stranger), characterId: castId<CharacterId>("character_phantom") }).catch((e: unknown) => e);
  expect(foreign).toBeInstanceOf(DomainNotFoundError);
  expect(absent).toBeInstanceOf(DomainNotFoundError);
});

test("the name belt bites at the verb (the internal-boundary parse, not just the wire)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ss_d" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ss-card-d");
  await expect(h.svc.startSession({ principal: principal(owner), characterId, name: "x".repeat(NAME_MAX + 1) })).rejects.toBeInstanceOf(ZodError);
});
