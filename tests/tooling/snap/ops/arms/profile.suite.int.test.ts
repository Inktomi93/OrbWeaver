// @instrument-proof: a real Vite development page imports this checkout's React 19.2.7 renderer, mounts
// a named expensive component beside a cheap twin, and schedules an update through Snap's real argv
// drive. The ranked artifact must put the planted hot path above the twin and retain the component tree,
// read-only inspection values, update/boundary evidence, page identity and React timing population.
//
// @instrument-absence-proof: three real pages distinguish hook-with-no-renderer, renderer-with-no-commit,
// and a hook removed before measurement. Every arm exits 2 and names the absent population; none can
// produce a clean empty profile.
import { readFile, stat, symlink } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/_shared/host-slots";
import { vi } from "vitest";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(180_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const QUIET = ["--no-shot", "--no-deadcss"];
const SESSION_HOME_ENV = "ORB_SNAP_SESSION_HOME";
const INDEX_HTML = `<!doctype html><html lang="en"><head><title>React profile fixture</title></head><body><main><div id="root"></div></main><script>window.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}}</script><script type="module" src="/main.tsx"></script></body></html>`;
const PLAIN_HTML = `<!doctype html><html lang="en" data-app-ready="settled"><head><title>No React</title></head><body><main>plain</main></body></html>`;
const RENDERER_HTML = `<!doctype html><html lang="en"><head><title>Renderer only</title></head><body><main>renderer only</main><script type="module" src="/renderer.js"></script></body></html>`;
const INCOMPATIBLE_HTML = `<!doctype html><html lang="en"><head><title>Incompatible renderer</title></head><body><main>incompatible</main><script type="module" src="/incompatible.js"></script></body></html>`;
const SHAPE_DRIFT_HTML = `<!doctype html><html lang="en"><head><title>Fiber shape drift</title></head><body><main>shape drift</main><script type="module" src="/shape-drift.js"></script></body></html>`;
const COMPOSITE_SHAPE_DRIFT_HTML = `<!doctype html><html lang="en"><head><title>Composite Fiber shape drift</title></head><body><main>composite shape drift</main><script type="module" src="/composite-shape-drift.js"></script></body></html>`;
const SERIALIZATION_STRESS_HTML = `<!doctype html><html lang="en"><head><title>Fiber serialization stress</title></head><body><main>serialization stress</main><script>window.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}}</script><script type="module" src="/serialization-stress.js"></script></body></html>`;
const MAIN_TSX = `
import React, { Component, Suspense, createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
const e = React.createElement;
const ProfileContext = createContext("night");
ProfileContext.displayName = "ProfileContext";
const forever = new Promise(() => {});
function PendingPanel() { throw forever; }
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error: String(error) }; }
  render() { return this.state.error ? e("p", null, "caught") : this.props.children; }
}
function CleanComponent({ label }) { return e("p", { id: "clean" }, label); }
function HiddenActivityWork() {
  let checksum = 0;
  for (let index = 0; index < 1250000; index += 1) checksum += Math.sqrt(index % 509);
  return e("p", { id: "hidden-activity-work" }, "hidden:" + Math.round(checksum));
}
function HotComponent({ probeLabel }) {
  const theme = useContext(ProfileContext);
  const [count, setCount] = useState(0);
  globalThis.bumpProfileFixture = () => setCount((value) => value + 1);
  let checksum = 0;
  for (let index = 0; index < 2500000; index += 1) checksum += Math.sqrt(index % 997);
  return e("button", { id: "hot", "data-probe": probeLabel }, "hot:" + count + ":" + theme + ":" + Math.round(checksum));
}
function App() {
  useEffect(() => { document.documentElement.dataset.appReady = "settled"; }, []);
  return e(ProfileContext.Provider, { value: "night" },
    e(ErrorBoundary, null,
      e(HotComponent, { key: "hot-key", probeLabel: "expensive" }),
      e(CleanComponent, { label: "clean twin" }),
      e(React.Activity, { mode: "hidden" }, e(HiddenActivityWork)),
      e(Suspense, { fallback: e("p", { id: "pending" }, "pending") }, e(PendingPanel)),
    ),
  );
}
createRoot(document.getElementById("root")).render(e(App));
`;
const RENDERER_JS = `import "react-dom/client"; document.documentElement.dataset.appReady = "settled";`;
const INCOMPATIBLE_JS = `
const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
const rendererId = hook.inject({ rendererPackageName: "react-dom", version: "18.3.0", bundleType: 1 });
hook.onCommitFiberRoot(rendererId, { current: { tag: 3, actualDuration: 1, treeBaseDuration: 1, child: null } });
document.documentElement.dataset.appReady = "settled";
`;
const SHAPE_DRIFT_JS = `
const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
const rendererId = hook.inject({ rendererPackageName: "react-dom", version: "19.2.7", bundleType: 1 });
hook.onCommitFiberRoot(rendererId, { current: { tag: 3, treeBaseDuration: 1, child: null } });
document.documentElement.dataset.appReady = "settled";
`;
const COMPOSITE_SHAPE_DRIFT_JS = `
const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
const rendererId = hook.inject({ rendererPackageName: "react-dom", version: "19.2.7", bundleType: 1 });
function MalformedComposite() {}
const child = { tag: 0, type: MalformedComposite, elementType: MalformedComposite, key: null, alternate: null, flags: 1, memoizedProps: {}, memoizedState: null, child: null, sibling: null };
hook.onCommitFiberRoot(rendererId, { current: { tag: 3, actualDuration: 1, treeBaseDuration: 1, memoizedState: { element: {} }, child } });
document.documentElement.dataset.appReady = "settled";
`;
const SERIALIZATION_STRESS_JS = `
const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
const rendererId = hook.inject({ rendererPackageName: "react-dom", version: "19.2.7", bundleType: 1 });
function DeepFiber() {}
const cyclic = { label: "cyclic inspection value" };
cyclic.self = cyclic;
let child = null;
for (let index = 599; index >= 0; index -= 1) {
  child = {
    tag: 0, type: DeepFiber, elementType: DeepFiber, key: String(index), alternate: null, flags: 1,
    actualDuration: 1, treeBaseDuration: 1, memoizedProps: { index, cyclic }, memoizedState: null,
    dependencies: null, child, sibling: null,
  };
}
hook.onCommitFiberRoot(rendererId, { current: { tag: 3, actualDuration: 1, treeBaseDuration: 1, memoizedState: { element: {} }, child } });
document.documentElement.dataset.appReady = "settled";
`;

interface ViteServer {
  readonly httpServer: { readonly address: () => string | AddressInfo | null } | null;
  readonly listen: () => Promise<void>;
  readonly close: () => Promise<void>;
}

interface ProfileArtifact {
  readonly summary: {
    readonly rendererCount: number;
    readonly commitCount: number;
    readonly componentCount: number;
    readonly updateEventCount: number;
    readonly userTimingCount: number;
    readonly reactTraceEventCount: number;
    readonly retainedHiddenCompositeRenderCount: number;
  };
  readonly gaps: readonly unknown[];
  readonly ranked: readonly {
    readonly name: string;
    readonly path: string;
    readonly contextIndex: number;
    readonly pageIndex: number;
    readonly totalActualDurationMs: number;
    readonly selfTimeMs: number;
    readonly subtreeTimeMs: number;
    readonly maxTreeBaseDurationMs: number;
  }[];
  readonly pages: readonly {
    readonly contextIndex: number;
    readonly pageIndex: number;
    readonly commits: readonly {
      readonly updaters: readonly { readonly path: string | null }[];
      readonly fibers: readonly FiberArtifact[];
    }[];
    readonly limits: {
      readonly maxFibersPerCommit: number;
      readonly maxPreviewDepth: number;
      readonly maxPreviewArrayEntries: number;
      readonly maxPreviewObjectKeys: number;
    };
  }[];
  readonly trace: { readonly eventCount: number; readonly calibration: unknown; readonly reactEvents: readonly { readonly epochMs: number | null }[] };
}

interface ProfileSummaryArtifact {
  readonly summary: ProfileArtifact["summary"];
  readonly gaps: readonly unknown[];
  readonly hottest: ProfileArtifact["ranked"];
  readonly artifacts: { readonly rawFiber: string; readonly trace: string };
}

interface FiberArtifact {
  readonly id: number;
  readonly parentId: number | null;
  readonly childIds: readonly number[];
  readonly segment: string;
  readonly activityState: "active" | "retained-hidden";
  readonly name: string;
  readonly type: string;
  readonly key: string | null;
  readonly sourceStack: string | null;
  readonly props: unknown;
  readonly state: unknown;
  readonly context: readonly unknown[];
  readonly hooks: readonly unknown[];
  readonly boundary: { readonly type?: string; readonly status?: string; readonly errorBoundary?: boolean } | null;
  readonly reason: { readonly kind: string; readonly hooks: readonly number[] };
}

interface FixtureServer {
  readonly base: string;
  readonly close: () => Promise<void>;
}

async function startFixture(repoRoot: string, plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<FixtureServer> {
  const root = await plantedTree({
    "index.html": INDEX_HTML,
    "main.tsx": MAIN_TSX,
    "plain.html": PLAIN_HTML,
    "renderer.html": RENDERER_HTML,
    "renderer.js": RENDERER_JS,
    "incompatible.html": INCOMPATIBLE_HTML,
    "incompatible.js": INCOMPATIBLE_JS,
    "shape-drift.html": SHAPE_DRIFT_HTML,
    "shape-drift.js": SHAPE_DRIFT_JS,
    "composite-shape-drift.html": COMPOSITE_SHAPE_DRIFT_HTML,
    "composite-shape-drift.js": COMPOSITE_SHAPE_DRIFT_JS,
    "serialization-stress.html": SERIALIZATION_STRESS_HTML,
    "serialization-stress.js": SERIALIZATION_STRESS_JS,
  });
  await symlink(join(repoRoot, "packages", "client", "node_modules"), join(root, "node_modules"), "dir");
  const viteUrl = pathToFileURL(join(repoRoot, "packages", "client", "node_modules", "vite", "dist", "node", "index.js")).href;
  const vite = (await import(viteUrl)) as { readonly createServer: (config: unknown) => Promise<ViteServer> };
  const server = await vite.createServer({ root, configFile: false, logLevel: "silent", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === "string") {
    await server.close();
    throw new Error("the React profile Vite fixture did not bind a loopback port");
  }
  return { base: `http://127.0.0.1:${String(address.port)}`, close: async () => await server.close() };
}

function artifactPath(stdout: string): string {
  const path = /\breact-profile-artifact=(\S+)/u.exec(stdout)?.[1];
  if (path === undefined) {
    throw new Error(`snap did not print react-profile-artifact: ${stdout}`);
  }
  return path;
}

function summaryPath(stdout: string): string {
  const path = /\breact-profile-summary=(\S+)/u.exec(stdout)?.[1];
  if (path === undefined) {
    throw new Error(`snap did not print react-profile-summary: ${stdout}`);
  }
  return path;
}

function runIndexPath(stdout: string): string {
  const path = /\bindex=(\S+)/u.exec(stdout)?.[1];
  if (path === undefined) {
    throw new Error(`snap did not print its run index: ${stdout}`);
  }
  return path;
}

async function readArtifact(stdout: string): Promise<ProfileArtifact> {
  return JSON.parse(await readFile(artifactPath(stdout), "utf8")) as ProfileArtifact;
}

async function readSummary(stdout: string): Promise<ProfileSummaryArtifact> {
  return JSON.parse(await readFile(summaryPath(stdout), "utf8")) as ProfileSummaryArtifact;
}

test("the real React renderer ranks the planted hot component and retains the agent-readable evidence", async ({ plantedTree, repoRoot, runCli }) => {
  const fixture = await startFixture(repoRoot, plantedTree);
  try {
    const run = await runCli("snap", ["/", "--base", fixture.base, "--react-profile", "--pages", "2", "--eval", "globalThis.bumpProfileFixture()", ...QUIET], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    await expect(run).toExitWith(EXIT.clean);
    expect(run.stdout).toContain("--- REACT PROFILE");
    const artifact = await readArtifact(run.stdout);
    expect(artifact.gaps).toEqual([]);
    expect(artifact.summary.rendererCount).toBeGreaterThanOrEqual(2);
    expect(artifact.summary.commitCount).toBeGreaterThanOrEqual(3);
    expect(artifact.summary.componentCount).toBeGreaterThan(0);
    expect(artifact.trace.eventCount).toBeGreaterThan(0);
    expect(artifact.trace.calibration).not.toBeNull();
    expect(artifact.trace.reactEvents.some((event) => event.epochMs !== null)).toBe(true);
    expect(artifact.summary.userTimingCount + artifact.summary.reactTraceEventCount).toBeGreaterThan(0);
    expect(artifact.summary.retainedHiddenCompositeRenderCount).toBeGreaterThan(0);
    expect(run.stdout).toContain("Activity/Offscreen raw evidence; excluded from active ranking");
    expect(artifact.pages.map((page) => [page.contextIndex, page.pageIndex])).toEqual([
      [0, 0],
      [0, 1],
    ]);
    const hot = artifact.ranked.find((row) => row.name === "HotComponent" && row.pageIndex === 0);
    const clean = artifact.ranked.find((row) => row.name === "CleanComponent" && row.pageIndex === 0);
    expect(hot).toBeDefined();
    expect(clean).toBeDefined();
    expect(hot?.totalActualDurationMs).toBeGreaterThan(clean?.totalActualDurationMs ?? Number.POSITIVE_INFINITY);
    expect(hot?.selfTimeMs).toBeLessThanOrEqual(hot?.subtreeTimeMs ?? -1);
    expect(hot?.maxTreeBaseDurationMs).toBeGreaterThan(0);
    const fibers = artifact.pages.flatMap((page) => page.commits.flatMap((commit) => commit.fibers));
    const hotFibers = fibers.filter((fiber) => fiber.name === "HotComponent");
    const hiddenActivityFibers = fibers.filter((fiber) => fiber.name === "HiddenActivityWork");
    expect(hotFibers.some((fiber) => fiber.sourceStack?.includes("main.tsx:") === true)).toBe(true);
    expect(hotFibers.every((fiber) => fiber.type === "HotComponent")).toBe(true);
    expect(hotFibers.every((fiber) => fiber.key === "hot-key")).toBe(true);
    expect(hotFibers.some((fiber) => fiber.parentId !== null)).toBe(true);
    expect(hot?.path.includes("App")).toBe(true);
    expect(hotFibers.some((fiber) => JSON.stringify(fiber.props).includes("expensive"))).toBe(true);
    expect(hotFibers.some((fiber) => fiber.context.length > 0 && fiber.hooks.length > 0)).toBe(true);
    expect(hotFibers.some((fiber) => fiber.reason.kind === "direct-change" && fiber.reason.hooks.includes(0))).toBe(true);
    expect(hiddenActivityFibers.length).toBeGreaterThan(0);
    expect(hiddenActivityFibers.every((fiber) => fiber.activityState === "retained-hidden")).toBe(true);
    expect(artifact.ranked.some((row) => row.name === "HiddenActivityWork")).toBe(false);
    expect(fibers.some((fiber) => fiber.name === "Suspense" && fiber.boundary?.status === "fallback")).toBe(true);
    expect(
      fibers.some(
        (fiber) =>
          fiber.name === "ErrorBoundary" &&
          fiber.boundary?.type === "class" &&
          fiber.boundary.errorBoundary === true &&
          JSON.stringify(fiber.state).includes('"error":null'),
      ),
    ).toBe(true);
    expect(
      artifact.pages.some((page) => page.commits.some((commit) => commit.updaters.some((updater) => updater.path?.includes("HotComponent") === true))),
    ).toBe(true);
    const summary = await readSummary(run.stdout);
    expect(summary.summary).toEqual(artifact.summary);
    expect(summary.gaps).toEqual([]);
    expect(summary.hottest).toEqual(artifact.ranked.slice(0, 20));
    expect(summary.artifacts).toEqual({ rawFiber: artifactPath(run.stdout), trace: expect.stringMatching(/\.trace\.json$/u) });
    expect((await stat(summaryPath(run.stdout))).size).toBeLessThan(250_000);

    const report = await runCli("snap", ["--report", runIndexPath(run.stdout), "--problems", "--arm", "react-profile"], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    await expect(report).toExitWith(EXIT.clean);
    expect(report.stdout).toContain("REACT HOT");
    expect(report.stdout).toContain(`REACT FILES summary=${summaryPath(run.stdout)}`);
    expect(report.stdout).toContain(`raw-fiber=${artifactPath(run.stdout)}`);
    expect(report.stdout).toContain(`trace=${summary.artifacts.trace}`);
  } finally {
    await fixture.close();
  }
});

test("hook, renderer and commit absences each refuse instead of reading clean", async ({ plantedTree, repoRoot, runCli }) => {
  const fixture = await startFixture(repoRoot, plantedTree);
  try {
    const noRenderer = await runCli("snap", ["/plain.html", "--base", fixture.base, "--react-profile", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
    await expect(noRenderer).toExitWith(EXIT.toolError);
    expect(noRenderer.stdout).toContain("a React renderer is ABSENT");
    expect(noRenderer.stdout).toContain("react-profile=REFUSED");
    expect((await readSummary(noRenderer.stdout)).gaps).toEqual([
      expect.objectContaining({ evidence: "a React renderer" }),
      expect.objectContaining({ evidence: "a React commit" }),
      expect.objectContaining({ evidence: "a ranked React component" }),
    ]);

    const noCommit = await runCli("snap", ["/renderer.html", "--base", fixture.base, "--react-profile", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
    await expect(noCommit).toExitWith(EXIT.toolError);
    expect(noCommit.stdout).toContain("a React commit is ABSENT");
    const noCommitArtifact = await readArtifact(noCommit.stdout);
    expect(noCommitArtifact.summary.rendererCount).toBeGreaterThan(0);
    expect(noCommitArtifact.summary.commitCount).toBe(0);

    const noHook = await runCli(
      "snap",
      ["/", "--base", fixture.base, "--react-profile", "--eval", "delete globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__", ...QUIET],
      { timeoutMs: CLI_TIMEOUT_MS },
    );
    await expect(noHook).toExitWith(EXIT.toolError);
    expect(noHook.stdout).toContain("the React hook on context 0 page 0 is ABSENT");
  } finally {
    await fixture.close();
  }
});

test("unsupported renderers and Fiber shape drift refuse with observed compatibility evidence", async ({ plantedTree, repoRoot, runCli }) => {
  const fixture = await startFixture(repoRoot, plantedTree);
  try {
    const contexts = await runCli("snap", ["/", "--base", fixture.base, "--contexts", "2", "--react-profile", ...QUIET], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    await expect(contexts).toExitWith(EXIT.misuse);
    expect(contexts.stdout).toContain("scenario/contexts would bypass the analyzer lifecycle");

    const incompatible = await runCli("snap", ["/incompatible.html", "--base", fixture.base, "--react-profile", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
    await expect(incompatible).toExitWith(EXIT.toolError);
    expect(incompatible.stdout).toContain("renderer version 18.3.0 is outside supported ReactDOM 19.2.x");
    expect(incompatible.stdout).toContain("react-profile=REFUSED");

    const drift = await runCli("snap", ["/shape-drift.html", "--base", fixture.base, "--react-profile", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
    await expect(drift).toExitWith(EXIT.toolError);
    expect(drift.stdout).toContain("React 19.2 Fiber shape drift: actualDuration is absent");
    expect(drift.stdout).toContain("react-profile=REFUSED");

    const compositeDrift = await runCli("snap", ["/composite-shape-drift.html", "--base", fixture.base, "--react-profile", ...QUIET], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    await expect(compositeDrift).toExitWith(EXIT.toolError);
    expect(compositeDrift.stdout).toContain("React 19.2 Fiber shape drift: MalformedComposite.actualDuration is absent");
    expect(compositeDrift.stdout).toContain("MalformedComposite.treeBaseDuration is absent");
    expect(compositeDrift.stdout).toContain("react-profile=REFUSED");
  } finally {
    await fixture.close();
  }
});

test("deep Fiber topology and cyclic inspection values cross the Playwright boundary as bounded evidence", async ({ plantedTree, repoRoot, runCli }) => {
  const fixture = await startFixture(repoRoot, plantedTree);
  try {
    const run = await runCli("snap", ["/serialization-stress.html", "--base", fixture.base, "--react-profile", ...QUIET], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    await expect(run).toExitWith(EXIT.clean);
    const artifact = await readArtifact(run.stdout);
    expect(artifact.summary.componentCount).toBe(600);
    expect(JSON.stringify(artifact.pages)).toContain("[circular]");
    const commit = artifact.pages[0]?.commits[0];
    expect(commit?.fibers).toHaveLength(601);
    expect(commit?.fibers[0]?.parentId).toBeNull();
    expect(commit?.fibers.at(-1)?.childIds).toEqual([]);
    expect(artifact.pages[0]?.limits).toMatchObject({
      maxFibersPerCommit: 5000,
      maxPreviewDepth: 3,
      maxPreviewArrayEntries: 24,
      maxPreviewObjectKeys: 32,
    });
  } finally {
    await fixture.close();
  }
});

test("a profiled Snap session opens a fresh call window without reinstalling the renderer", async ({ plantedTree, repoRoot, runCli, scratch }) => {
  const fixture = await startFixture(repoRoot, plantedTree);
  const name = `react-profile-${String(process.pid)}`;
  const env = { [SESSION_HOME_ENV]: join(scratch, "session-home"), [HOST_POOL_ROOT_ENV]: join(scratch, "host-slots") };
  try {
    const boot = await runCli("snap", ["/", "--base", fixture.base, "--session", name, "--react-profile", "--no-failure-evidence", ...QUIET], {
      env,
      timeoutMs: CLI_TIMEOUT_MS,
    });
    await expect(boot).toExitWith(EXIT.clean);
    const first = await readArtifact(boot.stdout);
    expect(first.summary.commitCount).toBeGreaterThan(0);

    const next = await runCli("snap", ["--session", name, "--eval", "globalThis.bumpProfileFixture()", ...QUIET], { env, timeoutMs: CLI_TIMEOUT_MS });
    await expect(next).toExitWith(EXIT.clean);
    const second = await readArtifact(next.stdout);
    expect(second.summary.rendererCount).toBeGreaterThan(0);
    expect(second.summary.commitCount).toBeGreaterThan(0);
    expect(
      second.pages.flatMap((page) => page.commits).some((commit) => commit.updaters.some((updater) => updater.path?.includes("HotComponent") === true)),
    ).toBe(true);
  } finally {
    await runCli("snap", ["--session-close", name], { env, timeoutMs: CLI_TIMEOUT_MS });
    await fixture.close();
  }
});
