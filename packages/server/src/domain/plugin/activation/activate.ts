// domain/plugin/activation/activate — bring a plugin RESIDENT. Read the bundle bytes from the
// owner's CAS → re-parse (re-validated on load) → `createInstance` (realm setup + run `main.js` under the
// invocation budget) → collect registrations → hand each to its registrar op. ATOMIC: any failure (a corrupt
// stored bundle, a contained activation error, a registrar refusal such as a tool-name collision) discards the
// whole activation — the partial registrations are unregistered, the instance disposed, and the row lands
// `errored` + `last_error`. NEVER a partial activation. The host process is never fatal on guest
// behavior — a `main.js` throw is contained data (`ok:false`), not an exception.

import type { PluginInstance } from "@orb/contracts/plugin";
import { errorMessage } from "@orb/kit/error-message";
import type { PluginActivationScope, PluginInvokeHandler, PluginRegistrationHandle } from "../contract/ops.ts";
import type { ActivateInput, ActivateOutcome, CrashPolicy, PluginContext, PluginRegistry } from "../contract/service.ts";
import { setStatus } from "../persistence/plugins.ts";
import { buildPluginBridge } from "../substrate/bridge.ts";
import { parseBundle } from "../substrate/manifest.ts";

/** Hand every collected registration to its registrar op, collecting the deregistration handles. Each carries
 *  the per-activation {@link PluginActivationScope} (the manifest slug for namespacing + the installer for the
 *  PL-C ceiling). On the FIRST registrar refusal (a collision is activation-fatal) it unregisters its
 *  OWN partial set before rethrowing, so the throw leaves NO orphan registration (the caller then disposes). */
function register(ctx: PluginContext, instance: PluginInstance, invoke: PluginInvokeHandler, scope: PluginActivationScope): PluginRegistrationHandle[] {
  const handles: PluginRegistrationHandle[] = [];
  try {
    for (const tool of instance.tools) {
      handles.push(ctx.ops.registrar.registerTool(tool, invoke, scope));
    }
    for (const transform of instance.transforms) {
      handles.push(ctx.ops.registrar.registerTransform(transform, invoke, scope));
    }
    // Events aggregate into ONE subscriber per instance (declaredEvents = the union of collected types — the
    // fan-out's declared-match + one visibility read serve every handler); a plugin with no `events.on` registers
    // nothing.
    if (instance.events.length > 0) {
      handles.push(ctx.ops.registrar.subscribeEvent(instance.events, invoke, scope));
    }
  } catch (err) {
    for (const handle of handles) {
      handle.unregister();
    }
    throw err;
  }
  return handles;
}

export function createActivate(ctx: PluginContext, registry: PluginRegistry, crashPolicy: CrashPolicy): (input: ActivateInput) => Promise<ActivateOutcome> {
  return async (input: ActivateInput): Promise<ActivateOutcome> => {
    const { bytes } = await ctx.assets.readBytes(input.caller, input.bundleAssetId);
    let mainJs: string;
    let slug: string;
    let netHosts: readonly string[] | undefined;
    let matchAutomationEvents = false;
    try {
      const bundle = parseBundle(bytes);
      mainJs = bundle.mainJs;
      // The slug is DERIVED from the re-validated manifest (never guest-runtime-supplied) — the registrar
      // namespaces plugin tools `plugin_<slug'>_<name>` with it (PL-A).
      slug = bundle.manifest.id;
      // The `net.fetch` SSRF allowlist — forwarded from the RE-VALIDATED manifest (never guest-runtime-supplied)
      // so the infra host-fn pins `safeFetch` to it; absent ⇒ fail-closed `[]` (no host reachable) infra-side.
      netHosts = bundle.manifest.netHosts;
      // The cascade opt-in — DERIVED from the re-validated manifest, fail-closed `false` when absent.
      matchAutomationEvents = bundle.manifest.matchAutomationEvents ?? false;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await setStatus(ctx.db, input.pluginId, { status: "errored", lastError: `bundle re-validation failed: ${error}`, updatedAt: ctx.now() });
      return { ok: false, error };
    }

    // The membrane bridge is built PER INSTALLER (global-vars closes over the installer); an installed plugin's
    // `main.js` runs registration-only, so no chat is admitted for the activation run (chat: null). (The
    // per-plugin spend gate was stripped for enterprise spend enforcement; a runaway plugin's turns are
    // bounded by the engine's per-member turn RATE budget + the cascade-depth guard, and cost VISIBILITY rides
    // the stats domain.)
    const bridge = buildPluginBridge(ctx.ops, input.caller.userId, input.pluginId);
    const outcome = await ctx.host.createInstance({ mainJs, grants: input.grants, bridge, chat: null, ...(netHosts !== undefined ? { netHosts } : {}) });
    if (!outcome.ok) {
      await setStatus(ctx.db, input.pluginId, { status: "errored", lastError: outcome.error, updatedAt: ctx.now() });
      return { ok: false, error: outcome.error };
    }

    const { instance } = outcome;
    // The resident-tool invoke loop under the crash policy: a handler throw/deadline surfaces as
    // `ctx.host.invoke` REJECTING → bump the consecutive-crash counter (auto-disable + owner-notify at the
    // threshold) and RE-THROW so the tool-use registrar catches it as `threw` (errors-as-data to the model); a
    // clean run resets the counter. `chat` is the registrar-resolved invocation scope (read admits, host writes).
    const invoke: PluginInvokeHandler = async (handler, argsJson, chat) => {
      try {
        const result = await ctx.host.invoke(instance, handler, argsJson, chat);
        await crashPolicy.recordCleanRun(input.pluginId);
        return result;
      } catch (err) {
        await crashPolicy.recordCrash({ pluginId: input.pluginId, recipientUserId: input.caller.userId, error: errorMessage(err) });
        throw err;
      }
    };
    const scope: PluginActivationScope = { slug, installer: input.caller, matchAutomationEvents };
    let handles: PluginRegistrationHandle[];
    try {
      handles = register(ctx, instance, invoke, scope);
    } catch (err) {
      // Discard the partial activation: nothing this run registered survives, and the instance is disposed.
      ctx.host.dispose(instance);
      const error = err instanceof Error ? err.message : String(err);
      await setStatus(ctx.db, input.pluginId, { status: "errored", lastError: `registration failed: ${error}`, updatedAt: ctx.now() });
      return { ok: false, error };
    }

    registry.set(input.pluginId, { instance, handles });
    await setStatus(ctx.db, input.pluginId, { status: "enabled", lastError: null, updatedAt: ctx.now() });
    return { ok: true };
  };
}
