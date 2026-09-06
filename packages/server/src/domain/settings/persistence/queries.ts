// domain/settings/persistence/queries — all db access for settings (queries only, no business logic). This
// domain never reads/joins `users` (the `no-direct-users-read` chokepoint — `users` is
// domain/sessions + domain/admin only; a caller here always already holds a resolved Principal's userId).
// Timestamps arrive as params (injected clock, no ambient wall-clock reads).
//
// THE ONE EXCEPTION (#471): the two whole-blob writers (`writeUserConfig`, `writeAppOverride`) re-read the
// row they are about to replace and REFUSE when an existing blob is unreadable. It lives here, not in the
// verbs, because "may this row be overwritten?" is a property of the ROW, and because these two functions
// are the only whole-blob writers of THIS domain's columns — guarding them is TOTAL over every present and
// future caller, where a per-verb check is a convention the next verb forgets. `#kit/stored-config` carries
// the reasoning + the tradeoff (it moved out of this domain's `substrate/` in #1026, when `domain/preset`
// became the second caller and a domain→domain value import was the wrong shape).

import type { AssetKind } from "@orb/contracts/assets";
import type { UserSettings } from "@orb/contracts/settings";
import { appSettingsConfig, DEFAULT_USER_SETTINGS, parseUserSettings, USER_SETTINGS_SCHEMA_VERSION, userSettingsConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { assets, settings, userSettings } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, sql } from "drizzle-orm";
import { requireIntactStoredConfig } from "#kit/stored-config";
import { APP_SETTINGS_KEY } from "../contract/keys.ts";
import type { GlobalSettingView, UserSettingsView } from "../contract/views.ts";

/** Read this user's typed/defaulted UserSettings. A never-touched account returns parsed defaults with no
 *  write (updatedAt: 0) — materializing the row is ensureUserSettings.
 *
 *  READS THROUGH `parseOutcome`, NOT `parse` (#1716): same walk, same value, plus the provenance the
 *  settings surfaces need. `writeUserConfig` below asks this EXACT question of this EXACT row before every
 *  write and refuses (`stored_config_unreadable`) when it is not intact, so the read has to carry the same
 *  verdict or the pane renders a defaults-looking form and only discovers the refusal after the user types
 *  (the #1716 defect). An ABSENT row reports `null`, not a failure: `parseOutcome(undefined)` would say
 *  `not-an-object`, which is honest about the bytes and WRONG about the situation — a never-written account
 *  writes normally, exactly as `writeUserConfig`'s own row-absent arm does. */
export async function readUserSettings(db: Db, ownerId: UserId): Promise<UserSettingsView> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, ownerId)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    return {
      userId: ownerId,
      schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
      config: parseUserSettings({}),
      updatedAt: 0,
      configUnreadable: null,
    };
  }
  // The blob carries no schemaVersion itself; without threading the column, every blob probes as v1.
  const outcome = userSettingsConfig.parseOutcome(row.config, row.schemaVersion);
  return {
    userId: ownerId,
    schemaVersion: row.schemaVersion,
    config: outcome.value,
    updatedAt: row.updatedAt,
    configUnreadable: outcome.intact ? null : outcome.failure,
  };
}

/** First-touch seed (idempotent), independent of `writeUserConfig`'s own guarded seed
 *  ({@link insertGuardedUserSettings}) — materializes defaults with no guard, for callers that need a row
 *  to exist without a config write (there are none on the tree today; kept as the module's public seed
 *  primitive, tested directly below).
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export async function ensureUserSettings(db: Db, ownerId: UserId, at: number): Promise<void> {
  await db
    .insert(userSettings)
    .values({
      userId: ownerId,
      schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
      config: DEFAULT_USER_SETTINGS,
      updatedAt: at,
    })
    .onConflictDoNothing();
}

// The ONE asset kind a background may be. Every writer of a `backgroundAssetId` / `backgroundLibrary`
// entry stores exactly this kind — the appearance upload field, `materializeBackground` (the pasted-URL
// arm), and the ST profile import — so the predicate below refuses nothing the product produces.
// Exported for `heal-legacy-background-pins.ts` (#1600), the ONE other reader of this kind constant.
export const BACKGROUND_ASSET_KIND: AssetKind = "background";

/** The ONE refusal both halves of the background predicate raise (the pre-write check and the guards that
 *  ride the UPDATE), so which half refused is not observable — and neither names the asset. */
function backgroundUnavailable(): DomainOperationError {
  return new DomainOperationError("background_unavailable", "A background asset is no longer available.");
}

/** The background assets a config PINS: the `asset`-kind current selection plus every library entry,
 *  deduped. These are exactly the ids the write predicate has to clear. Exported for
 *  `heal-legacy-background-pins.ts` (#1600), the ONE other reader of this predicate. */
export function pinnedBackgroundAssetIds(config: UserSettings): AssetId[] {
  const current =
    config.appearance.backgroundImageKind === "asset" && config.appearance.backgroundAssetId.length > 0
      ? [castId<AssetId>(config.appearance.backgroundAssetId)]
      : [];
  const ids = [...current, ...config.appearance.backgroundLibrary.map((entry) => entry.assetId)];
  return ids.filter((id, index, all) => all.indexOf(id) === index);
}

/** THE background predicate as EXISTS subqueries that RIDE the UPDATE (atomic with the write): every pinned
 *  id must name an asset this user owns AND whose `kind` is `background`. Ownership alone is not the
 *  question (#1478 item 1) — a user's own card / avatar / export asset id is owned but is not a background,
 *  and accepting one leaves the background plane semantically corrupt while the write reports success. */
function ownedBackgroundGuards(db: Db, ownerId: UserId, ids: readonly AssetId[]): SQL[] {
  return ids.map((id) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(assets)
        .where(and(eq(assets.id, id), eq(assets.ownerId, ownerId), eq(assets.kind, BACKGROUND_ASSET_KIND))),
    ),
  );
}

/**
 * The FIRST-write path (#1577; closes the #1478 item 2 residual): a brand-new user's row has to be
 * SEEDED before it can be UPDATEd, and the old shape did that as two statements — a standalone pre-check,
 * then a separate seed INSERT, then the guarded UPDATE — so an asset deleted in the window between the
 * pre-check and the seed left a defaults-only row behind even though the write correctly refused.
 *
 * This closes the window by making the seed itself the guarded statement: an `insert().select()` (drizzle
 * 0.45's sqlite dialect; the repo's first use) whose SELECT carries the ownership+kind guard in its WHERE,
 * so the guard is evaluated fresh at THIS statement's execution rather than at an earlier read — there is
 * no interleaving to land inside because there is only one statement. The SELECT's FROM is a bare
 * one-row derived table (`(select 1)`), never `users` (this domain's `no-direct-users-read` fence, checked
 * at gate-time) — `ownerId` itself needs no guaranteed-row source, it is a LITERAL carried by every branch,
 * and the `userId` FK on `user_settings` still rejects a nonexistent owner at the DB level exactly as the
 * unconditional `ensureUserSettings` insert always relied on. SQLite's grammar refuses a bare
 * `SELECT … FROM (subquery) ON CONFLICT …` with no WHERE at all (a parser quirk, confirmed live), so an
 * absent guard (no pinned backgrounds) still carries an explicit always-true `1 = 1`.
 *
 * `onConflictDoNothing` (not a guarded `onConflictDoUpdate`) is deliberate: this function is reached only
 * when the caller has already observed no row. A genuine race — a second concurrent first-write from the
 * SAME user landing between that observation and this statement — is a different, narrower race than the
 * one this closes (an asset deleted mid-write); under it the loser sees a refusal rather than a silent
 * write, which is the same fail-closed posture as the guard itself and is left unhandled on purpose (no
 * observed caller fires two concurrent first writes for one user).
 */
async function insertGuardedUserSettings(db: Db, ownerId: UserId, config: UserSettings, at: number): Promise<void> {
  const guards = ownedBackgroundGuards(db, ownerId, pinnedBackgroundAssetIds(config));
  const written = await db
    .insert(userSettings)
    .select((qb) =>
      qb
        .select({
          userId: sql<UserId>`${ownerId}`.as("user_id"),
          schemaVersion: sql<number>`${USER_SETTINGS_SCHEMA_VERSION}`.as("schema_version"),
          config: sql<UserSettings>`${JSON.stringify(config)}`.as("config"),
          updatedAt: sql<number>`${at}`.as("updated_at"),
        })
        .from(sql`(select 1)`)
        .where(guards.length > 0 ? and(...guards) : sql`1 = 1`),
    )
    .onConflictDoNothing()
    .returning({ userId: userSettings.userId });
  if (written.length === 0) {
    throw backgroundUnavailable();
  }
}

/** Seed-or-UPDATE the user's config blob; schemaVersion is service-owned (pinned to the current constant).
 *  The first write for a user is ONE guarded `insert().select()` ({@link insertGuardedUserSettings}); every
 *  later write is a guarded UPDATE riding the same {@link ownedBackgroundGuards} atomically.
 *
 *  REFUSES (`DomainOperationError(stored_config_unreadable)`) when a row already exists whose blob cannot be
 *  read: every caller builds `config` by spreading a READ of that row, and the read seam degrades an
 *  unreadable blob to schema defaults — so persisting it would silently reset the user's whole settings
 *  blob (#471). A never-written user has nothing to lose and writes normally. */
export async function writeUserConfig(db: Db, ownerId: UserId, config: UserSettings, at: number): Promise<void> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, ownerId)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    await insertGuardedUserSettings(db, ownerId, config, at);
    return;
  }
  requireIntactStoredConfig(userSettingsConfig.parseOutcome(row.config, row.schemaVersion), `user_settings for ${ownerId}`);
  const written = await db
    .update(userSettings)
    .set({ config, schemaVersion: USER_SETTINGS_SCHEMA_VERSION, updatedAt: at })
    .where(and(eq(userSettings.userId, ownerId), ...ownedBackgroundGuards(db, ownerId, pinnedBackgroundAssetIds(config))))
    .returning({ userId: userSettings.userId });
  if (written.length === 0) {
    throw backgroundUnavailable();
  }
}

/**
 * Write a config blob that DOES NOT DESCEND FROM A READ of the row it lands on — the settings twin of
 * `replacePresetConfig`, and the ONE way out of an unreadable `user_settings.config` (#1771/#1716).
 *
 * DELIBERATELY UNGUARDED, and that is the #1026 provenance rule rather than a hole: `writeUserConfig`
 * refuses because every one of its callers builds the next blob by spreading a READ of the stored one, so
 * an unreadable read would persist the stand-in (#471). This function's caller — `resetUserConfig` —
 * carries `DEFAULT_USER_SETTINGS`, a contract constant; there is no degraded read in it to persist, and
 * guarding it would refuse the user's own explicit repair while preventing no loss. Before this existed the
 * settings blob had NO repair door at all: every section write refused, the per-leaf Reset
 * (`use-config-leaf.ts`) refused because it writes through `updateUserSettingsSection`, and even the backup
 * restore (`verbs/import-user-settings.ts`) refused because it read-merges. The exemption is recorded
 * two-sidedly in the `json-column-write-parity` gate's GUARD_EXEMPT table, so a future caller that starts
 * merging onto the stored value turns that row RED.
 *
 * The BACKGROUND predicate still rides the write, unchanged from {@link writeUserConfig}: a repair may not
 * pin an asset the caller does not own. (`DEFAULT_USER_SETTINGS` pins none, so the guard list is empty and
 * the reset can never be refused by it — but the predicate belongs to the COLUMN, not to one caller.)
 */
export async function replaceUserConfig(db: Db, ownerId: UserId, config: UserSettings, at: number): Promise<void> {
  const rows = await db.select({ userId: userSettings.userId }).from(userSettings).where(eq(userSettings.userId, ownerId)).limit(1);
  // The row's own COLUMNS are never read — only its EXISTENCE, which decides seed-vs-update and cannot
  // carry a degraded blob into the write. That is what keeps this function outside the #471 guard's class.
  if (rows[0] === undefined) {
    await insertGuardedUserSettings(db, ownerId, config, at);
    return;
  }
  const written = await db
    .update(userSettings)
    .set({ config, schemaVersion: USER_SETTINGS_SCHEMA_VERSION, updatedAt: at })
    .where(and(eq(userSettings.userId, ownerId), ...ownedBackgroundGuards(db, ownerId, pinnedBackgroundAssetIds(config))))
    .returning({ userId: userSettings.userId });
  if (written.length === 0) {
    throw backgroundUnavailable();
  }
}

function toView(row: { key: string; value: JsonValue; updatedAt: number }): GlobalSettingView {
  return {
    key: row.key,
    // A corrupt row degrades to null rather than throwing — the read surface must not 500.
    value: jsonValueSchema.catch(null).parse(row.value),
    updatedAt: row.updatedAt,
  };
}

export async function readGlobalSetting(db: Db, key: string): Promise<GlobalSettingView | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toView(row);
}

/** Upsert one raw global-KV row and return its view. The reserved-key guard + audit live in the verb. */
export async function upsertGlobalSetting(db: Db, key: string, value: JsonValue, at: number): Promise<GlobalSettingView> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: at })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } });
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`upsertGlobalSetting: row for '${key}' missing immediately after upsert`);
  }
  return toView(row);
}

/** Read the raw stored AppSettings override blob (or undefined if never written); the caller parses it. */
export async function readAppOverrideRaw(db: Db): Promise<JsonValue | undefined> {
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, APP_SETTINGS_KEY)).limit(1);
  return rows[0]?.value;
}

/** Upsert the AppSettings override row; the caller stamps schemaVersion into the blob before writing.
 *
 *  Same refusal as `writeUserConfig` and for the same reason (#471): `updateAppSettings` merges its patch
 *  onto `parseAppSettings(readAppOverrideRaw())`, which degrades an unreadable override row to the empty
 *  override — persisting that would silently drop every admin override the box had. An ABSENT row is the
 *  normal first-write and proceeds. */
export async function writeAppOverride(db: Db, value: JsonValue, at: number): Promise<void> {
  const stored = await readAppOverrideRaw(db);
  if (stored !== undefined) {
    requireIntactStoredConfig(appSettingsConfig.parseOutcome(stored), `the ${APP_SETTINGS_KEY} override row`);
  }
  await db
    .insert(settings)
    .values({ key: APP_SETTINGS_KEY, value, updatedAt: at })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } });
}
