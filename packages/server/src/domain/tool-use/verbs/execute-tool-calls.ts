// verb: executeToolCalls — the ONE execute pipeline BOTH projections funnel through (tool-use-design/
// 01 §5): per call, in order — lookup → JSON.parse → the erased run-closure (zod safeParse → the
// can() ceiling → invoke; contract/results.ts erasure note) → the ONE stringify site → record.
// SEQUENTIAL by decision (02 §7: rpg's staged effects are order-dependent; the flip criterion is a
// real I/O-bound tool + measured latency — concurrency would land INSIDE here, zero contract change).
// NEVER throws for a per-call failure: every outcome is a `ToolCallRecord` (a denial/hallucinated
// name/bad args is a fact the MODEL reads and self-corrects on the recurse). `result` is ALWAYS a
// JSON document (chips `JSON.parse` unconditionally — 03 §4); stack traces never reach the model.

import type { ToolCallInput, ToolExecutionContext } from "../contract/params";
import type {
  RegisteredTool,
  ResolvedToolSet,
  RunOutcome,
  ToolCallRecord,
} from "../contract/results";
import type { ToolUseContext } from "../contract/service";
import { checkToolCapability } from "../substrate/capability";

interface CallOutcome {
  readonly result: string;
  readonly isError: boolean;
}

function errorOutcome(message: string): CallOutcome {
  return { result: JSON.stringify({ error: message }), isError: true };
}

// RunOutcome → the serialized record halves (the ONE stringify site for every error document).
function serializeOutcome(name: string, outcome: RunOutcome): CallOutcome {
  switch (outcome.kind) {
    case "invalid":
      return errorOutcome(`invalid arguments for ${name}: ${outcome.issues}`);
    case "denied":
      // The gate HELD; the denial is a policy fact the model should learn — data, not a dead turn.
      return errorOutcome(`not permitted: ${name}`);
    case "threw":
      return errorOutcome(outcome.message);
    case "result":
      return outcome.ok ? { result: outcome.value, isError: false } : errorOutcome(outcome.value);
    default: {
      const exhausted: never = outcome;
      throw new Error(`unhandled RunOutcome ${JSON.stringify(exhausted)}`);
    }
  }
}

async function runCall(
  ctx: ToolUseContext,
  entry: RegisteredTool,
  call: ToolCallInput,
  exec: ToolExecutionContext,
): Promise<CallOutcome> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(call.arguments);
  } catch {
    return errorOutcome(`malformed arguments (not JSON) for ${call.name}`);
  }
  const outcome = await entry.run(parsedJson, exec, () =>
    checkToolCapability(entry.capability, exec, ctx.can),
  );
  return serializeOutcome(call.name, outcome);
}

export function createExecuteToolCalls(
  ctx: ToolUseContext,
): (
  set: ResolvedToolSet,
  calls: readonly ToolCallInput[],
  exec: ToolExecutionContext,
) => Promise<readonly ToolCallRecord[]> {
  return async (set, calls, exec): Promise<readonly ToolCallRecord[]> => {
    const byName = new Map(set.entries.map((entry) => [entry.name, entry]));
    const records: ToolCallRecord[] = [];
    for (const call of calls) {
      const startedAt = ctx.clock();
      const entry = byName.get(call.name);
      let outcome: CallOutcome;
      if (entry === undefined) {
        outcome = errorOutcome(`unknown tool: ${call.name}`);
      } else {
        // SEQUENTIAL BY DESIGN (02 §7) — a call may depend on the previous call's staged effects.
        // biome-ignore lint/performance/noAwaitInLoops: emission-order sequencing is the invariant.
        outcome = await runCall(ctx, entry, call, exec);
      }
      records.push({
        // Provenance-faithful — verbatim from the input even when parse failed (01 §5 step 6).
        toolCallId: call.toolCallId,
        name: call.name,
        arguments: call.arguments,
        result: outcome.result,
        isError: outcome.isError,
        durationMs: ctx.clock() - startedAt,
      });
    }
    return records;
  };
}
