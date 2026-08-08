// domain/refinery — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The stage ENGINE
// (`createExecuteStage`) is built once and threaded into `runStage` (isRefinement:false) and `iterate`
// (twice per round) — verb-to-verb value deps wire HERE, never sideways (the discovery AnalyzeDeps
// precedent).

import type { RefineryContext } from "./context.ts";
import type { RefineryService } from "./contract/service.ts";
import { createApplyFields } from "./verbs/apply-fields.ts";
import { createDeleteSession } from "./verbs/delete-session.ts";
import { createGetSession } from "./verbs/get-session.ts";
import { createIterate } from "./verbs/iterate.ts";
import { createListRuns } from "./verbs/list-runs.ts";
import { createListSessions } from "./verbs/list-sessions.ts";
import { createExecuteStage, createRunStage } from "./verbs/run-stage.ts";
import { createStartSession } from "./verbs/start-session.ts";
import { createUpdateSession } from "./verbs/update-session.ts";

export function createRefineryService(ctx: RefineryContext): RefineryService {
  const engine = { executeStage: createExecuteStage(ctx) };
  return {
    startSession: createStartSession(ctx),
    getSession: createGetSession(ctx),
    listSessions: createListSessions(ctx),
    listRuns: createListRuns(ctx),
    updateSession: createUpdateSession(ctx),
    deleteSession: createDeleteSession(ctx),
    runStage: createRunStage(ctx, engine),
    iterate: createIterate(ctx, engine),
    applyFields: createApplyFields(ctx),
  };
}
