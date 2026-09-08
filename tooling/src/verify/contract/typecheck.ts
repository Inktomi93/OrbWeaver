// Unified native-program execution results. Discovery and compiler policy stay in their existing homes.
const TYPECHECK_PROGRAM_STATUSES = ["passed", "violations", "tool-error"] as const;
export type TypecheckProgramStatus = (typeof TYPECHECK_PROGRAM_STATUSES)[number];

export interface TypecheckProgramResult {
  readonly config: string;
  readonly status: TypecheckProgramStatus;
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface TypecheckExecutionResult {
  readonly discovered: number;
  readonly requested: readonly string[] | null;
  readonly skippedContainers: readonly string[];
  readonly programs: readonly TypecheckProgramResult[];
  readonly concurrency: number;
}
