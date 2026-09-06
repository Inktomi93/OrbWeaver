// tests/server/domain/rpg/chat-ops/macro-view — the game turn's MACRO + CEL feed. PURE (the gather resolves
// the view and hands it in), so a unit test over hand-built tracker views.
//
// The pin here is the CAST projection's READ SURFACE, asserted through the affordance a preset author actually
// uses: a parsed+evaluated `{{expr::rpg.cast…}}` program over the staged bindings, never a peek at the object
// literal. The three RV-11 standing guides (appearance/outfit/thoughts) are the fields this projection omitted
// while the extraction round wrote them on every beat, the steering reminder printed them and the Scene tab
// rendered them — writable everywhere, readable by no predicate.

import type { RpgActorView, RpgSnapshotState, RpgStatProfile, RpgTrackerView } from "@orb/contracts/rpg";
import { RPG_NPC_GUIDE_FIELDS, RPG_PROFILE_FREEFORM } from "@orb/contracts/rpg";
import type { CelValue } from "@orb/kit/cel";
import { evalCel, isCelParseError, parseCel } from "@orb/kit/cel";
import { buildRpgMacroFeed } from "../../../../../packages/server/src/domain/rpg/chat-ops/macro-view.ts";
import type { DeltaContext } from "../../../../../packages/server/src/domain/rpg/contract/delta.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The DEFAULT sheet every actor row falls back to (a participant with no `rpg_sheets` row). */
function sheet(): RpgActorView["sheet"] {
  return { className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] };
}

/** An on-stage NPC actor carrying an identity half — the only actor kind the CEL `cast` list projects. */
function castActor(npcKey: string, identity: Partial<NonNullable<RpgActorView["identity"]>> & { name: string }): RpgActorView {
  return {
    actorRef: { kind: "npc", npcKey },
    name: identity.name,
    presence: true,
    identity: { emoji: "", mood: "", relationship: { kind: "neutral", label: "" }, ...identity },
    sheet: sheet(),
    volatile: null,
    trackers: [],
  };
}

function viewWith(...rows: readonly RpgActorView[]): RpgTrackerView {
  return {
    ambient: null,
    lockedPaths: [],
    actors: rows,
    cast: rows.filter((r) => r.presence).map((r) => (r.actorRef.kind === "npc" ? `npc:${r.actorRef.npcKey}` : r.name)),
    trackerDefs: [],
    gameTrackers: [],
    quests: [],
    plot: null,
    recentBeats: [],
    trackersReadOnly: false,
    trackerOrbs: [],
  };
}

/** An empty snapshot state — the delta pair is held identical so the delta block omits (it has its own suite). */
function emptyState(): RpgSnapshotState {
  return {
    clock: null,
    calendarDate: null,
    location: "",
    weather: null,
    presentCharacters: [],
    recentEvents: [],
    actorState: [],
    trackerValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
  };
}

const DELTA_CONTEXT: DeltaContext = { rosterNames: {}, trackerDefs: [], relationshipHints: {} };
const STAT_PROFILE: RpgStatProfile = RPG_PROFILE_FREEFORM;

function feedFor(view: RpgTrackerView): ReturnType<typeof buildRpgMacroFeed> {
  const state = emptyState();
  return buildRpgMacroFeed({ view, prevSnapshot: state, curSnapshot: state, deltaContext: DELTA_CONTEXT, dateMode: "narrated", statProfile: STAT_PROFILE });
}

/** Read the feed the way a preset author does: parse the `{{expr}}` source and evaluate it against the staged
 *  `rpg` binding. A field the projection never staged makes the program error, which is the real symptom. */
function readExpr(rpg: CelValue, source: string): CelValue {
  const program = parseCel(source);
  if (isCelParseError(program)) {
    throw new Error(`the test's own expression did not parse: ${program.message}`);
  }
  return evalCel(program, { rpg });
}

test("the CEL cast projection stages every RV-11 standing guide, readable by an {{expr}} predicate", () => {
  const feed = feedFor(
    viewWith(
      castActor("vesna", {
        name: "Sister Vesna",
        mood: "warming",
        appearance: "tall, silver-haired",
        outfit: "patched grey habit",
        thoughts: "weighing whether to trust you",
      }),
    ),
  );

  expect(readExpr(feed.rpg, "rpg.cast[0].appearance")).toBe("tall, silver-haired");
  expect(readExpr(feed.rpg, "rpg.cast[0].outfit")).toBe("patched grey habit");
  expect(readExpr(feed.rpg, "rpg.cast[0].thoughts")).toBe("weighing whether to trust you");
  // The read surface a predicate is actually written against — the reason this projection exists at all.
  expect(readExpr(feed.rpg, 'rpg.cast.exists(c, c.outfit == "patched grey habit")')).toBe(true);
});

test("every RPG_NPC_GUIDE_FIELDS member is staged (the tuple is the contract, not this list)", () => {
  const feed = feedFor(viewWith(castActor("vesna", { name: "Sister Vesna" })));
  // Derived from the tuple: a fourth guide that reaches the tuple and NOT this projection fails HERE.
  for (const field of RPG_NPC_GUIDE_FIELDS) {
    expect(readExpr(feed.rpg, `rpg.cast[0].${field}`)).toBe("");
  }
});

test("an unwritten guide projects as the empty string, never an absent key that errors the chain", () => {
  const feed = feedFor(viewWith(castActor("kael", { name: "Kael", appearance: "scarred knuckles" })));
  // The data-only degrade the whole tree uses: the chain still evaluates when only one guide was written.
  expect(readExpr(feed.rpg, 'rpg.cast[0].appearance != "" && rpg.cast[0].thoughts == ""')).toBe(true);
});

test("an offstage npc is not in the projection at all (the presence partition is unchanged)", () => {
  const offstage = { ...castActor("ghost", { name: "Ghost", thoughts: "watching from the rafters" }), presence: false };
  const feed = feedFor(viewWith(offstage));
  expect(readExpr(feed.rpg, "rpg.cast.size()")).toBe(0);
});
