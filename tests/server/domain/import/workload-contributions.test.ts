// Contribution test: import's two off-request kinds. The load-bearing half is the STAGING-CONTAINMENT belt
// (moved here with the contribution, from `entry/compose/runner-env.test.ts`): both kinds take a
// server-minted staging handle that is tRPC-settable by any authed user (import-st/import-bundle are
// singular ⇒ no requireOwner gate). A traversal handle (`".."`, `"."`, `"../x"`, `"/etc"`, `""`) MUST throw a
// typed escape error BEFORE any fs read or rm — nothing outside the staging root is ever read or deleted.
// The regression it freezes: `basename("..") === ".."`, so an old `join(root, basename(handle))` belt
// resolved `".."` to the staging root's PARENT, which the unconditional cleanup `rm` then recursively
// deleted (a `/`-wipe when the default staging root is the OS temp dir).
//
// The rest pins the contribution's own logic: the ownerless-row guard, the dryRun echo, and the post-settle
// stats reconcile (only on a real run that changed rows).

import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import type { ImportWorkloadDeps } from "../../../../packages/server/src/domain/import/contract/workloads.ts";
import { createImportWorkloadContributions } from "../../../../packages/server/src/domain/import/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("user_owner");
const T0 = 1_700_000_000_000;
const ctx: WorkloadRunContext = { userId: OWNER_ID, ownerId: OWNER_ID, now: () => T0 };
const sig = (): AbortSignal => new AbortController().signal;

function build(
  stagingRoot: string,
  overrides: Partial<ImportWorkloadDeps> = {},
): { readonly deps: ImportWorkloadDeps; readonly contributions: ReturnType<typeof createImportWorkloadContributions> } {
  const deps: ImportWorkloadDeps = {
    stagingRoot,
    stProfileDir: join(stagingRoot, "..", "profiles"),
    runProfileDirImport: vi.fn(async () => ({ scanned: 12, changed: 4, failed: 0 })),
    runBundleImport: vi.fn(async () => ({ imported: 7, skipped: 1, failed: 0 })),
    runStagedDirImport: vi.fn(async () => ({ imported: 3, skipped: 0, failed: 0 })),
    reconcileImportStats: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, contributions: createImportWorkloadContributions(deps) };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const bases: string[] = [];

/** A fresh staging root plus a SIBLING `victim/keep.txt` (the parent-directory blast target `stagedDir: ".."`
 *  used to delete) — the escape belt must leave both the root and the sibling untouched. */
async function makeStaging(): Promise<{ stagingRoot: string; victim: string; victimFile: string }> {
  const base = await mkdtemp(join(tmpdir(), "orb-staging-belt-"));
  bases.push(base);
  const stagingRoot = join(base, "staging");
  const victim = join(base, "victim");
  const victimFile = join(victim, "keep.txt");
  await mkdir(stagingRoot, { recursive: true });
  await mkdir(victim, { recursive: true });
  await writeFile(victimFile, "keep");
  return { stagingRoot, victim, victimFile };
}

afterEach(async () => {
  await Promise.all(bases.splice(0).map((b) => rm(b, { recursive: true, force: true })));
});

// Handles the CONTRIBUTION belt itself must reject (the schema is a separate, outer belt tested in the
// contracts suite). `a/b` / `a\b` are NOT here: on POSIX they resolve to an IN-ROOT descendant, so this belt
// correctly lets them through — the SCHEMA is what rejects a separator. These are the shapes that would
// ESCAPE the root, which is exactly what the belt exists to stop.
const ESCAPING_HANDLES = ["..", ".", "../victim", "/etc", ""] as const;
const ESCAPE_ERROR = /escapes the staging root/;
const VALID_TOKEN = "import-tree-550e8400-e29b-41d4-a716-446655440000";
/** The ownerless-row guard's message — a create-kind cannot mint rows with no target owner. */
const NO_TARGET_OWNER = /no target owner/;

describe("import-st — staging containment", () => {
  test.each(ESCAPING_HANDLES)("stagedDir %j throws before any fs mutation (root + sibling survive)", async (stagedDir) => {
    const { stagingRoot, victim, victimFile } = await makeStaging();
    const { deps, contributions } = build(stagingRoot);
    await expect(contributions[0].run(ctx, { stagedDir }, vi.fn(), sig())).rejects.toThrow(ESCAPE_ERROR);
    // Zero fs mutation, and the driver was never even reached.
    expect(deps.runProfileDirImport).not.toHaveBeenCalled();
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
    expect(await exists(victimFile)).toBe(true);
  });

  test("a valid staged handle resolves IN-ROOT, runs, and its cleanup stays inside the root", async () => {
    const { stagingRoot, victim } = await makeStaging();
    const stagedPath = join(stagingRoot, VALID_TOKEN);
    await mkdir(stagedPath, { recursive: true });
    const { deps, contributions } = build(stagingRoot);
    const result = await contributions[0].run(ctx, { stagedDir: VALID_TOKEN }, vi.fn(), sig());
    expect(vi.mocked(deps.runProfileDirImport).mock.calls[0]?.[0]?.profileRoot).toBe(stagedPath);
    expect(result).toEqual({ scanned: 12, changed: 4, dryRun: false, failed: 0 });
    // Cleanup happened, but scoped INSIDE the root: the staged tree is gone, the root + sibling remain.
    expect(await exists(stagedPath)).toBe(false);
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
  });

  test("with NO stagedDir the configured profile dir is read and NEVER removed (it is persistent)", async () => {
    const { stagingRoot } = await makeStaging();
    const { deps, contributions } = build(stagingRoot);
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(vi.mocked(deps.runProfileDirImport).mock.calls[0]?.[0]?.profileRoot).toBe(deps.stProfileDir);
  });
});

describe("import-st — the run's own logic", () => {
  test("an ownerless row is refused (a create-kind cannot mint ownerless rows)", async () => {
    const { stagingRoot } = await makeStaging();
    const { contributions } = build(stagingRoot);
    await expect(contributions[0].run({ ...ctx, ownerId: null }, {}, vi.fn(), sig())).rejects.toThrow(NO_TARGET_OWNER);
  });

  test("a real run that CHANGED rows reconciles the owner's stats post-settle", async () => {
    const { stagingRoot } = await makeStaging();
    const { deps, contributions } = build(stagingRoot);
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(deps.reconcileImportStats).toHaveBeenCalledExactlyOnceWith({ ownerId: OWNER_ID });
  });

  test("a DRY run does not reconcile, and echoes dryRun in the result", async () => {
    const { stagingRoot } = await makeStaging();
    const { deps, contributions } = build(stagingRoot);
    const result = await contributions[0].run(ctx, { dryRun: true }, vi.fn(), sig());
    expect(deps.reconcileImportStats).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 12, changed: 4, dryRun: true, failed: 0 });
  });

  test("a real run that changed NOTHING does not reconcile", async () => {
    const { stagingRoot } = await makeStaging();
    const { deps, contributions } = build(stagingRoot, { runProfileDirImport: vi.fn(async () => ({ scanned: 3, changed: 0, failed: 0 })) });
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(deps.reconcileImportStats).not.toHaveBeenCalled();
  });
});

describe("import-bundle — staging containment", () => {
  test.each(ESCAPING_HANDLES)("token %j throws before any fs read or rm (root + sibling survive)", async (token) => {
    const { stagingRoot, victim, victimFile } = await makeStaging();
    const { deps, contributions } = build(stagingRoot);
    await expect(contributions[1].run(ctx, { token, source: "dir" }, vi.fn(), sig())).rejects.toThrow(ESCAPE_ERROR);
    expect(deps.runStagedDirImport).not.toHaveBeenCalled();
    expect(deps.runBundleImport).not.toHaveBeenCalled();
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
    expect(await exists(victimFile)).toBe(true);
  });

  test("a valid token imports a staged DIR and scopes cleanup to inside the root", async () => {
    const { stagingRoot, victim } = await makeStaging();
    const stagedPath = join(stagingRoot, VALID_TOKEN);
    await mkdir(stagedPath, { recursive: true });
    const { deps, contributions } = build(stagingRoot);
    const result = await contributions[1].run(ctx, { token: VALID_TOKEN, source: "dir" }, vi.fn(), sig());
    expect(vi.mocked(deps.runStagedDirImport).mock.calls[0]?.[0]?.stagedPath).toBe(stagedPath);
    expect(result).toEqual({ imported: 3, skipped: 0, failed: 0 });
    expect(await exists(stagedPath)).toBe(false);
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
  });

  test("the default (zip) source reads the staged archive and removes it afterwards", async () => {
    const { stagingRoot } = await makeStaging();
    const stagedPath = join(stagingRoot, "import-bundle-abc.zip");
    await writeFile(stagedPath, "not-a-real-zip");
    const { deps, contributions } = build(stagingRoot);
    const result = await contributions[1].run(ctx, { token: "import-bundle-abc.zip" }, vi.fn(), sig());
    expect(deps.runBundleImport).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ imported: 7, skipped: 1, failed: 0 });
    expect(await exists(stagedPath)).toBe(false);
  });

  test("an ownerless row is refused (a bundle is scoped to its uploader)", async () => {
    const { stagingRoot } = await makeStaging();
    const { contributions } = build(stagingRoot);
    await expect(contributions[1].run({ ...ctx, ownerId: null }, { token: VALID_TOKEN }, vi.fn(), sig())).rejects.toThrow(NO_TARGET_OWNER);
  });
});

describe("the contribution set", () => {
  test("contributes exactly import's two kinds, both sweep-lane + idempotent-restart", async () => {
    const { stagingRoot } = await makeStaging();
    const { contributions } = build(stagingRoot);
    expect(contributions.map((contribution) => contribution.kind)).toEqual(["import-st", "import-bundle"]);
    for (const contribution of contributions) {
      expect(contribution.lane).toBe("sweep");
      expect(contribution.resume).toBe("idempotent-restart");
    }
  });
});
