// THE WHOLE-PROJECT READ CONTEXT — root, the ONE shared ts-morph workspace, and the source files it
// resolved. Minted at #2176 Phase F (2026-09-14) out of the legacy `GateRunCtx`'s three surviving fields:
// the descriptor contract retired with `lib/pass.ts`, but the real-tree entrypoints that used to build a
// run context still need one shared workspace read (`ops/structure.ts`, `ops/scoped.ts`,
// `ops/gen/caught-failure-population.ts` and the repo-int suites that drive a policy pass by hand).
//
// It carries NO `scope` and NO `checker`: the final dispatcher resolves its own population from
// `requestedPaths` and acquires the checker through the policy context, so re-exposing either here would
// be a second spelling of a decision `lib/policy-pass.ts` already owns.
import type { Project, SourceFile } from "ts-morph";

export interface ProjectContext {
  readonly root: string;
  /** The ONE shared workspace (`_shared/ts-workspace.ts#getWorkspace`) — never a per-caller Project. */
  readonly project: Project;
  /** Every source file that workspace resolved, read once. */
  readonly files: readonly SourceFile[];
}
