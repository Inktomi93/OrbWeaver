// verbs: getAppSettings / updateAppSettings — the admin-runtime tier (AppSettings). BOTH gate on the
// INJECTED `requireAdmin` (owner ∪ admin). `updateAppSettings` additionally gates on `requireOwner` when
// the PATCH touches a D17 owner-box GOVERNANCE field (the box-governance split — only the owner flips
// "may non-owners use my shared local compute / hosted max-pro-sub"; the `max-pro-sub` MINT stays
// `requireOwner` elsewhere regardless). `getAppSettings` returns the SYNC resolved cache; `updateAppSettings`
// is a read-merge-write through a process-wide chain, then reloads the cache (so `getEffectiveConfig` +
// `logger.level` reflect the write before returning). ASSUMES(single-replica): the write chain is per-process.

import type { AppSettings, EffectiveAppConfig } from "@orb/contracts/settings";
import { APP_SETTINGS_SCHEMA_VERSION, parseAppSettings } from "@orb/contracts/settings";
import type { JsonValue } from "@orb/kit/json";
import { APP_SETTINGS_KEY } from "../contract/keys";
import type { GetAppSettingsParams, UpdateAppSettingsParams } from "../contract/params";
import type { SettingsContext } from "../contract/service";
import { readAppOverrideRaw, writeAppOverride } from "../persistence/queries";
import { deepMergeAppSettings } from "../substrate/merge";

interface AppSettingsVerbs {
  readonly getAppSettings: (params: GetAppSettingsParams) => Promise<EffectiveAppConfig>;
  readonly updateAppSettings: (params: UpdateAppSettingsParams) => Promise<EffectiveAppConfig>;
}

// The D17 owner-box governance fields — flipping any of these requires the box OWNER (not a delegated
// admin). `satisfies readonly (keyof AppSettings)[]` makes a rename/typo fail `tsc` (born-compliant).
const OWNER_GATED_FIELDS = [
  "allowNonOwnerLocalCompute",
  // biome-ignore lint/security/noSecrets: an AppSettings field name (D17 governance toggle), not a secret.
  "nonOwnerLocalComputeBudget",
  // biome-ignore lint/security/noSecrets: an AppSettings field name (D17 governance toggle), not a secret.
  "allowNonOwnerMaxProSub",
] as const satisfies readonly (keyof AppSettings)[];

/** Does this PATCH touch a governance field? Key-presence (even an explicit `null` clear is a governance
 *  change) — so a non-owner admin cannot widen/narrow the owner-box defaults. */
function touchesOwnerGatedField(partial: AppSettings): boolean {
  return OWNER_GATED_FIELDS.some((field) => field in partial);
}

export function createAppSettings(ctx: SettingsContext): AppSettingsVerbs {
  // The gate is deferred into the promise (not a bare sync throw) so a deny surfaces as a REJECTED promise
  // — consistent with every other verb, and safe for a caller doing `.catch()` without `await`. The cache
  // read itself is sync (the hot-path seam).
  const getAppSettings = (params: GetAppSettingsParams): Promise<EffectiveAppConfig> =>
    Promise.resolve().then(() => {
      ctx.requireAdmin(params.principal);
      return ctx.getEffectiveConfig();
    });

  // The single process-wide app-settings write chain (only this verb uses it → closure state here, not on
  // the context). Two concurrent admin PATCHes would each merge against the same base and last-write-wins
  // would drop one; the chain serializes the critical section. A failed write resolves the link so one
  // error can't wedge the queue. ASSUMES(single-replica).
  let writeChain: Promise<unknown> = Promise.resolve();

  const updateSerialized = async (params: UpdateAppSettingsParams): Promise<EffectiveAppConfig> => {
    ctx.requireAdmin(params.principal);
    if (touchesOwnerGatedField(params.partial)) {
      ctx.requireOwner(params.principal);
    }
    const merged = deepMergeAppSettings(
      parseAppSettings(await readAppOverrideRaw(ctx.db)),
      params.partial,
    );
    const at = ctx.now();
    // Stamp the version INTO the blob (the `settings` table has no version column; the probe reads it
    // before the schema strips it, so lifts run once per stored version). The merge never assigns
    // `undefined`, so the result is a valid JsonValue at runtime — the cast bridges only the type.
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
    const run = writeChain.then(
      () => updateSerialized(params),
      () => updateSerialized(params),
    );
    writeChain = run.catch(() => undefined); // a failed write must not poison the chain
    return run;
  };

  return { getAppSettings, updateAppSettings };
}
