// verbs: getVersion + checkForUpdate — the two reads behind Settings → This install (owner ask 2026-09-18: "a
// versioning system to stay in sync with github and to help with bug reports").
//
// WHY THEY ARE SETTINGS VERBS. Neither touches the db and neither is scoped to a principal — they are
// deployment-global facts. They are HERE because the settings domain owns the app tier and because the
// surface that renders them is a settings section; putting them on the router directly would make transport
// reach past its "validate → service verb" shape, and a whole new domain for two reads would be a 4-site
// landing for no invariant. The egress is an INJECTED op (`probeUpstream`), declared as a TYPE in the
// contract and wired at the composition root — the same shape `materializeBackground` already uses here, so
// this domain still imports no infra. The build's own release channel picks which probe runs: a `stable`
// build asks for the latest GitHub Release, a `main` build for main's head commit.
//
// THE VERDICT LOGIC IS NOT HERE EITHER. `compareToMainHead` and `compareToLatestRelease` are pure
// `@orb/kit/version-identity` engines, so each channel's verdict table (current · behind · offline · no local
// commit) is driven by a spec with no network and no server, and the SAME comparison could be run anywhere else without a second opinion appearing.

import type { ReleaseChannel, UpdateCheck, VersionIdentity } from "@orb/kit/version-identity";
import { compareToLatestRelease, compareToMainHead } from "@orb/kit/version-identity";
import type { SettingsContext, SettingsService } from "../contract/service.ts";

/** This process's frozen build identity — the same block `/healthz`, the boot line and a bug bundle report. */
export function createGetVersion(ctx: SettingsContext): SettingsService["getVersion"] {
  return (): VersionIdentity => ctx.versionIdentity();
}

/** ONE click → ONE unauthenticated GET of this build's channel upstream → a verdict. A probe FAILURE becomes
 *  `unknown` WITH its reason, never a silent "up to date": a check that cannot reach GitHub and a check that
 *  found nothing new must never render the same, or the button teaches people to trust a blank answer. */
export function createCheckForUpdate(ctx: SettingsContext): SettingsService["checkForUpdate"] {
  const checks: Record<ReleaseChannel, (identity: VersionIdentity) => Promise<UpdateCheck>> = {
    stable: async (identity) => {
      const probe = await ctx.probeUpstream.stable();
      return probe.ok ? compareToLatestRelease(identity.version, probe.upstream, null) : compareToLatestRelease(identity.version, null, probe.reason);
    },
    main: async (identity) => {
      const probe = await ctx.probeUpstream.main();
      return probe.ok ? compareToMainHead(identity.commit, probe.upstream, null) : compareToMainHead(identity.commit, null, probe.reason);
    },
  };
  return (): Promise<UpdateCheck> => {
    const identity = ctx.versionIdentity();
    return checks[identity.channel](identity);
  };
}
