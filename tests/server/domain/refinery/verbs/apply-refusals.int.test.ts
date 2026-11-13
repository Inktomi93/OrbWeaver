// The card-apply verb refuses an accepted entry for one of the typed reasons of `ApplyDropReason`, and a refusal writes nothing:
// the card, its snapshot list and the session stay as they were, and the whole act is refused when any one entry is.
// The rewrite under test is hand-authored through `submitManualRewrite`, so no model edge is scripted. A card moved by a
// second writer mid-apply is held at the card write by the database's statement hold.
// The refinery has no exported tuple of the reasons, so the case table is a `Record` keyed on the exported union: a new reason fails `tsc` here.
// @subject packages/server/src/domain/refinery/substrate/accept-belts.ts
// @subject packages/server/src/domain/refinery/verbs/apply-fields.ts

import { CHARACTER_STALE_BASIS_OP_CODE, createCharacterSchema } from "@orb/contracts/character";
import type { ApplyDropReason } from "@orb/contracts/refinery";
import { GREETING_SLOTS_MAX } from "@orb/contracts/refinery";
import { everyRow } from "@orb/kit/guards";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, freshHeldDb } from "@orb/testkit/node/composed";
import type { z } from "zod";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Accepts = Parameters<Caller["refinery"]["applyFields"]>[0]["accepts"];
type Rewrite = Parameters<Caller["refinery"]["submitManualRewrite"]>[0]["fields"];
type CardInput = Partial<z.input<typeof createCharacterSchema>>;

interface Attempt {
  readonly characterId: Awaited<ReturnType<Caller["character"]["create"]>>["id"];
  readonly sessionId: Awaited<ReturnType<Caller["refinery"]["startSession"]>>["id"];
  readonly rewriteRunId: Awaited<ReturnType<Caller["refinery"]["submitManualRewrite"]>>["id"];
  readonly accepts: Accepts;
}

const REWRITTEN = "A rewritten description.";
const EDITED_BY_ANOTHER_WRITER = "Edited while the apply was in flight.";
// The card write of the apply: the statement parked between its snapshot and its write.
const CARD_WRITE = /^update "characters" set/i;
const EDITED_UNDER_SESSION = "Edited under the session.";
const TWO_GREETINGS = [{ text: "First hello." }, { text: "Second hello." }];

async function openSession(caller: Caller, card: CardInput = {}): Promise<Pick<Attempt, "characterId" | "sessionId">> {
  const character = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "apply-card",
      name: "Apply card",
      description: "Original description.",
      scenario: "Original scenario.",
      greetings: TWO_GREETINGS,
      ...card,
    }),
  });
  const session = await caller.refinery.startSession({ characterId: character.id });
  return { characterId: character.id, sessionId: session.id };
}

async function rewriteWith(caller: Caller, sessionId: Attempt["sessionId"], fields: Rewrite): Promise<Attempt["rewriteRunId"]> {
  return (await caller.refinery.submitManualRewrite({ sessionId, fields })).id;
}

interface State {
  readonly card: Awaited<ReturnType<Caller["character"]["get"]>>;
  readonly snapshots: Awaited<ReturnType<Caller["character"]["listSnapshots"]>>;
  readonly status: Awaited<ReturnType<Caller["refinery"]["getSession"]>>["status"];
}

/** Everything a refused apply must leave alone, read back through production verbs. */
async function readState(caller: Caller, { characterId, sessionId }: Pick<Attempt, "characterId" | "sessionId">): Promise<State> {
  return {
    card: await caller.character.get({ characterId }),
    snapshots: await caller.character.listSnapshots({ characterId }),
    status: (await caller.refinery.getSession({ sessionId })).status,
  };
}

// One way into each refusal, through production verbs only: the card, the session scope or the rewrite is moved
// after the session starts exactly as a user would move it, and the accept names what the belts refuse.
async function notInRewrite(caller: Caller): Promise<Attempt> {
  const session = await openSession(caller);
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "description", text: REWRITTEN }]);
  return { ...session, rewriteRunId, accepts: [{ field: "scenario" }] };
}

async function notSelected(caller: Caller): Promise<Attempt> {
  const session = await openSession(caller);
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "scenario", text: "A rewritten scenario." }]);
  await caller.refinery.updateSession({ sessionId: session.sessionId, patch: { selection: { fields: ["description"] } } });
  return { ...session, rewriteRunId, accepts: [{ field: "scenario" }] };
}

async function greetingIndexMissing(caller: Caller): Promise<Attempt> {
  const session = await openSession(caller);
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "greetings", greetingIndex: 0, text: "A rewritten hello." }]);
  return { ...session, rewriteRunId, accepts: [{ field: "greetings" }] };
}

async function greetingIndexInvalid(caller: Caller): Promise<Attempt> {
  const session = await openSession(caller);
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "greetings", greetingIndex: 1, text: "A rewritten second hello." }]);
  await caller.character.update({ characterId: session.characterId, input: { greetings: [{ text: "First hello." }] } });
  return { ...session, rewriteRunId, accepts: [{ field: "greetings", greetingIndex: 1 }] };
}

async function greetingIndexForbidden(caller: Caller): Promise<Attempt> {
  const session = await openSession(caller);
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "description", text: REWRITTEN }]);
  return { ...session, rewriteRunId, accepts: [{ field: "description", greetingIndex: 0 }] };
}

async function notApplicable(caller: Caller): Promise<Attempt> {
  const session = await openSession(caller, { depthPrompt: { prompt: "An authored note.", depth: 4 } });
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "depthPrompt", text: "A rewritten note." }]);
  await caller.character.update({ characterId: session.characterId, input: { depthPrompt: null } });
  return { ...session, rewriteRunId, accepts: [{ field: "depthPrompt" }] };
}

async function wouldLeaveNoGreeting(caller: Caller): Promise<Attempt> {
  const session = await openSession(caller, { greetings: [{ text: "The only hello." }] });
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "greetings", greetingIndex: 0, cleared: true }]);
  return { ...session, rewriteRunId, accepts: [{ field: "greetings", greetingIndex: 0 }] };
}

async function greetingCapReached(caller: Caller): Promise<Attempt> {
  const session = await openSession(caller, { greetings: fullCard(GREETING_SLOTS_MAX) });
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "greetings", append: true, text: "One more hello." }]);
  return { ...session, rewriteRunId, accepts: [{ field: "greetings", appendIndex: 0 }] };
}

async function divergedSinceSession(caller: Caller): Promise<Attempt> {
  const session = await openSession(caller);
  await caller.character.update({ characterId: session.characterId, input: { description: EDITED_UNDER_SESSION } });
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "description", text: REWRITTEN }]);
  return { ...session, rewriteRunId, accepts: [{ field: "description" }] };
}

interface RefusalCase {
  readonly reason: ApplyDropReason;
  readonly attempt: (caller: Caller) => Promise<Attempt>;
}

const REFUSALS = everyRow<RefusalCase, "reason">()([
  { reason: "not_in_rewrite", attempt: notInRewrite },
  { reason: "not_selected", attempt: notSelected },
  { reason: "greeting_index_missing", attempt: greetingIndexMissing },
  { reason: "greeting_index_invalid", attempt: greetingIndexInvalid },
  { reason: "greeting_index_forbidden", attempt: greetingIndexForbidden },
  { reason: "not_applicable", attempt: notApplicable },
  { reason: "would_leave_no_greeting", attempt: wouldLeaveNoGreeting },
  { reason: "greeting_cap_reached", attempt: greetingCapReached },
  { reason: "diverged_since_session", attempt: divergedSinceSession },
]);

function fullCard(count: number): { text: string }[] {
  return Array.from({ length: count }, (_, index) => ({ text: `Hello ${String(index)}.` }));
}

test.for(REFUSALS)("an accept refused as $reason is itemized with that reason and nothing is written", async ({ reason, attempt }) => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const { characterId, sessionId, rewriteRunId, accepts } = await attempt(caller);
  const before = await readState(caller, { characterId, sessionId });

  const outcome = await caller.refinery.applyFields({ sessionId, rewriteRunId, accepts });

  expect(outcome.dropped).toEqual(accepts.map(({ field, greetingIndex, appendIndex }) => ({ field, greetingIndex, appendIndex, reason })));
  expect(outcome.applied).toEqual([]);
  expect(outcome.snapshotId).toBeNull();
  expect(outcome.character).toEqual(before.card);
  expect(await readState(caller, { characterId, sessionId })).toEqual(before);
});

test("an accept for a field edited under the session is refused until it is confirmed, then it applies", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const { characterId, sessionId, rewriteRunId, accepts } = await divergedSinceSession(caller);
  const before = await readState(caller, { characterId, sessionId });
  expect(before.card.description).toBe(EDITED_UNDER_SESSION);

  const refused = await caller.refinery.applyFields({ sessionId, rewriteRunId, accepts });
  expect(refused.dropped).toEqual([{ field: "description", reason: "diverged_since_session" }]);
  expect(await readState(caller, { characterId, sessionId })).toEqual(before);

  const confirmed = await caller.refinery.applyFields({ sessionId, rewriteRunId, accepts: accepts.map((accept) => ({ ...accept, confirmDiverged: true })) });
  expect(confirmed.dropped).toEqual([]);
  expect(confirmed.applied).toEqual([{ field: "description", kind: "replaced" }]);
  const after = await readState(caller, { characterId, sessionId });
  expect(after.card.description).toBe(REWRITTEN);
  expect(after.status).toBe("completed");
  expect(after.snapshots).toHaveLength(before.snapshots.length + 1);
  expect(after.snapshots.map(({ id }) => id)).toContain(present(confirmed.snapshotId));
});

test("the last greeting of a card is refused its clearing while a card with one more loses one", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const session = await openSession(caller);
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [
    { field: "greetings", greetingIndex: 0, cleared: true },
    { field: "greetings", greetingIndex: 1, cleared: true },
  ]);
  const before = await readState(caller, session);
  expect(before.card.greetings).toHaveLength(2);

  // Each entry is judged against the card the earlier ones would leave, so the second clearing is the one that would empty it.
  const both = await caller.refinery.applyFields({
    sessionId: session.sessionId,
    rewriteRunId,
    accepts: [
      { field: "greetings", greetingIndex: 0 },
      { field: "greetings", greetingIndex: 1 },
    ],
  });
  expect(both.dropped).toEqual([{ field: "greetings", greetingIndex: 1, reason: "would_leave_no_greeting" }]);
  expect(both.applied).toEqual([]);
  expect(await readState(caller, session)).toEqual(before);

  const one = await caller.refinery.applyFields({ sessionId: session.sessionId, rewriteRunId, accepts: [{ field: "greetings", greetingIndex: 0 }] });
  expect(one.applied).toEqual([{ field: "greetings", greetingIndex: 0, kind: "cleared" }]);
  expect((await readState(caller, session)).card.greetings.map(({ text }) => text)).toEqual(["Second hello."]);
});

test("a greeting append past the ceiling is refused while the append that reaches it lands", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const session = await openSession(caller, { greetings: fullCard(GREETING_SLOTS_MAX - 1) });
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [
    { field: "greetings", append: true, text: "The hundredth hello." },
    { field: "greetings", append: true, text: "One too many." },
  ]);
  const before = await readState(caller, session);
  expect(before.card.greetings).toHaveLength(GREETING_SLOTS_MAX - 1);

  const both = await caller.refinery.applyFields({
    sessionId: session.sessionId,
    rewriteRunId,
    accepts: [
      { field: "greetings", appendIndex: 0 },
      { field: "greetings", appendIndex: 1 },
    ],
  });
  expect(both.dropped).toEqual([{ field: "greetings", appendIndex: 1, reason: "greeting_cap_reached" }]);
  expect(both.applied).toEqual([]);
  expect(await readState(caller, session)).toEqual(before);

  const one = await caller.refinery.applyFields({ sessionId: session.sessionId, rewriteRunId, accepts: [{ field: "greetings", appendIndex: 0 }] });
  expect(one.applied).toEqual([{ field: "greetings", appendIndex: 0, kind: "added" }]);
  const { greetings } = (await readState(caller, session)).card;
  expect(greetings).toHaveLength(GREETING_SLOTS_MAX);
  expect(greetings.at(-1)?.text).toBe("The hundredth hello.");
});

test("one refused entry among accepted ones refuses the whole act and writes none of them", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const session = await openSession(caller);
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "description", text: REWRITTEN }]);
  const before = await readState(caller, session);

  // The good entry comes first, so a verb that wrote entries as it walked them would have landed it before the refusal.
  const batch = await caller.refinery.applyFields({
    sessionId: session.sessionId,
    rewriteRunId,
    accepts: [{ field: "description" }, { field: "scenario" }],
  });
  expect(batch.dropped).toEqual([{ field: "scenario", reason: "not_in_rewrite" }]);
  expect(batch.applied).toEqual([]);
  expect(batch.snapshotId).toBeNull();
  expect(await readState(caller, session)).toEqual(before);

  // The same good entry alone applies, so the refusal above was the other entry's.
  const alone = await caller.refinery.applyFields({ sessionId: session.sessionId, rewriteRunId, accepts: [{ field: "description" }] });
  expect(alone.applied).toEqual([{ field: "description", kind: "replaced" }]);
  expect((await readState(caller, session)).card.description).toBe(REWRITTEN);
});

test("an apply whose card moved between its snapshot and its write is refused whole and leaves no snapshot behind", async () => {
  using held = await freshHeldDb();
  await using root = await createServerHarness({ db: held.db });
  const caller = await root.internalCallerFor(root.ownerId);
  const session = await openSession(caller);
  const rewriteRunId = await rewriteWith(caller, session.sessionId, [{ field: "description", text: REWRITTEN }]);
  const before = await readState(caller, session);

  // The apply has read the card and taken its snapshot when its card write parks; a second writer then edits the card.
  const pending = held.hold(CARD_WRITE);
  const apply = caller.refinery.applyFields({ sessionId: session.sessionId, rewriteRunId, accepts: [{ field: "description" }] });
  await pending.reached;
  pending.disarm();
  await caller.character.update({ characterId: session.characterId, input: { personality: EDITED_BY_ANOTHER_WRITER } });
  pending.release();

  await expect(apply).rejects.toMatchObject({ cause: { code: CHARACTER_STALE_BASIS_OP_CODE } });
  const after = await readState(caller, session);
  expect(after.card.personality).toBe(EDITED_BY_ANOTHER_WRITER);
  expect(after.card.description).toBe(before.card.description);
  expect(after.snapshots).toEqual(before.snapshots);
  expect(after.status).toBe("active");

  // The same apply on the fresh basis lands and keeps its snapshot, so the retraction above removed a real row.
  const retried = await caller.refinery.applyFields({ sessionId: session.sessionId, rewriteRunId, accepts: [{ field: "description" }] });
  expect(retried.applied).toEqual([{ field: "description", kind: "replaced" }]);
  expect((await readState(caller, session)).snapshots).toHaveLength(before.snapshots.length + 1);
});
