// domain/plugin/activation/activate — bring a plugin RESIDENT. Read the bundle bytes from the
// owner's CAS → re-parse (re-validated on load) → `createInstance` (realm setup + run `main.js` under the
// invocation budget) → collect registrations → hand each to its registrar op. ATOMIC: any failure (a corrupt
// stored bundle, a contained activation error, a registrar refusal such as a tool-name collision) discards the
// whole activation — the partial registrations are unregistered, the instance disposed, and the row lands
// `errored` + `last_error`. NEVER a partial activation. The host process is never fatal on guest
// behavior — a `main.js` throw is contained data (`ok:false`), not an exception.
//
// ORDER AT THE END IS LOAD-BEARING: the `enabled` row is written BEFORE the resident is published into the
// in-process registry, and a failed write discards the activation. The row is the record and the registry is
// a view of it; publishing the view first meant a rejected write left a live instance with live registrations
// behind a row that said `disabled`, and the owner's retry then built a SECOND instance next to it.

import type { ProviderDef } from "@orb/contracts/inference";
import type { PluginInstance } from "@orb/contracts/plugin";
import { errorMessage } from "@orb/kit/error-message";
import type { PluginActivationScope, PluginInvokeHandler, PluginRegistrationHandle } from "../contract/ops.ts";
import type { ActivateInput, ActivateOutcome, CrashPolicy, PluginContext, PluginProviderLifecycle, PluginRegistry } from "../contract/service.ts";
import { setStatus } from "../persistence/plugins.ts";
import { buildPluginBridge } from "../substrate/bridge.ts";
import { consentedNetHosts } from "../substrate/grants.ts";
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
    // U8 §5a — the private plugin-event subscriptions wire onto the INSTALLER-scoped resident bus (the events
    // pattern, one plane over); a plugin with no `pubsub.on` registers nothing, and the deregistration handle
    // drops exactly this plugin's subscriptions on deactivate.
    if (instance.pubsub.length > 0) {
      handles.push(ctx.ops.registrar.subscribePubsub(instance.pubsub, invoke, scope));
    }
    // Macros aggregate the same way (ONE registry entry per plugin — the per-plugin ceiling and the per-turn
    // read are both per-plugin); a plugin with no `macros.register` registers nothing. DISPLAY transforms have
    // no registrar at all: like surfaces, they are read off the resident instance by their own verb.
    if (instance.macros.length > 0) {
      handles.push(ctx.ops.registrar.registerMacros(instance.macros, invoke, scope));
    }
  } catch (err) {
    for (const handle of handles) {
      handle.unregister();
    }
    throw err;
  }
  return handles;
}

/** Throw away everything one activation attempt built: every registration this run made goes (no ghost tool
 *  stays callable) and the guest instance is disposed. The ONE spelling of "this activation did not happen",
 *  shared by the registrar-refusal arm and the failed-status-write arm — two rollbacks written twice is how
 *  one of them ends up forgetting the handles. */
function discardActivation(ctx: PluginContext, instance: PluginInstance, handles: readonly PluginRegistrationHandle[]): void {
  for (const handle of handles) {
    handle.unregister();
  }
  ctx.host.dispose(instance);
}

/** The egress wall this activation arms: the re-validated manifest's declared allowlist MINUS the
 *  destinations the caller says are still unanswered (`consentedNetHosts`). `undefined` in ⇒ `undefined` out
 *  (the manifest declared no hosts; infra fails closed at `[]`), and the subtraction can only ever NARROW —
 *  consent is about REACH, so a host a standing re-consent covers stays unreachable until it is answered,
 *  including across the `setEnabled` toggle that grants nothing. */
function consentedWall(declared: readonly string[] | undefined, withheld: readonly string[]): readonly string[] | undefined {
  return declared === undefined ? undefined : consentedNetHosts(declared, withheld);
}

/** Everything this activation takes from the RE-VALIDATED manifest — nothing here is ever guest-runtime-
 *  supplied. Local: only {@link revalidate} produces it and only the activation closure reads it. */
interface RevalidatedBundle {
  readonly mainJs: string;
  /** The registrar's namespace for this plugin's tools (`plugin_<slug'>_<name>`, PL-A). */
  readonly slug: string;
  /** The host-facing display name a posture-2 card names. */
  readonly displayName: string;
  /** The `net.fetch` SSRF allowlist the infra host-fn pins `safeFetch` to; absent ⇒ fail-closed `[]`
   *  infra-side. Already MINUS whatever the caller says is unanswered (see {@link consentedWall}). */
  readonly netHosts: readonly string[] | undefined;
  /** The cascade opt-in, fail-closed `false` when the manifest declares none. */
  readonly matchAutomationEvents: boolean;
  /** Validated manifest data only; the connection registry validates it again at its persistence boundary. */
  readonly providers: readonly ProviderDef[];
}

/** Re-parse and re-validate the stored bundle bytes. A corrupt stored bundle is CONTAINED (never thrown):
 *  the caller lands the row `errored` with the detail. */
function revalidate(
  bytes: Uint8Array,
  withheldNetHosts: readonly string[],
): { readonly ok: true; readonly bundle: RevalidatedBundle } | { readonly ok: false; readonly error: string } {
  try {
    const parsed = parseBundle(bytes);
    return {
      ok: true,
      bundle: {
        mainJs: parsed.mainJs,
        slug: parsed.manifest.id,
        displayName: parsed.manifest.name,
        netHosts: consentedWall(parsed.manifest.netHosts, withheldNetHosts),
        matchAutomationEvents: parsed.manifest.matchAutomationEvents ?? false,
        providers: parsed.manifest.providers ?? [],
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function providerActivationError(
  providerLifecycle: PluginProviderLifecycle,
  rows: readonly ProviderDef[],
  pluginId: ActivateInput["pluginId"],
  pluginName: string,
): Promise<string | null> {
  try {
    await providerLifecycle.activate(rows, { pluginId, pluginName });
    return null;
    // @orb-waive caught-failure-ownership(err): the refusal becomes the returned activation error string; createActivate persists it as `plugins.lastError` and returns `{ok:false,error}`. Ends if that caller stops recording and returning this detail.
  } catch (err) {
    return errorMessage(err);
  }
}

export function createActivate(
  ctx: PluginContext,
  registry: PluginRegistry,
  crashPolicy: CrashPolicy,
  providerLifecycle: PluginProviderLifecycle,
): (input: ActivateInput) => Promise<ActivateOutcome> {
  return async (input: ActivateInput): Promise<ActivateOutcome> => {
    const { bytes } = await ctx.assets.readBytes(input.caller, input.bundleAssetId);
    const revalidated = revalidate(bytes, input.withheldNetHosts);
    if (!revalidated.ok) {
      await setStatus(ctx.db, input.pluginId, {
        status: "errored",
        lastError: `bundle re-validation failed: ${revalidated.error}`,
        updatedAt: ctx.now(),
      });
      return { ok: false, error: revalidated.error };
    }
    const { mainJs, slug, displayName, netHosts, matchAutomationEvents, providers } = revalidated.bundle;

    // The membrane bridge is built PER INSTALLER (global-vars closes over the installer); an installed plugin's
    // `main.js` runs registration-only, so no chat is admitted for the activation run (chat: null). (The
    // per-plugin spend gate was stripped for enterprise spend enforcement; a runaway plugin's turns are
    // bounded by the cascade-depth guard, and the hosting room accepts their inference liability.)
    // The bridge carries the plugin's IDENTITY (id + the manifest's display name) because a posture-2 card has
    // to say who is asking. The name is DERIVED from the re-validated manifest, never guest-runtime-supplied —
    // the same rule the slug and the netHosts allowlist follow.
    const bridge = buildPluginBridge(ctx.ops, input.caller.userId, { id: input.pluginId, name: displayName, slug }, ctx.belts);
    // `label` = the slug: the tag every guest log line carries into the central log stream (file log +
    // `/api/_debug/logs?q=<slug>`) — manifest-DERIVED like the slug and netHosts beside it, never guest-supplied.
    const outcome = await ctx.host.createInstance({
      mainJs,
      grants: input.grants,
      bridge,
      chat: null,
      label: slug,
      ...(netHosts !== undefined ? { netHosts } : {}),
    });
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

    // DURABLE FIRST, THEN THE REGISTRY — never the other way round. The row is the record; the registry is the
    // in-process view of it, and provider contributions are part of that view: neither may be published until
    // the record says `enabled`. Publishing first left
    // a LIVE instance (tools registered, handlers callable) behind a row that still said `disabled` whenever
    // this write rejected — and the owner's natural response, toggling again, then built a SECOND instance
    // beside the first with the first's registrations still standing. This ordering is also the restart marker:
    // a crash after this write is recovered by boot's enabled-row reactivation, whose clean-slate deactivate
    // removes any partial contribution before registering the complete manifest again.
    try {
      await setStatus(ctx.db, input.pluginId, { status: "enabled", lastError: null, updatedAt: ctx.now() });
    } catch (err) {
      discardActivation(ctx, instance, handles);
      // RETHROWN, not returned as `{ok:false}`: the contained-failure arm's whole contract is that the row
      // carries the detail (`errored` + `lastError`), and the row is exactly what could not be written. A
      // caller told "activation failed" by a value would read a row that says nothing happened.
      throw err;
    }

    // The complete provider set is one store transaction. A conflict writes nothing and converts the enabled
    // recovery marker to `errored`; no provider row from a refused activation becomes globally discoverable.
    const providerError = await providerActivationError(providerLifecycle, providers, input.pluginId, slug);
    if (providerError !== null) {
      discardActivation(ctx, instance, handles);
      await setStatus(ctx.db, input.pluginId, {
        status: "errored",
        lastError: `provider registration failed: ${providerError}`,
        updatedAt: ctx.now(),
      });
      return { ok: false, error: providerError };
    }
    registry.set(input.pluginId, { instance, handles, invoke });
    return { ok: true };
  };
}
