// The typed test-id registry (UI-Gates §11.5): freeform `data-testid` strings let a typo silently
// break an e2e selector; a typed map makes the typo a `tsc` error on BOTH sides (the component
// stamping the id and the Playwright test selecting it). Add ids HERE, never inline — grow the map
// as surfaces land. Values are the literal DOM attribute strings (kebab-case, stable API for e2e).

export const TEST_IDS = {
  appShell: "app-shell",
  loginPage: "login-page",
  loginLocalForm: "login-local-form",
  loginHandle: "login-handle",
  loginPassword: "login-password",
  loginSubmit: "login-submit",
  loginError: "login-error",
  loginOidc: "login-oidc",
  accountSurface: "account-surface",
  accountLogout: "account-logout",
  firstRunPersonaDialog: "first-run-persona-dialog",
  firstRunPersonaName: "first-run-persona-name",
  firstRunPersonaCreate: "first-run-persona-create",
  adminPage: "admin-page",
  adminUsersSection: "admin-users-section",
  adminCreateUserButton: "admin-create-user",
  adminCreateUserDialog: "admin-create-user-dialog",
  adminCreateUserSubmit: "admin-create-user-submit",
  adminSessionsDialog: "admin-sessions-dialog",
  adminResetPasswordDialog: "admin-reset-password-dialog",
  adminResetPasswordSubmit: "admin-reset-password-submit",
  adminEnginesSection: "admin-engines-section",
  composer: "composer",
  composerSend: "composer-send",
  composerWand: "composer-wand",
  speakAsSelect: "speak-as-select",
  messageList: "message-list",
  chatCastBar: "chat-cast-bar",
  notificationsInbox: "notifications-inbox",
  workloadsSection: "workloads-section",
  workloadsRunButton: "workloads-run-button",
  runWorkloadDialog: "run-workload-dialog",
  runWorkloadSubmit: "run-workload-submit",
  peoplePanel: "people-panel",
  inviteHandleInput: "invite-handle-input",
  inviteSubmit: "invite-submit",
  inviteCopyLink: "invite-copy-link",
  joinInviteDialog: "join-invite-dialog",
  joinInviteConfirm: "join-invite-confirm",
} as const;

export type TestIdKey = keyof typeof TEST_IDS;

/** `<div data-testid={testId("appShell")}>` / `page.getByTestId(testId("appShell"))`. */
export function testId(key: TestIdKey): (typeof TEST_IDS)[TestIdKey] {
  return TEST_IDS[key];
}
