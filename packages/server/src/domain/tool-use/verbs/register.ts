// verb: register — compose-time ONLY insertion into the ONE process-lifetime registry Map
// (tool-use-design/01 §4; "in-memory per request" was corrected — rpg-design/05 §3's "registered once
// at compose" is the committed posture). Collision or a bad name THROWS (boot-fatal — the env-spine
// superRefine precedent; never last-write-wins). The JSON-schema projection is computed HERE, once,
// and cached on the entry (the wire schema can never drift from the parse schema). The typed def is
// ERASED into a `RegisteredTool` whose fused run-closure keeps `parsed.data: A` inside the generic
// scope (contract/results.ts erasure note — zero casts).

import { errorMessage } from "@orb/kit/error-message";
import { DomainForbiddenError } from "@orb/kit/errors";
import { ToolNameCollisionError } from "../contract/errors";
import type { ToolDefinition, ToolExecutionContext } from "../contract/params";
import { TOOL_NAME_RE } from "../contract/params";
import type { RegisteredTool, RunOutcome, ToolRegistry } from "../contract/results";
import { projectArgSchema } from "../substrate/json-schema";

// The 01 §5 steps 2/3/4, fused so the typed pair never escapes: parse → gate → invoke.
function eraseDefinition<A>(def: ToolDefinition<A>): RegisteredTool {
  return {
    name: def.name,
    description: def.description,
    capability: def.capability,
    source: def.source,
    parameters: projectArgSchema(def.argsSchema),
    run: async (
      parsedJson: unknown,
      exec: ToolExecutionContext,
      gate: () => void,
    ): Promise<RunOutcome> => {
      const parsed = def.argsSchema.safeParse(parsedJson);
      if (!parsed.success) {
        // The zod issue summary IS the correction surface — the model reads it against its own schema.
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        return { kind: "invalid", issues };
      }
      try {
        gate();
      } catch (err) {
        if (err instanceof DomainForbiddenError) {
          return { kind: "denied" };
        }
        throw err; // a non-policy throw from the gate is an infrastructure bug — propagate
      }
      let outcome: RunOutcome;
      try {
        const result = await def.handler(parsed.data, exec);
        outcome = result.ok
          ? { kind: "result", ok: true, value: JSON.stringify(result.value) }
          : { kind: "result", ok: false, value: result.error };
      } catch (err) {
        outcome = { kind: "threw", message: errorMessage(err) };
      }
      return outcome;
    },
  };
}

export function createRegister(registry: ToolRegistry): <A>(def: ToolDefinition<A>) => void {
  return <A>(def: ToolDefinition<A>): void => {
    if (!TOOL_NAME_RE.test(def.name)) {
      throw new ToolNameCollisionError(
        `${def.name} (invalid — must match OpenAI∩MCP name charset ${TOOL_NAME_RE.source})`,
      );
    }
    if (registry.has(def.name)) {
      throw new ToolNameCollisionError(def.name);
    }
    registry.set(def.name, eraseDefinition(def));
  };
}
