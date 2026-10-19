import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HomeTileContribution, SectionDefinition } from "@orb/client/state";
import { assembleChrome, CONFIG_GROUP_IDS, isCollectionGroup, SECTION_IDS } from "@orb/client/state";
import { chromeWidgets, createAuthedComposition, createClientRuntime, homeTiles } from "@orb/testkit/browser/ct-door.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const FEATURES = fileURLToPath(new URL("../../../packages/client/src/features", import.meta.url));

// The production door, assembled exactly as the lazy authenticated route assembles it.
const composition = createAuthedComposition(createClientRuntime("http://localhost"));

const blank = (text: string): boolean => text.trim().length === 0;

/** A dormant doorway owes its reader a reason and a teaser; a live body owes neither. */
function dormantFaults(body: HomeTileContribution["body"]): readonly string[] {
  if (typeof body === "function") {
    return [];
  }
  const { reason, teaser } = body.dormant;
  return [...(blank(reason) ? ["empty reason"] : []), ...(blank(teaser) ? ["empty teaser"] : [])];
}

/** A planned section owes a stated reason; a live section has none to state. */
function plannedFaults(content: SectionDefinition["content"]): readonly string[] {
  return typeof content === "function" || !blank(content.planned) ? [] : ["empty planned reason"];
}

test("every section definition sits under its own id and states any planned reason", () => {
  for (const id of SECTION_IDS) {
    expect(composition.sections.get(id).id).toBe(id);
  }
  expect(composition.sections.list().flatMap(({ content }) => plannedFaults(content))).toEqual([]);
});

test("a planned section that states nothing is refused by the judge", () => {
  expect(plannedFaults({ planned: " " })).toEqual(["empty planned reason"]);
  expect(plannedFaults({ planned: "Build pending." })).toEqual([]);
});

test("every config group sits under its own id", () => {
  for (const id of CONFIG_GROUP_IDS) {
    expect(composition.configGroups.get(id).id).toBe(id);
  }
});

test("a collection group declares its lifecycle as named data", () => {
  const collections = CONFIG_GROUP_IDS.map((id) => composition.configGroups.get(id)).filter(isCollectionGroup);
  expect(collections.length).toBeGreaterThan(0);
  const blanks = collections.flatMap(({ id, body: { collection } }) => [
    ...(blank(collection.create.label) ? [`${id} create.label`] : []),
    ...(collection.importFile !== undefined && blank(collection.importFile.label) ? [`${id} importFile.label`] : []),
    ...(collection.importFile !== undefined && blank(collection.importFile.accept) ? [`${id} importFile.accept`] : []),
  ]);
  expect(blanks).toEqual([]);
});

test("every collection body file is registered by a group", async () => {
  const registered = new Set<unknown>(
    CONFIG_GROUP_IDS.map((id) => composition.configGroups.get(id)).flatMap((group) => (isCollectionGroup(group) ? [group.body.collection] : [])),
  );
  const files = [...globSync("*/lib/*-collection.ts", { cwd: FEATURES }), ...globSync("*/lib/*-collection.tsx", { cwd: FEATURES })];
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const exported: Record<string, unknown> = await import(/* @vite-ignore */ `${FEATURES}/${file}`);
    expect(
      Object.values(exported).some((value) => registered.has(value)),
      `${file} is exported but no group's body.collection is it`,
    ).toBe(true);
  }
});

test("home tiles keep unique ids and an honest dormant doorway", () => {
  const ids = homeTiles.list().map((tile) => tile.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(homeTiles.list().flatMap((tile) => dormantFaults(tile.body))).toEqual([]);
});

test("a dormant doorway that names nothing or promises nothing is refused by the judge", () => {
  expect(dormantFaults({ dormant: { reason: "", teaser: "Soon, with a subject." } })).toEqual(["empty reason"]);
  expect(dormantFaults({ dormant: { reason: "Not built.", teaser: "  " } })).toEqual(["empty teaser"]);
  expect(dormantFaults({ dormant: { reason: "Not built.", teaser: "Soon, with a subject." } })).toEqual([]);
});

test("chrome entries from the whole door carry unique ids", () => {
  const ids = composition.chrome.list().map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("assembling chrome refuses a repeated id and a zone outside CHROME_ZONES", () => {
  const [widget] = chromeWidgets;
  expect(widget).toBeDefined();
  if (widget === undefined) {
    return;
  }
  expect(() => assembleChrome({ sections: [], modals: [], widgets: [widget, widget] })).toThrow(`duplicate chrome entry id "${widget.id}"`);
  // The type admits only CHROME_ZONES; the door re-judges the value, so a widened zone still renders nowhere unseen.
  const stray = { ...widget };
  Reflect.set(stray, "zone", "sidebar.top");
  expect(() => assembleChrome({ sections: [], modals: [], widgets: [stray] })).toThrow('declares zone "sidebar.top"');
});
