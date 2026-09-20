// getAppSettings / updateAppSettings — the admin-runtime tier. Both gate on the injected `requireAdmin`.
// `updateAppSettings` additionally gates on `requireOwner` when the patch touches an owner-box governance
// field. `getAppSettings` returns the sync resolved cache; `updateAppSettings` is a read-merge-write
// through a process-wide chain, then reloads the cache. ASSUMES(single-replica): the write chain is
// per-process.

import type { AppSettings, AppSettingsView, EffectiveAppConfig } from "@orb/contracts/settings";
import { APP_SETTINGS_SCHEMA_VERSION, parseAppSettings } from "@orb/contracts/settings";
import type { JsonValue } from "@orb/kit/json";
import { APP_SETTINGS_KEY } from "../contract/keys.ts";
import type { GetAppSettingsParams, UpdateAppSettingsParams } from "../contract/params.ts";
import type { SettingsContext } from "../contract/service.ts";
import { readAppOverrideRaw, writeAppOverride } from "../persistence/queries.ts";
import { deepMergeAppSettings } from "../substrate/merge.ts";

interface AppSettingsVerbs {
  readonly getAppSettings: (params: GetAppSettingsParams) => Promise<EffectiveAppConfig>;
  readonly getAppSettingsWithOverrides: (params: GetAppSettingsParams) => Promise<AppSettingsView>;
  readonly updateAppSettings: (params: UpdateAppSettingsParams) => Promise<EffectiveAppConfig>;
}

// The owner-box governance fields — flipping any of these requires the box owner, not a delegated admin.
const OWNER_GATED_FIELDS = ["privateEndpointAllowlist", "localMultiUser"] as const satisfies readonly (keyof AppSettings)[];

/** Does this patch touch a governance field? Key-presence (even an explicit `null` clear counts). */
function touchesOwnerGatedField(partial: AppSettings): boolean {
  return OWNER_GATED_FIELDS.some((field) => field in partial);
}

export function createAppSettings(ctx: SettingsContext): AppSettingsVerbs {
  // The gate is deferred into the promise (not a bare sync throw) so a deny surfaces as a rejected promise.
  const getAppSettings = (params: GetAppSettingsParams): Promise<EffectiveAppConfig> =>
    Promise.resolve().then(() => {
      ctx.requireAdmin(params.principal);
      return ctx.getEffectiveConfig();
    });

  // The richer admin read: the resolved config (sync cache) PLUS the raw stored overrides (so the admin pane
  // shows floor-vs-override and can clear an override to the `null` sentinel). Admin-gated like getAppSettings.
  const getAppSettingsWithOverrides = async (params: GetAppSettingsParams): Promise<AppSettingsView> => {
    ctx.requireAdmin(params.principal);
    const overrides = parseAppSettings(await readAppOverrideRaw(ctx.db));
    return { resolved: ctx.getEffectiveConfig(), overrides };
  };

  // The single process-wide write chain: two concurrent admin PATCHes would each merge against the same
  // base and last-write-wins would drop one; the chain serializes the critical section. ASSUMES(single-replica).
  let writeChain: Promise<unknown> = Promise.resolve();

  const updateSerialized = async (params: UpdateAppSettingsParams): Promise<EffectiveAppConfig> => {
    ctx.requireAdmin(params.principal);
    if (touchesOwnerGatedField(params.partial)) {
      ctx.requireOwner(params.principal);
    }
    const merged = deepMergeAppSettings(parseAppSettings(await readAppOverrideRaw(ctx.db)), params.partial);
    const at = ctx.now();
    // Stamp the version into the blob (the `settings` table has no version column). The merge never
    // assigns `undefined`, so the result is a valid JsonValue at runtime — the cast bridges only the type.
    const value = { ...merged, schemaVersion: APP_SETTINGS_SCHEMA_VERSION } as JsonValue;
    await writeAppOverride(ctx.db, value, at);
    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "settings.updateAppSettings",
        entityType: "settings",
        entityId: APP_SETTINGS_KEY,
        metadata: { value: merged },
      },
      at,
    );
    return ctx.reloadEffectiveConfig();
  };

  const updateAppSettings = (params: UpdateAppSettingsParams): Promise<EffectiveAppConfig> => {
    // @orb-waive caught-failure-ownership(writeChain): propagated — `run` is what this function
    // RETURNS to the caller, so a failed write reaches the caller unmuted through `run`'s own rejection.
    // Ends if `run` stops being the returned promise.
    const run = writeChain.then(
      () => updateSerialized(params),
      () => updateSerialized(params),
    );
    // @orb-waive caught-failure-ownership(run): scaffolding only — the trailing comment states
    // the contract: a failed write must not poison the CHAIN's next link. The real outcome the caller sees is
    // `run`, not `writeChain`. Ends if `writeChain` is read anywhere but the chain-continuation plumbing.
    writeChain = run.catch(() => undefined); // a failed write must not poison the chain
    return run;
  };

  return { getAppSettings, getAppSettingsWithOverrides, updateAppSettings };
}
