// The server tracing exports that open a detached ROOT span, the vocabulary `orb/detached-work-traced` judges
// call sites against. A new opener is declared here, and tests/tooling/verify/ops/detached-work-native.suite.test.ts
// reds when `foundation/observability/tracing.ts` and this tuple disagree.

export const ROOT_SPAN_OPENERS = ["withRequestSpan", "superviseDetached", "superviseSettled"] as const;

/** The module that exports every opener. */
export const TRACING_MODULE = "packages/server/src/foundation/observability/tracing.ts";
