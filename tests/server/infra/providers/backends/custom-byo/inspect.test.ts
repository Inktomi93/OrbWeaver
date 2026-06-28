// backends/custom-byo/inspect — the "Test endpoint" probe: it sends the ACTUAL shaped request (real key on
// the wire) but returns a REDACTED request + the raw response, never throwing. Asserts the redaction (the
// key never leaves the server in the result), the ok path, and the unreachable (!ok) transport-error path.
// Fetch is mocked.

import { inspectCustomByoEndpoint } from "@orb/server/infra/providers/backends/custom-byo";
import { afterEach, describe, expect, test, vi } from "vitest";

const BASE_URL = "https://byo.example.com/v1";
const EXPECTED_URL = "https://byo.example.com/v1/chat/completions";
const SECRET_KEY = "sk-secret-123";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inspectCustomByoEndpoint", () => {
  test("REDACTS the Authorization header in the returned request while sending the real key", async () => {
    let capturedAuth: string | null = null;
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit): Response => {
      capturedAuth = new Headers(init?.headers).get("authorization");
      return new Response('{"ok":true}', { status: 200, statusText: "OK" });
    });

    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: SECRET_KEY,
      headers: { "x-team": "alpha" },
      model: "local-model",
    });

    // The ACTUAL wire carried the real key…
    expect(capturedAuth).toBe(`Bearer ${SECRET_KEY}`);
    // …but the surfaced request masks it (the key never leaves the server in the result).
    expect(result.request.headers["authorization"]).not.toContain(SECRET_KEY);
    expect(result.request.headers["x-team"]).toBe("alpha");
    expect(result.request.url).toBe(EXPECTED_URL);
    expect(result.ok).toBe(true);
    expect(result.response?.status).toBe(200);
    expect(result.response?.bodyPreview).toBe('{"ok":true}');
  });

  test("never throws on an unreachable endpoint — returns ok:false + the transport error", async () => {
    vi.stubGlobal("fetch", (): never => {
      throw new Error("ECONNREFUSED");
    });
    const result = await inspectCustomByoEndpoint({
      baseUrl: BASE_URL,
      apiKey: null,
      headers: null,
      model: "m",
    });
    expect(result.ok).toBe(false);
    expect(result.response).toBeNull();
    expect(result.error).toContain("ECONNREFUSED");
  });
});
