// domain/refinery — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The stage ENGINE
// (`createExecuteStage`) is built once and threaded into `runStage` (isRefinement:false) and `iterate`
// (twice per round) — verb-to-verb value deps wire HERE, never sideways (the discovery AnalyzeDeps
// precedent).

import type { RefineryContext } from "./context.ts";
import type { RefineryService } from "./contract/service.ts";
import { createApplyAsCopy } from "./verbs/apply-as-copy.ts";
import { createApplyFields } from "./verbs/apply-fields.ts";
import { createCreateSchema } from "./verbs/create-schema.ts";
import { createDeleteSchema } from "./verbs/delete-schema.ts";
import { createDeleteSession } from "./verbs/delete-session.ts";
import { createGenerateSchema } from "./verbs/generate-schema.ts";
import { createGetSession } from "./verbs/get-session.ts";
import { createIterate } from "./verbs/iterate.ts";
import { createListRuns } from "./verbs/list-runs.ts";
import { createListSchemas } from "./verbs/list-schemas.ts";
import { createListSessions } from "./verbs/list-sessions.ts";
import { createPreflight } from "./verbs/preflight.ts";
import { createRefineSchema } from "./verbs/refine-schema.ts";
import { createExecuteStage, createRunStage } from "./verbs/run-stage.ts";
import { createStartSession } from "./verbs/start-session.ts";
import { createSubmitManualRewrite } from "./verbs/submit-manual-rewrite.ts";
import { createTestSchema } from "./verbs/test-schema.ts";
import { createUpdateSchema } from "./verbs/update-schema.ts";
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
    applyAsCopy: createApplyAsCopy(ctx),
    submitManualRewrite: createSubmitManualRewrite(ctx),
    preflight: createPreflight(ctx),
    listSchemas: createListSchemas(ctx),
    createSchema: createCreateSchema(ctx),
    updateSchema: createUpdateSchema(ctx),
    deleteSchema: createDeleteSchema(ctx),
    generateSchema: createGenerateSchema(ctx),
    refineSchema: createRefineSchema(ctx),
    testSchema: createTestSchema(ctx),
  };
}
