// The teach HONESTY assertion (owner rider R-TEACH, 2026-08-30): teach is
// LOCKED to its leaf by type (`ConfigSettingLeaf.teach` is required), and this assert carries what tsc
// cannot see — a HOLLOW declaration. Runs at the compose door beside `assertSettingsKeyPartition` (a
// throw, not a gate approximation) over the REAL registry, so every leaf that exists is swept; the mirror
// unit test pins each arm with a planted fixture.
//
// The arms: a non-none teach with an empty `summary`, an empty `affects` list or a blank `affects` entry
// is RED; a `{none: ""}` is RED (an opt-out owes its reason); a `related` ref that does not resolve
// against the registry — an unknown group, a sub no contribution renders, a setting its section does not
// declare — is RED (the host's resolution already computes this; surfacing it here means a broken link is
// a build failure, never a silent null door).

import type { ContributorRegistry } from "#lib";
import { isConfigGroupId } from "./config-group-ids.ts";
import type { ConfigSettingRef, SettingTeach } from "./config-group-registry.ts";
import { isTeachNone } from "./config-group-registry.ts";
import type { ConfigSectionContribution } from "./config-section-registry.ts";

function assertTeachBody(teach: SettingTeach, subject: string): void {
  if (teach.summary.trim().length === 0) {
    throw new Error(`config teach: ${subject} has an empty summary`);
  }
  if (teach.affects.length === 0 || teach.affects.some((a) => a.trim().length === 0)) {
    throw new Error(`config teach: ${subject} has an empty "affects" list or a blank entry`);
  }
}

function assertRefResolves(ref: ConfigSettingRef, registry: ContributorRegistry<ConfigSectionContribution>, subject: string): void {
  if (!isConfigGroupId(ref.group)) {
    throw new Error(`config teach: ${subject} relates to unknown group "${String(ref.group)}"`);
  }
  const section = registry.list().find((c) => c.anchor === ref.group && c.nav.id === ref.sub);
  if (section === undefined) {
    throw new Error(`config teach: ${subject} relates to "${ref.group}/${ref.sub}", which no contribution renders`);
  }
  if (!(section.nav.settings ?? []).some((leaf) => leaf.id === ref.setting)) {
    throw new Error(`config teach: ${subject} relates to setting "${ref.setting}", which "${ref.group}/${ref.sub}" does not declare`);
  }
}

function assertTeach(teach: SettingTeach, registry: ContributorRegistry<ConfigSectionContribution>, subject: string): void {
  assertTeachBody(teach, subject);
  for (const ref of teach.related ?? []) {
    assertRefResolves(ref, registry, subject);
  }
}

/** Sweep every contribution's section teach + leaf teach declarations. Throws on the first hollow one. */
export function assertTeachHonesty(registry: ContributorRegistry<ConfigSectionContribution>): void {
  for (const contribution of registry.list()) {
    const at = `${contribution.anchor}/${contribution.nav.id}`;
    if (contribution.nav.teach !== undefined) {
      assertTeach(contribution.nav.teach, registry, `section ${at}`);
    }
    for (const leaf of contribution.nav.settings ?? []) {
      const subject = `leaf ${at}::${leaf.id}`;
      if (isTeachNone(leaf.teach)) {
        if (leaf.teach.none.trim().length === 0) {
          throw new Error(`config teach: ${subject} opts out without a reason ({none: ""})`);
        }
        continue;
      }
      assertTeach(leaf.teach, registry, subject);
    }
  }
}
