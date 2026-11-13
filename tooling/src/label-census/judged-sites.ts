// The label census's judged sites: each row is a reader's verdict that a site in a home class (a production home exists
// and the test types the text anyway) is not a name the test should take from production.
//
// The rule a row applies: a name the mounted component renders is judged only as a `literal-pin`; otherwise the test
// imports it or calls its label function, or production first moves it to its names leaf and renders it from there. A
// row records only a value that is no such name, or a deliberate pin, for one of the reasons below.
//
// A row keys on the test file the literal is written in, the case it sits in (as `judged-oracles.ts` keys a case) and
// the literal's value (a template or pattern as the source spells it), so it survives line drift. The key is
// deliberately not the line: one row covers every site of that value in its case, because two sites of one value in
// one case share one verdict. The census prints every home-class site no row covers, and every row that covers no
// home-class site: a row goes stale when its site is rebound or deleted, or when a story starts to author the value.
//
// The reasons, a closed list:
// - `production-id`: the value is an identifier production keeps in state, such as a modal slot id or a section id,
//   that a story prints for the case to read. No user reads it as a name.
// - `test-authored`: the test, its story or its own helper module wrote the value: a story prop, a payload, a tracker
//   it defines, a document it serves, text it typed. Production spells the same word for another control, or, for a
//   `composed` site, a production template fits the text by accident: a false fit, which the note names.
// - `guest-authored`: a guest plugin's markup wrote the value, and the host renders it as the guest's content.
// - `data`: the value is content or syntax a control shows, not the control's name: a macro token, a card fence, a
//   wire enum value printed as a badge, an entry the first-boot seed writes into a user's own library.
// - `fragment`: the value is part of a text the assertion matches by substring, not a whole name.
// - `literal-pin`: the case's subject is the composed name itself (which words show, in which order, for which input),
//   so the value spells production's words by hand where a call to the label function would compare it with itself.
//   The case locates the control through the function, and no other case pins that output literally; a pattern
//   pin says in its note why it must be a pattern.

/** Why a home-class site is no name the targeted control renders; each member is defined in the header. */
export const SITE_REASONS = ["production-id", "test-authored", "guest-authored", "data", "fragment", "literal-pin"] as const;
export type SiteReason = (typeof SITE_REASONS)[number];

/** One verdict: the site's value is no rendered name, for `reason`; `note` names the evidence a reader checks. */
export interface SiteJudgement {
  readonly file: string;
  readonly scope: string;
  readonly value: string;
  readonly reason: SiteReason;
  readonly note: string;
}

export const JUDGED_SITES: readonly SiteJudgement[] = [
  {
    file: "tests/client/components/_described-menu-item-labels.ts",
    scope: "(module)",
    value: "Archive",
    reason: "test-authored",
    note: "the described-menu story renders these item labels from this helper; no production menu mounts",
  },
  {
    file: "tests/client/components/_described-menu-item-labels.ts",
    scope: "(module)",
    value: "Duplicate",
    reason: "test-authored",
    note: "the described-menu story renders these item labels from this helper; no production menu mounts",
  },
  {
    file: "tests/client/components/_described-menu-item-labels.ts",
    scope: "(module)",
    value: "Export",
    reason: "test-authored",
    note: "the described-menu story renders these item labels from this helper; no production menu mounts",
  },
  {
    file: "tests/client/components/form-dialog-footer.ct.tsx",
    scope: "a body's state starts fresh on each open, Enter commits and the opener takes focus back",
    value: "second",
    reason: "test-authored",
    note: "the text the case types into the story's field and reads back",
  },
  {
    file: "tests/client/components/list-pane-header.ct.tsx",
    scope: "back is keyboard operable and the host renders one optional action and its resulting overlay",
    value: "Chats",
    reason: "test-authored",
    note: "the title the case passes through component.update and reads back from the heading",
  },
  {
    file: "tests/client/compose/library-accessibility.ct.tsx",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the case's title template as the source spells it.
    scope: 'native library shelf ${scenario.captioned ? "caption" : "no-caption"} keeps its description and resumes its room by ${scenario.key}',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Resume the chat with ${character.name}, ${stamp}`",
    reason: "literal-pin",
    note: "characterFaceName's resume arm; the face is located by its character and no other case pins this arm's words",
  },
  {
    file: "tests/client/compose/library-accessibility.ct.tsx",
    scope: "native library starred shelf opens the character editor by keyboard even when the character has a room",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`${subjects.starred.name}, starred`",
    reason: "literal-pin",
    note: "characterFaceName's starred arm; the case comment says the starred tail is pinned by the literal the reader hears",
  },
  {
    file: "tests/client/compose/library-accessibility.ct.tsx",
    scope: "native library starred shelf opens the character editor by keyboard even when the character has a room",
    value: "Starred · 1",
    reason: "literal-pin",
    note: "characterStarredShelfName; the case comment says the shelf count is pinned by the literal the reader hears",
  },
  {
    file: "tests/client/data/session-freshness.ct.tsx",
    scope: "an unreachable visibility read retries, while a real signed-out verdict opens recovery without discarding the workspace",
    value: "reauth",
    reason: "production-id",
    note: "the session prompt's modal slot id, which the story prints in a status probe",
  },
  {
    file: "tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx",
    scope: "the ⌘K chip paints no text, and its name and description carry Jump and this platform's shortcut",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Jump to… ${shortcut}`",
    reason: "literal-pin",
    note: "the command chip's description, COMMAND_MODAL_TITLE then the shortcut (command-chip.tsx); the case is titled for those words",
  },
  {
    file: "tests/client/features/app-shell/surfaces/list-band-title.ct.tsx",
    scope: "widestBand",
    value: " of ",
    reason: "fragment",
    note: "the census joiner inside a band title the case matches by substring",
  },
  {
    file: "tests/client/features/app-shell/surfaces/list-band-title.ct.tsx",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the case's title template as the source spells it.
    scope: "the ${collection.id} band prints its census whole or not at all, and its value stays in the heading's name, with Context docked",
    value: " of ",
    reason: "fragment",
    note: "the census joiner inside a band title the case matches by substring",
  },
  {
    file: "tests/client/features/app-shell/surfaces/list-band-title.ct.tsx",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the case's title template as the source spells it.
    scope: "the ${collection.id} screen name prints its census whole or not at all, and its value stays in the name",
    value: " of ",
    reason: "fragment",
    note: "the census joiner inside a screen name the case matches by substring",
  },
  {
    file: "tests/client/features/chat/components/ghost-macro.ct.tsx",
    scope: "a streaming reply resolves {{char}} to the speaker's name, as the settled row does",
    value: "{{char}}",
    reason: "data",
    note: "the macro token the scripted reply streams, which the case proves resolves away",
  },
  {
    file: "tests/client/features/chat/components/platform-remaining-action-groups.suite.ct.tsx",
    scope: "meter and text tracker definitions keep all editors and glyph actions contained",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: 'new RegExp(`^Tracker ${String(index + 1)} label: `, "u")',
    reason: "literal-pin",
    note: "trackerLabelFieldName; the builder finds the control and the case comment says these literals pin what the reader hears",
  },
  {
    file: "tests/client/features/chat/components/platform-remaining-action-groups.suite.ct.tsx",
    scope: "meter and text tracker definitions keep all editors and glyph actions contained",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Remove ${def.label}`",
    reason: "literal-pin",
    note: "trackerRemoveName; the builder finds the control and the case comment says these literals pin what the reader hears",
  },
  {
    file: "tests/client/features/chat/components/platform-remaining-action-groups.suite.ct.tsx",
    scope: "meter and text tracker definitions keep all editors and glyph actions contained",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: 'new RegExp(`^${RegExp.escape(`${def.label} default max`)}: `, "u")',
    reason: "literal-pin",
    note: "trackerDefaultMaxName; the builder finds the control and the case comment says these literals pin what the reader hears",
  },
  {
    file: "tests/client/features/chat/components/regex-row-title-floor.ct.tsx",
    scope: "(module)",
    value: "Quotation marks smoothed across every speaker in the long vigil at the lighthouse keeper's cottage",
    reason: "test-authored",
    note: "a false fit of a corpus insight template: the regex title the case seeds",
  },
  {
    file: "tests/client/features/config/surfaces/config-search-fold.ct.tsx",
    scope: "Enter on a member hit lands in its editor, because the search field started the arrival",
    value: "/luck ledger/u",
    reason: "data",
    note: "the seed card's lorebook entry title, which the search hit prints; a seed row, not a control name",
  },
  {
    file: "tests/client/features/config/surfaces/config-search-fold.ct.tsx",
    scope: "a member hit whose read is held leaves a reader who went back to typing in the search field",
    value: "/luck ledger/u",
    reason: "data",
    note: "the seed card's lorebook entry title, which the search hit prints; a seed row, not a control name",
  },
  {
    file: "tests/client/features/config/surfaces/looks-hearth-thumbnail.ct.tsx",
    scope: "the Hearth thumbnail paints the base surface on a Light page",
    value: "/Hearth/u",
    reason: "data",
    note: "the Hearth theme's row name, which the server seeds and the Looks radio prints",
  },
  {
    file: "tests/client/features/config/surfaces/looks-import-leftovers.ct.tsx",
    scope: "a theme you already have is reported as reused, and its note never claims an import",
    value: "4 SillyTavern settings in this file aren't part of a theme here",
    reason: "literal-pin",
    note: "themeImportLeftoverTitle's reuse arm; the case is titled for the reuse wording that never claims an import",
  },
  {
    file: "tests/client/features/config/surfaces/theme-css-editor.ct.tsx",
    scope: "a planted stale slot warns in the editor and names the closest current slot",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: '`[data-slot="${SLOT}"]`',
    reason: "fragment",
    note: "CSS selector syntax inside the diagnostic message, matched by substring",
  },
  {
    file: "tests/client/features/config/surfaces/theme-css-editor.ct.tsx",
    scope: "a current slot raises no warning",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: '`[data-slot="${SLOT}"]`',
    reason: "test-authored",
    note: "the selector the case typed into the editor",
  },
  {
    file: "tests/client/features/config/surfaces/theme-css-editor.ct.tsx",
    scope: "accepting a slot completion writes the name into the selector",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: '`[data-slot="${SLOT}"`',
    reason: "test-authored",
    note: "the selector the case typed, completed in the editor",
  },
  {
    file: "tests/client/features/credentials/components/platform-credential-fact-action-groups.suite.ct.tsx",
    scope: "saved-key actions remain state-exclusive and canceled secret/destructive prompts do not write",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Replace the ${subject} key`",
    reason: "literal-pin",
    note: "replaceKeyName; the builder finds the control and no other case pins its words",
  },
  {
    file: "tests/client/features/credentials/components/platform-credential-fact-action-groups.suite.ct.tsx",
    scope: "saved-key actions remain state-exclusive and canceled secret/destructive prompts do not write",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Revoke the ${subject} key`",
    reason: "literal-pin",
    note: "revokeKeyName; the builder finds the control and no other case pins its words",
  },
  {
    file: "tests/client/features/credentials/components/platform-credential-fact-action-groups.suite.ct.tsx",
    scope: "saved-key actions remain state-exclusive and canceled secret/destructive prompts do not write",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Revoke the ${subject} key?`",
    reason: "literal-pin",
    note: "revokeKeyTitle; the builder finds the dialog and no other case pins its words",
  },
  {
    file: "tests/client/features/credentials/components/platform-credential-fact-action-groups.suite.ct.tsx",
    scope: "saved-key actions remain state-exclusive and canceled secret/destructive prompts do not write",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Remove the ${subject} key`",
    reason: "literal-pin",
    note: "removeKeyName; the builder finds the control and no other case pins its words",
  },
  {
    file: "tests/client/features/credentials/components/platform-credential-fact-action-groups.suite.ct.tsx",
    scope: "saved-key actions remain state-exclusive and canceled secret/destructive prompts do not write",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Remove the ${subject} key?`",
    reason: "literal-pin",
    note: "removeKeyTitle; the builder finds the dialog and no other case pins its words",
  },
  {
    file: "tests/client/features/databank/hooks/databank-list-header.ct.tsx",
    scope: "each owner-wide sweep waits for its confirm before sending its mode, and Add opens the ingest slot",
    value: "addDocument",
    reason: "production-id",
    note: "the ingest modal slot id, which the story prints in a status probe",
  },
  {
    file: "tests/client/features/discovery/components/corpus-context-tabs-boundary.ct.tsx",
    scope: "(module)",
    value: "forked",
    reason: "data",
    note: "a wire relation value the pair row prints as its badge",
  },
  {
    file: "tests/client/features/discovery/surfaces/duplicate-chats-names.ct.tsx",
    scope: "(module)",
    value: "Remove the unrelated pair",
    reason: "test-authored",
    note: "a false fit of a remove grammar: the story's own control label",
  },
  {
    file: "tests/client/features/persona/components/platform-persona-action-groups.suite.ct.tsx",
    scope: "the persona editor retains all lifecycle actions and cancelling Delete preserves the named persona",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Show details for ${name}`",
    reason: "literal-pin",
    note: "personaDetailsToggleName's closed arm; the case comment says a swapped arm fails here",
  },
  {
    file: "tests/client/features/persona/components/platform-persona-action-groups.suite.ct.tsx",
    scope: "the persona editor retains all lifecycle actions and cancelling Delete preserves the named persona",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Hide details for ${name}`",
    reason: "literal-pin",
    note: "personaDetailsToggleName's open arm; the case comment says a swapped arm fails here",
  },
  {
    file: "tests/client/features/persona/components/platform-persona-editor-footprint.suite.ct.tsx",
    scope: "the persona editor keeps keyboard completion, popup footprint and helper description on its actual macro control",
    value: "{{user}}",
    reason: "data",
    note: "the macro token the case completes and reads in the macro field",
  },
  {
    file: "tests/client/features/plugin/components/confirmation-identity.ct.tsx",
    scope: "a refreshed action cannot inherit another action's open destructive confirmation",
    value: "Refresh actions",
    reason: "test-authored",
    note: "a false fit: the labels the guest UI source this case serves declares",
  },
  {
    file: "tests/client/features/plugin/components/confirmation-identity.ct.tsx",
    scope: "a refreshed action cannot inherit another action's open destructive confirmation",
    value: "Remove first",
    reason: "test-authored",
    note: "a false fit: the labels the guest UI source this case serves declares",
  },
  {
    file: "tests/client/features/plugin/components/confirmation-identity.ct.tsx",
    scope: "a refreshed action cannot inherit another action's open destructive confirmation",
    value: "Remove first?",
    reason: "test-authored",
    note: "a false fit: the labels the guest UI source this case serves declares",
  },
  {
    file: "tests/client/features/plugin/components/confirmation-identity.ct.tsx",
    scope: "a refreshed action cannot inherit another action's open destructive confirmation",
    value: "Remove second",
    reason: "test-authored",
    note: "a false fit: the labels the guest UI source this case serves declares",
  },
  {
    file: "tests/client/features/plugin/components/confirmation-identity.ct.tsx",
    scope: "a refreshed action cannot inherit another action's open destructive confirmation",
    value: "Remove second?",
    reason: "test-authored",
    note: "a false fit: the labels the guest UI source this case serves declares",
  },
  {
    file: "tests/client/features/plugin/components/context-panels.ct.tsx",
    scope: "ordinary plugin panels share Context, collapse independently, and move individually to the sidecar",
    value: "First panel content",
    reason: "test-authored",
    note: "a false fit of contentRegionName: text the case's plugin bundle renders in its panel",
  },
  {
    file: "tests/client/features/plugin/components/context-panels.ct.tsx",
    scope: "ordinary plugin panels share Context, collapse independently, and move individually to the sidecar",
    value: "Second panel content",
    reason: "test-authored",
    note: "a false fit of contentRegionName: text the case's plugin bundle renders in its panel",
  },
  {
    file: "tests/client/features/plugin/components/context-panels.ct.tsx",
    scope: "keyboard placement hands focus to the return control and back to the restored panel",
    value: "First panel content",
    reason: "test-authored",
    note: "a false fit of contentRegionName: text the case's plugin bundle renders in its panel",
  },
  {
    file: "tests/client/features/plugin/components/context-panels.ct.tsx",
    scope: "ordinary panels use mobile Context and only an explicitly selected panel opens in the sidecar sheet",
    value: "First panel content",
    reason: "test-authored",
    note: "a false fit of contentRegionName: text the case's plugin bundle renders in its panel",
  },
  {
    file: "tests/client/features/plugin/components/context-panels.ct.tsx",
    scope: "ordinary panels use mobile Context and only an explicitly selected panel opens in the sidecar sheet",
    value: "Second panel content",
    reason: "test-authored",
    note: "a false fit of contentRegionName: text the case's plugin bundle renders in its panel",
  },
  {
    file: "tests/client/features/plugin/components/flank-overlay-exits.ct.tsx",
    scope: "Escape closes the overlay after a press on a part that takes no focus",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`${PLUGINS[0].name} content`",
    reason: "test-authored",
    note: "the text the case's plugin bundle registers as its panel's content",
  },
  {
    file: "tests/client/features/plugin/components/hide-focus.ct.tsx",
    scope: "hiding the final plugin panel returns focus to the shell Chats main region",
    value: "Focus panel content",
    reason: "test-authored",
    note: "a false fit of contentRegionName: text the case's plugin bundle renders in its panel",
  },
  {
    file: "tests/client/features/plugin/components/platform-plugin-action-sizing.suite.ct.tsx",
    scope: "(module)",
    value: "Review the current note alongside the complete northern expedition reference archive",
    reason: "test-authored",
    note: "a false fit: the long action label the case's plugin declares",
  },
  {
    file: "tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx",
    scope:
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the case's title template as the source spells it.
      'Atlas whole filter controls ${viewport.sharedLine ? "stay inline and horizontally contained" : "stay horizontally contained"} in a ${viewport.host}px host at ${viewport.width}×${viewport.height}',
    value: "Sort",
    reason: "guest-authored",
    note: "the Card Atlas guest bundle names its own select; the host renders the guest's markup",
  },
  {
    file: "tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx",
    scope: "settings use the same attributed block for native scripted and frame registrations",
    value: "Native scripted settings",
    reason: "test-authored",
    note: "a false fit of a settings template: the text the case's plugin renders",
  },
  {
    file: "tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx",
    scope: "settings use the same attributed block for native scripted and frame registrations",
    value: "Native frame settings",
    reason: "test-authored",
    note: "a false fit of a settings template: the text the case's plugin frame renders",
  },
  {
    file: "tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx",
    scope: "Keepsake Album names the live media placement and retains its chat-only slash alternative",
    value: "/plugin keepsake-camera snapshot",
    reason: "guest-authored",
    note: "the Keepsake Camera bundle's album copy, matched by substring",
  },
  {
    file: "tests/client/features/preset/components/list-lifetimes.ct.tsx",
    scope: "native nested lists preserve typing and successor bindings, retain own echoes, and close replaced draft editors",
    value: "Option 1",
    reason: "literal-pin",
    note: "presetVariableOptionGroupName and its confirm; the case comment says the literals pin the ordinal counted from one",
  },
  {
    file: "tests/client/features/preset/components/list-lifetimes.ct.tsx",
    scope: "native nested lists preserve typing and successor bindings, retain own echoes, and close replaced draft editors",
    value: "Remove option 1?",
    reason: "literal-pin",
    note: "presetVariableOptionGroupName and its confirm; the case comment says the literals pin the ordinal counted from one",
  },
  {
    file: "tests/client/features/preset/components/preset-readout-boundary.ct.tsx",
    scope: "Actions holds, fails and retries the resolved preview, and says the host-only refusal as one",
    value: "/^Action readout: /u",
    reason: "literal-pin",
    note: "presetActionReadoutName's lead; the builder finds the region and the case comment says the literal pins it",
  },
  {
    file: "tests/client/features/refinery/components/payload-inherited-keys.ct.tsx",
    scope: "an omitted field named like an inherited object member renders as absent at every payload depth",
    value: "present",
    reason: "test-authored",
    note: "a payload field the case serves and reads back",
  },
  {
    file: "tests/client/features/refinery/components/payload-inherited-keys.ct.tsx",
    scope: "an omitted field named like an inherited object member renders as absent at every payload depth",
    value: "constructor",
    reason: "test-authored",
    note: "the inherited-member key the case serves as a payload field",
  },
  {
    file: "tests/client/features/regex/surfaces/regex-editor-reflow.ct.tsx",
    scope: "a long find pattern wraps at 300% text and the editor does not scroll sideways",
    value: "narration",
    reason: "test-authored",
    note: "text the case's seeded script carries",
  },
  {
    file: "tests/client/features/rpg/components/own-key-panels.ct.tsx",
    scope: "(module)",
    value: "Mood",
    reason: "test-authored",
    note: "the text tracker the case defines on the game",
  },
  {
    file: "tests/client/features/rpg/components/platform-action-groups.suite.ct.tsx",
    scope: "known-character resting and confirmation controls fit, and cancellation preserves the actor",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Promote ${name} to the room's characters`",
    reason: "literal-pin",
    note: "npcPromoteName; the builder finds the control and the case comment says these literals pin what the reader hears",
  },
  {
    file: "tests/client/features/rpg/components/platform-action-groups.suite.ct.tsx",
    scope: "known-character resting and confirmation controls fit, and cancellation preserves the actor",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Give ${name} a character card and a seat in this room`",
    reason: "literal-pin",
    note: "npcPromoteTipLabel; the case comment says these literals pin what the reader hears",
  },
  {
    file: "tests/client/features/rpg/components/platform-action-groups.suite.ct.tsx",
    scope: "known-character resting and confirmation controls fit, and cancellation preserves the actor",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Dismiss ${name}`",
    reason: "literal-pin",
    note: "npcDismissName; the builder finds the control and the case comment says these literals pin what the reader hears",
  },
  {
    file: "tests/client/features/rpg/components/platform-action-groups.suite.ct.tsx",
    scope: "known-character resting and confirmation controls fit, and cancellation preserves the actor",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Cancel promoting ${name}`",
    reason: "literal-pin",
    note: "npcCancelPromoteName; the builder finds the control and the literal pins its words",
  },
  {
    file: "tests/client/features/rpg/components/platform-action-groups.suite.ct.tsx",
    scope: "known-character resting and confirmation controls fit, and cancellation preserves the actor",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Confirm promoting ${name}`",
    reason: "literal-pin",
    note: "npcConfirmPromoteName; the builder finds the control and the literal pins its words",
  },
  {
    file: "tests/client/features/rpg/components/platform-action-groups.suite.ct.tsx",
    scope: "known-character resting and confirmation controls fit, and cancellation preserves the actor",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Give ${name} a character card and a seat in this room? Everything tracked on them comes along; their mood and their stance toward you do not.`",
    reason: "literal-pin",
    note: "npcPromoteQuestionLabel; the case locates the copy by the builder below and the literal pins its words",
  },
  {
    file: "tests/client/features/rpg/components/platform-action-groups.suite.ct.tsx",
    scope: "known-character resting and confirmation controls fit, and cancellation preserves the actor",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Confirm dismissing ${name}`",
    reason: "literal-pin",
    note: "npcConfirmDismissName; the builder finds the control and the literal pins its words",
  },
  {
    file: "tests/client/features/rpg/components/platform-action-groups.suite.ct.tsx",
    scope: "known-character resting and confirmation controls fit, and cancellation preserves the actor",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Forget ${name} and everything tracked on them?`",
    reason: "literal-pin",
    note: "npcDismissQuestionLabel; no other case pins its words",
  },
  {
    file: "tests/client/features/rpg/components/scene-cards.ct.tsx",
    scope: "the archive is a heading, not a region, and its card row is a touch-sized control stamped with an older turn's day and time",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Open card: ${CARD_TITLE}, ${stamp}`",
    reason: "literal-pin",
    note: "openCardName's no-note arm; the case comment says the literal pins it",
  },
  {
    file: "tests/client/features/rpg/components/scene-cards.ct.tsx",
    scope: "a card from another year carries the year in its chip and its row name",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`Open card: ${CARD_TITLE}, ${stamp}`",
    reason: "literal-pin",
    note: "openCardName with a year stamp; the case is titled for the year in the row name",
  },
  {
    file: "tests/client/lib/use-focus-on-mount-names.ts",
    scope: "(module)",
    value: "Dismiss",
    reason: "test-authored",
    note: "the focus-on-mount story renders this button label from this helper",
  },
  {
    file: "tests/client/state/durable-local-binding.ct.tsx",
    scope: "verified binding preserves returning-user bytes and rejects another user's boot hint",
    value: "home",
    reason: "production-id",
    note: "the bound workspace id, which the story prints in a status probe",
  },
  {
    file: "tests/client/state/state-lifecycle.ct.tsx",
    scope: "(module)",
    value: "Back to Witness library",
    reason: "test-authored",
    note: "a false fit of sectionBackName: the drill rows the story is handed as props",
  },
  {
    file: "tests/client/state/state-lifecycle.ct.tsx",
    scope: "(module)",
    value: "Back to Witness entries",
    reason: "test-authored",
    note: "a false fit of sectionBackName: the drill rows the story is handed as props",
  },
  {
    file: "tests/e2e/live-composer-instant-type.spec.ts",
    scope: "(module)",
    value: "Typing instantly on fast room entry should keep every character.",
    reason: "test-authored",
    note: "a false fit: the text the spec types",
  },
  {
    file: "tests/e2e/live-parity-plus-capstone.spec.ts",
    scope: "P4 immersive HTML: a planted :::card settles routed under the D294 grant, view-raw shows source, archive lists it, no DOM leak",
    value: ":::card",
    reason: "data",
    note: "the card fence syntax the raw view shows",
  },
  {
    file: "tests/e2e/live-settings-render-truth.spec.ts",
    scope: "(module)",
    value: "Charlotte's study",
    reason: "data",
    note: "a background entry the first-boot seed writes into the user's own library",
  },
  {
    file: "tests/e2e/members-tab-views.local.spec.ts",
    scope: "(module)",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: 'new RegExp(`: host${PRESENCE}$`, "u")',
    reason: "literal-pin",
    note: "rowAccessibleName's role and presence clauses; the header says the anchored pattern is the case's subject, and it must be a pattern because the presence clause may be absent",
  },
  {
    file: "tests/e2e/rpg-lite-loop.spec.ts",
    scope: "(module)",
    value: "Mana",
    reason: "test-authored",
    note: "the tracker the spec defines on the game",
  },
  {
    file: "tests/e2e/rpg-lite-loop.spec.ts",
    scope: "(module)",
    value: "Trust",
    reason: "test-authored",
    note: "the tracker the spec defines on the game",
  },
  {
    file: "tests/e2e/support/surface-chat.ts",
    scope: "walkChatCommands",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the site's template as the source spells it.
    value: "`${title} renamed`",
    reason: "test-authored",
    note: "the title the walk types into the rename field",
  },
  {
    file: "tests/ui/content/sandbox-frame/sandbox-frame-navigation.ct.tsx",
    scope: "a card form submission is blocked even when the embedder's frame-src is open",
    value: "send",
    reason: "test-authored",
    note: "the button in the card markup the case serves",
  },
  {
    file: "tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx",
    scope: "the srcdoc floor is script-dead: its sandbox grants nothing and an authored script never runs",
    value: "card",
    reason: "test-authored",
    note: "text in the card markup the case serves",
  },
  {
    file: "tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx",
    scope: "a card-authored script is refused by the served policy and cannot drive the height",
    value: "card",
    reason: "test-authored",
    note: "text in the card markup the case serves",
  },
  {
    file: "tests/ui/primitives/log-viewer/named-logs.ct.tsx",
    scope: "(module)",
    value: "Static prefix",
    reason: "test-authored",
    note: "the subject the named-logs story passes each log viewer",
  },
  {
    file: "tests/ui/primitives/log-viewer/named-logs.ct.tsx",
    scope: "(module)",
    value: "Dynamic suffix",
    reason: "test-authored",
    note: "the subject the named-logs story passes each log viewer",
  },
];
