// Snap filmstrip proof: bounded exact-page CDP capture, action-labelled PNG output, total cleanup,
// interference refusals, and the absence of the retired Record command it replaced.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/_shared/host-slots";
import sharp from "sharp";
import { vi } from "vitest";
import type { FilmstripLimits } from "../../../../../tooling/src/snap/contract/filmstrip.ts";
import type { SnapRunIndex } from "../../../../../tooling/src/snap/contract/run-index.ts";
import { writeFilmstripContactSheet } from "../../../../../tooling/src/snap/lib/filmstrip-sheet.ts";
import type { FilmstripCdp } from "../../../../../tooling/src/snap/ops/filmstrip-capture.ts";
import { startFilmstripCapture } from "../../../../../tooling/src/snap/ops/filmstrip-capture.ts";
import { startFilmstripAuthFixture } from "../../../../support/filmstrip-auth-fixture.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(120_000, 3);
const TEST_FRAME_LIMIT_ENV = "ORB_SNAP_TEST_FILMSTRIP_FRAME_LIMIT";
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const LIMITS = { frames: 8, bytes: 1_000_000, durationMs: 1000, maxWidth: 64, maxHeight: 64, quality: 70 } as const satisfies FilmstripLimits;

function resultValue(stdout: string, key: string): string {
  const prefix = `${key}=`;
  const value = stdout
    .split(/\s+/u)
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);
  expect(value, `missing ${key} in:\n${stdout}`).toBeDefined();
  return value as string;
}

class FakeCdp implements FilmstripCdp {
  readonly calls: string[] = [];
  readonly #failures: ReadonlySet<string>;
  #listener: ((event: object) => void) | null = null;

  constructor(failures: readonly string[] = []) {
    this.#failures = new Set(failures);
  }

  #call(method: string): Promise<void> {
    this.calls.push(method);
    if (this.#failures.has(method)) {
      return Promise.reject(new Error(`${method} planted failure`));
    }
    return Promise.resolve();
  }

  startScreencast(): Promise<void> {
    return this.#call("Page.startScreencast");
  }

  stopScreencast(): Promise<void> {
    return this.#call("Page.stopScreencast");
  }

  acknowledgeFrame(_sessionId: number): Promise<void> {
    return this.#call("Page.screencastFrameAck");
  }

  onFrame(listener: (event: object) => void): void {
    this.#listener = listener;
  }

  offFrame(): void {
    this.#listener = null;
  }

  detach(): Promise<void> {
    this.calls.push("detach");
    if (this.#failures.has("detach")) {
      return Promise.reject(new Error("detach planted failure"));
    }
    return Promise.resolve();
  }

  frame(bytes: Buffer, sessionId: number): void {
    this.#listener?.({ data: bytes.toString("base64"), sessionId });
  }
}

test("a small capture remains ordered and labelled by the true argv action order", async () => {
  const cdp = new FakeCdp();
  let now = 0;
  const controller = await startFilmstripCapture(null, LIMITS, { createCdp: async () => cdp, now: () => now });
  cdp.frame(Buffer.from("one"), 1);
  now = 10;
  controller.mark(0, { type: "step", action: { kind: "click", selector: "#open", page: 0 } });
  now = 20;
  cdp.frame(Buffer.from("two"), 2);
  now = 30;
  controller.mark(1, { type: "step", action: { kind: "hover", selector: "#menu", page: 0 } });
  now = 40;
  cdp.frame(Buffer.from("three"), 3);
  const receipt = await controller.stop();
  expect(receipt.frames.map((frame) => [frame.sequence, frame.label])).toEqual([
    [0, "before actions"],
    [1, "click #open"],
    [2, "hover #menu"],
  ]);
  expect(receipt.actions.map((action) => action.label)).toEqual(["click #open", "hover #menu"]);
  expect(receipt).toMatchObject({ observedFrames: 3, retainedBytes: 11, acked: 3 });
  expect(receipt.limits[0]).toMatchObject({ complete: true, events: [] });
  expect(cdp.calls.filter((method) => method === "Page.screencastFrameAck")).toHaveLength(3);
  expect(cdp.calls.slice(-2)).toEqual(["Page.stopScreencast", "detach"]);
});

test("a multi-action capture over the cap retains first, last, and every action bracket before thinning intermediates", async () => {
  const cdp = new FakeCdp();
  let now = 0;
  const limits = { ...LIMITS, frames: 7 };
  const controller = await startFilmstripCapture(null, limits, { createCdp: async () => cdp, now: () => now });
  cdp.frame(Buffer.from("frame-0"), 1);
  now = 10;
  controller.mark(0, { type: "step", action: { kind: "click", selector: "#first", page: 0 } });
  for (let sequence = 1; sequence <= 4; sequence += 1) {
    now += 10;
    cdp.frame(Buffer.from(`frame-${String(sequence)}`), sequence + 1);
  }
  now += 10;
  controller.mark(1, { type: "step", action: { kind: "click", selector: "#terminal", page: 0 } });
  for (let sequence = 5; sequence <= 11; sequence += 1) {
    now += 10;
    cdp.frame(Buffer.from(`frame-${String(sequence)}`), sequence + 1);
  }

  const receipt = await controller.stop();
  const retained = receipt.frames.map((frame) => frame.sequence);
  expect(retained).toHaveLength(7);
  expect(retained).toEqual([...retained].toSorted((left, right) => left - right));
  expect(retained).toEqual(expect.arrayContaining([0, 1, 4, 5, 11]));
  expect(receipt).toMatchObject({ observedFrames: 12, acked: 12 });
  expect(receipt.limits[0]?.events).toContainEqual(expect.objectContaining({ kind: "frame-cap", omitted: 5 }));
});

test("a terminal action whose observed after-state cannot be retained makes the retention receipt incomplete", async () => {
  const cdp = new FakeCdp();
  let now = 0;
  const controller = await startFilmstripCapture(null, { ...LIMITS, bytes: 1 }, { createCdp: async () => cdp, now: () => now });
  cdp.frame(Buffer.from("b"), 1);
  now = 10;
  controller.mark(0, { type: "step", action: { kind: "click", selector: "#terminal", page: 0 } });
  now = 20;
  cdp.frame(Buffer.from("after-state-too-large"), 2);

  const receipt = await controller.stop();
  expect(receipt.limits[0]?.complete).toBe(false);
  expect(receipt.limits[0]?.events).toContainEqual(
    expect.objectContaining({ kind: "action-frame-missing", path: "$.actions[0].after", retained: 0, omitted: 1 }),
  );
});

test("the CLI withholds an over-cap action tape whose required brackets cannot all be retained", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "filmstrip-required-anchor-overflow.html");
  await writeFile(
    fixture,
    `<!doctype html><html lang="en" data-app-ready="settled"><body><p>paint target</p><script>document.addEventListener('keydown',()=>{const next=Number(document.body.dataset.paint ?? '0')+1;document.body.dataset.paint=String(next);document.body.style.backgroundColor='hsl('+String((next*47)%360)+' 80% 35%)'});globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},snap:()=>({fixture:true})}</script></body></html>`,
  );
  const actions = Array.from({ length: 6 }, () => ["--key", "a", "--pause", "70"]).flat();
  const run = await runCli(
    "snap",
    [
      "--file",
      fixture,
      "--filmstrip",
      "--json",
      ...actions,
      "--out",
      "filmstrip-required-anchor-overflow",
      "--no-shot",
      "--no-deadcss",
      "--no-failure-evidence",
    ],
    { timeoutMs: CLI_TIMEOUT_MS, env: { [TEST_FRAME_LIMIT_ENV]: "3" } },
  );

  await expect(run).toExitWith(EXIT.toolError);
  const indexPath = resultValue(run.stdout, "index");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as SnapRunIndex;
  expect(index.verdict).toMatchObject({ exit: EXIT.toolError, state: "refused" });
  expect(index.verdict.arms.find((arm) => arm.arm === "filmstrip")).toMatchObject({
    state: "refused",
    artifacts: [],
    detail: expect.stringMatching(/^FILMSTRIP REFUSED: action-relative frame was not retained \(\$\.actions\[\d+\]\.(?:before|at|after)\)$/u),
  });
  expect(index.resultPairs).toContainEqual(["filmstrip", "REFUSED"]);
  expect(index.artifacts.some((artifact) => artifact.channel === "filmstrip")).toBe(false);
  const fact = index.results?.batches.flatMap((batch) => batch.arms).find((candidate) => candidate.arm === "filmstrip");
  expect(fact).toMatchObject({
    data: {
      state: "refused",
      detail: expect.stringContaining("action-relative frame was not retained"),
      retainedFrames: 3,
      artifact: null,
    },
  });

  const report = await runCli("snap", ["--report", indexPath, "--problems", "--arm", "filmstrip"]);
  await expect(report).toExitWith(EXIT.clean);
  expect(report.stdout).toContain("VERDICT      refused exit=2");
  expect(report.stdout).toContain("ARM          filmstrip state=refused");
  expect(report.stdout).toContain("detail=FILMSTRIP REFUSED: action-relative frame was not retained");
  expect(report.stdout).not.toContain("producer=filmstrip arm=filmstrip channel=filmstrip");
});

test("start, ack, stop, and detach failures remain explicit and cleanup failures aggregate", async () => {
  const start = new FakeCdp(["Page.startScreencast", "detach"]);
  await expect(startFilmstripCapture(null, LIMITS, { createCdp: async () => start })).rejects.toMatchObject({
    name: "AggregateError",
    errors: [
      expect.objectContaining({ message: expect.stringContaining("startScreencast") }),
      expect.objectContaining({ message: expect.stringContaining("detach") }),
    ],
  });

  const stop = new FakeCdp(["Page.screencastFrameAck", "Page.stopScreencast", "detach"]);
  const controller = await startFilmstripCapture(null, LIMITS, { createCdp: async () => stop });
  stop.frame(Buffer.from("frame"), 1);
  await expect(controller.stop()).rejects.toMatchObject({
    name: "AggregateError",
    errors: expect.arrayContaining([expect.any(Error), expect.any(Error), expect.any(Error)]),
  });
});

test("a static zero-frame population refuses instead of emitting a fake clean sheet", async ({ scratch }) => {
  await expect(writeFilmstripContactSheet([], join(scratch, "empty.png"))).rejects.toThrow("produced no frames");
});

test("real animated capture writes a parseable labelled PNG and typed exact-scope fact", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "filmstrip.html");
  await writeFile(
    fixture,
    `<!doctype html><html lang="en" data-app-ready="settled"><head><style>#box{width:30px;height:30px;background:red;transition:transform .5s linear}.go{transform:translateX(180px)}</style></head><body><button id="go" onclick="document.querySelector('#box').classList.add('go')">go</button><div id="box"></div><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},snap:()=>({fixture:true})}</script></body></html>`,
  );
  const run = await runCli(
    "snap",
    ["--file", fixture, "--filmstrip", "--click", "#go", "--pause", "700", "--out", "filmstrip-real", "--no-shot", "--no-deadcss", "--no-failure-evidence"],
    {
      timeoutMs: CLI_TIMEOUT_MS,
    },
  );
  await expect(run).toExitWith(EXIT.clean);
  expect(run.stdout).toContain("FILMSTRIP   frames=");
  const indexPath = resultValue(run.stdout, "index");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as SnapRunIndex;
  const artifact = index.artifacts.find((candidate) => candidate.channel === "filmstrip");
  expect(artifact).toMatchObject({
    mediaType: "image/png",
    role: "primary",
    scope: { context: { kind: "exact", value: 0 }, page: { kind: "exact", value: 0 } },
  });
  const path = join(index.identity.slotPath ?? "missing", artifact?.relativePath ?? "missing");
  const metadata = await Promise.resolve(sharp(path).metadata());
  expect(metadata).toMatchObject({ format: "png", width: 1280 });
  const fact = index.results?.batches.flatMap((batch) => batch.arms).find((candidate) => candidate.arm === "filmstrip");
  expect(fact).toMatchObject({ scope: artifact?.scope, data: { state: "passed", actions: 2, artifact: artifact?.relativePath } });
});

test("pages retain one browser identity but receive distinct filmstrip artifacts and exact page scopes", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "filmstrip-pages.html");
  await writeFile(
    fixture,
    `<!doctype html><html lang="en" data-app-ready="settled"><body><button id="go" onclick="this.textContent='done'">go</button><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},snap:()=>({fixture:true})}</script></body></html>`,
  );
  const run = await runCli(
    "snap",
    [
      "--file",
      fixture,
      "--pages",
      "2",
      "--filmstrip",
      "--click@0",
      "#go",
      "--click@1",
      "#go",
      "--pause@0",
      "250",
      "--pause@1",
      "250",
      "--out",
      "filmstrip-pages",
      "--no-shot",
      "--no-deadcss",
      "--no-failure-evidence",
    ],
    { timeoutMs: CLI_TIMEOUT_MS },
  );
  await expect(run).toExitWith(EXIT.clean);
  const index = JSON.parse(await readFile(resultValue(run.stdout, "index"), "utf8")) as SnapRunIndex;
  const artifacts = index.artifacts.filter((artifact) => artifact.channel === "filmstrip");
  expect(artifacts.map((artifact) => artifact.relativePath).sort()).toEqual([
    "filmstrip/filmstrip-pages-p0-filmstrip.png",
    "filmstrip/filmstrip-pages-p1-filmstrip.png",
  ]);
  expect(artifacts.map((artifact) => [artifact.scope.context, artifact.scope.page])).toEqual([
    [
      { kind: "exact", value: 0 },
      { kind: "exact", value: 0 },
    ],
    [
      { kind: "exact", value: 0 },
      { kind: "exact", value: 1 },
    ],
  ]);
});

test("contexts retain isolated owner/member identities and distinct exact context filmstrips", async ({ runCli, scratch }) => {
  const fixture = await startFilmstripAuthFixture(scratch);
  try {
    const run = await runCli(
      "snap",
      [
        "/",
        "--contexts",
        "2",
        "--fixture-server",
        fixture.base,
        "--fixture-base",
        fixture.base,
        "--filmstrip",
        "--eval@0",
        "()=>{document.body.dataset.filmstrip='owner';return document.body.dataset.viewer}",
        "--eval@1",
        "()=>{document.body.dataset.filmstrip='member';return document.body.dataset.viewer}",
        "--pause@0",
        "150",
        "--pause@1",
        "150",
        "--out",
        "filmstrip-contexts",
        "--no-shot",
        "--no-deadcss",
        "--no-failure-evidence",
      ],
      { timeoutMs: CLI_TIMEOUT_MS },
    );
    await expect(run).toExitWith(EXIT.clean);
    const index = JSON.parse(await readFile(resultValue(run.stdout, "index"), "utf8")) as SnapRunIndex;
    expect(index.resultPairs).toContainEqual(["users", "owner,member"]);
    const artifacts = index.artifacts.filter((artifact) => artifact.channel === "filmstrip");
    expect(artifacts.map((artifact) => artifact.relativePath).sort()).toEqual([
      "filmstrip/filmstrip-contexts-u0-filmstrip.png",
      "filmstrip/filmstrip-contexts-u1-filmstrip.png",
    ]);
    expect(artifacts.map((artifact) => [artifact.scope.context, artifact.scope.page])).toEqual([
      [
        { kind: "exact", value: 0 },
        { kind: "exact", value: 0 },
      ],
      [
        { kind: "exact", value: 1 },
        { kind: "exact", value: 0 },
      ],
    ]);
  } finally {
    await fixture.close();
  }
});

test("named session captures the exact owned page and remains alive for a later call", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "filmstrip-session.html");
  const name = basename(scratch).toLowerCase();
  const env = { [HOST_POOL_ROOT_ENV]: join(scratch, "host-slots") };
  await writeFile(
    fixture,
    `<!doctype html><html lang="en" data-app-ready="settled"><body><button id="go" onclick="document.body.dataset.hit='yes'">go</button><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},snap:()=>({fixture:true})}</script></body></html>`,
  );
  try {
    const boot = await runCli(
      "snap",
      ["--session", name, "--file", fixture, "--filmstrip", "--click", "#go", "--pause", "200", "--no-shot", "--no-deadcss", "--no-failure-evidence"],
      { env, timeoutMs: CLI_TIMEOUT_MS },
    );
    await expect(boot).toExitWith(EXIT.clean);
    const later = await runCli("snap", ["--session", name, "--eval", "document.body.dataset.hit", "--no-shot"], { env, timeoutMs: CLI_TIMEOUT_MS });
    await expect(later).toExitWith(EXIT.clean);
    expect(later.stdout).toContain("yes");
  } finally {
    await runCli("snap", ["--session-close", name, "--force"], { env, timeoutMs: CLI_TIMEOUT_MS });
  }
});

test("scenario checkpoints each own a scoped filmstrip fact and artifact", async ({ runCli, scratch }) => {
  const fixture = join(scratch, "filmstrip-scenario.html");
  const scenario = join(scratch, "filmstrip-scenario.json");
  await writeFile(
    fixture,
    `<!doctype html><html lang="en" data-app-ready="settled"><body><button id="go" onclick="this.textContent+='!'">go</button><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},snap:()=>({fixture:true})}</script></body></html>`,
  );
  await writeFile(
    scenario,
    JSON.stringify({
      name: "filmstrip-scenario",
      defaults: ["--no-shot", "--no-deadcss"],
      checkpoints: [
        { name: "first", args: ["--file", fixture, "--filmstrip", "--click", "#go", "--pause", "150"] },
        { name: "second", args: ["--file", fixture, "--filmstrip", "--click", "#go", "--pause", "150"] },
      ],
    }),
  );
  const run = await runCli("snap", ["--scenario", scenario, "--no-failure-evidence"], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(run).toExitWith(EXIT.clean);
  const indexPath = resultValue(run.stdout, "index");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as SnapRunIndex;
  const facts = index.results?.batches.flatMap((batch) => batch.arms).filter((fact) => fact.arm === "filmstrip") ?? [];
  const artifacts = index.artifacts.filter((artifact) => artifact.channel === "filmstrip");
  expect(facts).toHaveLength(2);
  expect(artifacts).toHaveLength(2);
  expect(index.verdict.arms.find((arm) => arm.arm === "filmstrip")).toMatchObject({
    state: "passed",
    artifacts: expect.arrayContaining(artifacts.map((artifact) => artifact.path)),
  });
  expect(new Set(facts.map((fact) => (fact.scope.window.kind === "exact" ? fact.scope.window.value : null))).size).toBe(2);
  for (const fact of facts) {
    expect(fact.artifacts).toEqual([fact.data.artifact]);
    const owned = artifacts.find((artifact) => artifact.relativePath === fact.data.artifact);
    expect(owned?.scope).toEqual(fact.scope);
  }

  const report = await runCli("snap", ["--report", indexPath, "--arm", "filmstrip"]);
  await expect(report).toExitWith(EXIT.clean);
  expect(report.stdout).toContain("ARM          filmstrip state=passed");
  for (const artifact of artifacts) {
    expect(report.stdout).toContain(artifact.path);
  }
});

test("filmstrip interference refuses before allocating a run slot", async ({ runCli }) => {
  for (const flag of ["--motion", "--perf", "--cpu-profile", "--heap", "--boot-trace", "--react-profile", "--probe"]) {
    let argv = ["--filmstrip", flag];
    if (flag === "--motion") {
      argv = [...argv, "#x"];
    } else if (flag === "--heap") {
      argv = [...argv, "before"];
    }
    const run = await runCli("snap", argv);
    await expect(run).toExitWith(EXIT.misuse);
    expect(run.stdout).toContain(flag);
    expect(run.stdout).not.toContain("run slot");
  }
});

/** THE RECORD DOOR IS GONE, SO ITS RECIPE PIN IS TOO (owner ruling 2026-09-04, #1315: no doors, no
 *  shims). This asserted that `pnpm screen-record /chats --click … --settle 900` printed
 *  `RECORD RETIRED` plus an exact translated `pnpm snap … --pause 900 --filmstrip` recipe — an argv
 *  TRANSLATION layer, which is the thing the ruling deleted. `tooling/src/screen-record/` no longer
 *  exists at all, so there is no process left to exit 3, and asserting through `runCli("screen-record")`
 *  now fails at the fixture ("no such tool") rather than proving anything about snap. What replaced it,
 *  one rung weaker and one rung honester: `unified-instrument.suite.int.test.ts` sweeps the tracked
 *  corpus so no file still tells a reader to run the retired `pnpm record`, with a planted control. */
test("the retired Record command names nothing runnable: its tool dir is absent from the corpus", ({ repoRoot }) => {
  // The DIRECTORY, not just the entry point — a surviving `ops/` beside a deleted `cli.ts` is exactly the
  // half-migration Core-Tooling-Law.md §1 bans, and it would keep knip and the size gates busy forever.
  expect(existsSync(join(repoRoot, "tooling", "src", "screen-record"))).toBe(false);
  // The planted control: the same probe SEES the sibling dirs that legitimately survived the fold (the
  // detector engines kept their tool dirs and lost only their argv doors), so a bare `false` above cannot
  // mean "this probe cannot look at the filesystem".
  expect(existsSync(join(repoRoot, "tooling", "src", "ui-audit"))).toBe(true);
  expect(existsSync(join(repoRoot, "tooling", "src", "snap", "ops", "arms", "filmstrip.ts"))).toBe(true);
});
