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
 *  enterprise spend enforcement.)
 *
 *  THE ASKED-VS-ALLOWED PAIR (`declaredCapabilities` + `netHosts`, both lifted from the persisted manifest).
 *  A grant surface that can show only the ALLOWED half cannot say the one sentence that makes consent
 *  meaningful — "this plugin asked for X and you allowed Y" — and cannot compute the netHosts half of an
 *  upgrade's widening delta at all (the server compares against the PRIOR manifest's `netHosts`,
 *  `verbs/upgrade.ts`, and no read surface projected it). Both are also the input the `setGrant`
 *  acknowledgement echo is built from, so the consent act pins the exact list the owner was shown. */
export interface PluginView {
  readonly id: PluginId;
  readonly slug: string;
  readonly name: string;
  readonly version: string;
  readonly status: PluginStatus;
  readonly origin: PluginOrigin;
  readonly grantedCapabilities: readonly PluginCapability[];
  /** What the persisted manifest DECLARES (the ask). Always present — `capabilities` is a required manifest
   *  array — and possibly empty; `grantedCapabilities ⊆ this` is the standing invariant every grant write holds. */
  readonly declaredCapabilities: readonly PluginCapability[];
  /** The manifest's exact-host `net.fetch` allowlist — the REACH half of what `net.fetch` means (a capability
   *  name alone does not say where it points). `null` when the manifest declares none, which by the
   *  `netHosts ⟺ net.fetch` biconditional is exactly when `net.fetch` is not declared. */
  readonly netHosts: readonly string[] | null;
  /** THE SYSTEM'S OWN REFUSAL, made visible. `true` from the moment an UPGRADE widened declared reach and
   *  forced this row `disabled`; cleared when the owner re-consents to the WHOLE ask (`setGrant`), and
   *  `false` on a fresh install. Untouched by `setEnabled` — re-enabling grants nothing, so the gap outlives
   *  it.
   *
   *  WHY IT IS PROJECTED RATHER THAN DERIVED. Without it a forced disable renders identically to the owner's
   *  own toggle-off, and the surface then presents the system's refusal as the person's decision. It is not
   *  recoverable from current state: `declaredCapabilities ⊄ grantedCapabilities` is legitimately TRUE for an
   *  ENABLED plugin whose owner granted a paranoid subset, and the netHosts half of a widening is judged
   *  against the PRIOR manifest, which nothing persists. It records an EVENT. */
  readonly reconsentPending: boolean;
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
