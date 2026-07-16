// biome-ignore-all lint/style/useNamingConvention: OAuth wire + credentials-file fields are snake_case
// (grant_type/access_token/expires_in/refresh_token) — the SDK/OAuth wire vocab, not our identifiers.
// biome-ignore-all lint/security/noSecrets: the token strings here are obvious test fixtures, not real keys.
//
// host-token — the PROACTIVE Max-sub OAuth refresh (fixes `auth_failed` every few hours when the host
// access token expires but the spawned runtime's own refresh can't persist through the ephemeral-dir
// symlink). Load-bearing security guarantees, in test form:
//   • refreshes ONLY when the access token is expired AND a usable refresh token exists;
//   • writes the fresh token back to the REAL host file IN PLACE (0600, other fields preserved);
//   • best-effort — NEVER throws into a turn (no file / dead refresh token / HTTP error → no-op);
//   • the refresh POST hits Anthropic's own OAuth endpoint with the CLI client_id — never our HTTP client
//     to a paid/third-party URL;
//   • NO token value is ever logged.

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "@orb/server/foundation/observability";
import type { HostTokenDeps } from "@orb/server/infra/providers/backends/agent-sdk";
import { ensureFreshHostSubToken, refreshHostSubTokenIfMode1 } from "@orb/server/infra/providers/backends/agent-sdk";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { makeOpenRouterCredential, makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

/** A typed fake `fetch` — `vi.fn<typeof fetch>()` so no `as unknown as` double-cast is needed (the
 *  no-test-fabrication gate); the `.mock` inspection stays type-safe. */
type FetchMock = Mock<typeof fetch>;

const NOW = 1_800_000_000_000; // a fixed epoch-ms "now" for every test (injected clock).
const OAUTH_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLI_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

const OLD_ACCESS = "old-access-token-SECRET";
const OLD_REFRESH = "old-refresh-token-SECRET";
const NEW_ACCESS = "new-access-token-SECRET";
const NEW_REFRESH = "new-refresh-token-SECRET";

let dir: string;
let credPath: string;

/** Write a host `.credentials.json` with the given oauth block merged over a realistic base. */
function writeCreds(oauth: Record<string, unknown>): void {
  writeFileSync(
    credPath,
    JSON.stringify({
      claudeAiOauth: {
        accessToken: OLD_ACCESS,
        refreshToken: OLD_REFRESH,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
        rateLimitTier: "default",
        ...oauth,
      },
    }),
    { mode: 0o600 },
  );
}

function readOauth(): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(credPath, "utf8")) as {
    claudeAiOauth: Record<string, unknown>;
  };
  return parsed.claudeAiOauth;
}

/** A fake token endpoint returning a successful refresh. */
function okFetch(body: Record<string, unknown> = {}): FetchMock {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      Response.json({
        access_token: NEW_ACCESS,
        expires_in: 3600,
        refresh_token: NEW_REFRESH,
        ...body,
      }),
    ),
  );
}

function deps(fetchImpl: FetchMock): HostTokenDeps {
  return { now: () => NOW, fetch: fetchImpl, credentialsPath: credPath };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "orb-host-token-test-"));
  credPath = join(dir, ".credentials.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("ensureFreshHostSubToken — the expired-access + valid-refresh path (the LIVE bug)", () => {
  test("refreshes the expired token and writes the fresh token back IN PLACE (0600, fields preserved)", async () => {
    // expired ~1h ago; refresh token valid for ~24 days.
    writeCreds({ expiresAt: NOW - 3_600_000, refreshTokenExpiresAt: NOW + 2_000_000_000 });
    const fetchImpl = okFetch();

    const refreshed = await ensureFreshHostSubToken(deps(fetchImpl));

    expect(refreshed).toBe(true);
    // POST hit Anthropic's own endpoint with the CLI client_id + grant_type — never our HTTP client to a
    // paid base URL.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call ?? [];
    expect(url).toBe(OAUTH_TOKEN_URL);
    const sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(sentBody).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: OLD_REFRESH,
      client_id: CLI_OAUTH_CLIENT_ID,
    });

    // The REAL host file now carries the new token + a future expiry (ms), and the rotated refresh token.
    const oauth = readOauth();
    expect(oauth["accessToken"]).toBe(NEW_ACCESS);
    expect(oauth["refreshToken"]).toBe(NEW_REFRESH);
    expect(oauth["expiresAt"]).toBe(NOW + 3_600_000);
    // Unrelated fields survive the in-place write.
    expect(oauth["subscriptionType"]).toBe("max");
    expect(oauth["scopes"]).toEqual(["user:inference", "user:profile"]);
    // 0600 preserved (no widening of the secret file's perms).
    expect(statSync(credPath).mode.toString(8).slice(-3)).toBe("600");
  });

  test("keeps the OLD refresh token when the endpoint does not rotate it", async () => {
    writeCreds({ expiresAt: NOW - 1000, refreshTokenExpiresAt: NOW + 2_000_000_000 });
    // No refresh_token in the response ⇒ the stored one is retained.
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ access_token: NEW_ACCESS, expires_in: 3600 })));

    await ensureFreshHostSubToken(deps(fetchImpl));

    expect(readOauth()["refreshToken"]).toBe(OLD_REFRESH);
  });

  test("NEVER logs a token value on the success path (only the numeric expiry)", async () => {
    writeCreds({ expiresAt: NOW - 3_600_000, refreshTokenExpiresAt: NOW + 2_000_000_000 });
    const infoSpy = vi.spyOn(logger, "info");

    await ensureFreshHostSubToken(deps(okFetch()));

    const serialized = JSON.stringify(infoSpy.mock.calls);
    for (const token of [OLD_ACCESS, OLD_REFRESH, NEW_ACCESS, NEW_REFRESH]) {
      expect(serialized).not.toContain(token);
    }
  });
});

describe("ensureFreshHostSubToken — the no-op paths (a fresh token is not refreshed)", () => {
  test("a NOT-yet-expired access token is left untouched (no fetch, no write)", async () => {
    writeCreds({ expiresAt: NOW + 3_600_000, refreshTokenExpiresAt: NOW + 2_000_000_000 });
    const fetchImpl = okFetch();

    const refreshed = await ensureFreshHostSubToken(deps(fetchImpl));

    expect(refreshed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readOauth()["accessToken"]).toBe(OLD_ACCESS);
  });

  test("a DEAD refresh token (itself expired) does not hammer the endpoint — manual login required", async () => {
    writeCreds({ expiresAt: NOW - 3_600_000, refreshTokenExpiresAt: NOW - 1000 });
    const fetchImpl = okFetch();

    const refreshed = await ensureFreshHostSubToken(deps(fetchImpl));

    expect(refreshed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a missing credentials file is a clean no-op (dev/CI without `claude login`)", async () => {
    // credPath intentionally not written.
    const fetchImpl = okFetch();

    const refreshed = await ensureFreshHostSubToken(deps(fetchImpl));

    expect(refreshed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("ensureFreshHostSubToken — best-effort: a failure NEVER throws + never corrupts the file", () => {
  test("an HTTP error from the token endpoint is swallowed; the stale file is left intact", async () => {
    writeCreds({ expiresAt: NOW - 3_600_000, refreshTokenExpiresAt: NOW + 2_000_000_000 });
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ error: "invalid_grant" }, { status: 400 })));

    const refreshed = await ensureFreshHostSubToken(deps(fetchImpl));

    expect(refreshed).toBe(false);
    // The stale token is untouched — the spawn proceeds and surfaces the SDK's own auth error unchanged.
    expect(readOauth()["accessToken"]).toBe(OLD_ACCESS);
  });

  test("a network throw is swallowed (best-effort — never fatal to the turn)", async () => {
    writeCreds({ expiresAt: NOW - 3_600_000, refreshTokenExpiresAt: NOW + 2_000_000_000 });
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new Error("ECONNREFUSED")));

    await expect(ensureFreshHostSubToken(deps(fetchImpl))).resolves.toBe(false);
  });

  test("a malformed token response (missing access_token) is rejected, not written", async () => {
    writeCreds({ expiresAt: NOW - 3_600_000, refreshTokenExpiresAt: NOW + 2_000_000_000 });
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ expires_in: 3600 })));

    const refreshed = await ensureFreshHostSubToken(deps(fetchImpl));

    expect(refreshed).toBe(false);
    expect(readOauth()["accessToken"]).toBe(OLD_ACCESS);
  });
});

describe("refreshHostSubTokenIfMode1 — the source gate (mode-1 ONLY)", () => {
  test("a mode-2 (openrouter) credential NEVER invokes the refresh seam (the sub token stays untouched)", async () => {
    // The gate is a pure `source === "max-pro-sub"` check: a mode-2 credential returns WITHOUT calling the
    // injected refresh — the sub-token isolation from paid/local paths (mode-2/3 null every host credential
    // source) is not disturbed. A max-pro-sub credential routing through IS covered by the direct tests above.
    const refresh = vi.fn(() => Promise.resolve(false));
    await refreshHostSubTokenIfMode1(makeOpenRouterCredential(), refresh);
    expect(refresh).not.toHaveBeenCalled();
  });

  test("a max-pro-sub credential DOES invoke the refresh seam", async () => {
    const refresh = vi.fn(() => Promise.resolve(true));
    await refreshHostSubTokenIfMode1(makeResolvedCredential("max-pro-sub"), refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
