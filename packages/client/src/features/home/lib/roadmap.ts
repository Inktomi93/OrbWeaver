// THE ROADMAP — what "What's coming" actually lists (owner ruling, 2026-08-30, #834).
//
// The region lists what is GENUINELY coming: the committed-but-unrealized PROGRAMS, each a work item under
// `docs/work/` whose title names it a program and which links the plan under `docs/plans/` that holds its
// unbuilt remainder. A landed program's item closes and its plan is deleted, so it drops off this list.
// Buddy stays as one of them, and keeps its own file (`buddy-tile.tsx`) because it is not a program item:
// it is the purged-pending-return domain the map still names.
//
// THE SOURCE IS docs/work, AND IT IS NOT READABLE AT RUNTIME. A doc is not a module — the client cannot
// import markdown, and mirroring the items into a build step would put a second copy of the same list on
// the tree either way. So this tuple is a HAND-CURATED MIRROR whose divergence is a TEST failure, not a
// review finding: `tests/client/features/home/lib/roadmap.test.ts` reads the program items and their plans
// off disk and asserts set EQUALITY between this tuple and the open program items, plus each entry's plan
// link. Close a program item, delete its plan, or file a new program, and this file goes RED with the item
// named. That is what makes a curated list honest rather than rotting.
//
// EACH ENTRY IS A DORMANT DOORWAY TILE, not a new render path (H7/H8 — the mechanism `buddy-tile.tsx`'s
// header states, applied to every listed program). The `{dormant}` body arm and the marker are the SAME field, so
// building one of these means writing `body: () => <…/>`, which deletes the promise in the same edit: a
// stale doorway stays unrepresentable. They are HOME-owned for the same reason buddy is — an empty
// `features/expressions/` dir is `feature-owns-definition` RED, and the day the domain lands it takes its
// tile with it.
//
// THE COPY RULE (owner): one honest line each, house voice, and NO date is ever promised. The state line
// is `Not started yet.` for a program with nothing built and `Partly built — <what is there>` for one
// with a built part; the test pins that grammar and refuses a year or a quarter in either line.

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
  /** The plan slug under `docs/plans/` that holds the program's unbuilt remainder. */
  readonly plan: string;
  /** The `docs/work/` item number of the program, which links `plan` — asserted by the parity test. */
  readonly item: number;
}

/** Buddy's doorway is 80 (`buddy-tile.tsx`), and it leads; the mirrored programs follow in tuple order. */
const ROADMAP_ORDER_BASE = 81;

/** The curated mirror of the open program items. ORDER IS READING ORDER — nearest to real first,
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
    plan: "rpg",
    item: 50,
  },
  {
    id: "expressions",
    title: "Expressions",
    icon: Drama,
    gloss: "Portraits that change with the mood of a reply, so a character's face answers you as well as their words.",
    state: "Partly built — image-sheet prep is in place; sprite storage, mood classification, and portrait swapping are still to come.",
    plan: "expressions",
    item: 49,
  },
  {
    id: "reactions",
    title: "Reactions",
    icon: SmilePlus,
    gloss: "React to one line of a reply — and let your characters react to each other, where the next turn can see it.",
    state: "Partly built — reactions and reaction-triggered automations work; custom emoji is still to come.",
    plan: "message-reactions",
    item: 70,
  },
  {
    id: "world-state",
    title: "World state",
    icon: ListChecks,
    gloss: "Trackers and durable notes that hold what is true in a story — relationships, open threads, standing facts — not just what was said.",
    state: "Not started yet.",
    plan: "world-state-clips",
    item: 52,
  },
  {
    id: "agents",
    title: "Agents of their own",
    icon: UserPlus,
    gloss: "An agent that holds its own name and seat in a room, so what it does is attributed to it and bounded on its own terms.",
    state: "Not started yet — an agent still acts under your name.",
    plan: "agent-principals",
    item: 48,
  },
  {
    id: "maps",
    title: "World maps",
    icon: MapIcon,
    gloss: "A map of the place you are playing in — regions, rooms and the ways between them — that the story can move through.",
    state: "Not started yet.",
    plan: "spatial-maps",
    item: 51,
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
