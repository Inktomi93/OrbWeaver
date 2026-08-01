// The pure half of the built-in's fork CHOICE (`hooks/use-preset-autosave.ts`): which fork a "keep editing"
// lands on, and what a "start a new fork" is called before the owner edits the suggestion.
//
// Editing the built-in default is copy-on-write server-side. The FIRST time there is nothing to forget, so it
// stays silent; once the owner already has a fork, a silent second edit is a fork they can't find (or a
// convergence that quietly reopens one they'd moved on from), so the editor asks first. The "keep editing"
// arm must name — and target — exactly the row the server's `converge` intent would pick, or the dialog lies:
// `findConvergenceFork` mirrors `persistence/queries.ts#findOwnedForkOf` (the OLDEST fork by `createdAt`,
// ties broken by id) rather than trusting the list's own ordering.

/** The minimal `PresetSummary` shape these two need (tRPC-inferred at the call site). */
export interface PresetForkRow {
  readonly id: string;
  readonly name: string;
  readonly forkedFrom: string | null;
  readonly createdAt: number;
}

/** The caller's OLDEST fork of `sourceId` — the row a `converge` intent would land on — or null when they
 *  have none (the silent copy-on-write case). */
export function findConvergenceFork<Row extends PresetForkRow>(rows: readonly Row[], sourceId: string): Row | null {
  let oldest: Row | null = null;
  for (const row of rows) {
    if (row.forkedFrom !== sourceId) {
      continue;
    }
    if (oldest === null || row.createdAt < oldest.createdAt || (row.createdAt === oldest.createdAt && row.id < oldest.id)) {
      oldest = row;
    }
  }
  return oldest;
}

/** The pre-filled name for a NEW fork: `"<source> fork <n>"`, where n counts the fork this would BE (one
 *  existing fork ⇒ "Default fork 2"), bumped past any name the owner already uses so the suggestion is never
 *  one the server would have to de-collide behind their back (`substrate/names.ts`). */
export function suggestForkName(sourceName: string, existingForkCount: number, takenNames: readonly string[]): string {
  const taken = new Set(takenNames);
  let ordinal = existingForkCount + 1;
  while (taken.has(`${sourceName} fork ${ordinal}`)) {
    ordinal += 1;
  }
  return `${sourceName} fork ${ordinal}`;
}
