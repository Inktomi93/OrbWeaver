// `stack status`'s SERVED-MODULE probe (#524) — the answer to "is the thing on :5173 actually serving the
// code on disk?", which neither `healthz` nor a live vite pid can give.
//
// THE INCIDENT IT CLOSES (2026-08-22): vite's file watcher died silently. The process stayed up, the port
// stayed bound, `stack status` printed `status=up`, and for 24 minutes every page load white-screened
// because vite kept handing out a pre-merge transform of a workspace module that was missing an export the
// merge had landed — byte-identical 20542-byte bodies, and `touch` did not invalidate them. A whole design
// review ran against a dead app before anyone doubted the status line.
//
// WHY THE NEWEST FILE, and not a fixed canary: a dead watcher serves the LAST transform it computed, so for
// an UNCHANGED file that transform is indistinguishable from a fresh one — a fixed canary can never detect
// this. Divergence exists only for files that changed after the watcher died, so the probe aims at the most
// recently modified workspace module and walks down from there until one is comparable — since #2461 that
// is any module vite mapped (its transform carries the source bytes), and only a map-less one needs exports.
//
// WHY IT CANNOT FALSE-ALARM ON A COLD MODULE: a module vite has never loaded is transformed on demand, so
// it comes back fresh by construction. The probe only ever accuses a module vite is CACHING.

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { budget } from "@orb/tooling/_shared/load-budget";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { DEV_PORTS } from "../../_shared/ports.ts";
import type { ServedVerdict } from "../contract/types.ts";
import { newestSourceEntries } from "../lib/source-scan.ts";
import { viteUrl } from "../lib/stack-plan.ts";
import { classifyServedTransform } from "../lib/verdicts.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack served-probe");

/** The workspace trees vite SOURCE-consumes (no prebundling since 086c4e047), i.e. every tree whose edits
 *  the dev watcher is responsible for invalidating. `server`/`db` are absent: they are node's `--watch`
 *  problem, not vite's. */
const WATCHED_SOURCE_DIRS = ["packages/client/src", "packages/ui/src", "packages/kit/src", "packages/contracts/src"];
const MODULE_EXT_RE = /\.(?:ts|tsx)$/u;
const DECLARATION_RE = /\.d\.ts$/u;
/** How far down the newest-first list to walk before giving up on finding a comparable module. */
const CANDIDATE_DEPTH = 5;
// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const FETCH_TIMEOUT_MS_BASE = 3000;
const FETCH_TIMEOUT_MS = budget(FETCH_TIMEOUT_MS_BASE);
const HTTP_OK = 200;

/** `/@fs/<abs>` is vite's own escape hatch for a file outside root. */
async function fetchServed(absPath: string, vitePort: number): Promise<string | null> {
  // @orb-waive caught-failure-ownership(catch): probe JSON parse failure returns null and the caller reports the service as unverified. Ends if null can satisfy the served probe.
  try {
    const res = await fetch(`${viteUrl(vitePort)}@fs${absPath}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return res.status === HTTP_OK ? await res.text() : null;
  } catch {
    return null;
  }
}

function readSource(path: string): string | null {
  // @orb-waive caught-failure-ownership(catch): probe request failure returns null and the caller reports the service as unreachable. Ends if null can satisfy the served probe.
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Compare the newest comparable workspace module against what vite serves for it.
 *
 *  `roots` defaults to the real watched trees and is a parameter ONLY so the committed controls can plant a
 *  two-file tree and drive both directions (a fake vite echoing the file = `fresh`; one echoing a wedged
 *  body = `stale`). A detector nobody can fail is not a detector. `vitePort` is the stack's own, so a
 *  sidecar probes its own vite and never the dev one.
 * @public Test-anchored module surface; focused tests pin this production-local behavior. */
export async function probeServedTransform(
  roots: readonly string[] = WATCHED_SOURCE_DIRS.map((rel) => `${REPO_ROOT}/${rel}`),
  vitePort: number = DEV_PORTS.vite,
): Promise<ServedVerdict> {
  const candidates = newestSourceEntries(roots, (path) => MODULE_EXT_RE.test(path) && !DECLARATION_RE.test(path)).slice(0, CANDIDATE_DEPTH);
  let last: ServedVerdict = classifyServedTransform({ file: null, diskSource: null, servedBody: null });
  for (const candidate of candidates) {
    const rel = relative(REPO_ROOT, candidate.path);
    const diskSource = readSource(candidate.path);
    const servedBody = await fetchServed(candidate.path, vitePort);
    const verdict = classifyServedTransform({ file: rel, diskSource, servedBody });
    if (verdict.state !== "unverifiable") {
      return verdict;
    }
    last = verdict;
  }
  return last;
}

/** The `served-probe` verb a staged tree's caller runs by name. Prints ONE machine line
 *  (`SERVED state=… file=…`) followed by the human reason, and answers with the exit contract: a STALE
 *  transform is a violation (exit 1) so the caller can degrade its own verdict; an unreachable/unverifiable
 *  measurement is a tool error (exit 2), because missing evidence must never masquerade as a healthy stack. */
export async function runServedProbe(roots?: readonly string[], vitePort?: number): Promise<ExitCode> {
  const verdict = await probeServedTransform(roots, vitePort);
  print(`SERVED state=${verdict.state} file=${verdict.file ?? "none"}`);
  print(verdict.message);
  if (verdict.state === "fresh") {
    return EXIT.clean;
  }
  return verdict.state === "stale" ? EXIT.violations : EXIT.toolError;
}
