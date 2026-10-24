// Plugin canon is captured after the real lifecycle operation; guest storage and consent remain production-owned.
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY } from "@orb/contracts/plugin";
import { adminDistributedPlugins, plugins } from "@orb/db";
import { MS_PER_SECOND } from "@orb/kit/time";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import type { ServerProducerRoot } from "../server.ts";
import type { CapturedPluginRows } from "./rows.ts";
import { capturePluginRows } from "./rows.ts";

type PluginService = ServicesResult["services"]["plugin"];

type AdminDistributedPluginRow = typeof adminDistributedPlugins.$inferSelect;

export interface SeededInstalledPlugin extends CapturedPluginRows {
  readonly outcome: Awaited<ReturnType<PluginService["install"]>>;
}

export interface SeededDistributedPlugin {
  readonly outcome: Awaited<ReturnType<PluginService["installForAllUsers"]>>;
  readonly distribution: AdminDistributedPluginRow;
  readonly installs: readonly CapturedPluginRows[];
}

export interface CapturedPluginOutputs {
  readonly plugins: Awaited<ReturnType<PluginService["list"]>>;
  readonly surfaces: Awaited<ReturnType<PluginService["listSurfaces"]>>;
  readonly commands: Awaited<ReturnType<PluginService["listCommands"]>>;
  readonly displayTransforms: Awaited<ReturnType<PluginService["listDisplayTransforms"]>>;
  readonly assets: Awaited<ReturnType<PluginService["listBundleAssets"]>>;
  readonly log: Awaited<ReturnType<PluginService["getLog"]>>;
  readonly state: Awaited<ReturnType<PluginService["getSurfaceState"]>>;
}

/** Capture the current owner-facing publications, never a projection of the private database capture. */
export async function capturePluginOutputs(root: ServerProducerRoot, params: Parameters<PluginService["getSurfaceState"]>[0]): Promise<CapturedPluginOutputs> {
  const service = root.services.plugin;
  return {
    plugins: await service.list(params),
    surfaces: await service.listSurfaces(params),
    commands: await service.listCommands(params),
    displayTransforms: await service.listDisplayTransforms(params),
    assets: await service.listBundleAssets(params),
    log: await service.getLog(params),
    state: await service.getSurfaceState(params),
  };
}

const ZIP_DOS_FALLBACK = "1980-07-01T12:00:00";
const ZIP_UTC_MTIME_FIELD = 0x54_55;
const ZIP_UTC_MTIME_PRESENT = 1;
export const PLUGIN_ZIP_MTIME_SECONDS_RANGE = [-2_147_483_648, 2_147_483_647] as const;

/** Pack raw install inputs with whole-second UTC mtime, limited to the standard signed32 Unix range.
 *  Milliseconds are not retained; the native install funnel still owns admission.
 *  @throws RangeError when the supplied epoch cannot be represented by the standard UTC extra field.
 */
export function makePluginBundle(manifest: PluginManifest, source: string, mtime: number, assets: Readonly<Record<string, Uint8Array>> = {}): Uint8Array {
  const seconds = Math.floor(mtime / MS_PER_SECOND);
  const [min, max] = PLUGIN_ZIP_MTIME_SECONDS_RANGE;
  if (!Number.isInteger(seconds) || seconds < min || seconds > max) {
    throw new RangeError(`Plugin ZIP mtime ${String(mtime)} cannot fit signed 32-bit Unix seconds (${String(min)}..${String(max)})`);
  }
  const utcTime = new Uint8Array(5);
  utcTime[0] = ZIP_UTC_MTIME_PRESENT;
  new DataView(utcTime.buffer).setInt32(1, seconds, true);
  // fflate's DOS encoder uses local getters; the civil fallback is fixed and the actual time rides the supported UTC extra field.
  return zipSync(
    { [PLUGIN_MANIFEST_ENTRY]: strToU8(JSON.stringify(manifest)), [PLUGIN_MAIN_ENTRY]: strToU8(source), ...assets },
    { mtime: ZIP_DOS_FALLBACK, extra: { [ZIP_UTC_MTIME_FIELD]: utcTime } },
  );
}

/** Store validated bundle bytes through the actual install funnel, then capture its returned identity. */
export async function seedInstalledPlugin(root: ServerProducerRoot, params: Parameters<PluginService["install"]>[0]): Promise<SeededInstalledPlugin> {
  const db = root.db;
  const install = root.services.plugin.install;
  const outcome = await install(params);
  return { outcome, ...(await capturePluginRows(db, params.caller.userId, outcome.id)) };
}

/** Capture the actual grant/activation outcome, including contained activation failure rather than inventing enablement. */
export async function seedPluginGrant(root: ServerProducerRoot, params: Parameters<PluginService["setGrant"]>[0]): Promise<SeededInstalledPlugin> {
  const db = root.db;
  const setGrant = root.services.plugin.setGrant;
  const outcome = await setGrant(params);
  return { outcome, ...(await capturePluginRows(db, params.caller.userId, outcome.id)) };
}

/** The returned slug is the distribution PK; each recipient keeps its own canonical install and CAS ownership. */
export async function seedDistributedPlugin(
  root: ServerProducerRoot,
  params: Parameters<PluginService["installForAllUsers"]>[0],
): Promise<SeededDistributedPlugin> {
  const db = root.db;
  const installForAllUsers = root.services.plugin.installForAllUsers;
  const outcome = await installForAllUsers(params);
  const distribution = await db.select().from(adminDistributedPlugins).where(eq(adminDistributedPlugins.slug, outcome.slug)).get();
  if (distribution === undefined) {
    throw new Error("production plugin distribution left no canonical publication row");
  }
  const rows = await db.select().from(plugins).where(eq(plugins.slug, outcome.slug)).orderBy(plugins.ownerId);
  const installs = await Promise.all(rows.map((row) => capturePluginRows(db, row.ownerId, row.id)));
  return { outcome, distribution, installs };
}
