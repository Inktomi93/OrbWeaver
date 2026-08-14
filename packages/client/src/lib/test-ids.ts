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
  // The rung-1 in-app re-auth modal body (staleness-and-session-freshness §4.4) — the affordance that
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
  adminEnginesSection: "admin-engines-section",
  engineLaunchConfig: "engine-launch-config",
  engineLaunchSave: "engine-launch-save",
  engineLaunchPendingRestart: "engine-launch-pending-restart",
  endpointInspectorDialog: "endpoint-inspector-dialog",
  endpointInspectorStatus: "endpoint-inspector-status",
  // The Saved-keys row revoke controls. `credentialMarkRevoked` = the destructive user-facing revoke
  // action (confirm-gated → credentials.markRevokedByUser); `credentialClearRevoked` = the recover
  // affordance shown on a revoked row (→ credentials.clearRevoked).
  credentialMarkRevoked: "credential-mark-revoked",
  credentialClearRevoked: "credential-clear-revoked",
  // The model picker's honest cold-cache marker — shown while the server serves its curated shortlist
  // instead of a real catalog (`origin: "curated"`), so the menu never silently differs run-to-run.
  modelPickerCuratedNotice: "model-picker-curated-notice",
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
  speakAsSelect: "speak-as-select",
  chatCastBar: "chat-cast-bar",
  notificationsInbox: "notifications-inbox",
  workloadsSection: "workloads-section",
  workloadsRunButton: "workloads-run-button",
  backupSection: "backup-section",
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
  soloRosterMenu: "solo-roster-menu",
  inviteHandleInput: "invite-handle-input",
  inviteSubmit: "invite-submit",
  inviteCopyLink: "invite-copy-link",
  inviteLinkResult: "invite-link-result",
  inviteOutstandingList: "invite-outstanding-list",
  joinInviteDialog: "join-invite-dialog",
  joinInviteConfirm: "join-invite-confirm",
  // D22 — the read-only, level-clamped member card-viewer opened from a roster Cast row ("View
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
  corpusSearchHit: "corpus-search-hit",
  corpusDiscoverEvidence: "corpus-discover-evidence",
  corpusBrowseView: "corpus-browse-view",
  corpusBrowseRow: "corpus-browse-row",
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
  corpusThemesDrill: "corpus-themes-drill",
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
  refineryStepper: "refinery-stepper",
  /** One per stage cell — pair with `data-stage` to pick a cell. */
  refineryStep: "refinery-step",
  /** The RUNNING cell's indeterminate hairline — present iff that stage has a call in flight. */
  refineryStepHairline: "refinery-step-hairline",
  refineryPayloadView: "refinery-payload-view",
  /** The plan-shaped first-run skeleton. Mutually exclusive with `refineryPayloadView`: a CT asserting
   *  the loading arm must barrier on THIS, and one asserting the settled arm on the view. */
  refineryPayloadSkeleton: "refinery-payload-skeleton",
  refineryVerdictBanner: "refinery-verdict-banner",
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
} as const;

export type TestIdKey = keyof typeof TEST_IDS;

/** `<div data-testid={testId("composer")}>` / `page.getByTestId(testId("composer"))`. */
export function testId(key: TestIdKey): (typeof TEST_IDS)[TestIdKey] {
  return TEST_IDS[key];
}
