// The cross-domain joint-batch ops the ledger rules, by ruling, each with the domain that builds it. An op is the
// member or the type that names it, as D337's table writes it. tests/tooling/unwired/ruled-ops.test.ts holds the D337 group equal to that table and
// the D259 group to D337's citation; a handle pass no entry names reports as `db-handle-review`.

export const JOINT_BATCH_RULINGS = [
  {
    ruling: "D337",
    citation: "D337 (the owner builds the statement and the consumer's batch places it)",
    ops: [
      { owner: "sessions", op: "localUserInsertStatement" },
      { owner: "sessions", op: "revokeAllForUserStatement" },
      { owner: "sessions", op: "linkExternalIdStatement" },
      { owner: "stats", op: "StatsBatchWiring" },
      { owner: "chat", op: "emptyMemoryScope" },
      { owner: "rpg", op: "planGameBirth" },
      { owner: "rpg", op: "handoffHealStatements" },
      { owner: "embeddings", op: "restampHandoffDigests" },
      { owner: "world-info", op: "copyHandoffBooks" },
      { owner: "regex", op: "copyHandoffRegexScripts" },
      { owner: "rpg", op: "rpgRestoreStatement" },
      { owner: "chat", op: "NotificationsEmitOp" },
      { owner: "chat", op: "claimStatement" },
    ],
  },
  {
    ruling: "D259",
    citation: "D259 (a signup invite mints the account, persona and seat in one gated batch)",
    ops: [
      { owner: "sessions", op: "signupUserStatement" },
      { owner: "persona", op: "signupPersonaStatement" },
      { owner: "settings", op: "signupPersonaPointersStatement" },
      { owner: "sessions", op: "PendingSignupStatements" },
    ],
  },
] as const;

const CITATION_OF: ReadonlyMap<string, string> = new Map(
  JOINT_BATCH_RULINGS.flatMap(({ citation, ops }) => ops.map(({ owner, op }) => [`${owner}|${op}`, citation] as const)),
);

/** The citation of the ruling that names one of `keys` (an op member, a type naming the op, or `Owner.op`) as built
 *  by one of `domains`, the domains the handle crosses between; null when none does. */
export function jointBatchRulingOf(keys: Iterable<string>, domains: Iterable<string | null>): string | null {
  const owners = [...domains].filter((domain) => domain !== null);
  for (const key of keys) {
    const op = key.slice(key.lastIndexOf(".") + 1);
    const citation = owners.map((owner) => CITATION_OF.get(`${owner}|${op}`)).find((found) => found !== undefined);
    if (citation !== undefined) {
      return citation;
    }
  }
  return null;
}
