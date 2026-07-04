// Contract tests for @orb/contracts/crew (D59 rider slice): the config schema's default/bounds
// behavior (every member OFF from an empty section set; the cadence floors are schema-enforced), the
// bookId brand validation, the two status tuples the db CHECKs derive, and the change/note/span leaf
// schemas the db columns $type against.

import {
  CARD_EVOLUTION_PROPOSAL_STATUSES,
  CREW_EDIT_PROPOSAL_STATUSES,
  cardEvolutionChangeSchema,
  cardEvolutionProposalStatusSchema,
  crewConfigSchema,
  crewEditNoteSchema,
  crewEditProposalStatusSchema,
  crewSpanSchema,
} from "@orb/contracts/crew";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

// ── crewConfigSchema ───────────────────────────────────────────────────────────────────────────────────

test("crewConfigSchema parses {version:1} into the all-OFF defaults (enabling is the consent act)", () => {
  const config = crewConfigSchema.parse({ version: 1 });
  expect(config.keeper).toEqual({ enabled: false, bookId: null, minSpan: 48 });
  expect(config.cardEvolution).toEqual({ enabled: false, minSpan: 128 });
  expect(config.director).toEqual({ enabled: false, cadenceTurns: 16, steer: "" });
  expect(config.proseAudit).toEqual({ enabled: false, mode: "on-demand" });
});

test("the cadence floors/ceilings are schema-enforced (the structural spend throttle)", () => {
  const withKeeper = (minSpan: number): unknown => ({ version: 1, keeper: { minSpan } });
  expect(crewConfigSchema.safeParse(withKeeper(16)).success).toBe(true);
  expect(crewConfigSchema.safeParse(withKeeper(15)).success).toBe(false);
  expect(crewConfigSchema.safeParse(withKeeper(257)).success).toBe(false);

  const withDirector = (cadenceTurns: number): unknown => ({
    version: 1,
    director: { cadenceTurns },
  });
  expect(crewConfigSchema.safeParse(withDirector(4)).success).toBe(true);
  expect(crewConfigSchema.safeParse(withDirector(3)).success).toBe(false);
  expect(crewConfigSchema.safeParse(withDirector(65)).success).toBe(false);
});

test("keeper.bookId validates the world_book TypeID prefix (the wibook spec-drift resolution)", () => {
  const bookId = mintTypeId(ID_PREFIX.worldBook);
  const parsed = crewConfigSchema.parse({ version: 1, keeper: { bookId } });
  expect(parsed.keeper.bookId).toBe(bookId);
  // A wrong-prefix id is REJECTED, not silently accepted.
  const wrong = crewConfigSchema.safeParse({
    version: 1,
    keeper: { bookId: mintTypeId(ID_PREFIX.chat) },
  });
  expect(wrong.success).toBe(false);
});

test("crewConfigSchema rejects a wrong version and an out-of-union proseAudit mode", () => {
  expect(crewConfigSchema.safeParse({ version: 2 }).success).toBe(false);
  expect(crewConfigSchema.safeParse({ version: 1, proseAudit: { mode: "hourly" } }).success).toBe(
    false,
  );
});

// ── the status tuples (the db CHECK sources) ───────────────────────────────────────────────────────────

test("CREW_EDIT_PROPOSAL_STATUSES is the pinned 5-member lifecycle (incl. superseded + stale)", () => {
  expect(CREW_EDIT_PROPOSAL_STATUSES).toEqual([
    "pending",
    "accepted",
    "dismissed",
    "superseded",
    "stale",
  ]);
  expect(crewEditProposalStatusSchema.options).toEqual(CREW_EDIT_PROPOSAL_STATUSES);
});

test("CARD_EVOLUTION_PROPOSAL_STATUSES is the pinned 4-member lifecycle (no stale arm)", () => {
  expect(CARD_EVOLUTION_PROPOSAL_STATUSES).toEqual([
    "pending",
    "accepted",
    "dismissed",
    "superseded",
  ]);
  expect(cardEvolutionProposalStatusSchema.options).toEqual(CARD_EVOLUTION_PROPOSAL_STATUSES);
});

// ── the column-leaf schemas ────────────────────────────────────────────────────────────────────────────

// biome-ignore lint/security/noSecrets: false positive — "cardEvolutionChangeSchema" is a zod schema name in the test title, not a credential.
test("cardEvolutionChangeSchema pins the conservative evolvable field set and the op union", () => {
  const change = {
    field: "personality",
    op: "append",
    text: "Now wary of open water.",
    rationale: "Shown repeatedly.",
  };
  expect(cardEvolutionChangeSchema.parse(change)).toEqual(change);
  // Steering internals are the author's, not play's — never proposable.
  expect(cardEvolutionChangeSchema.safeParse({ ...change, field: "systemPrompt" }).success).toBe(
    false,
  );
  expect(cardEvolutionChangeSchema.safeParse({ ...change, field: "name" }).success).toBe(false);
  expect(cardEvolutionChangeSchema.safeParse({ ...change, op: "delete" }).success).toBe(false);
  expect(cardEvolutionChangeSchema.safeParse({ ...change, text: "" }).success).toBe(false);
});

test("crewEditNoteSchema pins the two note kinds and the length cap", () => {
  expect(crewEditNoteSchema.parse({ kind: "prose", note: "echoes" })).toEqual({
    kind: "prose",
    note: "echoes",
  });
  expect(crewEditNoteSchema.safeParse({ kind: "style", note: "x" }).success).toBe(false);
  expect(crewEditNoteSchema.safeParse({ kind: "continuity", note: "" }).success).toBe(false);
  expect(crewEditNoteSchema.safeParse({ kind: "prose", note: "n".repeat(301) }).success).toBe(
    false,
  );
});

test("crewSpanSchema requires non-negative integer seq bounds", () => {
  expect(crewSpanSchema.parse({ fromSeq: 0, toSeq: 140 })).toEqual({ fromSeq: 0, toSeq: 140 });
  expect(crewSpanSchema.safeParse({ fromSeq: -1, toSeq: 2 }).success).toBe(false);
  expect(crewSpanSchema.safeParse({ fromSeq: 1.5, toSeq: 2 }).success).toBe(false);
});
