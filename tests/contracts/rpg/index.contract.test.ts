import {
  RPG_ACTIVE_STATES,
  RPG_CLOCK_SEGMENTS,
  RPG_GAME_STATUSES,
  RPG_WIDGET_POSITIONS,
  RPG_WIDGET_TYPES,
  rpgClockTimeSchema,
  rpgGameConfigSchema,
  rpgMapDataSchema,
  rpgSheetSchema,
  rpgWidgetBindingSchema,
} from "@orb/contracts/rpg";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

test("the rpg enum axes are the pinned tuples (03 §)", () => {
  expect(RPG_GAME_STATUSES).toEqual(["setup", "ready", "active", "concluded"]);
  expect(RPG_ACTIVE_STATES).toEqual(["exploration", "dialogue", "combat", "travel_rest"]);
  expect(RPG_WIDGET_TYPES).toHaveLength(8);
  expect(RPG_WIDGET_POSITIONS).toEqual(["hud_left", "hud_right"]);
  expect(RPG_CLOCK_SEGMENTS).toEqual([4, 6, 8, 12]);
});

test("rpgGameConfigSchema applies section defaults from a minimal input (prefault sub-objects)", () => {
  const parsed = rpgGameConfigSchema.parse({
    genres: ["Fantasy"],
    tones: ["Heroic"],
    difficulty: "normal",
    rating: "sfw",
    gm: { kind: "standalone" },
  });
  expect(parsed.setting).toBe("A fantasy world");
  expect(parsed.houseRules.failForward).toBe(true);
  expect(parsed.houseRules.criticalRange).toBe(20);
  expect(parsed.assist.recapOnSessionStart).toBe(true);
  expect(parsed.imagery.enabled).toBe(false);
  expect(parsed.lorebook.keeperBookId).toBeNull();
});

test("rpgGameConfigSchema — gm 'character' arm requires a branded characterId", () => {
  const ok = rpgGameConfigSchema.safeParse({
    genres: ["Sci-fi"],
    tones: ["Grim"],
    difficulty: "hard",
    rating: "nsfw",
    gm: { kind: "character", characterId: mintTypeId(ID_PREFIX.character) },
  });
  expect(ok.success).toBe(true);
  const bad = rpgGameConfigSchema.safeParse({
    genres: ["Sci-fi"],
    tones: ["Grim"],
    difficulty: "hard",
    rating: "nsfw",
    gm: { kind: "character", characterId: "not-a-char-id" },
  });
  expect(bad.success).toBe(false);
});

test("rpgClockTimeSchema bounds hour 0-23 / minute 0-59", () => {
  expect(rpgClockTimeSchema.parse({ day: 1, hour: 0, minute: 0 }).day).toBe(1);
  expect(rpgClockTimeSchema.safeParse({ day: 1, hour: 24, minute: 0 }).success).toBe(false);
  expect(rpgClockTimeSchema.safeParse({ day: 0, hour: 1, minute: 1 }).success).toBe(false);
});

test("rpgSheetSchema clamps attributes 1..30 and defaults class/combat baselines", () => {
  const sheet = rpgSheetSchema.parse({
    attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    maxHp: 20,
  });
  expect(sheet.className).toBe("Adventurer");
  expect(sheet.attack).toBe(5);
  expect(
    rpgSheetSchema.safeParse({
      attributes: { str: 31, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      maxHp: 20,
    }).success,
  ).toBe(false);
});

test("rpgMapDataSchema discriminates grid vs node", () => {
  const grid = rpgMapDataSchema.parse({
    kind: "grid",
    width: 4,
    height: 4,
    cells: [],
    partyPosition: { x: 0, y: 0 },
  });
  expect(grid.kind).toBe("grid");
  const node = rpgMapDataSchema.parse({
    kind: "node",
    nodes: [],
    edges: [],
    partyPosition: "start",
  });
  expect(node.kind).toBe("node");
});

test("rpgWidgetBindingSchema discriminates on source and brands entity refs", () => {
  const morale = rpgWidgetBindingSchema.parse({ source: "morale" });
  expect(morale.source).toBe("morale");
  const clock = rpgWidgetBindingSchema.parse({
    source: "clock",
    clockId: mintTypeId(ID_PREFIX.rpgClock),
  });
  expect(clock.source).toBe("clock");
  expect(
    rpgWidgetBindingSchema.safeParse({ source: "clock", clockId: "not-branded" }).success,
  ).toBe(false);
});
