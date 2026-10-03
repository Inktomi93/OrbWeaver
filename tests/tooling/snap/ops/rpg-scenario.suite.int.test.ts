// @instrument-proof: the shipped rpg-game tape seeds through the production __orb bridge, opens the
// returned chat, walks the live/phase-locked/host-gated context tabs, and retains map/state/pixel evidence.
// @instrument-absence-proof: seed rejection, openChat refusal, and an omitted host-only tab stay explicit
// instead of producing a clean-looking game walkthrough.

import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { parseSnapArgs, prepareScenario, SNAP_HELP } from "@orb/tooling/snap";
import { vi } from "vitest";
import { SNAP_SCENARIO_PRESET_NAMES, scenarioPresetFile } from "../../../../tooling/src/snap/contract/scenario-presets.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const TIMEOUT_MS = scaledBudget(120_000);
vi.setConfig({ testTimeout: TIMEOUT_MS, hookTimeout: TIMEOUT_MS });

const CHECKPOINTS = ["seed-status", "inventory", "scene", "quests", "journal", "phase-locked-map", "host-game"] as const;

interface FixtureMode {
  readonly seedFailure?: boolean;
  readonly navRefusal?: boolean;
  readonly gameLocked?: boolean;
}

interface ScenarioManifest {
  readonly captures: ReadonlyArray<{
    readonly evalResults: ReadonlyArray<{ readonly text: string; readonly failed: boolean }>;
    readonly assertions: ReadonlyArray<{ readonly line: string; readonly failed: boolean }>;
    readonly mapShell: { readonly status: string } | null;
  }>;
  readonly scenario: { readonly checkpoints: ReadonlyArray<{ readonly name: string; readonly screenshot: string | null }> };
}

function fixtureHtml(mode: FixtureMode): string {
  const config = JSON.stringify({ seedFailure: false, navRefusal: false, gameLocked: false, ...mode });
  return `<!doctype html><html data-app-ready="settled"><head><style>
    html,body{margin:0;width:100%;height:100%}.shell-grid{display:grid;grid-template-columns:4rem 12rem 1fr 28rem;min-height:100vh}
    .shell-rail{grid-column:1}.shell-panel[data-panel-side="list"]{grid-column:2}.shell-main{grid-column:3;min-height:100vh}
    .shell-panel[data-panel-side="context"]{grid-column:4}.shell-topbar{height:3rem}.shell-content{min-height:33rem}
    .shell-panel{min-height:36rem;border:1px solid #999;padding:1rem}
  </style></head><body><div class="shell-grid" data-section="chats" data-context-mode="docked" data-focus-mode="false">
    <nav class="shell-rail" aria-label="Orbweaver">Chats</nav>
    <aside class="shell-panel" data-panel-side="list" data-panel-mode="docked" data-panel-available="true" aria-label="Chats list">Game room</aside>
    <div class="shell-main"><header class="shell-topbar" aria-label="Game toolbar">Game</header><main class="shell-content" aria-label="Game chat">Game chat fixture</main></div>
    <aside class="shell-panel" data-panel-side="context" data-panel-mode="docked" data-panel-available="true" aria-label="Game context">
      <div data-slot="context-bracket"><div id="rpg-body" data-slot="rpg-status-tab">Status</div></div>
    </aside>
  </div><script>
    const config = ${config};
    const liveTabs = ["rpg.status","rpg.inventory","rpg.scene","rpg.quests","rpg.journal","rpg.map"];
    const allTabs = config.gameLocked ? liveTabs : [...liveTabs, "rpg.game"];
    const labels = {"rpg.status":"Status","rpg.inventory":"Inventory","rpg.scene":"Scene","rpg.quests":"Quests","rpg.journal":"Journal","rpg.map":"Map","rpg.game":"Game"};
    let activeChat = null;
    const render = (id) => {
      const body = document.querySelector("#rpg-body");
      body.dataset.slot = id.replace(".", "-") + "-tab";
      body.textContent = labels[id] + (id === "rpg.map" ? " — Maps are planned" : "");
    };
    globalThis.__orb = {
      resetEvidence(){},
      snap(){return {ready:true,game:activeChat};},
      shell(){return {section:"Chats",panels:[{side:"list",mode:"docked",available:true},{side:"context",mode:"docked",available:true}],chatOpen:activeChat !== null,focus:false};},
      consoleErrors(){return {records:[],dropped:0,cap:128};},
      seed:{async game(args){if(config.seedFailure) throw new Error("planted seed failure"); if(args.profile !== "d20") throw new Error("expected d20"); return {chatId:"chat_rpg_fixture"};}},
      nav:{
        capabilities(){return {sections:["chats"],modalSlots:[],configGroups:[],contextTabs:allTabs,contextTabNames:allTabs.map((id)=>({id,label:labels[id]})),contextTabsPublished:true,chatPositions:["first","latest","current"]};},
        async openChat(chatId){if(config.navRefusal) return {ok:false,reason:"planted nav refusal"}; activeChat=chatId; return {ok:true};},
        async contextTab(id){if(!allTabs.includes(id)) return {ok:false,reason:"host-only tab not published for this viewer"}; render(id); return {ok:true};}
      },
      async rpg(){return {chatId:activeChat,game:{profile:"d20",phase:"exploration"},tracker:{selected:"main"},journal:[{title:"Arrival"}],turnToolCalls:[]};}
    };
  </script></body></html>`;
}

async function withFixtureServer<T>(mode: FixtureMode, run: (origin: string) => Promise<T>): Promise<T> {
  const html = fixtureHtml(mode);
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    return await run(`http://127.0.0.1:${String(address.port)}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
}

function indexPath(stdout: string): string {
  const path = /RESULT snap exit=\d+ index=(\S+)/u.exec(stdout)?.[1];
  if (path === undefined) {
    throw new Error(`run index missing from output:\n${stdout}`);
  }
  return path;
}

async function manifest(stdout: string): Promise<ScenarioManifest> {
  const index = JSON.parse(await readFile(indexPath(stdout), "utf8")) as {
    readonly artifacts: ReadonlyArray<{ readonly path: string; readonly producer: string; readonly channel: string; readonly schema: string }>;
  };
  const artifact = index.artifacts.find(
    (candidate) => candidate.producer === "snap" && candidate.channel === "capture-manifest" && candidate.schema === "snap-manifest-v1",
  );
  if (artifact === undefined) {
    throw new Error("scenario run index did not retain its capture manifest");
  }
  return JSON.parse(await readFile(artifact.path, "utf8")) as ScenarioManifest;
}

function evalPayloads(data: ScenarioManifest): readonly unknown[] {
  return data.captures.flatMap((capture) => capture.evalResults.filter((result) => !result.failed).map((result) => JSON.parse(result.text) as unknown));
}

async function presetSource(): Promise<Record<string, unknown>> {
  const file = scenarioPresetFile("rpg-game");
  if (file === null) {
    throw new Error("rpg-game preset is absent");
  }
  return JSON.parse(await readFile(new URL(`../../../../tooling/src/snap/ops/scenarios/${file}`, import.meta.url), "utf8")) as Record<string, unknown>;
}

async function oneCheckpointScenario(scratch: string, checkpointName: string): Promise<string> {
  const source = await presetSource();
  const checkpoints = source["checkpoints"] as ReadonlyArray<{ readonly name: string; readonly args: readonly string[] }>;
  const checkpoint = checkpoints.find((candidate) => candidate.name === checkpointName);
  if (checkpoint === undefined) {
    throw new Error(`rpg-game checkpoint ${checkpointName} is absent`);
  }
  const path = join(scratch, `${checkpointName}.json`);
  await writeFile(path, `${JSON.stringify({ ...source, name: `rpg-${checkpointName}`, checkpoints: [checkpoint] }, null, 2)}\n`, "utf8");
  return path;
}

test("rpg-game is catalogued, strict, matrix-composable, and adds no flag-per-method aliases", async () => {
  expect(SNAP_SCENARIO_PRESET_NAMES).toContain("rpg-game");
  const outer = parseSnapArgs(["--matrix", "--scenario", "rpg-game", "--isolated", "--json"]);
  expect(outer.errors).toEqual([]);
  const prepared = await prepareScenario(outer, "rpg-game");
  expect(prepared.spec.checkpoints.map((checkpoint) => checkpoint.name)).toEqual(CHECKPOINTS);
  expect(prepared.checkpoints.flatMap((checkpoint) => checkpoint.errors)).toEqual([]);
  expect(SNAP_HELP).toContain("pnpm snap --eval 'window.__orb?.capabilities()'");
  expect(SNAP_HELP).toContain("pnpm snap --eval 'window.__orb?.rings()'");
  expect(SNAP_HELP).toContain("pnpm snap --eval 'window.__orb?.nav.capabilities()'");
  for (const alias of ["--seed", "--rpg"]) {
    expect(parseSnapArgs([alias]).errors).toContain(`unknown flag ${alias}`);
  }
});

test("the shipped tape seeds, opens, walks, maps, screenshots, and reads the same live game", async ({ runCli }) => {
  await withFixtureServer({}, async (origin) => {
    const result = await runCli("snap", ["--scenario", "rpg-game", "--base", origin, "--json", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
    await expect(result).toExitWith(EXIT.clean);
    for (const checkpoint of CHECKPOINTS) {
      expect(result.stdout).toContain(`CHECKPOINT ${checkpoint} PASS`);
    }
    const data = await manifest(result.stdout);
    expect(data.scenario.checkpoints.map((checkpoint) => checkpoint.name)).toEqual(CHECKPOINTS);
    expect(data.scenario.checkpoints.every((checkpoint) => checkpoint.screenshot !== null)).toBe(true);
    expect(evalPayloads(data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chatId: "chat_rpg_fixture" }),
        { tab: "rpg.map", status: "opened", lock: "Maps are planned" },
        { tab: "rpg.game", status: "opened" },
      ]),
    );
    expect(data.captures[5]?.mapShell).toMatchObject({ status: "available" });
    expect(data.captures[5]?.assertions).toEqual(expect.arrayContaining([expect.objectContaining({ line: expect.stringContaining('rpg-map-tab"]: PASS') })]));
  });
});

test("seed failure and openChat refusal red through the exact shipped first checkpoint", async ({ runCli, scratch }) => {
  const scenario = await oneCheckpointScenario(scratch, "seed-status");
  for (const mode of [{ seedFailure: true }, { navRefusal: true }] as const) {
    await withFixtureServer(mode, async (origin) => {
      const result = await runCli("snap", ["--scenario", scenario, "--base", origin, "--json", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
      await expect(result).toExitWith(EXIT.violations);
      const serialized = JSON.stringify((await manifest(result.stdout)).captures);
      expect(serialized).toContain(mode.seedFailure ? "planted seed failure" : "planted nav refusal");
    });
  }
});

test("the host-only checkpoint records an honest skip when rpg.game is not published", async ({ runCli, scratch }) => {
  const scenario = await oneCheckpointScenario(scratch, "host-game");
  await withFixtureServer({ gameLocked: true }, async (origin) => {
    const result = await runCli("snap", ["--scenario", scenario, "--base", origin, "--json", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
    await expect(result).toExitWith(EXIT.clean);
    expect(evalPayloads(await manifest(result.stdout))).toEqual(
      expect.arrayContaining([expect.objectContaining({ tab: "rpg.game", status: "skipped", reason: "host-only tab not published for this viewer" })]),
    );
  });
});
