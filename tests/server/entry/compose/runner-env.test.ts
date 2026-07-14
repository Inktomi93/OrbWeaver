// entry/compose/runner-env — the cross-feature `WorkloadRunnerEnv` builder. Two things under test:
//
// 1. The `connection.refreshCatalogSnapshot` FAN-OUT. The daily catalog refresh runs BOTH provider catalogs
//    (OpenRouter `/models` + the agent-sdk daemon `supportedModels()` map) INDEPENDENTLY — one lane's failure
//    must never discard the other. Semantics: both succeed → both counts; one fails → the failed lane reports
//    `null` (NOT 0 — null ≠ empty catalog) and the run still succeeds; BOTH fail → rethrow the first rejection.
//
// 2. The STAGING-CONTAINMENT belt on the two import ops (`import.importAll`, `import.importBundle`). Both take
//    a server-minted staging handle that is tRPC-settable by any authed user (import-st/import-bundle are
//    singular ⇒ no requireOwner gate). A traversal handle (`".."`, `"."`, `"../x"`, `"/etc"`, `""`) MUST throw
//    a typed escape error BEFORE any fs read or rm — nothing outside the staging root is ever read or deleted.
//    The regression: `basename("..") === ".."`, so the old `join(root, basename(handle))` belt resolved `".."`
//    to the staging root's PARENT, which the unconditional cleanup `rm` then recursively deleted (a `/`-wipe
//    when the default staging root is the OS temp dir). A valid handle still resolves + cleans up in-root.

import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RunnerEnvDeps } from "@orb/server/entry/compose";
import { buildWorkloadRunnerEnv } from "@orb/server/entry/compose";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

// The fan-out only reads `.models.length` off each verb's return — derive the exact return shapes off the
// deps so the fakes stay contract-accurate without importing the snapshot element types by name.
type OrCatalog = Awaited<ReturnType<RunnerEnvDeps["connection"]["refreshCatalog"]>>;
type AgentSdkCatalog = Awaited<ReturnType<RunnerEnvDeps["connection"]["refreshAgentSdkCatalog"]>>;

/** The `refreshCatalog` (OpenRouter) return with `count` models — only `.models.length` is read. */
function orCatalog(count: number): OrCatalog {
  // FABRICATION-OK: the fan-out reads ONLY `.models.length` — the per-model shape never enters the test.
  return { models: Array.from({ length: count }, () => ({})) } as OrCatalog;
}

/** The `refreshAgentSdkCatalog` return with `count` models — only `.models.length` is read. */
function agentSdkCatalog(count: number): AgentSdkCatalog {
  // FABRICATION-OK: only `.models.length` is read (see orCatalog) — the per-model shape never enters the fan-out.
  return { models: Array.from({ length: count }, () => ({})) } as AgentSdkCatalog;
}

/** Build the runner-env with ONLY the two connection verbs wired (the rest of `RunnerEnvDeps` is unused by
 *  `refreshCatalogSnapshot`; cast the frame so the test states exactly what it exercises). */
function buildEnv(
  connection: RunnerEnvDeps["connection"],
): ReturnType<typeof buildWorkloadRunnerEnv> {
  // FABRICATION-OK: deliberate partial deps — `refreshCatalogSnapshot` closes over ONLY `deps.connection`.
  return buildWorkloadRunnerEnv({ connection } as RunnerEnvDeps);
}

const signal = new AbortController().signal;

describe("buildWorkloadRunnerEnv — refreshCatalogSnapshot fan-out", () => {
  test("both lanes succeed → both snapshot counts", async () => {
    const env = buildEnv({
      refreshCatalog: vi.fn(async () => orCatalog(99)),
      refreshAgentSdkCatalog: vi.fn(async () => agentSdkCatalog(3)),
    });
    const result = await env.connection.refreshCatalogSnapshot({ signal });
    expect(result).toEqual({ models: 99, agentSdkModels: 3 });
  });

  test("agent-sdk lane fails → its count is null, OR lane still refreshes (run succeeds)", async () => {
    const env = buildEnv({
      refreshCatalog: vi.fn(async () => orCatalog(42)),
      refreshAgentSdkCatalog: vi.fn(() =>
        Promise.reject(new Error("agent-sdk catalog unavailable")),
      ),
    });
    const result = await env.connection.refreshCatalogSnapshot({ signal });
    // null (could-not-refresh), NEVER 0 — 0 would conflate a failed lane with a real empty catalog.
    expect(result).toEqual({ models: 42, agentSdkModels: null });
  });

  test("OR lane fails → its count is null, agent-sdk lane still refreshes (run succeeds)", async () => {
    const env = buildEnv({
      refreshCatalog: vi.fn(() => Promise.reject(new Error("no OpenRouter key"))),
      refreshAgentSdkCatalog: vi.fn(async () => agentSdkCatalog(7)),
    });
    const result = await env.connection.refreshCatalogSnapshot({ signal });
    expect(result).toEqual({ models: null, agentSdkModels: 7 });
  });

  test("BOTH lanes fail → rethrows the first (OR) rejection (the run accomplished nothing)", async () => {
    const orFailure = new Error("no OpenRouter key");
    const env = buildEnv({
      refreshCatalog: vi.fn(() => Promise.reject(orFailure)),
      refreshAgentSdkCatalog: vi.fn(() =>
        Promise.reject(new Error("agent-sdk catalog unavailable")),
      ),
    });
    await expect(env.connection.refreshCatalogSnapshot({ signal })).rejects.toBe(orFailure);
  });
});

const OWNER_ID = castId<UserId>("user_owner");
const OWNER_PRINCIPAL: Principal = {
  userId: OWNER_ID,
  role: "user",
  handle: castId<Handle>("user_owner"),
  externalId: null,
  via: "header",
};
const T0 = 1_700_000_000_000;

/** Build a runner-env whose import ops resolve staged handles under `stagingRoot`. Only the deps the two
 *  import ops read are wired (the rest of `RunnerEnvDeps` is cast away — the containment belt runs before any
 *  other dep is touched, and an empty staged dir never invokes the per-entity import ports). */
function stagingEnv(stagingRoot: string): ReturnType<typeof buildWorkloadRunnerEnv> {
  // The containment belt runs before any other dep is touched, and an empty staged dir never invokes the
  // FABRICATION-OK: per-entity import ports — deliberate partial deps, only these four fields are ever read.
  return buildWorkloadRunnerEnv({
    now: () => T0,
    importStagingDir: stagingRoot,
    getPortabilityRegistry: () => [],
    profileImport: { resolveOwnerPrincipal: vi.fn(async () => OWNER_PRINCIPAL) },
  } as unknown as RunnerEnvDeps);
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

const signal2 = new AbortController().signal;

// Handles the RUNNER belt itself must reject (the schema is a separate, outer belt tested in the workloads
// contract suite). `a/b` / `a\b` are NOT here: on POSIX they resolve to an IN-ROOT descendant, so the runner
// belt correctly lets them through — the SCHEMA is what rejects a separator. These are the shapes that would
// ESCAPE the root, which is exactly what the belt exists to stop.
const ESCAPING_HANDLES = ["..", ".", "../victim", "/etc", ""] as const;
const ESCAPE_ERROR = /escapes the staging root/;

describe("buildWorkloadRunnerEnv — import.importAll staging containment", () => {
  test.each(
    ESCAPING_HANDLES,
  )("stagedDir %j throws before any fs mutation (root + sibling survive)", async (stagedDir) => {
    const { stagingRoot, victim, victimFile } = await makeStaging();
    const env = stagingEnv(stagingRoot);
    await expect(
      env.import.importAll({ ownerId: OWNER_ID, dryRun: false, stagedDir, signal: signal2 }),
    ).rejects.toThrow(ESCAPE_ERROR);
    // Zero fs mutation: the staging root, the sibling dir, AND its file all still exist.
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
    expect(await exists(victimFile)).toBe(true);
  });

  test("a valid staged handle is NOT rejected by the belt (dry run, empty dir) and leaves the root intact", async () => {
    const { stagingRoot, victim } = await makeStaging();
    const token = "import-tree-550e8400-e29b-41d4-a716-446655440000";
    await mkdir(join(stagingRoot, token), { recursive: true });
    const env = stagingEnv(stagingRoot);
    const result = await env.import.importAll({
      ownerId: OWNER_ID,
      dryRun: true,
      stagedDir: token,
      signal: signal2,
    });
    expect(result).toEqual({ scanned: 0, changed: 0 });
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
  });
});

describe("buildWorkloadRunnerEnv — import.importBundle staging containment", () => {
  test.each(
    ESCAPING_HANDLES,
  )("token %j throws before any fs read or rm (root + sibling survive)", async (token) => {
    const { stagingRoot, victim, victimFile } = await makeStaging();
    const env = stagingEnv(stagingRoot);
    await expect(
      env.import.importBundle({ ownerId: OWNER_ID, token, source: "dir", signal: signal2 }),
    ).rejects.toThrow(ESCAPE_ERROR);
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
    expect(await exists(victimFile)).toBe(true);
  });

  test("a valid token imports an empty staged dir and scopes cleanup to inside the root", async () => {
    const { stagingRoot, victim } = await makeStaging();
    const token = "import-tree-550e8400-e29b-41d4-a716-446655440000";
    const stagedDir = join(stagingRoot, token);
    await mkdir(stagedDir, { recursive: true });
    const env = stagingEnv(stagingRoot);
    const result = await env.import.importBundle({
      ownerId: OWNER_ID,
      token,
      source: "dir",
      signal: signal2,
    });
    expect(result).toEqual({ imported: 0, skipped: 0, failed: 0 });
    // Cleanup happened, but scoped INSIDE the root: the staged dir is gone, the root + sibling remain.
    expect(await exists(stagedDir)).toBe(false);
    expect(await exists(stagingRoot)).toBe(true);
    expect(await exists(victim)).toBe(true);
  });
});
