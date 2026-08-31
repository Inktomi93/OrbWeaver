// The shell's MODAL-SLOT vocabulary — the rail-triggered/content-triggered modal registry is total over this
// tuple (assembled at the door). Extracted from `shell-store.ts` into its own module for `component-size`, the
// `section-ids.ts`/`config-group-ids.ts` precedent: it is a self-contained VOCABULARY with two readers (this
// store's `openModal` state and the door's `ModalDefinition` totality check) and belongs to neither's subject
// matter.

/** The modal vocabulary — the ModalDefinition registry is total over this tuple (assembled at the door).
 *
 *  `addDocument` joined it for the same reason `newChat` is here: the ingest dialog is a CREATION CEREMONY
 *  reachable from more than one surface (the Databank band's Add, that pane's empty state, and home's
 *  databank tile), and while it lived as local `useState` in two components a third caller could only
 *  navigate you toward it — home's "Add your first document" landed on the library's own empty state, one
 *  more click from the thing it named (side-eye 2026-08-08 P1-2). A slot makes the dialog itself the
 *  destination, from anywhere, with one opener.
 *
 *  `reauth` is the one slot NO human opens: the session-recovery ladder does (§4.4 rung 1), which is
 *  precisely why it needs a slot — a modal that must appear over ANY surface, from a `data/` seam that
 *  cannot import a feature, has nowhere else to live. */
// The `imagine`/`imageDetail`/`imageEdit` slots (interaction-direction-spec.md §7 B5) are CONTENT-triggered
// registry modals owned by `features/imagery` — opened by a `#state` action (openImagine / openImageDetail /
// openImageEdit) that carries WHICH image through the imagery-store, the newChat precedent. They live at the
// shell so they outlive a virtualized message row's unmount; `openModal` is transient, so no persist migrate.
// `settings` LEFT this tuple with the config revamp (#866 S1, D62 physics rule 5 finally satisfied): the
// settings overlay was the standing "section content in a modal" exception, and it retired into the
// Configuration SECTION (rail label "Settings", the foot slot). Nothing tombstones — the union is closed,
// so tsc enumerated every `openModal("settings")` and each became `openConfigTo(group)`.
// `theme` LEFT this tuple with S4 (#297/F-2, owner-ruled 2026-08-30): the picker + builder folded INTO
// the Appearance group's Looks section (apply-not-mode), and the rail foot shrank to the Settings section
// + the persona slot. tsc enumerated every `openModal("theme")`.
export const MODAL_SLOT_IDS = [
  "account",
  "command",
  "newChat",
  "you",
  "addDocument",
  "reauth",
  "imagine",
  "imageDetail",
  "imageEdit",
  // `pluginDialog` is the ONE house modal shell a plugin's `dialog` surface renders inside (plugin-ui-plane
  // #679 U5, §4.5a) — the imagery precedent exactly: a CONTENT-triggered slot opened by a `#state` action
  // (`openPluginDialog`) that carries WHICH (plugin, surface) through the plugin-dialog store, never a chrome
  // affordance. ONE slot for the platform, never one per plugin: the shell owns the modal grammar, the plugin
  // supplies only the attributed title and the DSL body.
  "pluginDialog",
  // `pluginCommandArgs` is the ONE house modal that collects a plugin command's DECLARED typed args (#791) when
  // it is picked from the command palette — the `pluginDialog` posture exactly: a CONTENT-triggered slot opened
  // by a `#state` action (`openPluginCommandArgs`) carrying WHICH command + its arg specs through the
  // plugin-command-args store, never a chrome affordance. ONE slot for the platform; the per-command fan is the
  // subject. The composer collects the same args inline (`name=value`), so this slot is the palette half only.
  "pluginCommandArgs",
  // The saved-cast picker (B10 'saved casts') (#26 — D61 B6): a CREATION/LIBRARY ceremony reachable from more than one
  // surface (the new-chat picker's "Start from party…" and the members panel's host action) — the
  // `addDocument` reasoning verbatim: a slot makes the picker itself the destination, from anywhere,
  // with one opener spelling. Owned by `features/roster-preset` (savedCastsModal).
  "savedCasts",
] as const;
export type ModalSlotId = (typeof MODAL_SLOT_IDS)[number];
