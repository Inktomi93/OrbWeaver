// The #1638 leg of `__orb.nav.openConfig`: validate that `sub`/`setting` NAME a real section/leaf, which
// `isConfigGroup` (agent-nav/index.ts) cannot — that check is structural (closed group-id vocabulary), and
// there is no static vocabulary for a section/leaf id. The only runtime index is the config-section
// registry the compose door assembles (`compose/config-sections.ts`), so this file is pure OVER a registry
// handed in by the caller — it does not import `#data`/`#features`/compose, and it does no I/O.
//
// Pure function, not a class of assertions like `state/config-teach.ts`'s `assertRefResolves`: that helper
// THROWS at door-assembly time (a build-time honesty sweep over every declared `related` ref); this one
// returns a `NavResult` at CALL time, over whatever `sub`/`setting` a caller handed the bridge, and never
// throws — a bad target is data the caller renders, exactly like every other closed-vocabulary arm here.

import type { ContributorRegistry } from "#lib";
import type { ConfigGroupId, ConfigSectionContribution } from "#state";
import type { NavResult } from "../lib/agent-bridge.ts";

const OK: NavResult = { ok: true };

/**
 * Validate `sub`/`setting` against the sections `registry` actually holds for `group`. `sub === undefined`
 * always resolves — a group-only address needs no lookup, and `openConfig`'s caller already proved `group`
 * itself is real. Refuses LOUDLY, naming the nearest real target (the sibling sections/leaves), matching
 * every other closed-vocabulary arm in this bridge (`reject()`) — never a silent narrower landing.
 */
export function resolveConfigTarget(
  group: ConfigGroupId,
  sub: string | undefined,
  setting: string | undefined,
  registry: ContributorRegistry<ConfigSectionContribution>,
): NavResult {
  if (sub === undefined) {
    return OK;
  }
  const inGroup = registry.list().filter((candidate) => candidate.anchor === group);
  const section = inGroup.find((candidate) => candidate.nav.id === sub);
  if (section === undefined) {
    const known = inGroup.map((candidate) => candidate.nav.id);
    return {
      ok: false,
      reason:
        known.length === 0
          ? `config group "${group}" has no sections — "${sub}" names nothing`
          : `no section "${sub}" in config group "${group}" — nearest: ${known.join(", ")}`,
    };
  }
  if (setting === undefined) {
    return OK;
  }
  const leaves = section.nav.settings ?? [];
  if (!leaves.some((leaf) => leaf.id === setting)) {
    return {
      ok: false,
      reason:
        leaves.length === 0
          ? `"${group}/${sub}" declares no settings — "${setting}" names nothing`
          : `no setting "${setting}" in "${group}/${sub}" — nearest: ${leaves.map((leaf) => leaf.id).join(", ")}`,
    };
  }
  return OK;
}
