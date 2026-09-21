// #2505 — THE GATE THAT NEVER RAN A MUTANT. `quality:mutation-gate` could not produce a verdict whenever a
// lane worktree existed, which on this repo is most of the time.
//
// Stryker's sandbox links the project's `node_modules` trees into its temp copy, and it finds them with
// `fileUtils.findNodeModulesList` (`dist/src/utils/file-utils.js`): a bare BFS over `fs.promises.readdir`
// rooted at `process.cwd()` (`dist/src/sandbox/sandbox.js`, under Stryker's own `// TODO: Change with
// this.options.basePath when we have it`). It consults NO Stryker option except `tempDirName`, so
// `ignorePatterns` — where `tooling/src/_shared/stryker-config.ts` already lists `.claude/**` — cannot
// reach it. Two consequences, and the second is the worse one:
//
//   1. THE RACE (the symptom that surfaced). Agent worktrees are created and destroyed continuously. A
//      directory enumerated by its parent is gone by the time the queue reaches it, `readdir` rejects
//      ENOENT out of an unawaited path, and node dies before the first mutant. Measured 2026-09-20 on
//      `agent-aaa9b6274e7956db3`, in a run that had already instrumented 1177 mutants.
//   2. THE REACH (the defect). Unfenced, the walk does not merely trip over those directories — it FINDS
//      `.claude/worktrees/<lane>/node_modules` and the sandbox symlinks another agent's modules into the
//      mutation run. A mutation verdict sampled from a sibling lane's tree is not our tree's verdict.
//
// The fix is a hunk in `patches/@stryker-mutator__core@10.0.0.patch` — the house mechanism, alongside the
// two Stryker dist patches already shipping there. THIS FILE IS ITS KEEPER, and it pins the PATCHED
// package as installed, not a copy of the logic: a version bump that drops the patch reds here.
//
// BOTH CONTROLS RUN IN BOTH DIRECTIONS. The fence is paired with a planted positive — a real nested
// `node_modules` that MUST still be found, so "returns nothing" cannot pass as "fenced". The race is
// paired with a STOCK TWIN: the pre-patch algorithm, verbatim, run over the SAME scenario and required to
// die. Without that twin a green patched arm could mean the race never fired, which is exactly the shape
// of false clean this whole issue is about.
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll } from "vitest";
import { expect, test } from "../support/tool-fixtures.ts";

type FindNodeModulesList = (basePath: string, tempDirName?: string) => Promise<string[]>;

const require = createRequire(import.meta.url);
const STRYKER_CORE_ROOT = dirname(require.resolve("@stryker-mutator/core/package.json"));
const FILE_UTILS = join(STRYKER_CORE_ROOT, "dist", "src", "utils", "file-utils.js");

const mod: { readonly fileUtils: { readonly findNodeModulesList: FindNodeModulesList } } = await import(pathToFileURL(FILE_UTILS).href);
const findNodeModulesList = mod.fileUtils.findNodeModulesList;

const roots: string[] = [];
async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "orb-stryker-walk-"));
  roots.push(root);
  return root;
}
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

/** The STOCK algorithm, verbatim from the `@stryker-mutator/core` 10.0.0 `dist/src/utils/file-utils.js` before
 *  the #2505 hunk. It exists ONLY as the red arm of the race control — it is the thing that must die, so
 *  that a surviving patched arm means the scenario fired rather than that it never happened. */
async function stockFindNodeModulesList(basePath: string, tempDirName?: string): Promise<string[]> {
  const nodeModulesList: string[] = [];
  const dirBfsQueue = ["."];
  for (let dir = dirBfsQueue.pop(); dir !== undefined; dir = dirBfsQueue.pop()) {
    const name = dir.split(sep).at(-1);
    if (name === tempDirName) {
      continue;
    }
    if (name === "node_modules") {
      nodeModulesList.push(dir);
      continue;
    }
    const parentDir = dir;
    const filesWithType = await readdir(join(basePath, dir), { withFileTypes: true });
    dirBfsQueue.push(...filesWithType.filter((file) => file.isDirectory()).map((childDir) => join(parentDir, childDir.name)));
  }
  return nodeModulesList;
}

test("the walk SKIPS agent worktrees and still finds real workspace node_modules", async () => {
  const root = await scratchRoot();
  // The defect's exact shape: a lane worktree carrying a full node_modules, inside the repo root.
  await mkdir(join(root, ".claude", "worktrees", "agent-deadbeef", "node_modules", "left-pad"), { recursive: true });
  await mkdir(join(root, ".claude", "worktrees", "agent-deadbeef", "packages", "kit", "node_modules"), { recursive: true });
  // THE PLANTED POSITIVE CONTROL, in the same invocation: the trees the sandbox genuinely needs.
  await mkdir(join(root, "node_modules", ".pnpm"), { recursive: true });
  await mkdir(join(root, "packages", "kit", "node_modules"), { recursive: true });
  await mkdir(join(root, "tooling", "node_modules"), { recursive: true });

  const found = await findNodeModulesList(root, ".stryker-tmp");

  expect([...found].sort()).toEqual(["node_modules", join("packages", "kit", "node_modules"), join("tooling", "node_modules")].sort());
  expect(found.some((entry) => entry.includes(".claude"))).toBe(false);
});

/** Build the race: many sibling subtrees the walk must enumerate, all of which vanish underneath it. */
async function plantVanishingTree(root: string): Promise<string> {
  const churn = join(root, "churn");
  await mkdir(churn, { recursive: true });
  await Promise.all(Array.from({ length: 300 }, (_unused, index) => mkdir(join(churn, `lane-${String(index)}`, "inner", "deeper"), { recursive: true })));
  return churn;
}

test("a directory swept mid-walk is skipped, not fatal — and the STOCK walk dies on the same scenario", async () => {
  const stockRoot = await scratchRoot();
  const stockChurn = await plantVanishingTree(stockRoot);
  const stockRun = stockFindNodeModulesList(stockRoot, ".stryker-tmp");
  const stockOutcome = await Promise.allSettled([stockRun, rm(stockChurn, { recursive: true, force: true })]);
  const stockArm = stockOutcome[0];
  // The RED arm proves the scenario fired. If this ever passes, the race did not happen and the green arm
  // below would be meaningless — so it fails the test rather than quietly weakening it.
  expect(stockArm.status).toBe("rejected");
  expect(stockArm.status === "rejected" ? String((stockArm.reason as { code?: string }).code) : "").toBe("ENOENT");

  const patchedRoot = await scratchRoot();
  const patchedChurn = await plantVanishingTree(patchedRoot);
  const patchedRun = findNodeModulesList(patchedRoot, ".stryker-tmp");
  const [patchedArm] = await Promise.allSettled([patchedRun, rm(patchedChurn, { recursive: true, force: true })]);
  expect(patchedArm.status).toBe("fulfilled");
});
