// The cross-domain joint-batch ops D337 names, one entry per op in its table. A test holds this tuple equal to the
// ADR's table, so an op absent from the table reports as `db-handle-review` in `pnpm unwired ports`.

export const RULED_JOINT_BATCH_OPS = [
  "localUserInsertStatement",
  "revokeAllForUserStatement",
  "linkExternalIdStatement",
  "StatsBatchWiring",
  "emptyMemoryScope",
  "planGameBirth",
  "handoffHealStatements",
  "restampHandoffDigests",
  "copyHandoffBooks",
  "copyHandoffRegexScripts",
  "rpgRestoreStatement",
] as const;

export const D337_RULING = "D337 (the owner builds the statement and the consumer's batch places it)";

const RULED: ReadonlySet<string> = new Set(RULED_JOINT_BATCH_OPS);

/** Whether a census key (`Owner.op`, an op name, or an imported type name) is one of D337's ruled ops. */
export const isRuledJointBatchOp = (key: string): boolean => RULED.has(key.slice(key.lastIndexOf(".") + 1));
