// domain/plugin/contract/results — the verb result shapes (02 §4). `PluginView` projects the `plugins` row
// for the owner's management surface; `builtAgainst` is read from the persisted manifest (provenance rides
// INSIDE the manifest json — there is no denormalized column, 02 §3). `PluginLogView` is one line of the
// host.log ring (03 §3). `SnippetResult` is the inline-mode return (03 §1) — TYPE HOME ONLY here; the
// `runSnippet` verb that produces it is P5.

import type { PluginBudgetView, PluginBuiltAgainst, PluginCapability, PluginLogLevel, PluginOrigin, PluginStatus } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";

/** One installed plugin as its owner sees it — the `plugins` row projected (02 §3), minus the bundle bytes
 *  and the full manifest json. `builtAgainst` is lifted from the persisted manifest (display/warn provenance
 *  — 02 §3 rider); `null` when the manifest declared none. `grantedCapabilities` is the confirmed subset the
 *  guest feature-detects via `host.grants`. `budget` is the per-day spend envelope (PLUGIN-SPEND) — the panel
 *  renders limit + spent-today for BOTH ceilings; an absent `plugin_budgets` row projects to the defaults over
 *  a zero accumulator. */
export interface PluginView {
  readonly id: PluginId;
  readonly slug: string;
  readonly name: string;
  readonly version: string;
  readonly status: PluginStatus;
  readonly origin: PluginOrigin;
  readonly grantedCapabilities: readonly PluginCapability[];
  readonly builtAgainst: PluginBuiltAgainst | null;
  readonly consecutiveCrashes: number;
  readonly lastError: string | null;
  readonly installedAt: number;
  readonly updatedAt: number;
  readonly budget: PluginBudgetView;
}

/** One line of a plugin's host.log ring (03 §3) — the rate-limited, ring-buffered log surface the owner reads
 *  via `getPluginLog`. `at` is the injected-clock stamp; `level` mirrors the `host.log.{info,warn,error}` arm. */
export interface PluginLogView {
  readonly level: PluginLogLevel;
  readonly message: string;
  readonly at: number;
}

/** The inline-snippet run's result (03 §1) — echoed into the CALLER's own chat client (a personal REPL, not a
 *  room broadcast). `error` is present iff the snippet threw / hit its wall (a snippet crash is data, never a
 *  resident-crash counter — nothing is resident to protect). TYPE HOME ONLY at P3: `runSnippet` is P5. */
export interface SnippetResult {
  readonly logLines: readonly string[];
  readonly error?: string;
}
