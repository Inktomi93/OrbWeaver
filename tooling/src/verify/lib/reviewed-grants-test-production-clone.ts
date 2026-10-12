// Reviewed grants: test-production-clone. Each row is a test-tree function the gate found with the shape of an exported
// production function when it landed (docs/law/Spine-Testing.md §10). Delete a row when the test calls production;
// central liveness reds a row whose copy is gone. A new copy calls production instead of taking a row.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const POLICY = "test-production-clone";

/** One grant per `[subject, operation]`; the operation names the copy and its first production twin. */
function cloneGrants(rows: readonly (readonly [string, string])[]): readonly ReviewedGateGrant[] {
  return rows.map(([subject, operation]) => ({
    id: `${POLICY}:${subject}#${operation}`,
    policyId: POLICY,
    subject,
    operation,
    why: `${subject} re-declared the body of an exported production function when the gate landed, so it keeps passing when that rule changes.`,
    endsWhen: "the test imports and calls the production function (burn-down: docs/work item 890); this row then consumes nothing and reds stale.",
  }));
}

export const REVIEWED_GRANTS_TEST_PRODUCTION_CLONE: readonly ReviewedGateGrant[] = cloneGrants([
  ["tests/db/client.int.test.ts", "copies:digest=packages/server/src/primitives/content-hash/index.ts#sha256Hex"],
  ["tests/db/client.int.test.ts", "copies:sha256=packages/server/src/primitives/content-hash/index.ts#sha256Hex"],
  ["tests/default-content/embeddings.test.ts", "copies:hash=packages/server/src/primitives/content-hash/index.ts#sha256Hex"],
  ["tests/default-content/index.test.ts", "copies:sha256=packages/server/src/primitives/content-hash/index.ts#sha256Hex"],
  ["tests/inference/backends/anthropic-messages/chat.test.ts", "copies:isRecord=packages/kit/src/guards/index.ts#isPlainObject"],
  ["tests/inference/backends/local-light/_stub-model-cache.ts", "copies:holdThread=tooling/src/snap/ops/stage-marker.ts#waitSync"],
  ["tests/inference/capability/synthesize.test.ts", "copies:generationOf=packages/contracts/src/inference/capability/reads.ts#requireGenerationCapability"],
  [
    "tests/inference/resolve/resolve-task.suite.test.ts",
    "copies:generationOf=packages/contracts/src/inference/capability/reads.ts#requireGenerationCapability",
  ],
  ["tests/server/domain/assets/verbs/backfill-avatars.int.test.ts", "copies:sha256=packages/server/src/primitives/content-hash/index.ts#sha256Hex"],
  ["tests/server/domain/import/substrate/persona-review.test.ts", "copies:sha256=packages/server/src/primitives/content-hash/index.ts#sha256Hex"],
  ["tests/server/domain/rpg/stale-actor-key.suite.int.test.ts", "copies:poison=packages/server/src/domain/rpg/persistence/snapshots.ts#updateSnapshotState"],
  ["tests/server/entry/boot/seed-read-back.suite.int.test.ts", "copies:isRecord=packages/kit/src/guards/index.ts#isPlainObject"],
  ["tests/server/infra/plugin-host/_platform-proof.ts", "copies:finiteNumber=tooling/src/snap/lib/react-profile-trace.ts#numberOf"],
  ["tests/server/infra/plugin-host/broker-supervision.suite.test.ts", "copies:isAlive=tooling/src/floor/artifacts/run-retention.ts#pidAlive"],
  ["tests/server/infra/relay/binary.test.ts", "copies:sha256=packages/server/src/primitives/content-hash/index.ts#sha256Hex"],
  ["tests/server/infra/storage/cas.int.test.ts", "copies:sha256Hex=packages/server/src/primitives/content-hash/index.ts#sha256Hex"],
  ["tests/tooling/floor/browser/browser-run-marker.suite.int.test.ts", "copies:aliveNow=tooling/src/floor/artifacts/run-retention.ts#pidAlive"],
  ["tests/tooling/floor/devtools/devtools-assets.test.ts", "copies:sha256=packages/server/src/primitives/content-hash/index.ts#sha256Hex"],
  ["tests/tooling/floor/process/niced-exec.int.test.ts", "copies:isAlive=tooling/src/floor/artifacts/run-retention.ts#pidAlive"],
  ["tests/tooling/issue-form-guidance-integrity.test.ts", "copies:isRecord=packages/kit/src/guards/index.ts#isPlainObject"],
  ["tests/tooling/snap/ops/session-daemon.int.test.ts", "copies:pidAlive=tooling/src/floor/artifacts/run-retention.ts#pidAlive"],
  ["tests/tooling/snap/ops/stage-boot-dead.suite.int.test.ts", "copies:pidAlive=tooling/src/floor/artifacts/run-retention.ts#pidAlive"],
  ["tests/tooling/snap/ops/stage-death-control.suite.int.test.ts", "copies:pidAlive=tooling/src/floor/artifacts/run-retention.ts#pidAlive"],
  ["tests/tooling/snap/ops/stage-keeper.int.test.ts", "copies:pidAlive=tooling/src/floor/artifacts/run-retention.ts#pidAlive"],
  ["tests/ui/charts/_ct-stories.tsx", "copies:signedDelta=packages/client/src/features/stats/lib/analytics-view-model.ts#formatSignedDelta"],
]);
