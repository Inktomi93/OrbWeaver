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
// The `imagine`/`imageDetail`/`imageEdit` slots are CONTENT-triggered
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
// `account` LEFT with S4's other half (#866, owner-ruled F-3): the modal's three facts + sign-out became
// the persona switcher's head and foot (`PersonaAccountFoot`) — one concept named "account" (D74 survives
// as You ⊃ Identity). tsc enumerated every `openModal("account")`.
export const MODAL_SLOT_IDS = [
  "command",
  "newChat",
  "you",
  "addDocument",
  "reauth",
  "imagine",
  "imageDetail",
  "imageEdit",
  // `pluginDialog` is the ONE house modal shell a plugin's `dialog` surface renders inside
  // — the imagery precedent exactly: a CONTENT-triggered slot opened by a `#state` action
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
  // The saved-roster picker (B10 'saved rosters') (#26 — D61 B6): a CREATION/LIBRARY ceremony reachable from more than one
  // surface (the new-chat picker's "Start from a saved roster" and the members panel's host action) — the
  // `addDocument` reasoning verbatim: a slot makes the picker itself the destination, from anywhere,
  // with one opener spelling. Owned by `features/roster-preset` (savedRostersModal).
  "savedRosters",
] as const;
export type ModalSlotId = (typeof MODAL_SLOT_IDS)[number];

/** Whether a modal slot's MEANING survives the CONTENT pane being swapped underneath it (UI-Arch §4a,
 *  #1795). `"global"` = reachable from, and about, anywhere — it stays open across a swap. `"content"` =
 *  its subject is the very content being left, so the swap dismisses it. */
export type ModalContentLifetime = "global" | "content";

/**
 * THE CONTENT-SWAP LIFETIME OF EVERY MODAL SLOT — the shell's answer to "may this float outlive the
 * content it was opened against?" (UI-Arch §4a; the mechanism is `withContentSwap` in `shell-store.ts`).
 *
 * WHY IT LIVES WITH THE VOCABULARY AND NOT ON `ModalDefinition`. The registry's posture is that a modal
 * SELF-DECLARES (its title, trigger, presentation), and lifetime looks like one more of those axes — but
 * the DECIDER is a navigation action in this tier (`setActiveSection`, `selectChat`, `selectCharacter`),
 * which holds only the open slot ID: the assembled registry is a React context read at the door, and a
 * store action fires outside any render. A def-side field would therefore have to be re-published into
 * `#state` at mount to be readable at the moment of the swap — a second home for one fact. The closed
 * vocabulary is the one place both readers already share, and `Record<ModalSlotId, …>` makes the
 * declaration MANDATORY: a new slot id fails `tsc` here until it says which kind of float it is
 * (the §5.5 mapped-Record dispatch discipline — the enforcer is compile-time, not a gate).
 *
 * THE RULE BEHIND THE ROWS. A slot is `"content"` when its SUBJECT is a thing inside the content being
 * left — the three imagery modals carry an `ImageSubject`/`ImagineSeed` pinned to one room's asset, so
 * after a swap the reader is looking at a lightbox for a room they are no longer in. Everything else is
 * `"global"`: a ceremony reachable from several sections (`newChat`, `addDocument`, `savedRosters`), the
 * navigator itself (`command`), the account sheet (`you`), a plugin round-trip's outcome that can be
 * raised from a settings row as easily as from a chat (`pluginDialog`, `pluginCommandArgs` — both also
 * hold user-entered state a navigation must not discard, and both pin their own scope), and `reauth`,
 * which must survive EVERY swap by construction: the recovery ladder navigates (`selectChat` on resume)
 * while its own prompt is up, and dismissing it would strand the ladder's promise.
 */
export const MODAL_CONTENT_LIFETIME: Record<ModalSlotId, ModalContentLifetime> = {
  command: "global",
  newChat: "global",
  you: "global",
  addDocument: "global",
  reauth: "global",
  // THE PRICE OF THIS ROW, stated where the choice is (owner-confirmed 2026-09-06): `imagine` also holds a
  // TYPED PROMPT, so a programmatic navigation away discards what the person was writing. It is `"content"`
  // anyway because the seed pins a chatId and the composer generates INTO that room — a preview-before-spend
  // surface for a room you have left is the worse of the two wrongs. Flipping it is a one-word edit here.
  imagine: "content",
  imageDetail: "content",
  imageEdit: "content",
  pluginDialog: "global",
  pluginCommandArgs: "global",
  savedRosters: "global",
};
