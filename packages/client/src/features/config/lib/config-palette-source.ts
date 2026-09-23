// The ⌘K SETTINGS source (#866 S2) — the SAME static index the LIST
// search derives, contributed to the command palette as a `CommandPaletteSource` ("Settings"): one row per
// group / section / leaf, `run` = the `openConfigTo` deep link, the palette dismisses and Config lands with
// the hit flashed. One index, two hosts; nothing hardcoded (the `plugin-command-palette-source.ts`
// precedent).
//
// THE GROUPS ARRIVE BY A DOOR-BOUND MODULE SLOT, not a factory: the group registry is door-held (delivered
// to the host by `makeConfigSection(groups)` — no context pair), and `useRows` must be a MODULE-LEVEL hook
// (a factory-minted hook is a new function identity per call — the `noComponentHookFactories` wall). The
// door calls `bindConfigPaletteGroups(groups)` once, in the same assembly that builds the registry; the slot
// is written exactly once and read forever after, the module-scope posture every `#state` store already
// takes. Unbound (a test that never assembled the door) ⇒ zero rows — byte-identical to no source.
//
// STATIC rows only, stated rather than left to be noticed: a group's DYNAMIC rows (`useSearchRows` — a
// collection's members, the persona names) are per-group HOOKS, and `useRows` is ONE hook slot — running
// thirteen optional hooks in a loop here would be the rules-of-hooks violation the per-fiber posture exists
// to avoid. Members stay reachable through the LIST search (its per-group fibers) and the palette's own
// entity sources.

import { Settings } from "@orb/ui/icons";
import { useSettingsViewerView } from "#data";
import type { CommandPaletteSource, PaletteCommandRow } from "#lib";
import type { ConfigGroupRegistry } from "#state";
import { openConfigTo, setConfigSearchMatch } from "#state";
import type { ConfigSearchEntry } from "./config-search.ts";
import { buildConfigSearchEntries } from "./config-search.ts";
import { useConfigSubcategories } from "./config-subcategories.ts";

let boundGroups: ConfigGroupRegistry | null = null;

/** The door's one write — called beside the registry assembly (`compose/authed-app.tsx`). */
export function bindConfigPaletteGroups(groups: ConfigGroupRegistry): void {
  boundGroups = groups;
}

function toRow(entry: ConfigSearchEntry): PaletteCommandRow {
  return {
    id: `config:${entry.id}`,
    label: entry.label,
    describe: entry.kind === "group" ? entry.groupLabel : `${entry.groupLabel} — open this setting`,
    ...(entry.kind === "group" ? {} : { badge: entry.groupLabel }),
    keywords: [...entry.keywords],
    run: (): void => {
      openConfigTo(entry.groupId, entry.subId ?? undefined, entry.settingId ?? undefined);
      setConfigSearchMatch({ group: entry.groupId, sub: entry.subId, setting: entry.settingId, memberId: null });
    },
  };
}

/** The whole visible static index as palette rows — a hook, in the source's own fiber (the palette renders
 *  each source as its own component). Advanced rows stay behind the LIST search's `@advanced` (the palette
 *  has no token grammar). */
function useConfigPaletteRows(): readonly PaletteCommandRow[] {
  const viewer = useSettingsViewerView();
  const subcategoriesFor = useConfigSubcategories();
  const groups = boundGroups;
  if (groups === null) {
    return [];
  }
  const visible = new Set(
    groups
      .list()
      .filter((group) => group.when?.(viewer) ?? true)
      .map((group) => group.id),
  );
  const entries = buildConfigSearchEntries(groups, (id) => visible.has(id), subcategoriesFor);
  return entries.filter((entry) => !entry.advanced).map(toRow);
}

export const configPaletteSource: CommandPaletteSource = {
  id: "config-settings",
  heading: "Settings",
  icon: Settings,
  useRows: useConfigPaletteRows,
};
