// The typed test-id registry (UI-Gates §11.5): freeform `data-testid` strings let a typo silently
// break an e2e selector; a typed map makes the typo a `tsc` error on BOTH sides (the component
// stamping the id and the Playwright test selecting it). Add ids HERE, never inline — grow the map
// as surfaces land. Values are the literal DOM attribute strings (kebab-case, stable API for e2e).
// A row lives only as long as a component STAMPS it: the `testid-liveness` gate reds a row no producer
// spends (and a test selecting one), so add the row and its `data-testid` in the same commit.

export const TEST_IDS = {
  loginPage: "login-page",
  loginLocalForm: "login-local-form",
  loginHandle: "login-handle",
  loginPassword: "login-password",
  loginSubmit: "login-submit",
  loginError: "login-error",
  loginOidc: "login-oidc",
  // A7 — the OIDC callback error line rendered above the Continue button when /login?authError=<code> is set.
  loginAuthError: "login-auth-error",
  // B4 — the local-mode FIRST-RUN owner-password setup form (rendered in place of the credential form on a
  // fresh local box: password + confirm + submit + inline error).
  firstRunSetupForm: "first-run-setup-form",
  firstRunPassword: "first-run-password",
  firstRunConfirm: "first-run-confirm",
  firstRunSubmit: "first-run-submit",
  firstRunError: "first-run-error",
  accountSurface: "account-surface",
  accountLogout: "account-logout",
  // The rung-1 in-app re-auth modal body — the affordance that
  // proves a dead LOCAL session recovers WITHOUT a navigation.
  reauthSurface: "reauth-surface",
  firstRunPersonaDialog: "first-run-persona-dialog",
  firstRunPersonaName: "first-run-persona-name",
  firstRunPersonaCreate: "first-run-persona-create",
  adminUsersSection: "admin-users-section",
  // A2 — the OIDC_REQUIRE_APPROVAL account-approval queue + its per-row Approve action + empty state.
  adminApprovalsSection: "admin-approvals-section",
  adminApproveButton: "admin-approve",
  adminApprovalsEmpty: "admin-approvals-empty",
  // B5 — the "Link SSO identity" admin section: lists linkable (unbound, non-owner, human) rows; each row's
  // Link opens a dialog with a stable-subject field. Empty state when nothing is linkable.
  adminLinkSsoSection: "admin-link-sso-section",
  adminLinkSsoEmpty: "admin-link-sso-empty",
  adminLinkButton: "admin-link-sso",
  adminLinkSsoDialog: "admin-link-sso-dialog",
  adminLinkSsoSubject: "admin-link-sso-subject",
  adminLinkSsoSubmit: "admin-link-sso-submit",
  adminCreateUserButton: "admin-create-user",
  adminCreateUserDialog: "admin-create-user-dialog",
  adminCreateUserSubmit: "admin-create-user-submit",
  adminSessionsDialog: "admin-sessions-dialog",
  adminResetPasswordDialog: "admin-reset-password-dialog",
  adminResetPasswordSubmit: "admin-reset-password-submit",
  // The About section (owner ask 2026-09-18) — the build identity a bug report quotes, its copy affordance,
  // and the manual update check's verdict slot.
  aboutSection: "about-section",
  aboutVersionLine: "about-version-line",
  aboutUpdateVerdict: "about-update-verdict",
  // The Saved-keys row revoke controls. `credentialMarkRevoked` = the destructive user-facing revoke
  // action (confirm-gated → credentials.markRevokedByUser); `credentialClearRevoked` = the recover
  // affordance shown on a revoked row (→ credentials.clearRevoked).
  credentialMarkRevoked: "credential-mark-revoked",
  credentialClearRevoked: "credential-clear-revoked",
  composer: "composer",
  composerSend: "composer-send",
  // W-D — the guided cluster's four dual-mode icons + the ✨ utility menu (replaces the old composer-wand).
  composerGuidedImpersonate: "composer-guided-impersonate",
  composerGuidedSwipe: "composer-guided-swipe",
  composerGuidedResponse: "composer-guided-response",
  composerGuidedContinue: "composer-guided-continue",
  composerGuidedGameSteer: "composer-guided-game-steer",
  // IMP-2 — the impersonate stream's Stop, rendered in the cluster ONLY while the stream fills the composer.
  composerGuidedStopImpersonate: "composer-guided-stop-impersonate",
  // The ✨ menu's Plot submenu trigger (side-eye P1-B — the six plot steers nest under it) + the ref-triggered
  // Attach images row (side-eye P1-C — the file input is off the row's accessible name).
  composerPlotSteers: "composer-plot-steers",
  composerAttachImages: "composer-attach-images",
  composerUtility: "composer-utility",
  // P5 CYOA — one `:::choices` option button in a message body (click sends the option as the user turn).
  messageChoiceOption: "message-choice-option",
  composerGenerateImage: "composer-generate-image",
  // The ✨ menu's SECOND image door (#623) — opens the /imagine modal seeded with the typed text, so the
  // mode + preview surface is reachable without knowing to type `/`.
  composerOpenImagine: "composer-open-imagine",
  chatCharacterBar: "chat-character-bar",
  notificationsInbox: "notifications-inbox",
  workloadsSection: "workloads-section",
  workloadsRunButton: "workloads-run-button",
  backupExportButton: "backup-export-button",
  backupImportDropzone: "backup-import-dropzone",
  importReport: "import-report",
  runWorkloadDialog: "run-workload-dialog",
  runWorkloadSubmit: "run-workload-submit",
  workloadsSchedulesSection: "workloads-schedules-section",
  scheduleCreateButton: "schedule-create-button",
  createScheduleDialog: "create-schedule-dialog",
  createScheduleSubmit: "create-schedule-submit",
  editScheduleDialog: "edit-schedule-dialog",
  editScheduleSubmit: "edit-schedule-submit",
  membersPanel: "members-panel",
  invitePeopleButton: "invite-people-button",
  inviteDialog: "invite-dialog",
  inviteHandleInput: "invite-handle-input",
  inviteSubmit: "invite-submit",
  inviteCopyLink: "invite-copy-link",
  inviteLinkResult: "invite-link-result",
  inviteOutstandingList: "invite-outstanding-list",
  joinInviteDialog: "join-invite-dialog",
  joinInviteConfirm: "join-invite-confirm",
  // D22 — the read-only, level-clamped member card-viewer opened from a roster Character row ("View
  // character"). `memberCardHiddenNote` marks the "hidden at this visibility level" affordance the
  // viewer renders in place of a clamped-away (null) section.
  memberCardViewer: "member-card-viewer",
  memberCardHiddenNote: "member-card-hidden-note",
  // RAWVIEW — the HOST-only per-variant wire inspector opened from a message'''s metadata row. The trigger
  // is the quiet "wire" readout (the MessageCostReadout class); the dialog shows the assembled prompt the
  // turn actually SENT.
  variantWireTrigger: "variant-wire-trigger",
  variantWireViewer: "variant-wire-viewer",
  corpusListSurface: "corpus-list-surface",
  corpusSearchTarget: "corpus-search-target",
  corpusSearchResults: "corpus-search-results",
  // NO per-ROW key here (2026-08-18). `corpusSearchHit` and `corpusBrowseRow` both sat on a `<ListRow>`,
  // which builds its body from named props and forwards no rest props — so both matched ZERO nodes in the
  // rendered DOM and every probe keyed on them was a silent no-op. A row is addressed by its role and
  // accessible name, which is also how a user meets it; a marker a primitive drops is worse than none.
  corpusDiscoverEvidence: "corpus-discover-evidence",
  corpusBrowseView: "corpus-browse-view",
  /** The add-document dialog's scrape arm submit — the FORM-body dialog's own button (FormSubmitButton
   *  requires a registered key; the other two arms are plain buttons reachable by their labels). */
  databankScrapeSubmit: "databank-scrape-submit",
  corpusHomeSurface: "corpus-home-surface",
  corpusDossierSurface: "corpus-dossier-surface",
  corpusAskInput: "corpus-ask-input",
  corpusAskSubmit: "corpus-ask-submit",
  corpusCompareTab: "corpus-compare-tab",
  corpusCompareDeep: "corpus-compare-deep",
  /** The deep-compare DEGRADED arm — present only when `ComparisonNarrative.degraded` is true (the model's
   *  reply failed the payload schema twice, so the body is its raw text). Its absence is the assertion that a
   *  narrative is real; a CT that only checks the summary text can't tell the two apart. */
  corpusCompareDeepDegraded: "corpus-compare-deep-degraded",
  /** The Ask answer's provenance badge — carries `data-answer-state` = grounded | speculative | degraded, the
   *  three DIFFERENT claims (model-says-supported / model-says-not / our parse failed) the copy must not merge. */
  corpusAskState: "corpus-ask-state",
  corpusVisualsTab: "corpus-visuals-tab",
  corpusFacetDrill: "corpus-facet-drill",
  corpusKeywordExplorer: "corpus-keyword-explorer",
  corpusSearchSuggest: "corpus-search-suggest",
  analyticsListSurface: "analytics-list-surface",
  analyticsLeaderboardRow: "analytics-leaderboard-row",
  analyticsLeaderboardSort: "analytics-leaderboard-sort",
  analyticsOverviewSurface: "analytics-overview-surface",
  analyticsCharacterSurface: "analytics-character-surface",
  analyticsModelsTab: "analytics-models-tab",
  analyticsTimeTab: "analytics-time-tab",
  analyticsPersonasTab: "analytics-personas-tab",
  /** The preset readout's RESOLVED template block (D8 / §7.1) — the payload box, not its gloss. A test
   *  asserting "the identity resolved but the fire-time tokens did not" must read exactly that box: the
   *  same words appear in the gloss beside it, so a text query would pass on the wrong element. */
  presetResolvedPreview: "preset-resolved-preview",
  // ── refinery (R3) — the pipeline surface + the schema-driven renderer ──────────────────────────────
  refineryContent: "refinery-content",
  refineryTeaching: "refinery-teaching",
  /** The teaching state's three-step flow row. Scoped so a CT can assert the sequence is carried by the
   *  stage glyphs + order (owner ruling 2026-08-09: no 01/02/03 markers), not by numerals. */
  refineryTeachingSteps: "refinery-teaching-steps",
  /** The workbench masthead block (program #102, mockup C) — card name, state chips, credit, scope strip. */
  refineryMasthead: "refinery-masthead",
  /** One lane's numbered band. Three per canvas; scope by the lane's own `[data-lane]`/island testid. */
  refineryLaneBand: "refinery-lane-band",
  /** A lane's indeterminate hairline — present iff THAT stage has a call in flight. (It replaced the stage
   *  stepper's cell hairline when the stepper was deleted for the pipeline-parallel canvas; the
   *  reduced-motion contract is identical — the travelling segment is REMOVED, never parked.) */
  refineryLaneHairline: "refinery-lane-hairline",
  /** The ONE focal island: the rewrite lane (stripe + rationed glow — CD3). */
  refineryRewriteLane: "refinery-rewrite-lane",
  /** One row of the accept queue — pair with `data-queue-state` (open/kept/discarded/undecided). */
  refineryQueueRow: "refinery-queue-row",
  /** The foot run bar (guidance · hand-edit · iterate · the terminal apply cluster). */
  refineryRunBar: "refinery-run-bar",
  refineryPayloadView: "refinery-payload-view",
  /** The plan-shaped first-run skeleton. Mutually exclusive with `refineryPayloadView`: a CT asserting
   *  the loading arm must barrier on THIS, and one asserting the settled arm on the view. */
  refineryPayloadSkeleton: "refinery-payload-skeleton",
  refineryVerdictBanner: "refinery-verdict-banner",
  /** The word-primary state/tone chip the refinery surfaces share. It is the chip's OWN identity because
   *  its `data-tone` is no longer the chip's: `Text` stamps its resolved recipe arm there through the ui
   *  package's variant-axis seam (#1080/#1097), so a bare `[data-tone]` now matches every Text on the row
   *  and can no longer state "this row wears no chip". */
  refineryChip: "refinery-chip",
  refineryHeroGauge: "refinery-hero-gauge",
  /** The hero numeral itself — it COUNTS UP, so a CT reading it must poll to the settled figure. */
  refineryHeroValue: "refinery-hero-value",
  /** One per assay row — pair with the row's own text. */
  refineryAssayRow: "refinery-assay-row",
  /** One per rendered field block — pair with `data-field` for the key. */
  refineryField: "refinery-field",
  refineryAcceptReview: "refinery-accept-review",
  refineryUndecidedNote: "refinery-undecided-note",
  refineryApplyOutcome: "refinery-apply-outcome",
  refineryRunsTab: "refinery-runs-tab",
  refinerySetupTab: "refinery-setup-tab",
  refineryVersionsTab: "refinery-versions-tab",
  refineryStrippedWarn: "refinery-stripped-warn",
  refineryFitLine: "refinery-fit-line",
  refineryPreflightWarn: "refinery-preflight-warn",
  refineryForgeNote: "refinery-forge-note",
  refinerySchemaRefusal: "refinery-schema-refusal",
  /** The collapsed character-picker trigger (`CharacterDoor`) — its accessible NAME is the chosen card,
   *  or the invitation while none is chosen, so a CT reads the selection off the trigger itself. */
  refineryCharacterDoor: "refinery-character-door",
  /** The raw JSON door's PREFLIGHT block (stats line + advisories). Present only when the draft parses;
   *  its absence is the honest "nothing to say about a schema that isn't one yet". */
  refinerySchemaPreflight: "refinery-schema-preflight",
  /** The preflight's accounting line — one node so a CT reads the numbers without the prose. */
  refinerySchemaStats: "refinery-schema-stats",
  /** ONE advisory row. Carries `data-advisory` = the advisory CODE, so a CT pins the CLASS that fired
   *  rather than a sentence that copy edits will move. */
  refinerySchemaAdvisory: "refinery-schema-advisory",
  roomActivityLog: "room-activity-log",
  /** The PAGE-SCALE plugin attribution band — the pinned header a full-page
   *  plugin surface can never opt out of. It is a typed id rather than a text selector on purpose: the band IS
   *  the impersonation wall for the biggest canvas in the design, so its presence must be assertable
   *  independently of whatever copy the plugin happens to put beside it. */
  pluginPageAttribution: "plugin-page-attribution",
  /** The Extensions section's LIST pane (the page switcher) and its CONTENT pane — named so a CT can tell
   *  "no pages exist" from "none is picked" without matching on prose. */
  extensionsSwitcher: "extensions-switcher",
  extensionsContent: "extensions-content",
} as const;

export type TestIdKey = keyof typeof TEST_IDS;

/** `<div data-testid={testId("composer")}>` / `page.getByTestId(testId("composer"))`. */
export function testId(key: TestIdKey): (typeof TEST_IDS)[TestIdKey] {
  return TEST_IDS[key];
}
