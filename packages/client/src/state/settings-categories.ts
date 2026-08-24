// The settings CATEGORY vocabulary — the closed tuple the pane registry is total over, and the shell's
// `settingsCategory`/`openSettingsTo` navigation type.
//
// SPLIT OUT OF `shell-store.ts` at C7 (2026-08-24), and the reason is worth recording because the pressure
// will recur: the tuple had TWO readers already (`shell-store.ts` for the nav state, `settings-pane-registry.ts`
// for the registry's totality) and lived in neither's subject matter — it is vocabulary, not store state and
// not a render contract. It sat inline in `shell-store.ts` at 443 lines against that file's 450-line
// `component-size` cap, so ADDING ONE MEMBER pushed the tuple past the printWidth, biome exploded it to one
// entry per line, and a 9-word edit REDDED a gate in a file it had no business restructuring. A vocabulary
// with two readers and its own file has neither problem, and the next member costs one line here.
//
// Both former homes now import from this one. No inversion, no cycle: this module imports NOTHING.

/** The settings vocabulary — the SettingsPaneDefinition registry is total over this tuple (assembled at
 *  the door). MOVED to state from features/settings/lib/settings-nav-model.ts (M6.1 ruling, §5 rule 5):
 *  `settingsCategory`/`openSettingsTo` already navigated by category as a bare string, i.e. this was
 *  always shell vocabulary, just untyped.
 *
 *  `system` RETIRED with SET-SEAMS stage 4 (§10 Q2, owner-ruled): it and `admin` were both APP-group,
 *  both admin-gated, and after the decomposition both held admin-tier knob sections owned by the same
 *  feature — two panes meant hunting for which admin knob lived where. System's five sections are the
 *  admin pane's FIRST group now; a deep link to `system` no longer type-checks (`openSettingsTo("admin")`
 *  is the replacement) and `agent-nav` rejects it against this tuple.
 *
 *  `tags` + `regex` RETIRED with the config rail's R1 (config-rail-spec.md §2 C-11): both were
 *  workspace-grade CRUD libraries living as modal panes, and they are now `CollectionContribution`s in the
 *  `config` section's roster. The "Library" nav group disappeared with them; NOTHING tombstones — the union
 *  is closed, so tsc enumerated every `openSettingsTo` call site and each became `goToCollection(kind)`.
 *
 *  `plugins` ADDED at C7: the D46 sandbox's install/grant/lifecycle screen (`features/plugin`). It is the
 *  SECURITY surface of that feature — the one place a person confirms what a sandboxed script may reach —
 *  which is why it is a pane of its own beside Connections rather than a section inside another pane. */
export const SETTINGS_CATEGORY_IDS = [
  "personas",
  "appearance",
  "workloads",
  "backup",
  "chat-behavior",
  "connections",
  "automation",
  "plugins",
  "admin",
] as const;
export type SettingsCategoryId = (typeof SETTINGS_CATEGORY_IDS)[number];
