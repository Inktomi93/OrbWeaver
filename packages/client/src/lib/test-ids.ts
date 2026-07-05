// The typed test-id registry (UI-Gates §11.5): freeform `data-testid` strings let a typo silently
// break an e2e selector; a typed map makes the typo a `tsc` error on BOTH sides (the component
// stamping the id and the Playwright test selecting it). Add ids HERE, never inline — grow the map
// as surfaces land. Values are the literal DOM attribute strings (kebab-case, stable API for e2e).

export const TEST_IDS = {
  appShell: "app-shell",
  loginPage: "login-page",
  adminPage: "admin-page",
  composer: "composer",
  composerSend: "composer-send",
  composerWand: "composer-wand",
  speakAsSelect: "speak-as-select",
  messageList: "message-list",
  chatCastBar: "chat-cast-bar",
} as const;

export type TestIdKey = keyof typeof TEST_IDS;

/** `<div data-testid={testId("appShell")}>` / `page.getByTestId(testId("appShell"))`. */
export function testId(key: TestIdKey): (typeof TEST_IDS)[TestIdKey] {
  return TEST_IDS[key];
}
