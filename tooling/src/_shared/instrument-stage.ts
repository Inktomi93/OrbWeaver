export interface StageRequest {
  readonly isolated: boolean;
  readonly dirty: boolean;
  readonly ref: string | null;
  readonly baseExplicit: boolean;
  readonly session: string | null;
}

export const STAGE_DB_NOTE = "STAGE DB      the stage serves its OWN db copy; verify its provenance before treating corpus-dependent output as a verdict.";
export const STAGE_WARMUP_NOTE = "STAGE WARMUP  the FIRST run at a new sha is not a verdict; this run boots the stage and then REFUSES. Re-run once warm.";
export const COLD_STAGE_REFUSAL = "COLD STAGE    this run booted the stage; no verdict was printed. Re-run the same command against the now-warm stage.";

export function stageArgErrors(args: StageRequest): string[] {
  const errors: string[] = [];
  if (args.isolated && args.baseExplicit) {
    errors.push("--base and --isolated/--ref/--dirty both name WHERE to audit — pass one (the stage supplies its own base URL)");
  }
  if (args.dirty && args.ref !== null) {
    errors.push("--dirty stages the WORKING TREE and --ref stages a commit — pass one");
  }
  if (args.session !== null && args.isolated) {
    errors.push("--session attaches to a live session's browser; --isolated/--ref/--dirty/--fresh boot a stage — pass one");
  }
  return errors;
}

export function stageBootedByThisRun(startedAtIso: string, beforeEnsureMs: number): boolean {
  const startedMs = Date.parse(startedAtIso);
  return Number.isNaN(startedMs) ? false : startedMs >= beforeEnsureMs;
}

export function unknownRefRefusal(ref: string): string {
  return `REF REFUSED   git cannot resolve ${JSON.stringify(ref)} to a commit in this checkout — no run was made.`;
}

export function stageBootRefusal(reason: string): string {
  return `STAGE ERROR   ${reason}\n              no run was made — stage admin lives on snap: pnpm snap --stage-status / --stage-down / --stage-sweep.`;
}

export function stageLabel(stageShortSha: string | null): string {
  return stageShortSha ?? "live";
}
