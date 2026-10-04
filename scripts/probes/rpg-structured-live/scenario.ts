// The scripted game the live matrix plays: eight player turns, each with the state change it implies and a check
// over the panel view read after that turn's flush. Every check reads what a player would see on the panel.

import type { RpgActorView, RpgTrackerDef, RpgTrackerView } from "@orb/contracts/rpg";
import { rpgTrackerDefSchema } from "@orb/contracts/rpg";

export const TRACKERS: readonly RpgTrackerDef[] = [
  rpgTrackerDefSchema.parse({
    key: "stamina",
    label: "Stamina",
    shape: "meter",
    write: "delta",
    subject: "actor",
    max: 10,
    hint: "physical energy you spend on hard work",
  }),
  rpgTrackerDefSchema.parse({
    key: "resolve",
    label: "Resolve",
    shape: "text",
    write: "set",
    subject: "actor",
    hint: "one word for how steady they are right now",
  }),
  rpgTrackerDefSchema.parse({
    key: "alarm",
    label: "Alarm",
    shape: "meter",
    write: "set",
    subject: "game",
    max: 100,
    hint: "how roused the village is, 0 to 100",
  }),
];

export const NARRATOR_CARD = {
  name: "Narrator",
  description:
    "The narrator of a small fantasy adventure. The player is a courier. Narrate exactly what the player does in two to four " +
    "sentences, in second person, and confirm every concrete fact the player states: places, times of day, people present, " +
    "items gained or lost, and how they feel. Never contradict the player's action and never add new items or people.",
};

/** One read of the panel, flattened to the fields the checks compare. */
export interface PanelRead {
  readonly location: string;
  readonly clock: string;
  readonly present: readonly string[];
  readonly inventory: readonly string[];
  readonly stamina: number | null;
  readonly resolve: string | null;
  readonly alarm: number | null;
  readonly quests: readonly string[];
}

function playerOf(view: RpgTrackerView): RpgActorView | undefined {
  return view.actors.find((actor) => actor.actorRef.kind === "user");
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function readPanel(view: RpgTrackerView): PanelRead {
  const player = playerOf(view);
  const values = player?.volatile?.trackerValues ?? {};
  const resolve = values["resolve"]?.value;
  const ambient = view.ambient;
  return {
    location: ambient === null ? "" : ambient.location,
    clock: JSON.stringify(ambient === null ? null : ambient.clock),
    present: view.actors.filter((actor) => actor.presence && actor.actorRef.kind === "npc").map((actor) => actor.name),
    inventory: (player?.volatile?.inventory ?? []).map((item) => item.name),
    stamina: numberOf(values["stamina"]?.value),
    resolve: typeof resolve === "string" ? resolve : null,
    alarm: numberOf(view.gameTrackers.find((entry) => entry.def.key === "alarm")?.value?.value),
    quests: view.quests.map((quest) => quest.name),
  };
}

const has = (list: readonly string[], pattern: RegExp): boolean => list.some((entry) => pattern.test(entry));

/** The panel clock is `{day, hour, minute}`; a named time of day lands as an hour. */
function hourOf(read: PanelRead): number | null {
  const clock = JSON.parse(read.clock) as { hour?: unknown } | null;
  return typeof clock?.hour === "number" ? clock.hour : null;
}

const EVENING_FIRST_HOUR = 16;
const EVENING_LAST_HOUR = 21;
const NIGHT_FIRST_HOUR = 22;
const NIGHT_LAST_HOUR = 4;

function isEvening(read: PanelRead): boolean {
  const hour = hourOf(read);
  return hour !== null && hour >= EVENING_FIRST_HOUR && hour <= EVENING_LAST_HOUR;
}

function isNight(read: PanelRead): boolean {
  const hour = hourOf(read);
  return hour !== null && (hour >= NIGHT_FIRST_HOUR || hour <= NIGHT_LAST_HOUR);
}

/** One expectation: a label and a predicate over the panel before and after the turn. */
interface Expectation {
  readonly label: string;
  readonly holds: (after: PanelRead, before: PanelRead) => boolean;
}

export interface Turn {
  readonly id: string;
  readonly player: string;
  /** The planes this turn changes, in the vocabulary of the brief's coverage list. */
  readonly planes: readonly string[];
  readonly expect: readonly Expectation[];
}

export const TURNS: readonly Turn[] = [
  {
    id: "t1-arrive",
    player: "As evening falls I walk into the Copper Lantern, the only inn in the village of Ashford, and shake the rain off my cloak.",
    planes: ["scene.location", "scene.time"],
    expect: [
      { label: "location is the Copper Lantern / Ashford", holds: (a) => /lantern|ashford/i.test(a.location) },
      { label: "time is evening", holds: isEvening },
    ],
  },
  {
    id: "t2-cast",
    player: "A tall innkeeper named Marta greets me from behind the bar, and a hooded stranger named Vell sits watching me from a corner table.",
    planes: ["presentUpsert"],
    expect: [
      { label: "Marta present", holds: (a) => has(a.present, /marta/i) },
      { label: "Vell present", holds: (a) => has(a.present, /vell/i) },
    ],
  },
  {
    id: "t3-buy",
    player: "I buy a coil of rope and a brass lantern from Marta and stow both in my pack.",
    planes: ["inventory.add"],
    expect: [
      { label: "rope in inventory", holds: (a) => has(a.inventory, /rope/i) },
      { label: "lantern in inventory", holds: (a) => has(a.inventory, /lantern/i) },
    ],
  },
  {
    id: "t4-labour",
    player: "To pay for my board I spend two hours hauling heavy crates in the cellar. It leaves me drained; I lose 3 stamina.",
    planes: ["tracker.delta"],
    expect: [{ label: "stamina went down", holds: (a, b) => a.stamina !== null && a.stamina < (b.stamina ?? 0) }],
  },
  {
    id: "t5-letter",
    player:
      "Vell slides me a sealed letter and asks me to deliver it to the old mill tonight. I accept; my resolve is now determined. " +
      "Outside, the village alarm bell starts ringing: the alarm is now at 60.",
    planes: ["tracker.set (actor)", "tracker.set (game)", "quest"],
    expect: [
      { label: "resolve set to determined", holds: (a) => /determin/i.test(a.resolve ?? "") },
      { label: "alarm set to 60", holds: (a) => a.alarm === 60 },
      { label: "a quest about the letter or mill", holds: (a) => has(a.quests, /letter|mill|deliver/i) },
    ],
  },
  {
    id: "t6-mill",
    player: "At midnight I leave the inn alone and walk out to the old mill on the edge of the village. Marta and Vell stay behind at the inn.",
    planes: ["scene.location", "scene.time", "presentRemove"],
    expect: [
      { label: "location is the old mill", holds: (a) => /mill/i.test(a.location) },
      { label: "time is night", holds: isNight },
      { label: "Marta no longer present", holds: (a) => !has(a.present, /marta/i) },
    ],
  },
  {
    id: "t7-climb",
    player: "I tie my rope to a beam, climb up to the mill loft, and leave the rope tied there. I no longer have the rope.",
    planes: ["inventory.remove"],
    expect: [
      { label: "rope gone", holds: (a) => !has(a.inventory, /rope/i) },
      { label: "lantern kept", holds: (a) => has(a.inventory, /lantern/i) },
    ],
  },
  {
    id: "t8-wait",
    player: "I wait in silence in the dark loft for a moment, listening. Nothing happens.",
    planes: ["no change"],
    expect: [
      {
        label: "panel unchanged",
        holds: (a, b) =>
          a.location === b.location &&
          JSON.stringify(a.inventory) === JSON.stringify(b.inventory) &&
          a.stamina === b.stamina &&
          a.resolve === b.resolve &&
          a.alarm === b.alarm,
      },
    ],
  },
];

/** What the story implies at its end: the resync must leave (or rebuild) this. */
export const FINAL_EXPECT: readonly Expectation[] = [
  { label: "location is the old mill", holds: (a) => /mill/i.test(a.location) },
  { label: "lantern in inventory", holds: (a) => has(a.inventory, /lantern/i) },
  { label: "rope gone", holds: (a) => !has(a.inventory, /rope/i) },
  { label: "resolve determined", holds: (a) => /determin/i.test(a.resolve ?? "") },
  { label: "alarm 60", holds: (a) => a.alarm === 60 },
];

export function judge(expect: readonly Expectation[], after: PanelRead, before: PanelRead): { readonly pass: string[]; readonly miss: string[] } {
  const pass: string[] = [];
  const miss: string[] = [];
  for (const e of expect) {
    (e.holds(after, before) ? pass : miss).push(e.label);
  }
  return { pass, miss };
}

/** The swipe scenario: a base turn, turn N steered two ways, then turn N+1 steered two ways. Each steer names the
 *  one state change its variant makes, so the two variants of a slot write different state by construction. */
export const SWIPE_SCRIPT = {
  base: "As evening falls I walk into the Copper Lantern inn in Ashford. Marta the innkeeper is behind the bar.",
  turnN: "I ask Marta what she has for sale and buy one thing from her.",
  steerA: "Marta sells the player a coil of rope, which the player stows in their pack. Nothing else changes.",
  steerB: "Marta sells the player a silver dagger, which the player belts at their hip. Nothing else changes.",
  turnN1: "At midnight I leave the inn and walk somewhere quiet to think.",
  steerC: "The player walks to the stables behind the inn and stays there. Nothing else changes.",
  steerD: "The player walks to the village chapel and stays there. Nothing else changes.",
} as const;

/** The fields of two panel reads that differ, as `field: before → after`. */
export function panelDiff(before: PanelRead, after: PanelRead): string[] {
  const out: string[] = [];
  for (const key of Object.keys(after) as (keyof PanelRead)[]) {
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) {
      out.push(`${key}: ${a} → ${b}`);
    }
  }
  return out;
}

const ROPE = /rope/i;
const DAGGER = /dagger/i;

/** The swipe checks, each over the panel reads the scenario recorded. */
export const SWIPE_CHECKS = {
  aVariantB: (b: PanelRead): boolean => has(b.inventory, DAGGER) && !has(b.inventory, ROPE),
  aVariantA: (a: PanelRead): boolean => has(a.inventory, ROPE) && !has(a.inventory, DAGGER),
  /** A's item stays unless this variant removed it itself, and B's never appears. */
  buildsOnA: (read: PanelRead, removedRope: boolean): boolean => has(read.inventory, ROPE) !== removedRope && !has(read.inventory, DAGGER),
  /** Storage, not steer-following: A's item stays unless this variant removed it itself, B's never appears, and
   *  nothing of C's location survives. */
  dKeepsAOnly: (d: PanelRead, removedRope: boolean): boolean =>
    has(d.inventory, ROPE) !== removedRope && !has(d.inventory, DAGGER) && !/stable/i.test(d.location),
} as const;
