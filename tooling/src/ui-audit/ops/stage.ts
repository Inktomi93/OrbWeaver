// The I/O half of design-audit's isolated-stage mode (#678): resolve the ref, boot-or-reuse the stage,
// point the audit's base URL at it. The verdicts/copy are pure in lib/stage-request.ts.
//
// ONE HOME, ENTERED THROUGH THE FRONT DOOR: the stage itself (worktree, ports, band ownership marker, db
// seed, teardown) is snap's — `docs/architecture/core/Core-Tooling-Law.md` §2.4 classified it snap-specific when snap
// was its only consumer, and that ruling SURVIVES; its input changed (a second consumer arrived), which the
// front-door law already has an answer for (§4.2: a sibling tool enters through `index.ts`). So this module
// imports `ensureStage`/`tryResolveRef` from `../../snap/index.ts` rather than re-homing four modules and
// their gate rows — and stage ADMIN (`--stage-status`/`--stage-down`/`--stage-sweep`) is deliberately NOT
// mirrored here: one band, one lifecycle owner.
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { ensureStage, tryResolveRef } from "../../snap/index.ts";
import type { Args } from "../contract/types.ts";
import { COLD_STAGE_REFUSAL, STAGE_DB_NOTE, STAGE_WARMUP_NOTE, stageBootedByThisRun, stageBootRefusal, unknownRefRefusal } from "../lib/stage-request.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

/** Boot-or-reuse the isolated stage and repoint `opts.base` at it. Returns an EXIT code when the run must
 *  STOP (and no audit has happened), or null to proceed:
 *   • an unresolvable `--ref` is CLI MISUSE (3) — refused before any git worktree/install/boot work, and
 *     emphatically before a browser, because the silent alternative audits the DEV STACK and files the rows
 *     under the ref's name (the #678 defect class in miniature);
 *   • a stage that will not boot is an INSTRUMENT failure (2) — never a finding, never a fallback audit.
 *  Both notes print BEFORE the run so a pasted receipt carries the db-provenance and cold-stage caveats. */
export function configureAuditStage(opts: Args): number | null {
  if (!opts.isolated) {
    return null;
  }
  if (!opts.dirty) {
    const ref = opts.ref ?? "HEAD";
    if (tryResolveRef(ref) === null) {
      print(unknownRefRefusal(ref));
      return EXIT.misuse;
    }
  }
  print(STAGE_DB_NOTE);
  print(STAGE_WARMUP_NOTE);
  const beforeEnsureMs = Date.now();
  // @orb-gate-ignore caught-failure-ownership(empty:error): the stage boot failure is printed via stageBootRefusal and returned as EXIT.toolError — propagated through both the message and the exit code. Ends if either is dropped.
  try {
    const stage = opts.dirty
      ? ensureStage({ fresh: opts.fresh, dirty: true })
      : ensureStage(opts.ref === null ? { fresh: opts.fresh } : { ref: opts.ref, fresh: opts.fresh });
    opts.base = stage.baseUrl;
    opts.stageShortSha = stage.shortSha;
    // The stage is now UP and stays warm for the next call — but this call cannot believe it (see
    // COLD_STAGE_REFUSAL's measured receipt), so it refuses instead of publishing a partial census.
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
