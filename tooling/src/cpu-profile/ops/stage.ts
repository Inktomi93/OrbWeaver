import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import {
  COLD_STAGE_REFUSAL,
  STAGE_DB_NOTE,
  STAGE_WARMUP_NOTE,
  stageBootedByThisRun,
  stageBootRefusal,
  unknownRefRefusal,
} from "@orb/tooling/_shared/instrument-stage";
import { ensureStage, shortSha, stageRowBaseUrl, tryResolveRef } from "../../snap/index.ts";
import type { Args } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm perf-meter");

export function configureCpuProfileStage(opts: Args): number | null {
  if (!opts.isolated) {
    return null;
  }
  if (!opts.dirty && tryResolveRef(opts.ref ?? "HEAD") === null) {
    print(unknownRefRefusal(opts.ref ?? "HEAD"));
    return EXIT.misuse;
  }
  print(STAGE_DB_NOTE);
  print(STAGE_WARMUP_NOTE);
  const beforeEnsureMs = Date.now();
  // @orb-gate-ignore caught-failure-ownership(empty:error): stageBootRefusal prints the caught failure and this run exits toolError without launching a browser. Ends if the refusal stops carrying the error or the caller stops returning this exit.
  try {
    const stage = opts.dirty
      ? ensureStage({ fresh: opts.fresh, dirty: true })
      : ensureStage(opts.ref === null ? { fresh: opts.fresh } : { ref: opts.ref, fresh: opts.fresh });
    opts.base = stageRowBaseUrl(stage);
    opts.stageShortSha = shortSha(stage.sha);
    if (stageBootedByThisRun(stage.startedAt, beforeEnsureMs)) {
      print(COLD_STAGE_REFUSAL);
      return EXIT.toolError;
    }
  } catch (error) {
    print(stageBootRefusal(errorMessage(error)));
    return EXIT.toolError;
  }
  return null;
}
