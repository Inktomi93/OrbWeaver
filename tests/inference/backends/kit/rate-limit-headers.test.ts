// backends/kit/rate-limit-headers — the ONE header parser both hosted wires read `response.headers` through (B6).
// The two families are the ones MEASURED 2026-09-20 (`rec-probe.mjs`): Anthropic's per-axis set with RFC 3339
// resets (`req_011CfEBkpjRWAjtLDifB2qpW`) and the OpenAI-style suffixed set with Go-duration resets
// (`req_f68c8dc2e4a24908a2e5be64132edbc0`); `retry-after` on either. The unsuffixed OpenRouter family is
// deliberately NOT parsed (OR sent no rate-limit header on a 200, `gen-1789884256-ZeulFgkGknjAbAgCKe1S`) — the
// negative pin below is what keeps "unobserved" from silently becoming "guessed".

import {
  parseGoDuration,
  RATE_LIMIT_WARN_UTILIZATION,
  rateLimitCanaryEvent,
  rateLimitFromHeaders,
} from "../../../../packages/inference/src/backends/kit/rate-limit-headers.ts";
import { expect, test } from "../../../support/fixtures.ts";

const NOW = 1_789_884_000_000;
const RESET = "2026-09-20T06:04:11Z";

/** The exact header set the direct wire answered with (values from the probe, remaining lowered to exercise the axis pick). */
const ANTHROPIC_HEADERS = {
  "anthropic-ratelimit-input-tokens-limit": "5000000",
  "anthropic-ratelimit-input-tokens-remaining": "5000000",
  "anthropic-ratelimit-input-tokens-reset": RESET,
  "anthropic-ratelimit-output-tokens-limit": "1000000",
  "anthropic-ratelimit-output-tokens-remaining": "1000000",
  "anthropic-ratelimit-output-tokens-reset": RESET,
  "anthropic-ratelimit-requests-limit": "5000",
  "anthropic-ratelimit-requests-remaining": "4999",
  "anthropic-ratelimit-requests-reset": RESET,
  "anthropic-ratelimit-tokens-limit": "6000000",
  "anthropic-ratelimit-tokens-remaining": "1500000",
  "anthropic-ratelimit-tokens-reset": RESET,
  "request-id": "req_011CfEBkpjRWAjtLDifB2qpW",
};

test("Anthropic family: the tightest axis names the type, its RFC 3339 reset is the instant, status is allowed below the canary", () => {
  const snapshot = rateLimitFromHeaders(ANTHROPIC_HEADERS, NOW);
  expect(snapshot).toMatchObject({ status: "allowed", rateLimitType: "tokens", resetsAt: Date.parse(RESET), surpassedThreshold: undefined });
  expect(snapshot?.utilization).toBeCloseTo(0.75);
  // Every other snapshot field is the agent-sdk's alone — a header cannot state overage.
  expect(snapshot?.isUsingOverage).toBeUndefined();
  expect(snapshot?.overageStatus).toBeUndefined();
});

test("OpenAI-style family: Go-duration resets are relative to now; a mixed-case header name still matches", () => {
  const snapshot = rateLimitFromHeaders(
    {
      "X-RateLimit-Limit-Requests": "500",
      "x-ratelimit-remaining-requests": "499",
      "x-ratelimit-reset-requests": "120ms",
      "x-ratelimit-limit-tokens": "500000",
      "x-ratelimit-remaining-tokens": "50000",
      "x-ratelimit-reset-tokens": "6m0s",
    },
    NOW,
  );
  expect(snapshot).toMatchObject({
    status: "allowed_warning",
    rateLimitType: "tokens",
    resetsAt: NOW + 6 * 60_000,
    utilization: 0.9,
    surpassedThreshold: RATE_LIMIT_WARN_UTILIZATION,
  });
});

test("parseGoDuration: compound units, fractions, and a refusal on anything else", () => {
  expect(parseGoDuration("120ms")).toBe(120);
  expect(parseGoDuration("6m0s")).toBe(360_000);
  expect(parseGoDuration("1.5s")).toBe(1500);
  expect(parseGoDuration("1h2m")).toBe(3_720_000);
  expect(parseGoDuration("soon")).toBeUndefined();
  expect(parseGoDuration("12")).toBeUndefined();
});

test("retry-after alone (seconds or an HTTP-date) yields a snapshot with the reset and no axis", () => {
  expect(rateLimitFromHeaders({ "retry-after": "30" }, NOW)).toMatchObject({
    status: "allowed",
    rateLimitType: undefined,
    resetsAt: NOW + 30_000,
    utilization: undefined,
  });
  expect(rateLimitFromHeaders({ "retry-after": "Sun, 20 Sep 2026 06:05:00 GMT" }, NOW)?.resetsAt).toBe(Date.parse("Sun, 20 Sep 2026 06:05:00 GMT"));
});

test("no known family ⇒ null: absent headers, unrelated headers, and the UNOBSERVED unsuffixed OpenRouter family", () => {
  expect(rateLimitFromHeaders(undefined, NOW)).toBeNull();
  expect(rateLimitFromHeaders({ "content-type": "text/event-stream", "cf-ray": "a3dea1ba796b7652-SEA" }, NOW)).toBeNull();
  // Documented, not guessed: OR sent none on a 200; a family nobody measured has no parser.
  expect(rateLimitFromHeaders({ "x-ratelimit-limit": "200", "x-ratelimit-remaining": "10", "x-ratelimit-reset": "1789884300000" }, NOW)).toBeNull();
  // A limit of 0 / a non-numeric count is not an axis (never a division by zero, never NaN utilization).
  expect(rateLimitFromHeaders({ "x-ratelimit-limit-requests": "0", "x-ratelimit-remaining-requests": "0" }, NOW)).toBeNull();
  expect(rateLimitFromHeaders({ "x-ratelimit-limit-requests": "lots", "x-ratelimit-remaining-requests": "1" }, NOW)).toBeNull();
});

test("the canary event rides only from allowed_warning up, carrying the bus fields verbatim", () => {
  const warning = rateLimitFromHeaders({ "x-ratelimit-limit-tokens": "10", "x-ratelimit-remaining-tokens": "1", "x-ratelimit-reset-tokens": "1s" }, NOW);
  expect(rateLimitCanaryEvent(warning, NOW)).toEqual({
    kind: "rate_limit",
    at: NOW,
    status: "allowed_warning",
    rateLimitType: "tokens",
    resetsAt: NOW + 1000,
    utilization: 0.9,
    isUsingOverage: undefined,
  });
  const calm = rateLimitFromHeaders(ANTHROPIC_HEADERS, NOW);
  expect(rateLimitCanaryEvent(calm, NOW)).toBeNull();
  expect(rateLimitCanaryEvent(null, NOW)).toBeNull();
});
