// .int tests for `updateSession` — the Setup patch: per-member re-parse at the verb (the internal-
// boundary belt), null-clears, the status label, and the ownership collapse.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ZodError } from "zod";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedOwnedCharacter, seedUser } from "../_support.ts";

const GUIDANCE_MAX = 4000;

test("patches name/guidance/selection/stageConfig/status with per-member parses; null clears", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_us_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "us-card-a");
  const session = await h.svc.startSession({ principal: principal(owner), characterId, name: "before" });

  const updated = await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: {
      name: null,
      guidance: "keep her mean",
      selection: { fields: ["greetings"], greetingIndexes: [0] },
      stageConfig: { score: { kind: "fixed", mode: "quick" }, rewrite: { kind: "fixed", mode: "expansive" }, analyze: { kind: "fixed", mode: "iteration" } },
      status: "abandoned",
    },
  });
  expect(updated.name).toBeNull();
  expect(updated.guidance).toBe("keep her mean");
  expect(updated.selection).toEqual({ fields: ["greetings"], greetingIndexes: [0] });
  expect(updated.stageConfig.score).toEqual({ kind: "fixed", mode: "quick" });
  expect(updated.status).toBe("abandoned");
  // The patch announced itself on the user bus (the ONE tick this verb owes: start + this patch).
  expect(h.userEvents).toEqual([
    { userId: owner, event: { type: "refineryChanged", sessionId: session.id } },
    { userId: owner, event: { type: "refineryChanged", sessionId: session.id } },
  ]);

  // The guidance belt bites at the verb (over the PROSE_MAX_CHARS twin).
  await expect(
    h.svc.updateSession({ principal: principal(owner), sessionId: session.id, patch: { guidance: "x".repeat(GUIDANCE_MAX + 1) } }),
  ).rejects.toBeInstanceOf(ZodError);
});

test("a stranger's patch collapses to NOT_FOUND (no write)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_us_b" });
  const stranger = await seedUser(db, { id: "user_us_c", handle: castId<Handle>("us-stranger") });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "us-card-b");
  const session = await h.svc.startSession({ principal: principal(owner), characterId, name: "mine" });

  await expect(h.svc.updateSession({ principal: principal(stranger), sessionId: session.id, patch: { name: "stolen" } })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  const unchanged = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(unchanged.name).toBe("mine");
  // A refused write announces NOTHING (the emit sits after the durable write, never before the belt) —
  // the ledger holds only the `startSession` tick from the setup above.
  expect(h.userEvents).toHaveLength(1);
});
