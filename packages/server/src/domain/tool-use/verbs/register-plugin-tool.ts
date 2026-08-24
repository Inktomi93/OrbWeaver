// verb: registerPluginTool — the RUNTIME registrar (D48 source (b)). A plugin's
// activation hands a guest-registered tool here; it lands in the ONE process registry (never a parallel
// plugin-tool map) and returns a deregistration handle the plugin's deactivation calls (no ghost tools).
// Three deltas from the compose-time `register` the landed shape forced:
//
//   (a) COLLISION IS ACTIVATION-FATAL, not boot-fatal — a runtime source can't be boot-fatal (nothing runs
//       at boot). A duplicate name throws `ToolNameCollisionError`, which the plugin activation catches and
//       treats as a contained activation failure (row → errored), never a process crash.
//   (b) The args schema is UNTRUSTED GUEST JSON Schema (a guest can't author zod). It is LIFTED to zod
//       host-side via `@orb/kit/json-schema` `liftJsonSchema` (PL-B — conservative-or-refuse: an unsupported
//       construct throws `JsonSchemaLiftError`, also activation-fatal), then the wire `parameters` is DERIVED
//       back through the SAME `projectJsonSchema` — zod stays the ONE representation (D79), no second schema.
//   (c) The ceiling runs as the INSTALLING principal (PL-C), not the turn caller: a plugin tool invoked in a
//       chat its installer is not a member of fails with errors-as-data (`denied`) — the model narrates, never
//       a cross-tenant read. It is a ROW READ of the installer's present role in THAT chat (the injected
//       `resolveInstallerRole`), not a `can()` verdict over the caller's roster — `can()` cannot express this
//       check, because the only roster in scope at invocation time belongs to the wrong principal. The guest
//       handler itself runs host-side under each host-fn's own installer gate, so the effects are
//       installer-bounded by construction; this belt is the invocation-time read/write ceiling.
//
// The guest handler returns a raw string that IS the tool result — it flows back verbatim (NOT
// re-JSON-stringified), so a guest that returns `JSON.stringify(...)` yields exactly that JSON to the model.

import type { InvocationChat } from "@orb/contracts/plugin";
import { errorMessage } from "@orb/kit/error-message";
import { liftJsonSchema, projectJsonSchema } from "@orb/kit/json-schema";
import { ToolNameCollisionError } from "../contract/errors.ts";
import type { PluginToolSpec, ToolExecutionContext } from "../contract/params.ts";
import { TOOL_NAME_RE } from "../contract/params.ts";
import type { PluginToolHandle, RegisteredTool, RunOutcome, ToolRegistry } from "../contract/results.ts";

/** Resolve the resident handler's invocation-chat scope, as the INSTALLING principal (PL-C). `"denied"` = the
 *  installer is not a present member of the exec chat (the tool call fails errors-as-data, never a cross-tenant
 *  read). Otherwise the admitted chat + whether the installer is HOST of it (`canWrite` — the membrane's write
 *  ceiling). `null` = a non-chat consumer (no chat scope for the guest handler).
 *
 *  THE PRINCIPAL IS THE WHOLE POINT: the role is re-read for the INSTALLER in THIS chat, never derived from
 *  `exec.roster` (documented as "the caller's loaded membership"). Reading the caller's roster made the read
 *  admission a no-op and set `canWrite` from the CALLER's host role — so a plugin installed by user A ran with
 *  host write authority inside user B's room whenever B's own turn called the tool. */
async function resolveInvocationChat(spec: PluginToolSpec, exec: ToolExecutionContext): Promise<InvocationChat | null | "denied"> {
  if (exec.chatId === null) {
    return null;
  }
  const role = await spec.resolveInstallerRole(exec.chatId);
  if (role === null) {
    return "denied";
  }
  // A resident tool runs INSIDE the turn that called it; v1 treats that as the cascade ROOT (automationDepth 0 —
  // a plugin `chat.requestTurn` from the tool stamps depth 1). The tool-exec context carries no turn depth yet, so
  // 0 is the honest floor (a future depth-aware exec context threads the executing turn's depth here).
  return { chatId: exec.chatId, canWrite: role === "host", automationDepth: 0 };
}

export function createRegisterPluginTool(registry: ToolRegistry): (spec: PluginToolSpec) => PluginToolHandle {
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
        // PL-C: the invocation ceiling runs as the INSTALLING principal — the installer must be a present
        // participant of the chat this tool runs in (a plugin never reads a room its owner can't see). The SAME
        // resolved role sets the guest handler's invocation-chat scope (membership admits it, host unlocks
        // `canWrite`). The turn CALLER's roster is irrelevant to this ceiling by construction.
        const chat = await resolveInvocationChat(spec, exec);
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
