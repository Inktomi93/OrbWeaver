// @instrument-proof: --map is three agent-facing views over one settled page. The atlas exposes
// executable SPA destinations, shell topology describes rendered regions, and the surface map describes
// only current controls by default while labelling attached hidden DOM as locator-only when requested.
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { afterAll, vi } from "vitest";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const RUN_ID = `snap_map_${process.pid}`;
const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const OUT_NAMES: string[] = [];
const TIMEOUT_MS = scaledBudget(60_000);

vi.setConfig({ testTimeout: TIMEOUT_MS, hookTimeout: TIMEOUT_MS });

function document(body: string, bridge = ""): string {
  return `<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><style>
    html,body{margin:0;width:100%;height:100%}.shell-grid{display:grid;grid-template-columns:64px 240px 1fr 280px;width:100vw;height:100vh}
    .shell-rail{grid-column:1}.shell-panel[data-panel-side="list"]{grid-column:2}.shell-main{grid-column:3;display:flex;flex-direction:column}
    .shell-panel[data-panel-side="context"]{grid-column:4}.shell-topbar{height:48px}.shell-content{flex:1}.hidden-activity{display:none}
    @media(max-width:48rem){.shell-grid{grid-template-columns:1fr;grid-template-rows:1fr 64px}.shell-main{grid-column:1;grid-row:1}
      .shell-rail{position:fixed;inset:auto 0 0;height:64px}.shell-panel{position:fixed;inset:48px 0 64px;width:100vw}
      .shell-grid[data-list-mode="docked"] .shell-content{display:none}.shell-panel[data-panel-mode="collapsed"]{visibility:hidden}}
  </style>${bridge}</head><body>${body}</body></html>`;
}

function validBridge(sectionValues = ["home", "chats"], contextMode: "docked" | "overlay" = "docked", publishPanels = true): string {
  const panels = publishPanels
    ? [
        { side: "list", mode: "docked", available: true },
        { side: "context", mode: contextMode, available: true },
      ]
    : [];
  return `<script>globalThis.__orb={
    nav:{capabilities:()=>({sections:${JSON.stringify(sectionValues)},modalSlots:["command"],configGroups:["appearance"],
      contextTabs:["game"],contextTabNames:[{id:"game",label:"Game"}],contextTabsPublished:true,chatPositions:["first","latest","current"]})},
    shell:()=>({section:"Chats",panels:${JSON.stringify(panels)},chatOpen:true,focus:false}),
    snap:()=>({fixture:true}),consoleErrors:()=>({records:[],dropped:0,cap:128})};</script>`;
}

function shellBody(extra = ""): string {
  return `<div class="shell-grid" data-section="chats" data-list-mode="docked" data-context-mode="docked" data-focus-mode="false">
    <nav class="shell-rail" aria-label="Orbweaver"><button aria-current="page">Chats</button></nav>
    <aside class="shell-panel" data-panel-side="list" data-panel-mode="docked" data-panel-available="true" aria-label="Chats list"><button disabled>Unavailable chat</button></aside>
    <div class="shell-main"><header class="shell-topbar"><button aria-expanded="true">Menu</button></header>
      <main class="shell-content" aria-label="Chats content"><button aria-label="Compose" onclick="document.body.dataset.clicked='yes'">Compose</button>${extra}</main></div>
    <aside class="shell-panel" data-panel-side="context" data-panel-mode="docked" data-panel-available="true" aria-label="Chats details"><button role="tab" aria-selected="true">Game</button></aside>
  </div>`;
}

async function fixture(scratch: string, name: string, html: string): Promise<string> {
  const path = join(scratch, `${name}.html`);
  await writeFile(path, html, "utf8");
  return path;
}

function resultValue(stdout: string, key: string): string {
  const result = stdout.match(/^RESULT .*$/gmu)?.at(-1);
  const value = result?.match(new RegExp(`(?:^| )${key}=([^ ]+)`, "u"))?.[1];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing ${key} in RESULT: ${result ?? "<none>"}`);
  }
  return value;
}

async function manifest(stdout: string): Promise<Record<string, unknown>> {
  const index = JSON.parse(await readFile(resultValue(stdout, "index"), "utf8")) as {
    readonly artifacts: ReadonlyArray<{ readonly path: string; readonly producer: string; readonly channel: string; readonly schema: string }>;
  };
  const artifact = index.artifacts.find(
    (candidate) => candidate.producer === "snap" && candidate.channel === "capture-manifest" && candidate.schema === "snap-manifest-v1",
  );
  if (!artifact) {
    throw new Error("run index did not inventory the Snap JSON manifest");
  }
  expect(artifact).toMatchObject({ producer: "snap", channel: "capture-manifest", schema: "snap-manifest-v1" });
  return JSON.parse(await readFile(artifact.path, "utf8")) as Record<string, unknown>;
}

function outName(suffix: string): string {
  const name = `${RUN_ID}_${suffix}`;
  OUT_NAMES.push(name);
  return name;
}

afterAll(async () => {
  await Promise.all(
    OUT_NAMES.flatMap((name) => ["json", "png"].map((extension) => rm(join(REPO_ROOT, "reports", "snaps", `${name}.${extension}`), { force: true }))),
  );
});

test("live map prints executable SPA atlas, factual desktop shell geometry, and stateful current controls", async ({ runCli, scratch }) => {
  const labeledInput = '<label for="search">Actual search label</label><input id="search" placeholder="Misleading placeholder">';
  const page = await fixture(scratch, "desktop", document(shellBody(labeledInput), validBridge()));
  const name = outName("desktop");
  const run = await runCli("snap", ["--file", page, "--viewport", "1200x700", "--no-shot", "--map", "--json", "--no-failure-evidence", "--out", name], {
    timeoutMs: TIMEOUT_MS,
  });

  await expect(run).toExitWith(0);
  // #1372: a plain --map states the atlas as ONE line and keeps the 2.1 KB block one flag away (#1515 —
  // this suite pinned the pre-#1372 block and went red on main without `pnpm check` ever running it).
  expect(run.stdout).toContain(
    "atlas: 8 SPA targets (2 sections, 1 modals, 1 settings, 1 context tabs, 3 chat positions) at section=Chats — list them with --map --atlas",
  );
  expect(run.stdout).not.toContain("--- SPA NAV TARGETS");
  expect(run.stdout).not.toContain('pnpm snap --goto "chats" --map');
  expect(run.stdout).toContain("--- CURRENT SHELL / REGIONS");
  expect(run.stdout).toContain("regime=wide");
  expect(run.stdout).toContain("content=Chats content");
  expect(run.stdout).toContain("active-tab=Game relation=unspecified/auxiliary");
  expect(run.stdout).toContain("--- SURFACE MAP");
  expect(run.stdout).toContain("current=page");
  expect(run.stdout).toMatch(/disabled=true .*actionability=locator-only/u);
  expect(run.stdout).toMatch(/expanded=true actionability=actionable/u);
  expect(run.stdout).toContain('textbox  "Actual search label"');
  expect(run.stdout).not.toContain('textbox  "Misleading placeholder"');

  const data = await manifest(run.stdout);
  const capture = (data["captures"] as Record<string, unknown>[])[0];
  expect(capture?.["mapAtlas"]).toMatchObject({ status: "available", capabilities: { sections: ["home", "chats"] } });
  expect(capture?.["mapShell"]).toMatchObject({ status: "available", regime: "wide", section: "chats" });
  const compose = (capture?.["mapResult"] as Record<string, unknown>[]).find((row) => row["name"] === "Compose");
  expect(compose).toMatchObject({ selector: '[aria-label="Compose"]:visible', visibility: "visible", actionability: "actionable" });

  const click = await runCli(
    "snap",
    ["--file", page, "--no-shot", "--no-deadcss", "--click", String(compose?.["selector"]), "--eval", "document.body.dataset.clicked", "--no-failure-evidence"],
    { timeoutMs: TIMEOUT_MS },
  );
  await expect(click).toExitWith(0);
  expect(click.stdout).toContain('"yes"');
});

test("static maps stay DOM-only while malformed live bridge evidence refuses", async ({ runCli, scratch }) => {
  const staticPage = await fixture(scratch, "static", document('<main aria-label="Static"><button>Inspect</button></main>'));
  const clean = await runCli("snap", ["--file", staticPage, "--no-shot", "--map", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
  await expect(clean).toExitWith(0);
  expect(clean.stdout).toContain("NAV TARGETS unavailable — static file has no Orbweaver navigation bridge");
  expect(clean.stdout).toContain('button  "Inspect"');

  const malformedBridge = `<script>globalThis.__orb={nav:{capabilities:()=>({sections:["home"],modalSlots:[],configGroups:[],contextTabs:["game"],contextTabNames:[],contextTabsPublished:true,chatPositions:["latest"]})},shell:()=>({section:"Home",panels:[],chatOpen:false,focus:false}),consoleErrors:()=>({records:[],dropped:0,cap:128})};</script>`;
  const malformedPage = await fixture(scratch, "malformed", document(shellBody(), malformedBridge));
  const refused = await runCli("snap", ["--file", malformedPage, "--no-shot", "--map", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stdout).toContain("MAP INSTRUMENT ERROR");
  expect(refused.stdout).toContain("contextTabs/contextTabNames");

  const malformedShellPage = await fixture(scratch, "malformed-shell", document(shellBody(), validBridge(undefined, "docked", false)));
  const shellRefused = await runCli("snap", ["--file", malformedShellPage, "--no-shot", "--map", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
  await expect(shellRefused).toExitWith(EXIT.toolError);
  // The atlas resolved and still states itself (as the one line a plain --map prints) while the SHELL half
  // refuses — the two halves of --map fail independently.
  expect(shellRefused.stdout).toContain("atlas: 8 SPA targets (2 sections, 1 modals, 1 settings, 1 context tabs, 3 chat positions) at section=Chats");
  expect(shellRefused.stdout).toContain("must publish exactly one list and one context panel");
});

test("--atlas prints the executable block, caps each group exactly, and stays global when the surface map is scoped", async ({ runCli, scratch }) => {
  const sections = Array.from({ length: 12 }, (_, index) => `section-${String(index + 1)}`);
  const page = await fixture(scratch, "bounded", document(shellBody(), validBridge(sections)));
  const run = await runCli("snap", ["--file", page, "--no-shot", "--map", "main", "--atlas", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
  await expect(run).toExitWith(0);
  // --atlas is the flag the one-line summary names: it prints the full block for every group, capped.
  expect(run.stdout).toContain("--- SPA NAV TARGETS");
  expect(run.stdout).toContain("SECTIONS total=12 shown=10 omitted=2");
  expect(run.stdout).toContain('pnpm snap --goto "section-10" --map');
  expect(run.stdout).not.toContain('pnpm snap --goto "section-11" --map');
  expect(run.stdout).toContain('pnpm snap --goto "modal:command" --map');
  expect(run.stdout).toContain('pnpm snap --goto "config:appearance" --map');
  expect(run.stdout).toContain('pnpm snap --context-tab "game" --map');
  expect(run.stdout).toContain('pnpm snap --open-chat "latest" --map');
  expect(run.stdout).toContain("choose a NAV TARGET, then map that settled destination");
  expect(run.stdout).toContain("--- SURFACE MAP (scope=main");
  expect(run.stdout).not.toContain('navigation  "Orbweaver"');
});

test("hidden Activity-like DOM is omitted by default and locator-only when explicitly inventoried", async ({ runCli, scratch }) => {
  const body = `<main aria-label="Active content"><button>Active</button>
    <section class="hidden-activity" aria-hidden="true"><button>Retained inactive</button></section>
    <section style="visibility:hidden"><button>Inherited hidden</button><button style="visibility:visible">Visibility override</button></section>
  </main>`;
  const page = await fixture(scratch, "activity", document(body));
  const active = await runCli("snap", ["--file", page, "--no-shot", "--map", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
  await expect(active).toExitWith(0);
  expect(active.stdout).toContain('button  "Active"');
  expect(active.stdout).toContain('button  "Visibility override"');
  expect(active.stdout).not.toContain("Retained inactive");
  expect(active.stdout).not.toContain("Inherited hidden");

  const all = await runCli("snap", ["--file", page, "--no-shot", "--map", "--include-hidden", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
  await expect(all).toExitWith(0);
  expect(all.stdout).toContain('button  "Retained inactive"');
  expect(all.stdout).toContain('button  "Inherited hidden"');
  expect(all.stdout).toContain("visibility=hidden inactive=aria-hidden actionability=locator-only");
  const retainedLine = all.stdout.split("\n").find((line) => line.includes('button  "Retained inactive"'));
  expect(retainedLine).not.toContain("actionability=actionable");
});

test("mobile shell topology distinguishes the bottom rail, list screen, hidden content, and context sheet", async ({ runCli, scratch }) => {
  const mobileBody = shellBody()
    .replace('data-context-mode="docked"', 'data-context-mode="overlay"')
    .replace('data-panel-side="context" data-panel-mode="docked"', 'data-panel-side="context" data-panel-mode="overlay"');
  const page = await fixture(scratch, "mobile", document(mobileBody, validBridge(undefined, "overlay")));
  const run = await runCli("snap", ["--file", page, "--viewport", "430x740", "--no-shot", "--map", "--no-failure-evidence"], { timeoutMs: TIMEOUT_MS });
  await expect(run).toExitWith(0);
  expect(run.stdout).toContain("regime=mobile viewport=430x740");
  expect(run.stdout).toMatch(/rail .*position=fixed.*visible=true/u);
  expect(run.stdout).toMatch(/list .*mode=docked.*position=fixed.*visible=true/u);
  expect(run.stdout).toMatch(/content .*visible=false/u);
  expect(run.stdout).toMatch(/context .*mode=overlay.*position=fixed.*visible=true/u);
});
