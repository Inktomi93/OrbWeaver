// NO SERVER BUILD STEP, EVER. node 26 runs `.ts` source directly (native type stripping; tsx was shed
// 2026-08-03). This plan therefore emits `node <repo>/packages/server/src/entry/index.ts` and nothing
// else — no loader flag, no emit, no bundle, no dist path for the SERVER. The only build artifact in this
// repo is @orb/client's `vite build` output. An argv snapshot test pins that.
import { join } from "node:path";
import { SERVER_ENTRY_REL } from "../../_shared/server-entry.ts";
import type { ProdSpawnPlan, ProdSpawnPlanOpts } from "../contract/types.ts";
import { stripDebugEnv } from "./debug-env.ts";

/** The built client bundle the prod SPA registrar serves (`CLIENT_DIST_DIR`'s default, cwd-relative there). */
export const CLIENT_DIST_REL = "packages/client/dist";
/** `resolveSpaDistDir` throws at boot in production when this file is missing (entry/http/spa.ts). */
export const CLIENT_DIST_INDEX_REL = `${CLIENT_DIST_REL}/index.html`;

function materialize(base: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/** Build the exact spawn the manual incantation performed — `NODE_ENV=production node <entry>.ts`, at the
 *  repo root, appending to the prod log — plus (only) the debug overlay when asked. */
export function buildProdSpawnPlan(opts: ProdSpawnPlanOpts): ProdSpawnPlan {
  const inherited = opts.debugOverlay === undefined ? stripDebugEnv(opts.baseEnv) : materialize(opts.baseEnv);
  return {
    command: opts.nodePath,
    args: [join(opts.repoRoot, SERVER_ENTRY_REL)],
    // NODE_ENV is an ENV NAME (the platform's SCREAMING_SNAKE vocabulary), so it is set by key, not by an
    // object-literal property.
    env: { ...inherited, ...Object.fromEntries([["NODE_ENV", "production"]]), ...(opts.debugOverlay ?? {}) },
    cwd: opts.repoRoot,
    logPath: opts.logPath,
  };
}
