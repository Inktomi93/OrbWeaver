// S2 — the settings KEY PARTITION (SET-SEAMS §2.3). N sections saving into ONE `UserSettings` namespace is
// only safe because each patch is KEY-MINIMAL (S1): the server's read-merge-write is per-key
// (`deepMergePlain`) and serialized per user, so DISJOINT patches commute. This assertion is what turns
// that convention into a proof — it runs ONCE at the door, over the whole config-section registry, against
// the contract defaults, and THROWS (the `createContributorRegistry` duplicate-id posture).
//
// The gap arm is scoped to CLAIMED namespaces: a namespace no section claims is still owned WHOLE by its
// group's welded form (pre-SET-SEAMS-stage-1), which is not a partition violation — it is the migration
// state the stage table describes. The instant one section claims a key in a namespace, that namespace is
// under the partition and every remaining key must be claimed or CITED. So each stage that decomposes a
// group brings its namespace under the pin automatically, and no stage can half-claim a namespace silently.
// The APP tier runs the OVERLAP arm only (including the nesting arm — its claims may be leaf paths), never
// a gap arm: "an AppSettings key with no admin editor" is already `knob-wire-coverage`'s arm B2 (D107),
// which reconciles it against the WHOLE admin surface with its own cited-deferral registry. Two registries
// of two different facts, deliberately (§10 Q5) — this one would only re-state it worse, since a key can be
// edited by a non-contributed surface.
//
// Split out of the registry contract at the config revamp (#866 S1) for the component-size cap; the
// mechanism is byte-identical to the settings-era `settings-pane-registry.ts` half it came from.

import type { UserSettings, UserSettingsSection } from "@orb/contracts/settings";
import type { ContributorRegistry } from "#lib";
import { settingsValueAtPath } from "#lib";
import type { ConfigSectionContribution } from "./config-section-registry.ts";

/** One cited exemption from the gap arm — a key inside a CLAIMED namespace that has no client editor.
 *  Self-cleaning in BOTH directions (the D50 producer-coverage DEFERRED discipline): a key that GAINS a section
 *  REDs its stale entry, and a cite for a key that no longer exists (or for a namespace no section claims)
 *  REDs too. */
export interface UnclaimedSettingsKey {
  readonly section: UserSettingsSection;
  readonly key: string;
  /** WHY there is no editor — an unclaimed knob is the settings-side twin of a dead switch (D107). */
  readonly reason: string;
}

/** The cited gap-arm exemptions. Keep it SHORT — every entry is a knob a user cannot reach. */
export const UNCLAIMED_SETTINGS_KEYS: readonly UnclaimedSettingsKey[] = [
  {
    section: "databank",
    key: "chunk",
    reason: "ingest-time chunking params (size/overlap) — set at import, never edited after; the databank section deliberately round-trips them untouched.",
  },
];

/** `defaults[section]` as a plain key bag, or undefined when the namespace is not an object. */
function namespaceKeys(defaults: UserSettings, section: UserSettingsSection): readonly string[] | undefined {
  const value: unknown = defaults[section];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : undefined;
}

function claimKey(tier: string, section: string, key: string): string {
  return `${tier}:${section}.${key}`;
}

/** A claim id back as its human `<section>.<key>` half (the tier prefix is scaffolding for the map). */
function claimLabel(id: string): string {
  return id.slice(id.indexOf(":") + 1);
}

/** An already-claimed key that NESTS with `id` — one is a dotted path INSIDE the other. A parent/child pair
 *  is an overlap in disguise: the parent's owner writes (and clears) the whole nested object, wiping the
 *  leaf owner's value. Returns the conflicting claim id + its owning section. */
function findNestedConflict(owners: ReadonlyMap<string, string>, id: string): readonly [string, string] | undefined {
  // The DOT is load-bearing: a claim that merely shares a name PREFIX (`engineLaunchExtra`) is a sibling key,
  // not a nested one.
  return [...owners].find(([claimed]) => claimed.startsWith(`${id}.`) || id.startsWith(`${claimed}.`));
}

/** Build the leaf-key → owning-section map, THROWING on the first overlap (two sections writing one key is
 *  a live lost-update: A's debounce carries its stale copy of B's value). */
function collectClaims(registry: ContributorRegistry<ConfigSectionContribution>): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const contribution of registry.list()) {
    const claim = contribution.owns;
    if (claim === undefined) {
      continue;
    }
    const section = claim.tier === "user" ? claim.section : "app";
    for (const key of claim.keys) {
      const id = claimKey(claim.tier, section, key);
      const firstOwner = owners.get(id);
      if (firstOwner !== undefined) {
        throw new Error(
          `assertSettingsKeyPartition: "${section}.${key}" is claimed by BOTH "${firstOwner}" and "${contribution.id}" — two sections writing one key is a lost update (SET-SEAMS §2.3 S2). Give the key exactly one owning section.`,
        );
      }
      const nested = findNestedConflict(owners, id);
      if (nested !== undefined) {
        throw new Error(
          `assertSettingsKeyPartition: "${section}.${key}" (claimed by "${contribution.id}") NESTS with "${claimLabel(nested[0])}" claimed by "${nested[1]}" — the outer claim's owner writes and CLEARS the whole nested object, wiping the inner one (SET-SEAMS §2.3 S2). Either split BOTH claims to disjoint leaves, or give the whole key to one section.`,
        );
      }
      owners.set(id, contribution.id);
    }
  }
  return owners;
}

/** THROWS on overlap (two sections write one key → clobber), on a GAP (a knob with no editor inside a
 *  claimed namespace → D107) that is not cited in {@link UNCLAIMED_SETTINGS_KEYS}, and on a STALE cite (a
 *  cited key that is now claimed, no longer exists, or sits in a namespace no section claims). Called once
 *  at the composition root, right after the config-section registry is assembled. `exemptions` defaults
 *  to the live cite list and is injectable so each arm is unit-testable against a fixture. */
export function assertSettingsKeyPartition(
  registry: ContributorRegistry<ConfigSectionContribution>,
  defaults: UserSettings,
  exemptions: readonly UnclaimedSettingsKey[] = UNCLAIMED_SETTINGS_KEYS,
): void {
  const owners = collectClaims(registry);
  const claimedSections = new Set<UserSettingsSection>();
  for (const contribution of registry.list()) {
    if (contribution.owns?.tier === "user") {
      claimedSections.add(contribution.owns.section);
    }
  }
  const cited = validateCites(exemptions, owners, claimedSections, defaults);
  assertNoGaps(claimedSections, defaults, owners, cited);
  assertLeafKeyBindings(registry, defaults);
}

/** The LEAF-KEY honesty arm (§3.4 row chrome, #866): a `ConfigSettingLeaf.key` binds the row's chrome —
 *  the modified stripe, Reset, About's default-vs-current — to a settings key, so a key OUTSIDE the
 *  owning contribution's user-tier claim would make the row read (and RESET) a value its section does not
 *  own. Declared bindings must be members of the claim; a leaf on a claim-less or app-tier contribution
 *  may not declare one at all (the app tier resets by clearing overrides — a different verb this chrome
 *  deliberately does not carry). And every bound key's DEFAULT must RESOLVE from the contract defaults —
 *  the ONE home (owner rider 2026-08-30: defaults are DERIVED, never mirrored; a key whose default
 *  resolves `undefined` would read as permanently modified and reset to a hole). */
function assertLeafKeyBindings(registry: ContributorRegistry<ConfigSectionContribution>, defaults: UserSettings): void {
  for (const contribution of registry.list()) {
    for (const leaf of contribution.nav.settings ?? []) {
      if (leaf.key !== undefined) {
        assertOneLeafKeyBinding(contribution, { leafId: leaf.id, key: leaf.key }, defaults);
      }
    }
  }
}

function assertOneLeafKeyBinding(
  contribution: ConfigSectionContribution,
  bound: { readonly leafId: string; readonly key: string },
  defaults: UserSettings,
): void {
  const at = `leaf "${contribution.nav.id}.${bound.leafId}" (section "${contribution.id}")`;
  const claim = contribution.owns;
  if (claim === undefined || claim.tier !== "user") {
    throw new Error(
      `assertSettingsKeyPartition: ${at} declares key "${bound.key}" but the contribution has no user-tier claim — a leaf binding needs an owned per-user key.`,
    );
  }
  if (!claim.keys.includes(bound.key)) {
    throw new Error(
      `assertSettingsKeyPartition: ${at} declares key "${bound.key}", which is NOT in the section's claim [${claim.keys.join(", ")}] — the row would read and RESET a value its section does not own.`,
    );
  }
  if (settingsValueAtPath(defaults, `${claim.section}.${bound.key}`) === undefined) {
    throw new Error(
      `assertSettingsKeyPartition: ${at} binds key "${claim.section}.${bound.key}", whose DEFAULT does not resolve from the contract defaults — the one home. The stripe would read permanently modified and Reset would write a hole; fix the key or the schema, never mirror a literal.`,
    );
  }
}

/** The STALE-CITE arms — a cite that is now claimed, sits in an unclaimed (still group-owned) namespace, or
 *  names a key the contract no longer has. Returns the validated cite ids. */
function validateCites(
  exemptions: readonly UnclaimedSettingsKey[],
  owners: ReadonlyMap<string, string>,
  claimedSections: ReadonlySet<UserSettingsSection>,
  defaults: UserSettings,
): ReadonlySet<string> {
  const cited = new Set<string>();
  for (const exemption of exemptions) {
    const id = claimKey("user", exemption.section, exemption.key);
    const owner = owners.get(id);
    if (owner !== undefined) {
      throw new Error(
        `assertSettingsKeyPartition: "${exemption.section}.${exemption.key}" is cited in UNCLAIMED_SETTINGS_KEYS but section "${owner}" now claims it — delete the stale cite (SET-SEAMS §2.3).`,
      );
    }
    if (!claimedSections.has(exemption.section)) {
      throw new Error(
        `assertSettingsKeyPartition: UNCLAIMED_SETTINGS_KEYS cites "${exemption.section}.${exemption.key}", but no section claims any key in "${exemption.section}" — the namespace is still group-owned, so the cite is inert. Delete it (SET-SEAMS §2.3).`,
      );
    }
    if (!(namespaceKeys(defaults, exemption.section)?.includes(exemption.key) ?? false)) {
      throw new Error(
        `assertSettingsKeyPartition: UNCLAIMED_SETTINGS_KEYS cites "${exemption.section}.${exemption.key}", which is not a key of DEFAULT_USER_SETTINGS.${exemption.section} — delete the stale cite (SET-SEAMS §2.3).`,
      );
    }
    cited.add(id);
  }
  return cited;
}

/** The GAP arm — every key of a CLAIMED namespace is owned by a section or cited as editor-less. */
function assertNoGaps(
  claimedSections: ReadonlySet<UserSettingsSection>,
  defaults: UserSettings,
  owners: ReadonlyMap<string, string>,
  cited: ReadonlySet<string>,
): void {
  for (const section of claimedSections) {
    for (const key of namespaceKeys(defaults, section) ?? []) {
      const id = claimKey("user", section, key);
      if (!(owners.has(id) || cited.has(id))) {
        throw new Error(
          `assertSettingsKeyPartition: "${section}.${key}" has no owning section — the namespace is under the partition (another section claims part of it), so this knob has no editor (D107). Claim it in a section's \`owns\`, or cite it in UNCLAIMED_SETTINGS_KEYS with a reason (SET-SEAMS §2.3).`,
        );
      }
    }
  }
}
