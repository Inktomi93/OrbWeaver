// Contribution test: import's two off-request kinds. The load-bearing half is the STAGING-CONTAINMENT belt
// (moved here with the contribution, from `entry/compose/runner-env.test.ts`): both kinds take a
// server-minted staging handle that is tRPC-settable by any authed user (import-st/import-bundle are
// singular ⇒ no requireOwner gate). A traversal handle (`".."`, `"."`, `"../x"`, `"/etc"`, `""`) MUST throw a
// typed escape error BEFORE any fs read or rm — nothing outside the staging root is ever read or deleted.
// The regression it freezes: `basename("..") === ".."`, so an old `join(root, basename(handle))` belt
// resolved `".."` to the staging root's PARENT, which the unconditional cleanup `rm` then recursively
// deleted (a `/`-wipe when the default staging root is the OS temp dir).
//
// Since #1534 the belt runs against the ROW OWNER's subdir of the staging root (`stagedOwnerRoot`), which is
// the second half of the same story: a handle is a NAME, and the only thing that makes it readable is being
// staged for the account whose run is asking. Its own describe block drives two owners.
//
// The rest pins the contribution's own logic: the ownerless-row guard, the dryRun echo, and the post-settle
// stats reconcile (only on a real run that changed rows).

import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import type { ImportWorkloadDeps } from "../../../../packages/server/src/domain/import/contract/workloads.ts";
import { createImportWorkloadContributions } from "../../../../packages/server/src/domain/import/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("user_owner");
const T0 = 1_700_000_000_000;
const STRANGER_ID = castId<UserId>("user_stranger");
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
    runBundleImport: vi.fn(async () => ({ imported: 7, skipped: 1, failed: 0, notes: [] })),
    runStagedDirImport: vi.fn(async () => ({ imported: 3, skipped: 0, failed: 0, notes: [] })),
    listTokenUsageCandidates: vi.fn(async () => []),
    compareAndSetTokenUsage: vi.fn(async () => true),
    reconcileImportStats: vi.fn(async () => undefined),
    emitLibraryChanged: vi.fn(),
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
async function makeStaging(): Promise<{ stagingRoot: string; ownerRoot: string; victim: string; victimFile: string }> {
  const base = await mkdtemp(join(tmpdir(), "orb-staging-belt-"));
  bases.push(base);
  const stagingRoot = join(base, "staging");
  // #1534: handles resolve under the ROW OWNER's subdir, so that is where the upload routes write and where
  // these fixtures stage. `stagingRoot` itself holds no handles.
  const ownerRoot = join(stagingRoot, OWNER_ID);
  const victim = join(base, "victim");
  const victimFile = join(victim, "keep.txt");
  await mkdir(ownerRoot, { recursive: true });
  await mkdir(victim, { recursive: true });
  await writeFile(victimFile, "keep");
  return { stagingRoot, ownerRoot, victim, victimFile };
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
/** A charset-legal handle (the schema would pass it) whose staged entry is a SYMLINK pointing out of the root
 *  — the shape a purely lexical `startsWith` belt calls contained while `readFile`/the tree walker follow it. */
const SYMLINK_TOKEN = "import-tree-11111111-1111-4111-8111-111111111111";
/** The ownerless-row guard's message — a create-kind cannot mint rows with no target owner. */
const NO_TARGET_OWNER = /no target owner/;

function tokenCandidate(
  key: string,
  overrides: Partial<Awaited<ReturnType<ImportWorkloadDeps["listTokenUsageCandidates"]>>[number]> = {},
): Awaited<ReturnType<ImportWorkloadDeps["listTokenUsageCandidates"]>>[number] {
  return {
    variantId: castId<MessageVariantId>(`variant_${key}`),
    ownerId: OWNER_ID,
    role: "assistant",
    content: "eight raw text tokens should be estimated by the canonical kit",
    metadata: null,
    tokensIn: null,
    tokensOut: null,
    tokenProvenance: "unrecorded",
    ...overrides,
  };
}

function recordedMetadata(tokenCount: number): Record<string, unknown> {
  return { ["token_count"]: tokenCount };
}

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

  test("a stagedDir SYMLINKED out of the root is refused — containment is resolved, not string-matched", async () => {
    const { stagingRoot, ownerRoot, victim, victimFile } = await makeStaging();
    // Charset-legal handle, lexically in-root, but the entry itself points at the sibling tree.
    await symlink(victim, join(ownerRoot, SYMLINK_TOKEN), "dir");
    const { deps, contributions } = build(stagingRoot);
    await expect(contributions[0].run(ctx, { stagedDir: SYMLINK_TOKEN }, vi.fn(), sig())).rejects.toThrow(ESCAPE_ERROR);
    // The victim tree is never walked, and the cleanup rm never reaches it.
    expect(deps.runProfileDirImport).not.toHaveBeenCalled();
    expect(await exists(victim)).toBe(true);
    expect(await exists(victimFile)).toBe(true);
  });

  test("a valid staged handle resolves IN-ROOT, runs, and its cleanup stays inside the root", async () => {
    const { stagingRoot, ownerRoot, victim } = await makeStaging();
    const stagedPath = join(ownerRoot, VALID_TOKEN);
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

  test("a real run that CHANGED rows fans the owner's library-changed refresh (#23)", async () => {
    const { stagingRoot } = await makeStaging();
    const { deps, contributions } = build(stagingRoot);
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(deps.emitLibraryChanged).toHaveBeenCalledExactlyOnceWith({ ownerId: OWNER_ID });
  });

  test("a DRY run does not reconcile or fan a refresh, and echoes dryRun in the result", async () => {
    const { stagingRoot } = await makeStaging();
    const { deps, contributions } = build(stagingRoot);
    const result = await contributions[0].run(ctx, { dryRun: true }, vi.fn(), sig());
    expect(deps.reconcileImportStats).not.toHaveBeenCalled();
    expect(deps.emitLibraryChanged).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 12, changed: 4, dryRun: true, failed: 0 });
  });

  test("a real run that changed NOTHING neither reconciles nor fans a refresh", async () => {
    const { stagingRoot } = await makeStaging();
    const { deps, contributions } = build(stagingRoot, { runProfileDirImport: vi.fn(async () => ({ scanned: 3, changed: 0, failed: 0 })) });
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(deps.reconcileImportStats).not.toHaveBeenCalled();
    expect(deps.emitLibraryChanged).not.toHaveBeenCalled();
  });
});

describe("import-bundle — staging containment", () => {
  test.each(ESCAPING_HANDLES)("token %j throws before any fs read or rm (root + sibling survive)", async (token) => {
    const { stagingRoot, victim, victimFile } = await makeStaging();
    const { deps, contributions } = build(stagingRoot);
    await expect(contributions[2].run(ctx, { token, source: "dir" }, vi.fn(), sig())).rejects.toThrow(ESCAPE_ERROR);
    expect(deps.runStagedDirImport).not.toHaveBeenCalled();
    expect(deps.runBundleImport).not.toHaveBeenCalled();
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
    expect(await exists(victimFile)).toBe(true);
  });

  test("a token SYMLINKED at a file outside the root is refused before the archive is read", async () => {
    const { stagingRoot, ownerRoot, victim, victimFile } = await makeStaging();
    await symlink(victimFile, join(ownerRoot, SYMLINK_TOKEN), "file");
    const { deps, contributions } = build(stagingRoot);
    await expect(contributions[2].run(ctx, { token: SYMLINK_TOKEN }, vi.fn(), sig())).rejects.toThrow(ESCAPE_ERROR);
    // The out-of-root file's BYTES never reach the importer, and it is still there afterwards.
    expect(deps.runBundleImport).not.toHaveBeenCalled();
    expect(await exists(victim)).toBe(true);
    expect(await exists(victimFile)).toBe(true);
  });

  test("a valid token imports a staged DIR and scopes cleanup to inside the root", async () => {
    const { stagingRoot, ownerRoot, victim } = await makeStaging();
    const stagedPath = join(ownerRoot, VALID_TOKEN);
    await mkdir(stagedPath, { recursive: true });
    const { deps, contributions } = build(stagingRoot);
    const result = await contributions[2].run(ctx, { token: VALID_TOKEN, source: "dir" }, vi.fn(), sig());
    expect(vi.mocked(deps.runStagedDirImport).mock.calls[0]?.[0]?.stagedPath).toBe(stagedPath);
    expect(result).toEqual({ imported: 3, skipped: 0, failed: 0, notes: [] });
    expect(await exists(stagedPath)).toBe(false);
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
  });

  test("the default (zip) source reads the staged archive and removes it afterwards", async () => {
    const { stagingRoot, ownerRoot } = await makeStaging();
    const stagedPath = join(ownerRoot, "import-bundle-abc.zip");
    await writeFile(stagedPath, "not-a-real-zip");
    const { deps, contributions } = build(stagingRoot);
    const result = await contributions[2].run(ctx, { token: "import-bundle-abc.zip" }, vi.fn(), sig());
    expect(deps.runBundleImport).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ imported: 7, skipped: 1, failed: 0, notes: [] });
    expect(await exists(stagedPath)).toBe(false);
  });

  test("an ownerless row is refused (a bundle is scoped to its uploader)", async () => {
    const { stagingRoot } = await makeStaging();
    const { contributions } = build(stagingRoot);
    await expect(contributions[2].run({ ...ctx, ownerId: null }, { token: VALID_TOKEN }, vi.fn(), sig())).rejects.toThrow(NO_TARGET_OWNER);
  });

  test("a bundle that imported canon fans the owner's library-changed refresh; an empty import does not (#23)", async () => {
    const { stagingRoot, ownerRoot } = await makeStaging();
    const stagedPath = join(ownerRoot, VALID_TOKEN);
    await mkdir(stagedPath, { recursive: true });
    const { deps, contributions } = build(stagingRoot);
    await contributions[2].run(ctx, { token: VALID_TOKEN, source: "dir" }, vi.fn(), sig()); // runStagedDirImport ⇒ imported: 3
    expect(deps.emitLibraryChanged).toHaveBeenCalledExactlyOnceWith({ ownerId: OWNER_ID });

    const emptyStaged = join(ownerRoot, `${VALID_TOKEN}-empty`);
    await mkdir(emptyStaged, { recursive: true });
    const { deps: emptyDeps, contributions: emptyContributions } = build(stagingRoot, {
      runStagedDirImport: vi.fn(async () => ({ imported: 0, skipped: 4, failed: 0, notes: [] })),
    });
    await emptyContributions[2].run(ctx, { token: `${VALID_TOKEN}-empty`, source: "dir" }, vi.fn(), sig());
    expect(emptyDeps.emitLibraryChanged).not.toHaveBeenCalled();
  });
});

describe("import-token-usage-backfill — provenance settlement", () => {
  test("recovers exact metadata, estimates missing counts, promotes legacy numerics, audits skips, and reconciles changed owners", async () => {
    const { stagingRoot } = await makeStaging();
    const candidates = [
      tokenCandidate("exact", { metadata: recordedMetadata(0) }),
      tokenCandidate("estimated", { role: "user" }),
      tokenCandidate("legacy", { tokensOut: 17 }),
      tokenCandidate("measured", { tokensOut: 22, tokenProvenance: "measured" }),
      tokenCandidate("already_estimated", { tokensOut: 13, tokenProvenance: "estimated" }),
      tokenCandidate("race", { metadata: recordedMetadata(5) }),
    ];
    const listTokenUsageCandidates = vi.fn(async () => candidates);
    const compareAndSetTokenUsage = vi.fn(async ({ candidate }) => candidate.variantId !== castId<MessageVariantId>("variant_race"));
    const { deps, contributions } = build(stagingRoot, { listTokenUsageCandidates, compareAndSetTokenUsage });

    const result = await contributions[1].run(ctx, { dryRun: false }, vi.fn(), sig());

    expect(result).toEqual({
      scanned: 6,
      exactRecovered: 1,
      legacyPromoted: 1,
      estimated: 1,
      alreadyMeasured: 1,
      alreadyEstimated: 1,
      compareAndSetSkipped: 1,
      ownersScanned: 1,
      ownersReconciled: 1,
      dryRun: false,
    });
    expect(compareAndSetTokenUsage).toHaveBeenCalledTimes(4);
    expect(compareAndSetTokenUsage).toHaveBeenCalledWith({
      candidate: candidates[0],
      resolution: { tokensIn: null, tokensOut: 0, tokenProvenance: "measured" },
    });
    expect(compareAndSetTokenUsage).toHaveBeenCalledWith({
      candidate: candidates[1],
      resolution: expect.objectContaining({ tokensIn: expect.any(Number), tokensOut: null, tokenProvenance: "estimated" }),
    });
    expect(deps.reconcileImportStats).toHaveBeenCalledExactlyOnceWith({ ownerId: OWNER_ID });
  });

  test("dry-run reports the plan without CAS writes or reconciliation", async () => {
    const { stagingRoot } = await makeStaging();
    const candidates = [tokenCandidate("exact_dry", { metadata: recordedMetadata(3) }), tokenCandidate("estimated_dry")];
    const { deps, contributions } = build(stagingRoot, { listTokenUsageCandidates: vi.fn(async () => candidates) });

    const result = await contributions[1].run(ctx, { dryRun: true }, vi.fn(), sig());

    expect(result).toMatchObject({ scanned: 2, exactRecovered: 1, estimated: 1, ownersReconciled: 0, dryRun: true });
    expect(deps.compareAndSetTokenUsage).not.toHaveBeenCalled();
    expect(deps.reconcileImportStats).not.toHaveBeenCalled();
  });
});

describe("staged handles are per-owner, not bearer tokens (#1534)", () => {
  test("a SECOND owner's run cannot read the handle staged for another owner, and cannot delete it either", async () => {
    const { stagingRoot } = await makeStaging();
    // A's staged upload, in A's own namespace — exactly where the route writes it.
    const aRoot = join(stagingRoot, OWNER_ID);
    await mkdir(aRoot, { recursive: true });
    const aStaged = join(aRoot, VALID_TOKEN);
    await writeFile(aStaged, "user-a-private-bundle");
    // A DECOY at the bare staging root under the same handle — where the pre-#1534 belt resolved handles.
    // Without it this arm passes vacuously (any missing path refuses); with it, a belt that resolves off the
    // row owner reads SOMEBODY'S bundle and the arm goes red.
    const rootDecoy = join(stagingRoot, VALID_TOKEN);
    await writeFile(rootDecoy, "not-the-stranger's-either");
    const { deps, contributions } = build(stagingRoot);

    // B names A's handle on a run of B's own (`workloads.start` is `authedProcedure`; this is the whole
    // exploit — nothing but the row's ownerId distinguishes the two calls).
    const strangerCtx: WorkloadRunContext = { ...ctx, userId: STRANGER_ID, ownerId: STRANGER_ID };
    await expect(contributions[2].run(strangerCtx, { token: VALID_TOKEN }, vi.fn(), sig())).rejects.toThrow(/staging root/u);

    // A's bytes never reached the importer, and B's cleanup `finally` did not delete them.
    expect(deps.runBundleImport).not.toHaveBeenCalled();
    expect(await exists(aStaged)).toBe(true);
    expect(await exists(rootDecoy)).toBe(true);
  });

  test("the OWNER's own run reads the same handle and imports it (the positive control)", async () => {
    const { stagingRoot } = await makeStaging();
    const aRoot = join(stagingRoot, OWNER_ID);
    await mkdir(aRoot, { recursive: true });
    await writeFile(join(aRoot, VALID_TOKEN), "user-a-private-bundle");
    const { deps, contributions } = build(stagingRoot);

    const result = await contributions[2].run(ctx, { token: VALID_TOKEN }, vi.fn(), sig());

    expect(deps.runBundleImport).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ imported: 7, skipped: 1, failed: 0, notes: [] });
    expect(await exists(join(aRoot, VALID_TOKEN))).toBe(false);
  });

  test("import-st's stagedDir is namespaced the same way — a stranger's handle resolves nothing", async () => {
    const { stagingRoot } = await makeStaging();
    const aStagedDir = join(stagingRoot, OWNER_ID, VALID_TOKEN);
    await mkdir(aStagedDir, { recursive: true });
    // The same decoy at the bare root the pre-#1534 belt would have walked (keeps this arm differential).
    const rootDecoy = join(stagingRoot, VALID_TOKEN);
    await mkdir(rootDecoy, { recursive: true });
    const { deps, contributions } = build(stagingRoot);
    const strangerCtx: WorkloadRunContext = { ...ctx, userId: STRANGER_ID, ownerId: STRANGER_ID };

    await expect(contributions[0].run(strangerCtx, { stagedDir: VALID_TOKEN }, vi.fn(), sig())).rejects.toThrow(/staging root/u);

    expect(deps.runProfileDirImport).not.toHaveBeenCalled();
    expect(await exists(aStagedDir)).toBe(true);
    expect(await exists(rootDecoy)).toBe(true);
  });
});

describe("the contribution set", () => {
  test("contributes exactly import's three kinds, all sweep-lane + idempotent-restart", async () => {
    const { stagingRoot } = await makeStaging();
    const { contributions } = build(stagingRoot);
    expect(contributions.map((contribution) => contribution.kind)).toEqual(["import-st", "import-token-usage-backfill", "import-bundle"]);
    for (const contribution of contributions) {
      expect(contribution.lane).toBe("sweep");
      expect(contribution.resume).toBe("idempotent-restart");
    }
  });
});
