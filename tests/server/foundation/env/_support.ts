// @module-tag requires-process-chdir
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterAll, afterEach, beforeEach, vi } from "vitest";

// Every re-import runs with the process CWD parked in a throwaway directory. foundation/env's `.env`
// loader is cwd-relative (as dotenv's was), so this is what keeps a developer's real repo-root `.env`
// (real OIDC_ISSUER etc.) from bleeding in and masking the refinement under test — and it exercises the
// REAL loader instead of mocking a module out of the way. It is also the seam the loader suite below
// uses to hand the production code a crafted `.env`.
const tempDirs: string[] = [];

export function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A throwaway cwd holding a `.env` with exactly these bytes. */
export function dirWithEnvFile(contents: string): string {
  const dir = makeDir("orb-env-w3-file-");
  writeFileSync(join(dir, ".env"), contents);
  return dir;
}

export const EMPTY_DIR = makeDir("orb-env-w3-empty-");

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Re-import foundation/env under a controlled process.env + cwd so the module-level `envSchema.parse()`
// (and the `.env` load that precedes it) run against the crafted input. resetModules invalidates the
// cache; we wipe process.env first to strip the runner pins.
//
// `vitest: false` DROPS the VITEST pin — that is the only way to exercise the production override arm,
// since `skipOverride` is derived at module load from VITEST/ORB_ENV_NO_OVERRIDE.
export async function reimportEnvIn(
  cwd: string,
  overrides: Record<string, string | undefined>,
  opts: { readonly vitest?: boolean } = {},
): Promise<typeof import("@orb/server/foundation/env")> {
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  if (opts.vitest !== false) {
    process.env["VITEST"] = "1";
  }
  // NOTHING IS INJECTED HERE, and that is load-bearing (#2406). Between #1864 and #2406 this helper had to
  // slip `AUTH_FALLBACK: "owner"` into every single-user env because the flat `deny` default paired
  // boot-fatally with the mode — which made the two "the zero-config default boots" tests below assert the
  // HELPER's pin rather than the schema's answer. The conditional default (`AUTH_MODE_DEFAULT_FALLBACK`)
  // removed the need, so a wiped process.env is now the honest input it reads as, and re-adding a pin here
  // would re-blind the same two tests.
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) {
      process.env[k] = v;
    }
  }
  vi.resetModules();
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    return await import("@orb/server/foundation/env");
  } finally {
    process.chdir(previousCwd);
  }
}

export function reimportEnvWith(overrides: Record<string, string | undefined>): Promise<typeof import("@orb/server/foundation/env")> {
  return reimportEnvIn(EMPTY_DIR, overrides);
}

const SESSION_SECRET_LEN = 32;
export const VALID_SESSION_SECRET = "x".repeat(SESSION_SECRET_LEN);

/** Restores process.env and the module cache after each test; `reimportEnvIn` wipes process.env first. */
export function restoreProcessEnvAfterEach(): void {
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = { ...process.env };
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    Object.assign(process.env, snapshot);
    vi.resetModules();
  });
}
