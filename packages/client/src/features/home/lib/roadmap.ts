// THE ROADMAP — what "What's coming" actually lists (owner ruling, 2026-08-30, #834).
//
// The region used to hold whatever DORMANT doorways the registry happened to carry, which after B3 retired
// automation's tile was exactly one: a `<section>` + h2 + disclosure + h3 + two paragraphs to say "Buddy —
// not started yet" (side-eye HOME delta 2026-08-30, P3 "a whole section of chrome to deliver ONE dateless
// item"). The owner's answer was not to cut the region but to give it its real subject: the region lists
// what is GENUINELY coming — the committed-but-unrealized programs in
// `docs/architecture/proposed/INDEX.md`, dispositions **FUTURE** and **PARTIAL**, excluding REALIZED and
// SUPERSEDED. Buddy stays as one of them, and keeps its own file (`buddy-tile.tsx`) because it is not an
// INDEX row: it is the purged-pending-return domain the map still names.
//
// THE SOURCE IS INDEX.md, AND IT IS NOT READABLE AT RUNTIME. A doc is not a module — the client cannot
// import a markdown table, and mirroring the table into a build step would put a second copy of the same
// list on the tree either way. So this tuple is a HAND-CURATED MIRROR whose divergence is a TEST failure,
// not a review finding: `tests/client/features/home/lib/roadmap.test.ts` reads INDEX.md off disk and
// asserts set EQUALITY between this tuple's `set` fields and the table's FUTURE/PARTIAL rows, plus the
// sprint number on each row. Promote a program to REALIZED, retire one, or add a new FUTURE set, and this
// file goes RED with the row named. That is what makes a curated list honest rather than rotting.
//
// EACH ENTRY IS A DORMANT DOORWAY TILE, not a new render path (H7/H8 — the mechanism `buddy-tile.tsx`'s
// header states, applied to every indexed program). The `{dormant}` body arm and the marker are the SAME field, so
// building one of these means writing `body: () => <…/>`, which deletes the promise in the same edit: a
// stale doorway stays unrepresentable. They are HOME-owned for the same reason buddy is — an empty
// `features/expressions/` dir is `feature-owns-definition` RED, and the day the domain lands it takes its
// tile with it.
//
// THE COPY RULE (owner): one honest line each, house voice, and NO date is ever promised. The state line
// is `Not started yet.` for a FUTURE program and `Partly built — <what is there>` for a PARTIAL one; the
// test pins the PARTIAL half against the INDEX disposition and refuses a year or a quarter in either line.

import type { LucideIcon } from "@orb/ui/icons";
import { Drama, ListChecks, MapIcon, SmilePlus, Swords, UserPlus } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";

/** One committed-but-unrealized program, as home says it out loud + the provenance that proves it.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export interface RoadmapProgram {
  /** Registry key + `data-home-tile` value — bare, like `buddy`, because a doorway names a capability. */
  readonly id: string;
  readonly title: string;
  readonly icon: LucideIcon;
  /** The one-line promise: what this will BE, in the user's terms. Rendered as the doorway's teaser. */
  readonly gloss: string;
  /** What is still missing, in the user's terms. Rendered as the doorway's quiet mono state line. */
  readonly state: string;
  /** The INDEX.md row this entry mirrors, spelled exactly as that table's first cell backticks it. */
  readonly set: string;
  /** The Project sprint issue the INDEX row links — the same number, asserted by the parity test. */
  readonly sprint: number;
}

/** Buddy's doorway is 80 (`buddy-tile.tsx`), and it leads; the mirrored programs follow in tuple order. */
const ROADMAP_ORDER_BASE = 81;

/** The curated mirror of INDEX.md's FUTURE + PARTIAL rows. ORDER IS READING ORDER — nearest to real first,
 *  largest and least likely last — and it is also the doorways' `order`, so the tuple is the one home for
 *  both.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const HOME_ROADMAP: readonly RoadmapProgram[] = [
  {
    id: "rpg",
    title: "RPG mode",
    icon: Swords,
    gloss: "Turn a chat into a table — dice, character sheets, trackers, and a GM that plays by the rules instead of vibing them.",
    state: "Partly built — the table runs; encounters and handing the GM seat to a person are still to come.",
    set: "docs/plans/rpg/design.md",
    sprint: 25,
  },
  {
    id: "expressions",
    title: "Expressions",
    icon: Drama,
    gloss: "Portraits that change with the mood of a reply, so a character's face answers you as well as their words.",
    state: "Partly built — image-sheet prep is in place; sprite storage, mood classification, and portrait swapping are still to come.",
    set: "docs/plans/expressions/design.md",
    sprint: 20,
  },
  {
    id: "reactions",
    title: "Reactions",
    icon: SmilePlus,
    gloss: "React to one line of a reply — and let your characters react to each other, where the next turn can see it.",
    state: "Partly built — reactions and reaction-triggered automations work; custom emoji is still to come.",
    set: "docs/plans/message-reactions/design.md",
    sprint: 2565,
  },
  {
    id: "world-state",
    title: "World state",
    icon: ListChecks,
    gloss: "Trackers and durable notes that hold what is true in a story — relationships, open threads, standing facts — not just what was said.",
    state: "Not started yet.",
    set: "docs/plans/world-state-clips/design.md",
    sprint: 29,
  },
  {
    id: "agents",
    title: "Agents of their own",
    icon: UserPlus,
    gloss: "An agent that holds its own name and seat in a room, so what it does is attributed to it and bounded on its own terms.",
    state: "Not started yet — an agent still acts under your name.",
    set: "docs/plans/agent-principals/design.md",
    sprint: 13,
  },
  {
    id: "maps",
    title: "World maps",
    icon: MapIcon,
    gloss: "A map of the place you are playing in — regions, rooms and the ways between them — that the story can move through.",
    state: "Not started yet.",
    set: "docs/plans/spatial-maps/design.md",
    sprint: 27,
  },
];

/** The tuple as home tiles — the SAME dormant-doorway arm buddy declares by hand, so the surface's doorway
 *  group, its fold and its count get these for free and no second render path exists. */
export const homeRoadmapTiles: readonly HomeTileContribution[] = HOME_ROADMAP.map((program, index) => ({
  id: program.id,
  title: program.title,
  icon: program.icon,
  order: ROADMAP_ORDER_BASE + index,
  body: { dormant: { reason: program.state, teaser: program.gloss } },
}));
