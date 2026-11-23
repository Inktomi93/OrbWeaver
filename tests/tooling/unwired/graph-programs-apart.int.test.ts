// A world the merged program cannot hold (worlds.ts WORLDS_APART) is walked as its own program into the same facts:
// two realms that declare one global with different shapes each read their own members, and a file both programs hold
// is walked once, in the merged program.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { WORLDS_APART } from "../../../tooling/src/unwired/worlds.ts";
import { graphScan, LIB, labelsIn, WORLD } from "./_planted.ts";

// The world the merge leaves out because its global collides: the plugin author ui realm.
const UI_WORLD = Object.entries(WORLDS_APART).find(([, reason]) => reason === "global-collision")?.[0] ?? "";
const SHARED = "packages/a/src/shared.ts";
const HOST = "packages/a/src/host.ts";
const UI = "packages/showcase-plugins/src/bundles/x/ui.ts";

test("two realms that declare one global differently each read their own members; a shared file is walked once", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const files = {
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: UI_WORLD }] }),
    [WORLD]: plantedTsconfig({ lib: LIB, include: ["src"] }),
    [UI_WORLD]: plantedTsconfig({ lib: LIB, include: ["src/bundles/*/ui.ts", "realm-ui.d.ts", "../a/src/shared.ts"] }),
    [SHARED]: ["export interface HostApi { hostRead(): void; hostSpare(): void }", "export interface UiApi { uiRead(): void; uiSpare(): void }"].join("\n"),
    "packages/a/src/realm-host.d.ts": 'import type { HostApi } from "./shared.ts";\ndeclare global { const realm: { readonly host: () => HostApi } }',
    "packages/showcase-plugins/realm-ui.d.ts": 'import type { UiApi } from "../a/src/shared.ts";\ndeclare global { const realm: { readonly ui: () => UiApi } }',
    [HOST]: "realm.host().hostRead();\nexport {};",
    [UI]: "realm.ui().uiRead();\nexport {};",
  };
  const scan = await graphScan(plantedTree, files, { entries: [HOST, UI] });
  expect(labelsIn(scan, "member-untouched", SHARED)).toEqual(["HostApi.hostSpare", "UiApi.uiSpare"]);
  // the host realm's three files in the merged walk, and the ui bundle alone in its own: shared.ts once
  expect(scan.files).toBe([SHARED, "packages/a/src/realm-host.d.ts", HOST, UI].length);
});
