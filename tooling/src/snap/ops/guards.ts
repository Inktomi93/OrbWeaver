// Mode guards + destination resolve: the --file target (a local mock over file://), the file-mode
// refusals, and the --isolated stage gate — shared by the cli dispatcher and the scenario path.
import { existsSync } from "node:fs";
import { basename, extname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { errorMessage } from "@orb/kit/error-message";
import { routeSlug } from "../../_shared/artifact-naming.ts";
import { print } from "../../_shared/artifacts.ts";
import { buildUrl } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { StageRow } from "../contract/stage.ts";
import type { Args } from "../contract/types.ts";
import { registerSnapStageProvenance } from "../lib/run-provenance.ts";
import { STAGE_USE_HEARTBEAT_MS } from "../lib/stage-bands.ts";
import { stageRowBaseUrl } from "../lib/stage-plan.ts";
import { ensureStage } from "./stage.ts";
import { repoRoot } from "./stage-git.ts";
import { holdStageUse, markerRoot } from "./stage-marker.ts";
import { stageStatus, sweepStages, teardownStage } from "./stage-status.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// --file: resolve the (possibly relative) path to an absolute one + its file:// URL + the default artifact
// slug (the file's basename, so `--file …/config-rail/workspace.html` writes reports/snaps/workspace.png).
// A relative path resolves against the CWD the operator typed it in — `pnpm snap --file reports/mocks/…`
// from the repo root is the documented shape.
interface FileTarget {
  readonly path: string;
  readonly url: string;
  readonly slug: string;
}
function fileTarget(pathArg: string): FileTarget {
  const abs = isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
  return { path: abs, url: pathToFileURL(abs).href, slug: routeSlug(basename(abs, extname(abs))) };
}

// WHERE this run navigates + what its artifacts are called: a local file (--file) or a route on the base
// URL. Split out of snap() so the file/route fork lives in one named place (and snap() stays under the
// cognitive-complexity gate).
export function snapDestination(opts: Args): { readonly url: string; readonly name: string } {
  if (opts.file !== null) {
    const target = fileTarget(opts.file);
    return { url: target.url, name: opts.out ?? target.slug };
  }
  return { url: buildUrl(opts.base, opts.route), name: opts.out ?? routeSlug(opts.route) };
}

// `--file` is a static-mock mode: it cannot mean anything alongside a stack-serving mode (an isolated stage
// or the fixture's authenticated contexts), and a static file has no `__orb` bridge for the nav flags. Refuse
// with the reason + the remedy rather than snapping something the caller didn't ask for.
export function refuseFileMode(opts: Args): string | null {
  if (opts.file === null) {
    return null;
  }
  if (!existsSync(fileTarget(opts.file).path)) {
    return `FILE REFUSED  no such file: ${fileTarget(opts.file).path} — pass a path relative to the CWD or an absolute one`;
  }
  if (opts.isolated) {
    return "FILE REFUSED  --file renders a local file over file://; --isolated/--dirty/--ref boot a stack to serve a ROUTE — drive one at a time";
  }
  if (opts.contexts > 1 || opts.as !== null) {
    return "FILE REFUSED  --file has no server to authenticate against — drop --contexts/--as (a static mock has no users)";
  }
  if (opts.actions.some((entry) => entry.type === "nav")) {
    return "FILE REFUSED  --goto/--open-chat/--open-character/--context-tab drive the app's __orb nav bridge; a static file has none — drop them (--click/--fill still work)";
  }
  if (opts.appearance !== null) {
    return "FILE REFUSED  --appearance/--appearance-preset/--full-motion shim the app's settings response; a static file makes no such request — drop them (a mock states its own appearance)";
  }
  if (opts.theme !== null) {
    return "FILE REFUSED  --theme shims the app's settings response; a static file makes no such request — drop it (a mock states its own theme)";
  }
  if (opts.matrix) {
    return "FILE REFUSED  --matrix derives Appearance axes and theme capabilities from the live app bridge; a static file has neither — drive an app route";
  }
  return null;
}

function stageControlResult(opts: Args): number | null {
  if (opts.stageStatus) {
    print(stageStatus());
    return 0;
  }
  if (opts.stageDown) {
    print(`[snap-stage] ${teardownStage({ force: opts.force, owner: opts.stageOwner })}`);
    return 0;
  }
  if (opts.stageSweep) {
    print(`[snap-stage] ${sweepStages()}`);
    return 0;
  }
  return null;
}

function registerLiveProvenance(opts: Args): void {
  registerSnapStageProvenance({
    mode: "live",
    state: "not-applicable",
    ownerCheckout: null,
    band: null,
    ref: null,
    binding: opts.file === null ? { kind: "base", url: opts.base } : { kind: "file", url: snapDestination(opts).url },
    failure: null,
  });
}

/** Boot or reuse this run's stage and point the run at it. A `local` stage is also the multi-human fixture
 *  for the run, so `--contexts`/`--as` log in against it unless the caller named another fixture. */
function bindIsolatedStage(opts: Args): StageRow {
  const auth = opts.stageAuth;
  const stage = opts.dirty
    ? ensureStage({ fresh: opts.fresh, dirty: true, auth })
    : ensureStage(opts.ref === null ? { fresh: opts.fresh, auth } : { ref: opts.ref, fresh: opts.fresh, auth });
  opts.base = stageRowBaseUrl(stage);
  // Held for the process's life: a one-shot run and a session daemon both read the stage until they exit.
  holdStageUse(markerRoot(repoRoot()), stage.band, repoRoot(), STAGE_USE_HEARTBEAT_MS);
  if (auth === "local") {
    opts.fixtureServer ??= `http://127.0.0.1:${String(stage.serverPort)}`;
    opts.fixtureBase ??= opts.base;
  }
  return stage;
}

export function configureStage(opts: Args): number | null {
  const control = stageControlResult(opts);
  if (control !== null) {
    return control;
  }
  if (opts.isolated) {
    // @orb-waive caught-failure-ownership(e): printed as STAGE ERROR and returned as exit code 1, which the CLI process exits with. Ends if that exit code stops being surfaced.
    try {
      const stage = bindIsolatedStage(opts);
      registerSnapStageProvenance({
        mode: "isolated",
        state: "bound",
        ownerCheckout: stage.checkout,
        band: stage.band,
        ref: stage.sha,
        binding: { kind: "stage", url: opts.base },
        failure: null,
      });
    } catch (e) {
      registerSnapStageProvenance({
        mode: "isolated",
        state: "unavailable",
        ownerCheckout: null,
        band: null,
        ref: opts.dirty ? "dirty-working-tree" : (opts.ref ?? "HEAD"),
        binding: null,
        failure: errorMessage(e),
      });
      print(`STAGE ERROR: ${errorMessage(e)}`);
      return 1;
    }
  } else {
    registerLiveProvenance(opts);
  }
  return null;
}
