// verb: executeToolCalls — the one execute pipeline both projections funnel through: per call, lookup →
// JSON.parse → the erased run-closure (safeParse → can() ceiling → invoke) → the one stringify site → record.
// Sequential by design (staged effects are order-dependent). Never throws for a per-call failure — every
// outcome is a ToolCallRecord the model reads and self-corrects on; result is always a JSON document.

import type { ToolUseContext } from "../context";
import type { ToolCallInput, ToolExecutionContext } from "../contract/params";
import type {
  RegisteredTool,
  ResolvedToolSet,
  RunOutcome,
  ToolCallRecord,
} from "../contract/results";
import { checkToolCapability } from "../substrate/capability";

interface CallOutcome {
  readonly result: string;
  readonly isError: boolean;
}

function errorOutcome(message: string): CallOutcome {
  return { result: JSON.stringify({ error: message }), isError: true };
}

function serializeOutcome(name: string, outcome: RunOutcome): CallOutcome {
  switch (outcome.kind) {
    case "invalid":
      return errorOutcome(`invalid arguments for ${name}: ${outcome.issues}`);
    case "denied":
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
        // biome-ignore lint/performance/noAwaitInLoops: sequential by design — a call may depend on the previous call's staged effects.
        outcome = await runCall(ctx, entry, call, exec);
      }
      records.push({
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
