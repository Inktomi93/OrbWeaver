// verb: register — compose-time only insertion into the one process-lifetime registry Map. Collision or
// a bad name throws (boot-fatal, never last-write-wins). The JSON-schema projection is computed here,
// once, and cached on the entry. The typed def is erased into a RegisteredTool whose fused run-closure
// keeps parsed.data: A inside the generic scope (zero casts).

import { errorMessage } from "@orb/kit/error-message";
import { DomainForbiddenError } from "@orb/kit/errors";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { ToolNameCollisionError } from "../contract/errors.ts";
import type { ToolDefinition, ToolExecutionContext } from "../contract/params.ts";
import { TOOL_NAME_RE } from "../contract/params.ts";
import type { RegisteredTool, RunOutcome, ToolRegistry } from "../contract/results.ts";
import { toolRegistryKey } from "../substrate/partition.ts";

// Fused so the typed pair never escapes: parse → gate → invoke.
function eraseDefinition<A>(def: ToolDefinition<A>): RegisteredTool {
  // Function-calling args are ALWAYS an object; the MCP projection needs the raw shape (the SDK's tool()
  // takes a shape, not JSON Schema). A non-object schema is a wiring bug — boot-fatal, like a bad name.
  if (!(def.argsSchema instanceof z.ZodObject)) {
    throw new ToolNameCollisionError(`${def.name} (invalid — argsSchema must be a z.object for the MCP projection)`);
  }
  return {
    name: def.name,
    description: def.description,
    capability: def.capability,
    source: def.source,
    // A compose-time definition is a BUILD ARTIFACT — it belongs to the process, not to a user. `null` is
    // therefore the honest owner, and it is also what makes a builtin un-direct-drivable by construction
    // (`substrate/reachability.ts`): no `UserId` equals null.
    owner: null,
    parameters: projectJsonSchema(def.argsSchema),
    argShape: def.argsSchema.shape,
    run: async (parsedJson: unknown, exec: ToolExecutionContext, gate: () => void): Promise<RunOutcome> => {
      const parsed = def.argsSchema.safeParse(parsedJson);
      if (!parsed.success) {
        // The zod issue summary IS the correction surface — the model reads it against its own schema.
        const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
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
      // @orb-waive caught-failure-ownership(err): errors-as-data — a thrown handler failure
      // becomes the `"threw"` `RunOutcome` arm, which `serializeOutcome` (execute-tool-calls.ts) turns into
      // an error-outcome the model reads and can retry, mirroring the sibling `denied`/`invalid` arms. Ends
      // if a handler throw needs to abort the whole tool round instead of failing just this call.
      try {
        const result = await def.handler(parsed.data, exec);
        outcome = result.ok ? { kind: "result", ok: true, value: JSON.stringify(result.value) } : { kind: "result", ok: false, value: result.error };
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
      throw new ToolNameCollisionError(`${def.name} (invalid — must match OpenAI∩MCP name charset ${TOOL_NAME_RE.source})`);
    }
    // The FIRST-PARTY partition (owner `null`) — one shelf for the whole process, so this collision check is
    // still global over builtins. It cannot see a plugin entry, and does not need to: this verb is compose-time
    // only, which runs before any activation, and the runtime registrar refuses a name a builtin already holds
    // (`register-plugin-tool.ts`). The two partitions therefore never hold the same name.
    const key = toolRegistryKey(null, def.name);
    if (registry.has(key)) {
      throw new ToolNameCollisionError(def.name);
    }
    registry.set(key, eraseDefinition(def));
  };
}
