export const SELECT_OPENING_TEST_CASES = [
  "native",
  "cancel",
  "cancel-timer",
  "cancel-transition",
  "controlled-ignore",
  "controlled-accept",
  "controlled-defer",
  "controlled-timer",
  "reset-request",
  "remove-request",
  "default-open",
] as const;
export type SelectOpeningTestCase = (typeof SELECT_OPENING_TEST_CASES)[number];
