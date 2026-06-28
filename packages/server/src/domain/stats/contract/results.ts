// domain/stats/contract/results — the write-substrate result shapes (the §7.4 one-home). The read service
// returns view types (contract/views.ts); the standalone write fns return these. Only `reconcileStats` has
// a structured result today (`applyStatsDelta` returns void — it appends to a batch).

/** What a full `reconcileStats` rebuild touched — the workload runner logs it; the drift test asserts it. */
export interface ReconcileStatsResult {
  owners: number;
  characters: number;
  days: number;
  models: number;
  computedAt: number;
}
