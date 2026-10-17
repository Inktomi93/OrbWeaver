// Source-text grammar shared by native restrictions and the retained invocation fallback.
export const AMBIENT_SOURCE_PATTERNS = [
  {
    invocationFallback: "binding",
    re: /\bDate\.now\s*\(/u,
    what: "Date.now() — inject the frozen clock (tests/support/iso/clock.ts)",
  },
  {
    invocationFallback: "binding",
    re: /\bnew\s+Date\s*\(\s*\)/u,
    what: "new Date() with no args — ambient clock; use the injected clock",
  },
  { invocationFallback: "binding", re: /\bMath\.random\s*\(/u, what: "Math.random() — nondeterministic; seed it or inject" },
  {
    invocationFallback: "binding",
    re: /\.randomUUID\s*\(/u,
    what: "randomUUID() — unseeded id; use the seeded ids (tests/support/iso/ids.ts)",
  },
  { invocationFallback: "binding", re: /\bperformance\.now\s*\(/u, what: "performance.now() — ambient clock" },
  {
    invocationFallback: "binding",
    re: /\bprocess\.hrtime\b/u,
    what: "process.hrtime()/process.hrtime.bigint() — ambient monotonic clock; mark it if the test's SUBJECT is elapsed real time (#828)",
  },
  {
    invocationFallback: "binding",
    re: /\bperformance\.timeOrigin\b/u,
    what: "performance.timeOrigin — ambient clock property",
  },
  {
    invocationFallback: "always",
    re: /\bvi\.useFakeTimers\s*\(/u,
    what: "vi.useFakeTimers() — replaces the ambient clock globally; inject the frozen clock via the composition seam instead (tests/support/iso/clock.ts)",
  },
  {
    invocationFallback: "native",
    re: /\.waitForTimeout\s*\(/u,
    what: ".waitForTimeout() — Playwright flaky-wait anti-pattern; biome's noPlaywrightWaitForTimeout misses non-`page` receivers (locator.page().waitForTimeout) and does not fire on CT files at all (#2385). Use a locator assertion or `expect.poll` instead",
  },
] as const;
