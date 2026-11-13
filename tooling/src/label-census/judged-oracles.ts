// The label census's judged oracle candidates: each row is a reader's verdict that a call to a production label function
// whose name varies, written where an assertion reads a name, is not a defect.
//
// The rule a row applies: when the function has more than one output and the case's subject is which output shows, the
// expected name must not come from calling it; a call that only locates a control, or whose outputs a literal-pinning
// test already spells, is fine. A defect is fixed in its test with a literal outcome, never recorded here.
//
// A row keys on the spec file, the case it sits in (the enclosing `test`, `it` or `describe` title as written, else the
// enclosing named function, else `(module)`) and the function's exported name, so it survives line drift. One row covers
// every call of its function in its case. The census reports a row that matches no candidate, and prints every
// branching candidate no row covers.

/** One verdict: the candidate is not a defect, for `reason`. */
export interface OracleJudgement {
  readonly file: string;
  readonly scope: string;
  readonly function: string;
  readonly reason: string;
}

export const JUDGED_ORACLES: readonly OracleJudgement[] = [
  {
    file: "tests/client/components/regex-script-picker.ct.tsx",
    scope: "two scripts in opposite states are found by their stable names, and a flip writes to its own script",
    function: "itemSwitchName",
    reason: "locates the switch the case presses or reads the state of",
  },
  {
    file: "tests/client/features/app-shell/surfaces/app-shell-notices.ct.tsx",
    scope: "the notice stack fits above the keyboard and keeps its dismiss reachable",
    function: "contextToggleLabel",
    reason: "locates the Context toggle the case presses or checks for focus",
  },
  {
    file: "tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx",
    scope: "a docked context pane has no close of its own: its edge control closes it and keeps focus, never the page body",
    function: "contextToggleLabel",
    reason: "locates the Context toggle the case presses or checks for focus",
  },
  {
    file: "tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx",
    scope: "a keyboard-opened context sheet takes focus without a ring, and its own close returns focus to the toggle",
    function: "contextToggleLabel",
    reason: "locates the Context toggle the case presses or checks for focus",
  },
  {
    file: "tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx",
    scope: "the scrim closes either sheet like its toggle does and hands focus back to that toggle",
    function: "contextToggleLabel",
    reason: "locates the Context toggle the case presses or checks for focus",
  },
  {
    file: "tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx",
    scope: "the ⌘K chip paints no text, and its name and description carry Jump and this platform's shortcut",
    function: "commandShortcutLabel",
    reason: "both outputs are pinned by literal in tests/client/features/app-shell/lib/command-shortcut-label.test.ts",
  },
  {
    file: "tests/client/features/app-shell/surfaces/context-header-navigation.ct.tsx",
    scope: "overflow offers every resolved chat tab, preserves manual activation and keeps close reachable",
    function: "contextToggleLabel",
    reason: "locates the Context toggle the case presses or checks for focus",
  },
  {
    file: "tests/client/features/app-shell/surfaces/panel-edge-controls.ct.tsx",
    scope: "the topbar keeps the doors onto the list screen and the detail sheet, no edge tab is drawn, and the open sheet has one dismiss",
    function: "contextToggleLabel",
    reason: "locates the Context toggle the case presses or checks for focus",
  },
  {
    file: "tests/client/features/app-shell/surfaces/platform-corpus-context-scroll.suite.ct.tsx",
    scope: "the tab overflow trigger paints its focus ring inside its own box",
    function: "contextToggleLabel",
    reason: "locates the Context toggle the case presses or checks for focus",
  },
  {
    file: "tests/client/features/chat/anchors/join-invite-dialog.ct.tsx",
    scope: "(module)",
    function: "inviteRoomSentence",
    reason: "its outputs are pinned by literal in tests/client/lib/invite-copy.dom.test.ts",
  },
  {
    file: "tests/client/features/chat/anchors/join-invite-dialog.ct.tsx",
    scope: "a controlled loading preview becomes ready and focuses its newly mounted primary action",
    function: "inviteRoomSentence",
    reason: "its outputs are pinned by literal in tests/client/lib/invite-copy.dom.test.ts",
  },
  {
    file: "tests/client/features/chat/components/assembly-preview-macros.ct.tsx",
    scope: "the diagnostics list the turn's registered macros by source and the preset macro a game macro shadowed",
    function: "macroSourceLabel",
    reason: "its outputs are pinned by literal in tests/client/lib/prompt-macros.dom.test.ts; each row shows its own home's word and not the other's",
  },
  {
    file: "tests/client/features/chat/components/composer-two-rows.ct.tsx",
    scope: "expectRefusalFits",
    function: "guidedControlName",
    reason: "locates the composer button the case checks is disabled",
  },
  {
    file: "tests/client/features/chat/components/regex-switches.ct.tsx",
    scope: "a script drawn in two lists, and two scripts that share a title in two tiers, each have a switch name of their own",
    function: "regexTierKicker",
    reason: "names the list a script switch sits under, to locate that switch",
  },
  {
    file: "tests/client/features/chat/components/regex-switches.ct.tsx",
    scope: "script rows, the on-screen roster and the tier levers are found by their stable names, and a flip writes to its own item",
    function: "regexTierKicker",
    reason: "names the list a script switch sits under, to locate that switch",
  },
  {
    file: "tests/client/features/chat/components/regex-switches.ct.tsx",
    scope: "script rows, the on-screen roster and the tier levers are found by their stable names, and a flip writes to its own item",
    function: "regexTierLever",
    reason: "names the tier switch the case locates and presses",
  },
  {
    file: "tests/client/features/config/surfaces/looks-keyboard-focus.ct.tsx",
    scope: "Back from the new-theme builder returns focus to the button that opened it",
    function: "newThemeName",
    reason: "locates the new-theme door the case presses",
  },
  {
    file: "tests/client/features/credentials/components/connection-prompt-cache.ct.tsx",
    scope: "automatic placement disables manual markers but leaves applicable retention available",
    function: "itemSwitchName",
    reason: "locates the switch the case presses or reads the state of",
  },
  {
    file: "tests/client/features/credentials/components/connection-prompt-cache.ct.tsx",
    scope: "modern prefix caching retains provider minimum prose and saves the implicit-disable control",
    function: "itemSwitchName",
    reason: "locates the switch the case presses or reads the state of",
  },
  {
    file: "tests/client/features/credentials/components/connections-background-control.ct.tsx",
    scope: "a list row shows its background state and opens the editor that holds the switch",
    function: "backgroundStateLabel",
    reason: "both outputs are pinned by literal in tests/client/features/credentials/lib/connections-copy.test.ts",
  },
  {
    file: "tests/client/features/credentials/components/connections-background-control.ct.tsx",
    scope: "a list row shows its background state and opens the editor that holds the switch",
    function: "connectionSummary",
    reason: "locates the connection row the case opens",
  },
  {
    file: "tests/client/features/credentials/components/connections-list-section.ct.tsx",
    scope: "a connection that can serve Utility but does not hold it shows Utility as a capability, not as a role it holds",
    function: "backgroundStateLabel",
    reason: "both outputs are pinned by literal in tests/client/features/credentials/lib/connections-copy.test.ts",
  },
  {
    file: "tests/client/features/credentials/components/connections-list-section.ct.tsx",
    scope: "a connection that can serve Utility but does not hold it shows Utility as a capability, not as a role it holds",
    function: "connectionSummary",
    reason: "locates the connection row the case opens",
  },
  {
    file: "tests/client/features/discovery/hooks/corpus-list-header.ct.tsx",
    scope: "the Corpus band states the distilled count against the library it is drawn from",
    function: "distilledCensus",
    reason: "its outputs are pinned by literal in tests/client/features/discovery/lib/corpus-vocabulary.test.ts",
  },
  {
    file: "tests/client/features/notifications/notification-inbox.ct.tsx",
    scope: "a Load more press lands while a background refetch is running",
    function: "notificationsBellLabel",
    reason: "locates the bell the case opens; the floor-mark case finds the bell by its mark and checks the other output is absent",
  },
  {
    file: "tests/client/features/notifications/notification-inbox.ct.tsx",
    scope: "a background refetch neither raises nor clears a Load more failure",
    function: "notificationsBellLabel",
    reason: "locates the bell the case opens; the floor-mark case finds the bell by its mark and checks the other output is absent",
  },
  {
    file: "tests/client/features/notifications/notification-inbox.ct.tsx",
    scope: "past the first page the bell says its unread count is a floor, and dismissed paging names itself",
    function: "notificationsBellLabel",
    reason: "locates the bell the case opens; the floor-mark case finds the bell by its mark and checks the other output is absent",
  },
  {
    file: "tests/client/features/persona/components/persona-avatar-upload.ct.tsx",
    scope: "(module)",
    function: "personaDetailsToggleName",
    reason: "locates the details toggle the case presses",
  },
  {
    file: "tests/client/features/persona/components/platform-persona-action-groups.suite.ct.tsx",
    scope: "the persona editor retains all lifecycle actions and cancelling Delete preserves the named persona",
    function: "personaDetailsToggleName",
    reason: "locates the details toggle the case presses",
  },
  {
    file: "tests/client/features/plugin/components/context-panels.ct.tsx",
    scope: "keyboard placement hands focus to the return control and back to the restored panel",
    function: "movePluginPanelLabel",
    reason: "locates the move control the case presses; the restored name is asserted by literal",
  },
  {
    file: "tests/client/features/refinery/components/platform-remaining-action-groups.suite.ct.tsx",
    scope: "masthead card and scope actions remain contained beside a maximum-length card name",
    function: "scopeChipLabelOf",
    reason: "locates the scope checkbox the case reads the state of",
  },
  {
    file: "tests/client/features/rpg/components/game-macro-browser.ct.tsx",
    scope: "the browser names each macro's source, links the preset's and the plugin's, and a completion row prints the same source",
    function: "macroSourceLabel",
    reason: "its outputs are pinned by literal in tests/client/lib/prompt-macros.dom.test.ts",
  },
  {
    file: "tests/client/features/workloads/components/import-preview.ct.tsx",
    scope: "a folder of two profiles that hold the same card says the second one adds nothing",
    function: "counted",
    reason: "the case's subject is the repeat count it spells; the tally only opens the line",
  },
  {
    file: "tests/client/features/workloads/components/import-preview.ct.tsx",
    scope: "keeping both of a colliding persona holds the preview back until it counts the copy, and the run writes what the line says",
    function: "counted",
    reason: "locates the persona line; the case asserts its numbers as literals",
  },
  {
    file: "tests/client/features/world-info/surfaces/platform-world-info-member.suite.ct.tsx",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the key is the case's title template as the source spells it.
    scope: 'the persona heading counts ${attached ? "attached" : "zero attached"} personas, not available personas',
    function: "itemSwitchName",
    reason: "locates the switch the case presses or reads the state of",
  },
  {
    file: "tests/client/features/world-info/surfaces/platform-world-info-member.suite.ct.tsx",
    scope: "two personas in opposite states are found by their stable names, and a flip writes to its own persona",
    function: "itemSwitchName",
    reason: "locates the switch the case presses or reads the state of",
  },
  {
    file: "tests/e2e/corpus-libraries.spec.ts",
    scope: "Plugins toggle the actual installed corpus plugin and persist its activation",
    function: "itemSwitchName",
    reason: "locates the switch the case presses or reads the state of",
  },
  { file: "tests/e2e/support/chat-room.ts", scope: "openChatsList", function: "panelEdgeName", reason: "locates the panel edge control the walk presses" },
  {
    file: "tests/e2e/support/surface-character.ts",
    scope: "deleteCommandCharacters",
    function: "characterBulkDeleteTitle",
    reason: "locates the bulk delete confirm the walk answers",
  },
  {
    file: "tests/e2e/support/surface-character.ts",
    scope: "lookJourney",
    function: "colorPickerName",
    reason: "locates the colour picker dialog the walk drives",
  },
  { file: "tests/e2e/support/surface-character.ts", scope: "openList", function: "panelEdgeName", reason: "locates the panel edge control the walk presses" },
  {
    file: "tests/e2e/support/surface-chat.ts",
    scope: "inspectSidecarColumn",
    function: "panelEdgeName",
    reason: "locates the panel edge control the walk presses",
  },
  {
    file: "tests/e2e/support/surface-chat.ts",
    scope: "messageVisibilityAndReaction",
    function: "reactionPillName",
    reason: "locates the reaction pill the walk presses",
  },
  {
    file: "tests/e2e/support/surface-chat.ts",
    scope: "walkChatOracle",
    function: "pluginSurfaceName",
    reason: "locates the opened plugin surface the walk reads",
  },
  {
    file: "tests/e2e/support/surface-sections.ts",
    scope: "corpusTarget",
    function: "corpusResultsStatusText",
    reason: "filters the results row by its status line to locate it",
  },
  {
    file: "tests/client/features/chat/components/members-focus.ct.tsx",
    scope: "removing a member closes the real confirm onto a surviving roster control",
    function: "memberCharacterRowName",
    reason: "locates the cast row the case checks for focus or visibility",
  },
  {
    file: "tests/client/features/discovery/components/corpus-context-tabs-boundary.ct.tsx",
    scope: "a room pair's button name contains the relation badge it shows",
    function: "corpusRoomPairName",
    reason: "the case passes the badge it planted; production passes the row's own relation, so a row that drops its badge fails the shape",
  },
  {
    file: "tests/client/features/rpg/components/own-key-panels.ct.tsx",
    scope: "Status meters and the character takeover read an unset inherited-name key as unset, then its own values",
    function: "trackerFieldName",
    reason: "locates the value buttons whose shown text the case reads",
  },
  {
    file: "tests/client/features/rpg/components/own-key-panels.ct.tsx",
    scope: "the Scene character card reads an unset inherited-name tracker as unset, then its own value",
    function: "trackerFieldName",
    reason: "locates the value buttons whose shown text the case reads",
  },
  {
    file: "tests/client/features/rpg/components/own-key-panels.ct.tsx",
    scope: "Status seats a text tracker's value at the end of the room its row leaves, and the status line at its own width",
    function: "trackerFieldName",
    reason: "locates the value buttons whose shown text the case reads",
  },
  {
    file: "tests/client/features/rpg/components/turn-tool-calls.ct.tsx",
    scope: "game actions stay compact, expose partial outcomes and follow the selected variant",
    function: "turnToolCallsCount",
    reason: "the case picks the arm by the record it plants; production picks it from the call verdicts, so a wrong pick fails",
  },
  {
    file: "tests/e2e/corpus-conversation.spec.ts",
    scope: "a corpus character supports swipe selection, edit save/cancel, persona switching and card pinning",
    function: "personaSwitchName",
    reason: "locates the switcher row after the switch; the case's subject is the switch and the turn it stamps",
  },
  {
    file: "tests/e2e/corpus-conversation.spec.ts",
    scope: "a corpus character supports swipe selection, edit save/cancel, persona switching and card pinning",
    function: "personaCardPinName",
    reason: "locates the pin toggle after pinning; the case's subject is the pin the turns read back",
  },
  {
    file: "tests/e2e/members-tab-views.local.spec.ts",
    scope: "MEMBERS TAB: the same two-human room rendered as HOST and as MEMBER (host gestures absent for the member)",
    function: "memberCharacterRowName",
    reason: "locates the cast row the case checks for focus or visibility",
  },
  {
    file: "tests/client/features/plugin/components/context-panels.ct.tsx",
    scope: "ordinary panels use mobile Context and only an explicitly selected panel opens in the sidecar sheet",
    function: "movePluginPanelLabel",
    reason: "the case moves the panel to the sidecar, then reads the Context branch to prove the action flipped; the earlier call names the sidecar branch",
  },
  {
    file: "tests/client/components/platform-setting-choices.suite.ct.tsx",
    scope: "inline choices contain rich Field states without losing identity, hints or selection targets",
    function: "hintTriggerName",
    reason: "locates the row's hint trigger and its popup by the row they annotate; the case's subject is the choice row, not the trigger's words",
  },
  {
    file: "tests/ui/primitives/text/structure.ct.tsx",
    scope: "a scrolling Text is reachable by keyboard and the hint trigger is at least the 24px target",
    function: "hintTriggerName",
    reason: "locates the hint trigger to measure its target size",
  },
];
