// Reviewed grants: test-reach — server domain verbs. Each row is a module no test reached when the reach rule replaced
// the file mirror (docs/law/Spine-Testing.md §5); the burn-down is docs/work item 915. Delete a row when a test
// reaches its module; central liveness reds a row whose module is reached.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_TEST_REACH_VERBS: readonly ReviewedGateGrant[] = [];
