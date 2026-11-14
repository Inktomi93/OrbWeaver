// The story's own notice words: test-authored data, not product copy, read by the story and its case. The title carries one
// unbroken token so a narrow box must wrap it anywhere, not overflow.
export const NOTICE_STORY = {
  testId: "notice-story",
  title: `The stored setting could not be read: ${"x".repeat(64)}`,
  detail: ["The server said the value is not a number.", "Open the setting and save it again."],
  action: "Retry",
  dismissName: "Dismiss the stored-setting notice",
  dismissHint: "Dismiss: keep the default",
} as const;
