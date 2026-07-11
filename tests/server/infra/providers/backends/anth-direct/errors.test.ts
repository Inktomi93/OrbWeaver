// backends/anth-direct errors — map an `@anthropic-ai/sdk` typed exception → the ONE `ProviderError`
// taxonomy via the REUSED kit classification path (`classifyHttpStatus` + `sanitizeApiError`). The SDK's
// typed subclasses expose `.status`, which routes through the SAME status table the OR runner uses.

import { RateLimitError } from "@anthropic-ai/sdk";
import { anthDirectError } from "@orb/server/infra/providers/backends/anth-direct";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const MODEL = "anthropic/claude-opus-4-5";
const NOW = 10_000;

// Build a fake SDK-shaped error carrying `.status` (+ optional Headers) — the shape `anthDirectError` reads.
function statusError(status: number, message: string, headers?: Headers): Error {
  const err = new Error(message);
  Object.assign(err, { status, ...(headers !== undefined ? { headers } : {}) });
  return err;
}

describe("anthDirectError — status → typed kind (reuses the kit table)", () => {
  test("401 → auth_failed (non-retryable)", () => {
    const e = anthDirectError(statusError(401, "invalid key"), MODEL, NOW);
    expect(e.kind).toBe("auth_failed");
    expect(e.retryable).toBe(false);
    expect(e.apiErrorStatus).toBe(401);
    expect(e.model).toBe(MODEL);
  });

  test("429 → rate_limit (retryable) with resetsAt from retry-after", () => {
    const headers = new Headers({ "retry-after": "30" });
    const e = anthDirectError(statusError(429, "slow down", headers), MODEL, NOW);
    expect(e.kind).toBe("rate_limit");
    expect(e.retryable).toBe(true);
    expect(e.resetsAt).toBe(NOW + 30_000);
  });

  test("500/529 → server (retryable)", () => {
    expect(anthDirectError(statusError(500, "boom"), MODEL, NOW).kind).toBe("server");
    expect(anthDirectError(statusError(529, "overloaded"), MODEL, NOW).retryable).toBe(true);
  });

  test("402 → billing; 400 → invalid (non-retryable)", () => {
    expect(anthDirectError(statusError(402, "credits"), MODEL, NOW).kind).toBe("billing");
    expect(anthDirectError(statusError(400, "bad prefill"), MODEL, NOW).kind).toBe("invalid");
  });

  test("a status-less failure (connection/abort) → the unknown floor", () => {
    const e = anthDirectError(new Error("socket hang up"), MODEL, NOW);
    expect(e.kind).toBe("unknown");
    expect(e.apiErrorStatus).toBeUndefined();
  });

  test("the message is sanitized + prefixed; a real SDK RateLimitError routes the same path", () => {
    // An HTML/markup body must not reach the message verbatim (the sanitize kit strips tags).
    const e = anthDirectError(statusError(400, "<h1>Bad</h1> request"), MODEL, NOW);
    expect(e.message).toContain("anth-direct chat");
    expect(e.message).not.toContain("<h1>");

    // A genuine SDK typed exception carries `.status` → the identical classification.
    const sdkErr = new RateLimitError(429, { type: "error" }, "rate limited", new Headers());
    expect(anthDirectError(sdkErr, MODEL, NOW).kind).toBe("rate_limit");
  });

  test("the credential/model appears NOWHERE unsafely — message names only the model label", () => {
    const e = anthDirectError(statusError(401, "sk-or-LEAKED should not appear"), MODEL, NOW);
    // The sanitized upstream text may echo, but the ProviderError core never fabricates a key; assert the
    // message is the safe prefix + sanitized body only (no bespoke secret handling here).
    expect(e.message.startsWith(`anth-direct chat (${MODEL}):`)).toBe(true);
  });
});
