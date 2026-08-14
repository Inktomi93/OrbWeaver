// domain/plugin/contract/results — the verb result shapes. `PluginView` projects the `plugins` row
// for the owner's management surface; `builtAgainst` is read from the persisted manifest (provenance rides
// INSIDE the manifest json — there is no denormalized column). `PluginLogView` is one line of the
// host.log ring. `SnippetResult` is the inline-mode return — TYPE HOME ONLY here; the
// `runSnippet` verb that produces it lives with the other verbs.

import type { PluginBuiltAgainst, PluginCapability, PluginLogLevel, PluginOrigin, PluginStatus } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";

/** One installed plugin as its owner sees it — the `plugins` row projected, minus the bundle bytes
 *  and the full manifest json. `builtAgainst` is lifted from the persisted manifest (display/warn provenance);
 *  `null` when the manifest declared none. `grantedCapabilities` is the confirmed subset the
 *  guest feature-detects via `host.grants`. (The per-plugin spend envelope was stripped for
 *  enterprise spend enforcement.) */
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
}

/** One line of a plugin's host.log ring — the rate-limited, ring-buffered log surface the owner reads
 *  via `getPluginLog`. `at` is the injected-clock stamp; `level` mirrors the `host.log.{info,warn,error}` arm. */
export interface PluginLogView {
  readonly level: PluginLogLevel;
  readonly message: string;
  readonly at: number;
}

/** The inline-snippet run's result — echoed into the CALLER's own chat client (a personal REPL, not a
 *  room broadcast). `error` is present iff the snippet threw / hit its wall (a snippet crash is data, never a
 *  resident-crash counter — nothing is resident to protect). TYPE HOME ONLY here; `runSnippet` lives with the
 *  other verbs. */
export interface SnippetResult {
  readonly logLines: readonly string[];
  readonly error?: string;
}
