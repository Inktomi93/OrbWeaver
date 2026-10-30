// The cross-domain joint-batch ops the ledger rules, by ruling. An entry is an op member or the type that names the
// op, as D337's table writes it. A test holds the D337 group equal to that table and the D259 group to D337's
// citation; a handle pass that resolves to no entry reports as `db-handle-review` in `pnpm unwired ports`.

export const JOINT_BATCH_RULINGS = [
  {
    ruling: "D337",
    citation: "D337 (the owner builds the statement and the consumer's batch places it)",
    ops: [
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
      "NotificationsEmitOp",
      "claimStatement",
    ],
  },
  {
    ruling: "D259",
    citation: "D259 (a signup invite mints the account, persona and seat in one gated batch)",
    ops: ["signupUserStatement", "signupPersonaStatement", "signupPersonaPointersStatement", "PendingSignupStatements"],
  },
] as const;

const CITATION_OF: ReadonlyMap<string, string> = new Map(JOINT_BATCH_RULINGS.flatMap(({ citation, ops }) => ops.map((op) => [op, citation] as const)));

/** The citation of the ruling that names any of `keys` (an op member, a type naming the op, or `Owner.op`), or null. */
export function jointBatchRulingOf(keys: Iterable<string>): string | null {
  for (const key of keys) {
    const citation = CITATION_OF.get(key.slice(key.lastIndexOf(".") + 1));
    if (citation !== undefined) {
      return citation;
    }
  }
  return null;
}
