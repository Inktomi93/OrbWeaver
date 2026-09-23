// F10: the matrix permission is behavioral, not
// parse-only. This suite enters through the real Snap cli, boots a daemon session on a non-default loopback
// base, then runs a scenario matrix as a later session call. Discovery and every cell must inherit that
// binding; each cell gets a fresh context; the owner page and its storage survive after the cells close.
//
// #2434: the `settings.getUserSettings` fixture below used to carry no `appearance.backgroundLibrary` at
// all, which was fine while the matrix's `asset` background arm could fall back to the static `kind:"seeded"`
// catalog. That catalog retired 2026-09-18 (the same commit this file's own `variants=14` comment already
// cites), so `planSnapAppearanceMatrix` (`ops/matrix.ts`) now REQUIRES a real
// `discovery.settings.backgroundLibraryFirst` (`_shared/appearance.ts` `readBackgroundCapability`) before it
// will build ANY matrix cells — scenario-checkpoints mode included, since cell planning is appearance-shared
// even though scenario mode never reports appearance receipts. Proven red-first: the unmocked fixture makes
// `--matrix --scenario` refuse in `runRatedMatrix` before a single cell runs (`INSTRUMENT ERROR: matrix
// discovery found no background-library asset to paint the \`asset\` Appearance arm with`), which zeroes
// EVERY registered fact batch and surfaces at the run-index layer as the unrelated-looking "dead-css"/
// "app-snapshot" arm refusals (`enabled arm emitted no typed fact` — `snap/lib/run-bundle-verdict.ts`): with
// no batches at all, the fallback terminal-only batch carries no arm facts, and both default-enabled arms
// read as refused. The fix is this test's own premise, not `tooling/src/snap/**`: mint one background asset
// row so discovery has something to plant.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
import { appearanceMatrixContract } from "../../../../packages/client/src/lib/appearance-carrier-manifest.ts";
import { readSessionRow } from "../../../../tooling/src/snap/lib/session-wire.ts";
import type { CliResult } from "../../../support/tool-fixtures.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CASE_BUDGET_MS = scaledBudget(180_000, 4);
const CLI_BUDGET_MS = scaledBudget(150_000, 4);
vi.setConfig({ testTimeout: CASE_BUDGET_MS, hookTimeout: CASE_BUDGET_MS });

const THEMES = [
  { id: "seed-hearth", name: "Hearth", isSeed: true, override: { background: "#111111" }, css: null },
  { id: "custom-light", name: "Paper", isSeed: false, override: { background: "#f7f3eb" }, css: ":root{color-scheme:light}" },
  { id: "custom-dark", name: "Ink", isSeed: false, override: { background: "#161821" }, css: ":root{color-scheme:dark}" },
] as const;

function runtimeContract(): ReturnType<typeof appearanceMatrixContract> & {
  readonly rows: readonly (ReturnType<typeof appearanceMatrixContract>["rows"][number] & { readonly reached: number; readonly samples: readonly unknown[] })[];
} {
  const contract = appearanceMatrixContract();
  return {
    ...contract,
    rows: contract.rows.map((row, index) => ({ ...row, reached: index === 0 ? 1 : 0, samples: index === 0 ? ["fixture"] : [] })),
  };
}

function fixtureHtml(): string {
  const contract = JSON.stringify(runtimeContract()).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en" data-app-ready="pending"><head><meta charset="utf-8"><title>F10 fixture</title></head>
<body><main id="fixture">matrix fixture</main><script>
globalThis.__orb = {
  appearanceMatrixContract: () => (${contract}),
  consoleErrors: () => ({ records: [], dropped: 0, cap: 128 }),
  resetEvidence: () => {}
};
fetch("/api/trpc/settings.getUserSettings?batch=1&input=%7B%7D")
  .then((response) => response.json())
  .then(() => { document.documentElement.dataset.appReady = "settled"; });
</script></body></html>`;
}

async function loopbackFixture(): Promise<{ readonly base: string; readonly requests: string[]; readonly close: () => Promise<void> }> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    requests.push(url);
    response.setHeader("content-type", url.includes("/api/trpc/") ? "application/json" : "text/html; charset=utf-8");
    if (url.includes("settings.listThemes")) {
      response.end(JSON.stringify([{ result: { data: THEMES } }]));
      return;
    }
    if (url.includes("settings.getUserSettings")) {
      response.end(
        JSON.stringify([
          {
            result: {
              data: {
                config: {
                  // #2434: the `asset` background arm (the only paintable one since `kind:"seeded"` retired
                  // 2026-09-18) needs a real library entry or matrix discovery refuses before any cell runs.
                  appearance: { backgroundLibrary: [{ assetId: "f10-bg-asset", assetHash: "f10-bg-hash", mime: "image/png" }] },
                  theme: { selectedThemeId: null },
                },
              },
            },
          },
        ]),
      );
      return;
    }
    response.end(fixtureHtml());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("loopback fixture did not bind a TCP port");
  }
  return {
    base: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error)))),
  };
}

function occurrenceCount(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function browserChildren(pid: number): readonly number[] {
  const children = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim().split(/\s+/u).filter(Boolean).map(Number);
  return children.filter((child) => {
    const argv = readFileSync(`/proc/${child}/cmdline`, "utf8");
    return argv.includes("chromium") && !argv.includes("--type=");
  });
}

// @instrument-proof: every matrix cell reports the synthetic origin and fresh storage through the real
// daemon call; a one-shot/fallback browser or reused context changes those receipts.
test("F10 — a session matrix inherits the daemon base, isolates every cell context, and leaves the owner usable", async ({ plantedTree, runCli }) => {
  const fixture = await loopbackFixture();
  const session = `p-f10-matrix-${process.pid}`;
  const cellEval =
    "new Promise((resolve) => setTimeout(() => resolve(JSON.stringify({origin:location.origin,owner:localStorage.getItem('f10-owner'),cell:localStorage.getItem('f10-cell')}) + (localStorage.setItem('f10-cell','set'),'')), 250))";
  const scenario = JSON.stringify({ name: "f10-one-checkpoint", checkpoints: [{ name: "cell", args: ["/", "--eval", cellEval, "--no-shot"] }] });
  const root = await plantedTree({ "registry/.keep": "", "scenario.json": scenario });
  const env = Object.fromEntries([["ORB_SNAP_SESSION_HOME", join(root, "registry")]]);
  const snap = (args: readonly string[]): Promise<CliResult> => runCli("snap", args, { env, timeoutMs: CLI_BUDGET_MS });
  try {
    const boot = await snap([
      "--session",
      session,
      "--base",
      fixture.base,
      "/",
      "--eval",
      "localStorage.setItem('f10-owner','owner-alive') || location.origin",
      "--no-shot",
      "--no-failure-evidence",
    ]);
    await expect(boot).toExitWith(EXIT.clean);
    expect(boot.stdout).toContain(fixture.base);

    const row = readSessionRow(readFileSync(join(root, "registry", `${session}.json`), "utf8"));
    if (row === null) {
      throw new Error("session daemon row was not persisted after boot");
    }
    const daemonPid = row.daemonPid;
    expect(browserChildren(daemonPid)).toHaveLength(1);

    let maxBrowserChildren = browserChildren(daemonPid).length;
    const sampler = setInterval(() => {
      maxBrowserChildren = Math.max(maxBrowserChildren, browserChildren(daemonPid).length);
    }, 50);
    const matrix = await snap(["--session", session, "--matrix", "--scenario", join(root, "scenario.json"), "--json", "--no-shot"]).finally(() => {
      clearInterval(sampler);
    });
    expect(maxBrowserChildren).toBe(1);
    await expect(matrix).toExitWith(EXIT.clean);
    expect(matrix.stdout).toContain("RESULT snap-matrix");
    // 16 → 14 with the `kind:"seeded"` retirement (2026-09-18): the background arm moved
    // `none|seeded` → `none|asset` and its risk row moved with it, so the same required rows pack into two
    // fewer cells. The count is DERIVED — `tests/tooling/snap/ops/matrix-contract.test.ts` owns the claim
    // that the smaller plan still covers every pair (`uncoveredPairs === []`). #2434: the per-cell occurrence
    // counts below were left at the STALE 16 by that same edit (this run never reached them before — the
    // fixture's missing background asset above made discovery refuse first) and are now derived from the
    // same 14, one per matrix cell's single checkpoint.
    expect(matrix.stdout).toContain("variants=14");
    expect(occurrenceCount(matrix.stdout, String.raw`\"origin\":\"${fixture.base}`)).toBe(14);
    expect(occurrenceCount(matrix.stdout, String.raw`\"owner\":null`)).toBe(14);
    expect(occurrenceCount(matrix.stdout, String.raw`\"cell\":null`)).toBe(14);
    expect(matrix.stdout).not.toContain(":5173");
    const receiptPath = /RESULT snap-matrix .*\bjson=(\S+)/u.exec(matrix.stdout)?.[1];
    expect(receiptPath).toBeTypeOf("string");
    const receipt = JSON.parse(readFileSync(String(receiptPath), "utf8")) as { readonly mode: string; readonly cells: readonly unknown[] };
    expect(receipt).toMatchObject({ mode: "scenario-checkpoints" });
    expect(receipt.cells).toHaveLength(14);
    const indexPath = /\bindex=(\/\S+\/run\.json)\b/u.exec(matrix.stdout)?.[1];
    expect(indexPath).toBeTypeOf("string");
    const index = JSON.parse(readFileSync(String(indexPath), "utf8")) as {
      readonly artifacts: readonly {
        readonly path: string;
        readonly producerArm: string | null;
        readonly channel: string;
        readonly schema: string | null;
      }[];
    };
    expect(index.artifacts.find((artifact) => artifact.path === receiptPath)).toMatchObject({
      producerArm: null,
      channel: "appearance-matrix",
      schema: "snap-appearance-matrix-v1",
    });

    const after = await snap([
      "--session",
      session,
      "--eval",
      "JSON.stringify({origin:location.origin,owner:localStorage.getItem('f10-owner'),cell:localStorage.getItem('f10-cell')})",
      "--no-shot",
    ]);
    await expect(after).toExitWith(EXIT.clean);
    expect(after.stdout).toContain(fixture.base);
    expect(after.stdout).toContain("owner-alive");
    expect(after.stdout).toContain(String.raw`\"cell\":null`);
    // #2434: 14 matrix cells (one page load each) + the boot page + the after-eval page = 16 non-tRPC
    // requests at minimum, one lower than the stale 16-cell bound this line carried before the same
    // 16 → 14 retirement above.
    expect(fixture.requests.filter((url) => !url.includes("/api/trpc/")).length).toBeGreaterThan(14);
  } finally {
    await snap(["--session-close", session]);
    await snap(["--session-sweep"]);
    await fixture.close();
  }
});
