// entry/compose/runner-env — what is LEFT of the retiring cross-feature hub (the workloads junk-drawer
// exit). The catalog fan-out moved out with its kind, to `domain/connection/workload-contributions.ts`
// (tested at its mirror). What remains under test here:
//
// The STAGING-CONTAINMENT belt on the two import ops (`import.importAll`, `import.importBundle`). Both take
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
  test.each(ESCAPING_HANDLES)("stagedDir %j throws before any fs mutation (root + sibling survive)", async (stagedDir) => {
    const { stagingRoot, victim, victimFile } = await makeStaging();
    const env = stagingEnv(stagingRoot);
    await expect(env.import.importAll({ ownerId: OWNER_ID, dryRun: false, stagedDir, signal: signal2 })).rejects.toThrow(ESCAPE_ERROR);
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
  test.each(ESCAPING_HANDLES)("token %j throws before any fs read or rm (root + sibling survive)", async (token) => {
    const { stagingRoot, victim, victimFile } = await makeStaging();
    const env = stagingEnv(stagingRoot);
    await expect(env.import.importBundle({ ownerId: OWNER_ID, token, source: "dir", signal: signal2 })).rejects.toThrow(ESCAPE_ERROR);
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
