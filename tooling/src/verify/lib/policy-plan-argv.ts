// The argv front of the final-policy planner: parse the command and resolve its scope, then plan it.
import type { PolicyPlannerInput, PolicyPlanningResult } from "../contract/policy-plan.ts";
import type { ResourceHostOptions } from "../contract/resource-host.ts";
import { parsePolicyCommand } from "./policy-command.ts";
import { planningToolError, planPolicyCommand } from "./policy-plan.ts";
import { resolvePolicyScope } from "./policy-scope.ts";

/** Parse argv and resolve its six-kind scope before producing the single final-policy command plan. */
export interface PolicyArgvOptions extends Omit<ResourceHostOptions, "root"> {
  readonly applicationPaths?: readonly string[];
  /** Exact files from the structure pass's own workspace, consulted only for whole scope at a standalone
   *  non-Git fixture root. A real repository always retains its Git-authored inventory. */
  readonly wholeWorkspacePaths?: () => readonly string[];
  /** Lazy so list/explain and parse refusals do not build the execution Project. */
  readonly executionWorkspacePaths?: () => readonly string[];
  readonly deferResourceFailuresToExecution?: boolean;
}

export function planPolicyArgv(
  root: string,
  argv: readonly string[],
  corpus: PolicyPlannerInput["corpus"],
  options: PolicyArgvOptions = {},
): PolicyPlanningResult {
  const parsed = parsePolicyCommand(argv);
  if (!parsed.ok) {
    return parsed;
  }
  try {
    const { wholeWorkspacePaths, executionWorkspacePaths, deferResourceFailuresToExecution, applicationPaths, ...resourceOptions } = options;
    const scope =
      parsed.request.mode === "run"
        ? resolvePolicyScope(root, parsed.request.scope, wholeWorkspacePaths === undefined ? {} : { wholeWorkspacePaths })
        : undefined;
    return planPolicyCommand({
      request: parsed.request,
      ...(applicationPaths === undefined ? {} : { applicationPaths }),
      corpus,
      ...(scope === undefined ? {} : { scope }),
      resourceOptions: { root, ...resourceOptions },
      ...(parsed.request.mode === "run" && executionWorkspacePaths !== undefined ? { executionWorkspacePaths: executionWorkspacePaths() } : {}),
      ...(deferResourceFailuresToExecution === undefined ? {} : { deferResourceFailuresToExecution }),
    });
  } catch (error) {
    return planningToolError(error instanceof Error ? error.message : String(error));
  }
}
