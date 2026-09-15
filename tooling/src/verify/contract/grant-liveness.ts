// The coordinate shape the shared registry-liveness core (`lib/grant-liveness.ts`) hands back — its own
// home, so the four liveness policies that consume it do not reach the legacy `contract/gate.ts` for a
// finding shape (#2176 Phase F).
//
// IT IS A COORDINATE, NOT A VERDICT. `lib/grant-liveness.ts` is a pure reader: it derives WHERE a dead
// grant sits and WHAT text names it, and the calling policy is what turns that into a report through
// `ctx.report.file`. Keeping the shape here rather than borrowing `contract/gate.ts#Finding` is the same
// call `contract/tier-home.ts` records for the tier tables: the legacy contract is being deleted, and a
// shared reader's return type is not a reason to keep it alive.

/** One located dead-grant coordinate. `line`/`column` are 1-based FROM THE SOURCE, `0` for a verdict that
 *  is genuinely file-level (a registry row with no readable source line). `token` is the exact offending
 *  lexeme — the dead path, the dead pattern, or the budget pair — which is what a reader jumps to. */
export interface GrantFinding {
  /** Repo-relative, posix — the config file the row was declared in. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** The offending lexeme: the dead path / pattern / budget pair. */
  readonly token?: string;
  /** The per-occurrence reason. Present on every row this core emits, because one call site produces
   *  several distinct arms and the calling policy prints one group header for all of them. */
  readonly message?: string;
}
