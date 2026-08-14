// .int tests for `updateSession` — the Setup patch: per-member re-parse at the verb (the internal-
// boundary belt), null-clears, the status label, the ownership collapse, and the SELECTION TWO-WRITER
// seam (the straddle below — `selection` is the one column `applyFields` also writes).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ZodError } from "zod";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, rewriteReply, seedOwnedCharacter, seedUser } from "../_support.ts";

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

// ── the SELECTION two-writer seam ───────────────────────────────────────────────────────────────────
// `selection` has two writers: this verb, and `applyFields`, which REMAPS `greetingIndexes` when an
// accepted rewrite removes a greeting (the session addresses greetings by POSITION). The scope dialog's
// state is seeded once at mount, so a save pressed after an apply carries a PRE-REMAP image — and a
// whole-record replace from that image silently undid the remap. The delta grammar is what fences it:
// absent greetings ⇒ keep, `null` ⇒ every greeting, an array ⇒ exactly these.

test("a scope save that never ADDRESSED greetings preserves applyFields' remap (the straddle)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_us_straddle" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "us-card-straddle");
  await h.character.update({
    principal: principal(owner),
    characterId,
    input: { greetings: [{ text: "g0" }, { text: "g1" }, { text: "g2" }, { text: "g3" }] },
  });
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // The scope the dialog opens on: greetings 0, 2 and 3 (the apply-fields §15.2 worked example).
  await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: { selection: { fields: ["greetings"], greetingIndexes: [0, 2, 3] } },
  });

  // WRITER TWO: the apply removes greeting 2, so the survivors shift down — [0,2,3] → [0,2].
  h.queueReply(rewriteReply({ fields: [{ field: "greetings", greetingIndex: 2, cleared: true }] }));
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });
  await h.svc.applyFields({ principal: principal(owner), sessionId: session.id, accepts: [{ field: "greetings", greetingIndex: 2 }] });
  const remapped = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(remapped.selection.greetingIndexes, "the remap landed (the premise this test straddles)").toEqual([0, 2]);

  // WRITER ONE, STRADDLING: the dialog was opened BEFORE the apply and the user only widened the FIELD
  // set — it never addressed the greeting axis, so the delta omits it. Under the old whole-replace this
  // wrote `{fields}` verbatim, dropping `greetingIndexes` entirely and silently re-widening the session
  // to EVERY greeting of the now-shorter card.
  const saved = await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: { selection: { fields: ["greetings", "description"] } },
  });
  expect(saved.selection.fields).toEqual(["greetings", "description"]);
  expect(saved.selection.greetingIndexes, "the untouched axis kept the server's remap").toEqual([0, 2]);
});

test("the greeting axis is three-state: `null` means EVERY greeting, an array means exactly those", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_us_tristate" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "us-card-tristate");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });

  const narrowed = await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: { selection: { fields: ["greetings"], greetingIndexes: [1] } },
  });
  expect(narrowed.selection.greetingIndexes).toEqual([1]);

  // `null` is the ONLY way the wire says "back to every greeting" — absence is spent on "keep", so a
  // widen that omitted the axis would be a no-op, and the all-checked dialog press would not land.
  const widened = await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: { selection: { greetingIndexes: null } },
  });
  expect(widened.selection.greetingIndexes).toBeUndefined();
  // …and the field set the delta never named is untouched by the widen.
  expect(widened.selection.fields).toEqual(["greetings"]);
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
