// SHAPE substrate — the roleHandling × namesBehavior matrix, the cached-prefix properties across a conversation, multi-human adjacency and the null-persona-stamp guard.

import type { AssembleContext, ChatInjection, MessageView } from "@orb/contracts/chat";
import type { RoleHandling } from "@orb/contracts/inference";
import type { NamesBehavior } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import type { HistoryMacroNames } from "./_shape-support.ts";
import { ARIA, convertsToEmptyWireRow, KAI, SPEAKERS, shape, toShapeCanon } from "./_shape-support.ts";

const ROLE_HANDLINGS: readonly RoleHandling[] = ["none", "merge", "semi-strict", "strict"];
const NAMES_BEHAVIORS: readonly NamesBehavior[] = ["none", "default", "content", "completion"];

/** A SOLO canon — the common case, and the one the live INJECT-NAMED-AS-PLAYER capture came from. */
const MATRIX_SOLO_CANON = [
  { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA },
  { role: "user" as const, content: "u1", authorName: "User" },
  { role: "assistant" as const, content: "a1 tip", authorName: "Aria", characterId: ARIA },
];

/** A GROUP canon with ADJACENT distinct-character assistant rows — the shape that makes the `completion`
 *  out-of-band `name` field collide with the merge requirement. Not an edge case: a multi-speaker round
 *  commits N adjacent assistant rows under one user turn by construction. */
const GROUP_CANON = [
  { role: "user" as const, content: "u1", authorName: "User" },
  { role: "assistant" as const, content: "I think we should go north.", authorName: "Aria", characterId: ARIA },
  { role: "assistant" as const, content: "No, south is safer.", authorName: "Kai", characterId: KAI },
];

/** The rpg instruction channel, in its real shape: a depth-0 `role:"system"` injection. On a backend
 *  without mid-conversation system this demotes to `user` and rides the tail — the exact live path. */
const INSTRUCTION: ChatInjection = {
  position: "in_chat",
  depth: 0,
  role: "system",
  content: "# Game state\nTrackers: HP",
};

/** The SAME instruction authored `role:"user"` — a host's post-history teach / author's note. It is the
 *  identical instruction wearing a different WIRE LANE, and it must be attributed identically.
 *
 *  This arm exists because a fix that carved out `role:"user"` injections shipped and reintroduced the
 *  reported bug for exactly this shape: the final turn arrived with TWO speaker labels, the second one
 *  attributing the game rules to the player. The system-role arm alone could never have caught it. */
const INSTRUCTION_AS_USER: ChatInjection = { ...INSTRUCTION, role: "user" };

/** The marker that identifies the injection's bytes wherever they land (merged or standalone). */
const INSTRUCTION_MARK = "# Game state";

interface Cell {
  readonly canon: typeof MATRIX_SOLO_CANON;
  readonly roleHandling: RoleHandling;
  readonly namesBehavior: NamesBehavior;
  readonly injections: readonly ChatInjection[];
  readonly appendUserTurn?: string | null;
}

function shapeCell(cell: Cell): ReturnType<typeof shape> {
  // Default applies to `undefined` ONLY — `appendUserTurn: null` is meaningful (no volatile tail), so a
  // `??` here would silently erase the case this matrix most wants to cover.
  const { appendUserTurn = "u2 volatile" } = cell;
  return shape({
    canon: cell.canon,
    appendUserTurn,
    injections: [...cell.injections],
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    namesBehavior: cell.namesBehavior,
    speakers: SPEAKERS,
    groupNudge: null,
    convertsToEmptyWireRow,
    roleHandling: cell.roleHandling,
    // Left at the default floor deliberately — `roleHandlingFloor` unset means `strict`, and the clamp
    // takes max(floor, knob), so the KNOB alone cannot go looser than strict. That is the shipped
    // behaviour and the matrix must measure it, not a hypothetical.
  });
}

/** Adjacent same-role pairs in the delivered history — the wire-validity violation, listed for the message. */
function adjacentSameRole(history: readonly { role: string; content: string }[]): string[] {
  const bad: string[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    if (prev !== undefined && cur !== undefined && prev.role === cur.role) {
      bad.push(`[${i - 1},${i}] both "${cur.role}"`);
    }
  }
  return bad;
}

/** Does any speaker label appear attached to the INSTRUCTION's bytes? Checks the row carrying the
 *  instruction for a `Name:` label introducing it — the INJECT-NAMED-AS-PLAYER shape. */
function instructionCarriesSpeaker(history: readonly { role: string; content: string; name?: string }[]): string | null {
  const row = history.find((r) => r.content.includes(INSTRUCTION_MARK));
  if (row === undefined) {
    return null;
  }
  // The label may introduce the whole merged row, or sit immediately before the instruction bytes after a
  // merge separator. Both are misattribution: the model reads a speaker as the author of what follows.
  for (const speaker of [SPEAKERS.user, SPEAKERS.assistant]) {
    if (new RegExp(`${speaker}:\\s*(\\[Note from|${INSTRUCTION_MARK})`, "u").test(row.content)) {
      return `"${speaker}:" introduces the instruction bytes`;
    }
  }
  if (row.name !== undefined) {
    return `row carries an out-of-band name field "${row.name}"`;
  }
  return null;
}

// ── P1 + P2 — the per-cell invariants ─────────────────────────────────────────────────────────────

describe("the roleHandling × namesBehavior matrix", () => {
  for (const canonName of ["solo", "group"] as const) {
    const canon = canonName === "solo" ? MATRIX_SOLO_CANON : GROUP_CANON;
    for (const roleHandling of ROLE_HANDLINGS) {
      for (const namesBehavior of NAMES_BEHAVIORS) {
        for (const [injLabel, injection] of [
          ["system-injection", INSTRUCTION],
          ["user-injection", INSTRUCTION_AS_USER],
        ] as const) {
          const label = `${canonName} · roleHandling=${roleHandling} · names=${namesBehavior} · ${injLabel}`;

          test(`P1 MERGE — ${label}: no adjacent same-role rows survive`, () => {
            const out = shapeCell({ canon, roleHandling, namesBehavior, injections: [injection] });
            // The clamp floors to `strict` when no model floor is supplied, so EVERY cell here merges —
            // including the `none` knob, which cannot go looser than the floor. If that ever changes, this
            // assertion is the thing that should be revisited, not silently relaxed.
            expect(adjacentSameRole(out.history), `adjacent same-role rows on the wire: ${adjacentSameRole(out.history).join(" · ")}`).toEqual([]);
          });

          test(`P2 ATTRIBUTION — ${label}: the injection carries no speaker`, () => {
            const out = shapeCell({ canon, roleHandling, namesBehavior, injections: [injection] });
            expect(instructionCarriesSpeaker(out.history)).toBeNull();
          });
        }
      }
    }
  }
});

// ── P3 — a depth-0 injection must not move cached bytes ───────────────────────────────────────────

describe("P3 PREFIX — a depth-0 injection rides the volatile tail and never moves the cached prefix", () => {
  for (const roleHandling of ROLE_HANDLINGS) {
    for (const namesBehavior of NAMES_BEHAVIORS) {
      test(`roleHandling=${roleHandling} · names=${namesBehavior}`, () => {
        const withNote = shapeCell({ canon: MATRIX_SOLO_CANON, roleHandling, namesBehavior, injections: [INSTRUCTION] });
        const clean = shapeCell({ canon: MATRIX_SOLO_CANON, roleHandling, namesBehavior, injections: [] });
        const cut = clean.cacheBreakpointFromEnd;
        // One unconditional assertion on a computed verdict, rather than branching around `expect`: a cell
        // that claims NO breakpoint is caching nothing and has nothing to protect, but it still has to show
        // up in the run so a cell that silently STOPS claiming one is visible.
        const prefixOf = (o: typeof clean): string =>
          cut === undefined ? "" : JSON.stringify(o.history.slice(0, o.history.length - cut).map((r) => [r.role, r.content]));
        const moved = cut !== undefined && prefixOf(withNote) !== prefixOf(clean);
        const verdict = moved ? "PREFIX MOVED" : "ok";
        expect(verdict).toBe("ok");
      });
    }
  }
});

// ── P4 — the property prompt caching depends on ACROSS a conversation ─────────────────────────────

describe("P4 GROWTH — turn N's cached prefix is a literal prefix of turn N+1's history", () => {
  // Turn N+1's canon = turn N's canon + the committed exchange (the user turn that WAS volatile, plus the
  // reply it produced). That is exactly how a chat grows, and the cache claim is that everything the
  // provider already ingested stays byte-identical underneath it.
  const turnN = MATRIX_SOLO_CANON;
  const turnNPlus1 = [
    ...MATRIX_SOLO_CANON,
    { role: "user" as const, content: "u2 volatile", authorName: "User" },
    { role: "assistant" as const, content: "a2 reply", authorName: "Aria", characterId: ARIA },
  ];

  for (const namesBehavior of NAMES_BEHAVIORS) {
    test(`names=${namesBehavior}: the previously-cached rows are unchanged one turn later`, () => {
      const n = shapeCell({ canon: turnN, roleHandling: "strict", namesBehavior, injections: [INSTRUCTION] });
      const n1 = shapeCell({ canon: turnNPlus1, roleHandling: "strict", namesBehavior, injections: [INSTRUCTION], appendUserTurn: "u3 volatile" });
      const cut = n.cacheBreakpointFromEnd;
      const cachedAtN = cut === undefined ? [] : n.history.slice(0, n.history.length - cut).map((r) => [r.role, r.content]);
      const sameRowsAtN1 = n1.history.slice(0, cachedAtN.length).map((r) => [r.role, r.content]);
      // If this fails, every turn re-bills the whole story prefix — the failure is SILENT in production
      // (nothing errors; the bill just goes up), which is why it needs a test rather than observation.
      // A cell with no breakpoint compares [] to [] and passes vacuously: it caches nothing to begin with.
      expect(sameRowsAtN1).toEqual(cachedAtN);
    });
  }
});

// ── P5 — MULTI-HUMAN adjacency (owner-raised, 2026-08-04) ─────────────────────────────────────────
// Two humans in one room send back-to-back: that is two adjacent `user` rows carrying DIFFERENT author
// names. Both requirements apply at once and they pull against each other under the old shape:
//   • the rows MUST merge (a strict backend rejects the adjacent same-role pair), and
//   • each speaker's label MUST survive the merge (otherwise the model cannot tell who said what, and
//     attributes both messages to whoever spoke first).
// An out-of-band `name` field can satisfy neither together — `squashSameRole` refuses to merge two rows
// with distinct names, which is exactly why `completion` had to start inlining. This is the multi-human
// case the room actually ships, not a synthetic one.

describe("P5 MULTI-HUMAN — two people speaking back-to-back", () => {
  const twoHumans = [
    { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "I open the door.", authorName: "Alex" },
    { role: "user" as const, content: "I follow him in.", authorName: "Joe" },
  ];

  for (const namesBehavior of NAMES_BEHAVIORS) {
    test(`names=${namesBehavior}: the two human turns merge into ONE user row`, () => {
      const out = shapeCell({ canon: twoHumans, roleHandling: "strict", namesBehavior, injections: [] });
      expect(adjacentSameRole(out.history)).toEqual([]);
    });
  }

  test("both speakers stay attributable inside the merged row (content mode)", () => {
    const out = shapeCell({ canon: twoHumans, roleHandling: "strict", namesBehavior: "content", injections: [] });
    const merged = out.history.find((r) => r.content.includes("I open the door."));
    expect(merged?.content).toContain("Alex: I open the door.");
    expect(merged?.content).toContain("Joe: I follow him in.");
  });

  test("completion mode ALSO keeps both speakers — the out-of-band name cannot survive a merge", () => {
    // Before the inlining change this produced two unmerged rows with `name: "Alex"` / `name: "Joe"`, which a
    // strict provider rejects outright. Merging while DROPPING one name would be worse than the rejection:
    // the room would silently tell the model that Alex said Joe's line.
    const out = shapeCell({ canon: twoHumans, roleHandling: "strict", namesBehavior: "completion", injections: [] });
    const merged = out.history.find((r) => r.content.includes("I open the door."));
    expect(merged?.content).toContain("Alex: I open the door.");
    expect(merged?.content).toContain("Joe: I follow him in.");
    expect(merged?.name).toBeUndefined();
  });

  test("under a NON-merging strategy completion keeps the out-of-band name (the field still has a use)", () => {
    // `roleHandling` cannot go looser than the model floor, so this is reached by an explicit non-strict
    // FLOOR — a backend that tolerates adjacent same-role rows. There the OpenAI-spec `name` field is the
    // better shape (no bytes injected into content) and it is preserved.
    const out = shape({
      convertsToEmptyWireRow,
      canon: twoHumans,
      appendUserTurn: null,
      injections: [],
      output: "per-speaker",
      cardScope: "merged",
      scopedTargetId: null,
      namesBehavior: "completion",
      speakers: SPEAKERS,
      groupNudge: null,
      roleHandling: "none",
      roleHandlingFloor: "none",
    });
    const rows = out.history.filter((r) => r.role === "user");
    expect(rows.map((r) => r.name)).toEqual(["Alex", "Joe"]);
    expect(rows.map((r) => r.content)).toEqual(["I open the door.", "I follow him in."]);
  });
});

// INVITE-JOIN-NULL-PERSONA, the PROMPT half. An invite-joined member seated with `activePersonaId = NULL`
// stamps `persona_id = NULL` on every row he writes; `toShapeCanon` returned `authorName: null` for those,
// and `applyNamesBehavior` then falls back to `speakers.user` — this turn's `{{user}}`, which belongs to ONE
// human. So the model was told the HOST said everything the member said. These rows are LEGACY (the migration
// posture accepts them), so the guard has to hold at read time, not just at the seat.
describe("toShapeCanon — the null-persona-stamp guard (a row never borrows a stranger's name)", () => {
  const hostUser = castId<UserId>("user_host");
  const memberUser = castId<UserId>("user_member");
  const hostPersona = castId<PersonaId>("persona_host");

  const macroNames: HistoryMacroNames = {
    characterNamesById: new Map<CharacterId, RowCharacterName>(),
    personaNamesById: new Map<PersonaId, RowPersonaName>([[hostPersona, { name: "Alex", description: "" }]]),
  };

  let nextSeq = 0;
  const userRow = (authorUserId: UserId, personaId: PersonaId | null, content: string): MessageView => {
    nextSeq += 1;
    // @orb-waive no-test-fabrication(unknown): slim MessageView double — toShapeCanon reads only role/kind/content/seq/personaId/authorUserId/excludedFromPrompt/id, all real here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    return {
      id: castId<MessageId>(`message_null_stamp_${nextSeq}`),
      seq: nextSeq,
      role: "user",
      // A real row always declares one (NOT NULL, default `standard`) — the double must not omit a column the
      // prompt-policy dispatch reads, or it tests a shape the read seam cannot produce.
      kind: "standard",
      content,
      authorUserId,
      characterId: null,
      personaId,
      excludedFromPrompt: false,
    } as unknown as MessageView;
  };

  /** A ctx just rich enough for `toShapeCanon`'s macro render — the host owns the active persona. */
  const ctxFor = (activePersonaUserId: UserId | null): AssembleContext =>
    // @orb-waive no-test-fabrication(unknown): slim AssembleContext double — this call path reads only character/characters/characterIds/recentMessages/promptConfig/activePersonaUserId. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    ({
      character: { name: "Aria", description: "" },
      characters: [],
      characterIds: [],
      recentMessages: [],
      promptConfig: DEFAULT_PROMPT_CONFIG,
      activePersonaUserId,
    }) as unknown as AssembleContext;

  test("a member's NULL-stamped row does NOT inherit the host's persona — it takes the unresolvable floor", () => {
    const canon = [userRow(hostUser, hostPersona, "host line"), userRow(memberUser, null, "member line")];
    const rows = toShapeCanon(canon, ctxFor(hostUser), macroNames, null);
    expect(rows.map((r) => r.authorName)).toEqual(["Alex", DEFAULT_PERSONA_NAME]);
  });

  test("end-to-end on the wire: exactly ONE line is spoken as the host", () => {
    const canon = [userRow(hostUser, hostPersona, "host line"), userRow(memberUser, null, "member line")];
    const out = shape({
      convertsToEmptyWireRow,
      canon: toShapeCanon(canon, ctxFor(hostUser), macroNames, null),
      appendUserTurn: null,
      injections: [],
      output: "per-speaker",
      cardScope: "merged",
      scopedTargetId: null,
      namesBehavior: "content",
      speakers: { user: "Alex", assistant: "Aria" },
      groupNudge: null,
      roleHandling: "none",
      roleHandlingFloor: "none",
    });
    const userLines = out.history.filter((r) => r.role === "user").map((r) => r.content);
    expect(userLines).toEqual(["Alex: host line", `${DEFAULT_PERSONA_NAME}: member line`]);
    expect(userLines.filter((l) => l.startsWith("Alex: "))).toHaveLength(1);
  });

  test("the active persona owner's own unstamped row still borrows {{user}} (byte-identical solo behavior)", () => {
    const rows = toShapeCanon([userRow(hostUser, null, "host line")], ctxFor(hostUser), macroNames, null);
    expect(rows[0]?.authorName).toBeNull();
  });

  test("an UNKNOWN owner (any hand-built ctx) fails CLOSED — nobody borrows", () => {
    const rows = toShapeCanon([userRow(hostUser, null, "host line")], ctxFor(null), macroNames, null);
    expect(rows[0]?.authorName).toBe(DEFAULT_PERSONA_NAME);
  });
});
