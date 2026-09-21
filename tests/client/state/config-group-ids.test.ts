// `CONFIG_GROUP_IDS` / `CONFIG_SHELVES` (state/config-group-ids.ts) — the ONE closed config-group vocabulary
// (config-revamp-design.md §3.1; owner fork F-1: the collections join the tuple) and the four LIST shelves
// (User · App · Collections · Extensions — never "You": that word is the mobile sheet's, owner correction
// 2026-08-30). Pins the membership the door's total `Record` and every deep link are typed against.

import { CONFIG_GROUP_IDS, CONFIG_SHELVES, isConfigGroupId } from "@orb/client/state";
import { expect, test } from "../../support/fixtures.ts";

test("the tuple is the nine settings groups + the four collections, each exactly once", () => {
  expect([...CONFIG_GROUP_IDS]).toEqual([
    "personas",
    "appearance",
    "chat-behavior",
    "workloads",
    "backup",
    "connections",
    "automation",
    "admin",
    "tags",
    "regex",
    "worldInfo",
    "rosterPreset",
    "plugins",
  ]);
  expect(new Set(CONFIG_GROUP_IDS).size).toBe(CONFIG_GROUP_IDS.length);
});

test("the shelves are User · App · Collections · Extensions — no `you` shelf on the desktop LIST", () => {
  expect([...CONFIG_SHELVES]).toEqual(["user", "app", "collections", "extensions"]);
});

test("the guards accept every member and refuse the retired settings-era spellings", () => {
  for (const id of CONFIG_GROUP_IDS) {
    expect(isConfigGroupId(id)).toBe(true);
  }
  // A collection is addressed by its GROUP id, never by a bare noun.
  expect(isConfigGroupId("tag")).toBe(false);
  expect(isConfigGroupId("world-info")).toBe(false);
  // The retired settings category that never became a group.
  expect(isConfigGroupId("system")).toBe(false);
  expect(isConfigGroupId("")).toBe(false);
});
