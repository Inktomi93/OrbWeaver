// verbs: getVersion + checkForUpdate — the two reads behind Settings → About (owner ask 2026-09-18: "a
// versioning system to stay in sync with github and to help with bug reports").
//
// WHY THEY ARE SETTINGS VERBS. Neither touches the db and neither is scoped to a principal — they are
// deployment-global facts. They are HERE because the settings domain owns the app tier and because the
// surface that renders them is a settings section; putting them on the router directly would make transport
// reach past its "validate → service verb" shape, and a whole new domain for two reads would be a 4-site
// landing for no invariant. The egress is an INJECTED op (`probeUpstreamHead`), declared as a TYPE in the
// contract and wired at the composition root — the same shape `materializeBackground` already uses here, so
// this domain still imports no infra.
//
// THE VERDICT LOGIC IS NOT HERE EITHER. `compareToUpstream` is a pure `@orb/kit/version-identity` engine, so
// the whole verdict table (current · behind · offline · no local commit) is driven by a spec with no network
// and no server, and the SAME comparison could be run anywhere else without a second opinion appearing.

import type { UpdateCheck, VersionIdentity } from "@orb/kit/version-identity";
import { compareToUpstream } from "@orb/kit/version-identity";
import type { SettingsContext, SettingsService } from "../contract/service.ts";

/** This process's frozen build identity — the same block `/healthz`, the boot line and a bug bundle report. */
export function createGetVersion(ctx: SettingsContext): SettingsService["getVersion"] {
  return (): VersionIdentity => ctx.versionIdentity();
}

/** ONE click → ONE unauthenticated GET of the upstream branch head → a verdict. A probe FAILURE becomes
 *  `unknown` WITH its reason, never a silent "up to date": a check that cannot reach GitHub and a check that
 *  found nothing new must never render the same, or the button teaches people to trust a blank answer. */
export function createCheckForUpdate(ctx: SettingsContext): SettingsService["checkForUpdate"] {
  return async (): Promise<UpdateCheck> => {
    const local = ctx.versionIdentity().commit;
    const probe = await ctx.probeUpstreamHead();
    return probe.ok ? compareToUpstream(local, probe.head, null) : compareToUpstream(local, null, probe.reason);
  };
}
