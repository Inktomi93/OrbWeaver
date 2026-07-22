// verb: registerPluginTool — the RUNTIME registrar (plugin-design PL-A; D48 source (b)). A plugin's
// activation hands a guest-registered tool here; it lands in the ONE process registry (never a parallel
// plugin-tool map) and returns a deregistration handle the plugin's deactivation calls (no ghost tools,
// 03 §5). Three deltas from the compose-time `register` the landed shape forced:
//
//   (a) COLLISION IS ACTIVATION-FATAL, not boot-fatal — a runtime source can't be boot-fatal (nothing runs
//       at boot). A duplicate name throws `ToolNameCollisionError`, which the plugin activation catches and
//       treats as a contained activation failure (row → errored), never a process crash (03 §5).
//   (b) The args schema is UNTRUSTED GUEST JSON Schema (a guest can't author zod). It is LIFTED to zod
//       host-side via `@orb/kit/json-schema` `liftJsonSchema` (PL-B — conservative-or-refuse: an unsupported
//       construct throws `JsonSchemaLiftError`, also activation-fatal), then the wire `parameters` is DERIVED
//       back through the SAME `projectJsonSchema` — zod stays the ONE representation (D79), no second schema.
//   (c) The ceiling runs as the INSTALLING principal (PL-C), not the turn caller: a plugin tool invoked in a
//       chat its installer can't read fails with errors-as-data (`denied`) — the model narrates, never a
//       cross-tenant read. The guest handler itself runs host-side under each host-fn's own installer gate,
//       so the effects are installer-bounded by construction; this belt is the invocation-time read ceiling.
//
// The guest handler returns a raw string that IS the tool result (03 §7) — it flows back verbatim (NOT
// re-JSON-stringified), so a guest that returns `JSON.stringify(...)` yields exactly that JSON to the model.

import type { Can, Principal } from "@orb/contracts/identity";
import type { InvocationChat } from "@orb/contracts/plugin";
import { errorMessage } from "@orb/kit/error-message";
import { liftJsonSchema, projectJsonSchema } from "@orb/kit/json-schema";
import { ToolNameCollisionError } from "../contract/errors";
import type { PluginToolSpec, ToolExecutionContext } from "../contract/params";
import { TOOL_NAME_RE } from "../contract/params";
import type { PluginToolHandle, RegisteredTool, RunOutcome, ToolRegistry } from "../contract/results";

const CHAT_READ = "read";
const CHAT_HOST = "host";

/** Resolve the resident handler's invocation-chat scope from the exec context, as the INSTALLING principal
 *  (PL-C). `"denied"` = the installer cannot read the exec chat (the tool call fails errors-as-data, never a
 *  cross-tenant read). Otherwise the admitted chat + whether the installer is HOST of it (`canWrite` — the
 *  membrane's write ceiling). `null` = a non-chat consumer (no chat scope for the guest handler). */
function resolveInvocationChat(can: Can, installer: Principal, exec: ToolExecutionContext): InvocationChat | null | "denied" {
  if (exec.chatId === null || exec.roster === null) {
    return null;
  }
  try {
    can(installer, CHAT_READ, { kind: "chat", roster: exec.roster });
  } catch {
    return "denied";
  }
  let canWrite = false;
  try {
    can(installer, CHAT_HOST, { kind: "chat", roster: exec.roster });
    canWrite = true;
  } catch {
    // Not host of this chat — read-only scope (the membrane refuses variable/lore/imagery writes).
  }
  // A resident tool runs INSIDE the turn that called it; v1 treats that as the cascade ROOT (automationDepth 0 —
  // a plugin `chat.requestTurn` from the tool stamps depth 1). The tool-exec context carries no turn depth yet, so
  // 0 is the honest floor (a future depth-aware exec context threads the executing turn's depth here).
  return { chatId: exec.chatId, canWrite, automationDepth: 0 };
}

export function createRegisterPluginTool(registry: ToolRegistry, can: Can): (spec: PluginToolSpec) => PluginToolHandle {
  return (spec: PluginToolSpec): PluginToolHandle => {
    if (!TOOL_NAME_RE.test(spec.name)) {
      throw new ToolNameCollisionError(`${spec.name} (invalid — must match the registry name charset ${TOOL_NAME_RE.source})`);
    }
    if (registry.has(spec.name)) {
      throw new ToolNameCollisionError(spec.name);
    }
    // Untrusted guest JSON Schema → zod (throws JsonSchemaLiftError on an unsupported construct — activation-fatal).
    const argsSchema = liftJsonSchema(spec.parameters);

    const registered: RegisteredTool = {
      name: spec.name,
      description: spec.description,
      // The turn-caller ceiling is null (member floor); the real ceiling is the PL-C installer gate in `run`.
      capability: null,
      source: "plugin",
      parameters: projectJsonSchema(argsSchema),
      argShape: argsSchema.shape,
      run: async (parsedJson, exec): Promise<RunOutcome> => {
        const parsed = argsSchema.safeParse(parsedJson);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
          return { kind: "invalid", issues };
        }
        // PL-C: the invocation ceiling runs as the INSTALLING principal — the installer must be a participant
        // of the chat this tool runs in (a plugin never reads a room its owner can't see). The SAME resolved
        // authority sets the guest handler's invocation-chat scope (read admits it, host unlocks `canWrite`).
        const chat = resolveInvocationChat(can, spec.installer, exec);
        if (chat === "denied") {
          return { kind: "denied" };
        }
        try {
          // The lifted-schema-parsed args cross to the guest as JSON; its string return IS the result verbatim.
          const result = await spec.invoke(JSON.stringify(parsed.data), chat);
          return { kind: "result", ok: true, value: result };
        } catch (err) {
          return { kind: "threw", message: errorMessage(err) };
        }
      },
    };
    registry.set(spec.name, registered);
    return {
      unregister: (): void => {
        registry.delete(spec.name);
      },
    };
  };
}
