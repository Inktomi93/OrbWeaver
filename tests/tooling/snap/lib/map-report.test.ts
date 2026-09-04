// WHEN the global SPA atlas is worth its 2.1 KB (#1372). Measured 2026-09-04: a `--map` run of /chats was
// 17 KB, and the atlas — an inventory of the APP, identical on every call — was 2.1 KB of it, reprinted
// whether or not the caller had just seen it. The decision below is the whole change; it depends on
// session state a one-shot CLI invocation cannot reach, so it is pinned here rather than through stdout.
import type { MapAtlasEvidence } from "../../../../tooling/src/snap/contract/map.ts";
import {
  mapChatPositionSchema,
  mapConfigGroupIdSchema,
  mapContextTabIdSchema,
  mapModalSlotIdSchema,
  mapSectionIdSchema,
} from "../../../../tooling/src/snap/contract/map.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/index.ts";
import { atlasIsNews, atlasSummaryLine, resetAtlasSessionMemory } from "../../../../tooling/src/snap/lib/map-report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

type AvailableAtlas = Extract<MapAtlasEvidence, { status: "available" }>;

function atlas(section: string | null): AvailableAtlas {
  return {
    status: "available",
    url: "http://localhost:5173/",
    capabilities: {
      // The ids are BRANDED: minting them through their own schemas is what makes this fixture the shape
      // the bridge actually produces, rather than a cast that would survive a contract change.
      sections: ["Home", "Chats"].map((id) => mapSectionIdSchema.parse(id)),
      modalSlots: [mapModalSlotIdSchema.parse("newChat")],
      configGroups: ["appearance", "connections"].map((id) => mapConfigGroupIdSchema.parse(id)),
      contextTabs: [mapContextTabIdSchema.parse("rpg.game")],
      contextTabNames: [{ id: mapContextTabIdSchema.parse("rpg.game"), label: "Game" }],
      contextTabsPublished: true,
      chatPositions: [mapChatPositionSchema.parse("latest")],
    },
    place: { url: "http://localhost:5173/", section: section === null ? null : mapSectionIdSchema.parse(section), chatOpen: false, focus: false },
  };
}

test("the one-line atlas states every count a reader needs to decide whether to expand it", () => {
  expect(atlasSummaryLine(atlas("Chats"))).toBe(
    "atlas: 7 SPA targets (2 sections, 1 modals, 2 settings, 1 context tabs, 1 chat positions) at section=Chats — list them with --map --atlas",
  );
});

test("a one-shot --map summarizes; --atlas prints the block", () => {
  resetAtlasSessionMemory();
  expect(atlasIsNews(parseSnapArgs(["/", "--map"]), atlas("Chats"))).toBe(false);
  expect(atlasIsNews(parseSnapArgs(["/", "--map", "--atlas"]), atlas("Chats"))).toBe(true);
});

test("inside a named session the atlas prints when it is NEWS: the first map, and any section change", () => {
  resetAtlasSessionMemory();
  const call = parseSnapArgs(["/", "--session", "drive", "--map"]);

  // First map of the session: the caller has not seen it.
  expect(atlasIsNews(call, atlas("Home"))).toBe(true);
  // Same session, same section: a reprint of what the previous call already said.
  expect(atlasIsNews(call, atlas("Home"))).toBe(false);
  // The section moved under it — the reachable set is news again.
  expect(atlasIsNews(call, atlas("Chats"))).toBe(true);
  expect(atlasIsNews(call, atlas("Chats"))).toBe(false);
  // A different session has its own first time.
  expect(atlasIsNews(parseSnapArgs(["/", "--session", "other", "--map"]), atlas("Chats"))).toBe(true);
});
