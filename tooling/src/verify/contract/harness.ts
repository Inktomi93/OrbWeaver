// `Violation` — the artifact's per-occurrence row — and `CheckContext`, the root+Project pair the
// standalone reconciliation stages take. `GateResult`, the legacy per-gate record, retired with the
// legacy dispatcher at #2176 Phase F (2026-09-14); the artifact's only row shape is now
// `contract/structure-report.ts#FinalPolicyRow`.
import type { Project } from "ts-morph";
import type { GateSeverity } from "./gate-authority.ts";

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
  /** The three fields a policy's effective finding carries beyond the `{file,line,message}` triple: the
   *  exact column and position token the central waiver engine bound, and the severity central authority
   *  stamped. Absent only on a HISTORICAL artifact read back by `check:show`. */
  readonly column?: number;
  readonly token?: string;
  readonly severity?: GateSeverity;
}

export interface CheckContext {
  readonly root: string;
  readonly project: Project;
}
