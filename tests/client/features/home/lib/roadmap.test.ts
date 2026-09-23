// THE ROADMAP'S PARITY PIN (#834) — home's "What's coming" tuple against the program items it mirrors.
//
// The open PROGRAM items under `docs/work/` (a work item whose title names it a program, linking the plan
// under `docs/plans/` that holds its unbuilt remainder) are the owner-ruled SOURCE for what the region
// lists, and a doc is not a module — the client cannot import markdown, so `features/home/lib/roadmap.ts`
// is a hand-curated mirror. A hand-curated mirror rots silently; this file is what makes it rot LOUDLY. It
// reads the items and plans off disk and asserts SET EQUALITY, so closing a program, deleting its plan, or
// filing a new program REDS here with the item named, instead of leaving home promising a thing that shipped.
//
// THE PARSER'S OWN CONTROL comes first: a frontmatter read that stops matching returns an empty item list,
// and every assertion below would then pass vacuously (⊆ ∅ is trivially true) — the exact "silent zero"
// shape a negative claim is never allowed to rest on. So the first test pins that the parse found more
// items than the tuple holds, in more than one state, and at least one program before anything else is
// asked.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RoadmapProgram } from "../../../../../packages/client/src/features/home/lib/roadmap.ts";
import { HOME_ROADMAP, homeRoadmapTiles } from "../../../../../packages/client/src/features/home/lib/roadmap.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const REPO_ROOT = join(import.meta.dirname, "../../../../..");
const WORK_DIR = join(REPO_ROOT, "docs/work");
const PLANS_DIR = join(REPO_ROOT, "docs/plans");

/** An item filename: a zero-padded number, then its slug. */
const ITEM_FILE_RE = /^(\d{4})-[\w-]+\.md$/u;
/** The word that marks an item as a program the roadmap lists. */
const PROGRAM_TITLE_RE = /\bprogram\b/iu;
/** A finished item is off the roadmap; every other state is still coming. */
const DONE_STATUS = "done";
/** A plan the roadmap points at is a live plan. */
const ACTIVE_STATUS = "active";
/** Buddy is NOT a program item — it is the purged-pending-return domain, and it keeps its own tile file. */
const BUDDY_TILE_ID = "buddy";
/** Every roadmap doorway sorts after buddy's 80 (`roadmap.ts` ROADMAP_ORDER_BASE). */
const FIRST_ROADMAP_ORDER = 81;
/** A promise with a year or a quarter in it is a date, and the owner ruled this region promises none. */
const DATE_PROMISE_RE = /\b(?:20\d\d|Q[1-4])\b/u;
/** The two state-line openings the copy rule allows. */
const NOT_STARTED = "Not started yet";
const PARTLY_BUILT = "Partly built — ";

interface WorkItem {
  readonly id: number;
  readonly title: string;
  readonly status: string;
  readonly plan: string | null;
}

/** The frontmatter value of `key`, or null when the block does not carry it. */
function field(source: string, key: string): string | null {
  const block = /^---\n([\s\S]*?)\n---\n/u.exec(source)?.[1] ?? "";
  const prefix = `${key}: `;
  const line = block.split("\n").find((entry) => entry.startsWith(prefix));
  return line === undefined ? null : line.slice(prefix.length).trim();
}

function readItems(): readonly WorkItem[] {
  return readdirSync(WORK_DIR).flatMap((name): readonly WorkItem[] => {
    const id = ITEM_FILE_RE.exec(name)?.[1];
    if (id === undefined) {
      return [];
    }
    const source = readFileSync(join(WORK_DIR, name), "utf8");
    const title = /^# (.+)$/mu.exec(source)?.[1];
    const status = field(source, "status");
    if (title === undefined || status === null) {
      return [];
    }
    return [{ id: Number(id), title, status, plan: field(source, "plan") }];
  });
}

const items = readItems();
const itemOf = (id: number): WorkItem | undefined => items.find((item) => item.id === id);
const openPrograms = items.filter((item) => item.status !== DONE_STATUS && PROGRAM_TITLE_RE.test(item.title));
const byNumber = (a: number, b: number): number => a - b;

test("CONTROL — the work items actually parsed (a broken read would pass every pin below vacuously)", () => {
  expect(items.length).toBeGreaterThan(HOME_ROADMAP.length);
  expect(new Set(items.map((item) => item.status)).size, "the parse must reach items in more than one state").toBeGreaterThan(1);
  expect(openPrograms.length).toBeGreaterThan(0);
});

test("every roadmap entry mirrors an open program item that links its plan, and the plan is live", () => {
  for (const program of HOME_ROADMAP) {
    const item = itemOf(program.item);
    const label = `item ${String(program.item)} ("${program.id}")`;
    expect(item, `${label} is not under docs/work`).toBeDefined();
    expect(item?.status, `${label} is done — home never promises what shipped`).not.toBe(DONE_STATUS);
    expect(item !== undefined && PROGRAM_TITLE_RE.test(item.title), `${label} is not titled as a program`).toBe(true);
    expect(item?.plan, `${label} links a different plan`).toBe(program.plan);
    const design = join(PLANS_DIR, program.plan, "design.md");
    expect(existsSync(design), `plan \`${program.plan}\` has no design.md`).toBe(true);
    expect(field(readFileSync(design, "utf8"), "status"), `plan \`${program.plan}\` is not active`).toBe(ACTIVE_STATUS);
  }
});

test("the tuple IS the open program set — a program filed or closed under docs/work reds here", () => {
  expect(HOME_ROADMAP.map((program) => program.item).toSorted(byNumber)).toEqual(openPrograms.map((item) => item.id).toSorted(byNumber));
});

test("the state line follows the copy rule, and neither line promises a date", () => {
  const stated = (program: RoadmapProgram): boolean => program.state.startsWith(NOT_STARTED) || program.state.startsWith(PARTLY_BUILT);
  for (const program of HOME_ROADMAP) {
    expect(stated(program), `"${program.id}" state line opens with neither "${NOT_STARTED}" nor "${PARTLY_BUILT}"`).toBe(true);
    expect(DATE_PROMISE_RE.test(`${program.gloss} ${program.state}`), `"${program.id}" promises a date`).toBe(false);
  }
});

test("the doorway tiles derive 1:1 from the tuple — dormant arm, tuple copy, buddy-then-roadmap order", () => {
  expect(homeRoadmapTiles.map((tile) => tile.id)).toEqual(HOME_ROADMAP.map((program) => program.id));
  expect(homeRoadmapTiles.map((tile) => tile.id)).not.toContain(BUDDY_TILE_ID);
  expect(new Set(homeRoadmapTiles.map((tile) => tile.id)).size).toBe(homeRoadmapTiles.length);
  expect(homeRoadmapTiles.map((tile) => tile.order)).toEqual(HOME_ROADMAP.map((_program, index) => FIRST_ROADMAP_ORDER + index));
  for (const [index, tile] of homeRoadmapTiles.entries()) {
    const program = HOME_ROADMAP[index];
    // The `{dormant}` arm, not a body function: a doorway renders no control, and building the program
    // means replacing this field, which deletes the promise in the same edit.
    expect(typeof tile.body, `"${tile.id}" must be a dormant doorway, not a live body`).not.toBe("function");
    expect(tile.body).toEqual({ dormant: { reason: program?.state, teaser: program?.gloss } });
  }
});
