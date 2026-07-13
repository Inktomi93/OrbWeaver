// Proactive OAuth refresh for the mode-1 Max sub. The bundled runtime refreshes an expired token by
// tmp-writing + renaming over the config-dir path, which replaces our credentials symlink with a regular
// file — the refresh never reaches the real host file. This file refreshes the host token itself first,
// writing the fresh token back to the real ~/.claude/.credentials.json in place before the spawn.

import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import { secondsToMs } from "@orb/kit/time";
import { getLog, securityEvent } from "#foundation/observability";

// Extracted from the pinned SDK bundle: pairs with the platform.claude.com token endpoint (the
// console/API-key client is a different flow, deliberately not used here).
const CLI_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const OAUTH_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";

const EXPIRY_SKEW_MS = 60_000;
const REFRESH_TIMEOUT_MS = 10_000;
const CREDENTIALS_FILE_MODE = 0o600;

// Extra fields (scopes/subscriptionType/rateLimitTier/...) are preserved verbatim on write.
interface ClaudeAiOauth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshTokenExpiresAt?: number;
  [extra: string]: unknown;
}
interface HostCredentials {
  claudeAiOauth?: ClaudeAiOauth;
  [extra: string]: unknown;
}

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

export interface HostTokenDeps {
  readonly now: () => number;
  readonly fetch?: typeof fetch;
  readonly credentialsPath?: string;
}

interface ResolvedHostTokenDeps {
  readonly now: () => number;
  readonly fetch: typeof fetch;
  readonly credentialsPath: string;
}

function resolveHostTokenDeps(deps: HostTokenDeps): ResolvedHostTokenDeps {
  return {
    now: deps.now,
    fetch: deps.fetch ?? fetch,
    credentialsPath: deps.credentialsPath ?? join(homedir(), ".claude", ".credentials.json"),
  };
}

async function readHostCredentials(path: string): Promise<HostCredentials | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return parsed as HostCredentials;
  } catch {
    return null;
  }
}

function needsRefresh(oauth: ClaudeAiOauth, now: number): boolean {
  if (typeof oauth.refreshToken !== "string" || oauth.refreshToken.length === 0) {
    return false;
  }
  if (typeof oauth.refreshTokenExpiresAt === "number" && oauth.refreshTokenExpiresAt <= now) {
    return false;
  }
  if (typeof oauth.expiresAt !== "number") {
    return false;
  }
  return oauth.expiresAt - now <= EXPIRY_SKEW_MS;
}

async function requestRefresh(
  refreshToken: string,
  deps: ResolvedHostTokenDeps,
): Promise<OAuthTokenResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  timer.unref?.();
  try {
    const res = await deps.fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-beta": OAUTH_BETA_HEADER,
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLI_OAUTH_CLIENT_ID,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Status only — a 400/401 body could echo the token; never surface it.
      securityEvent(
        "host_sub_token_refresh_failed",
        { httpStatus: res.status },
        "security: host Max-sub OAuth refresh rejected by the token endpoint",
      );
      return null;
    }
    const body = (await res.json()) as unknown;
    if (!isTokenResponse(body)) {
      securityEvent(
        "host_sub_token_refresh_failed",
        { reason: "malformed_response" },
        "security: host Max-sub OAuth refresh returned an unexpected shape",
      );
      return null;
    }
    return body;
  } catch {
    securityEvent(
      "host_sub_token_refresh_failed",
      { reason: "network_error" },
      "security: host Max-sub OAuth refresh request failed (network/timeout)",
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isTokenResponse(body: unknown): body is OAuthTokenResponse {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const b = body as Record<string, unknown>;
  return typeof b["access_token"] === "string" && typeof b["expires_in"] === "number";
}

// The real host file is a regular file (not a symlink), so this rename-over is correct — it does not
// recreate the ephemeral-dir symlink-clobber bug.
async function writeRefreshedCredentials(
  path: string,
  full: HostCredentials,
  updated: ClaudeAiOauth,
  now: number,
): Promise<boolean> {
  const next: HostCredentials = { ...full, claudeAiOauth: updated };
  const tmp = `${path}.orb-${process.pid}-${now}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(next, null, 2), { mode: CREDENTIALS_FILE_MODE });
    await rename(tmp, path);
    return true;
  } catch {
    securityEvent(
      "host_sub_token_refresh_failed",
      { reason: "write_failed" },
      "security: host Max-sub OAuth refresh could not persist the new token to the host file",
    );
    return false;
  }
}

export async function refreshHostSubTokenIfMode1(
  credential: ResolvedCredential,
  refresh: () => Promise<boolean>,
): Promise<void> {
  if (credential.source !== "max-pro-sub") {
    return;
  }
  await refresh();
}

export async function ensureFreshHostSubToken(deps: HostTokenDeps): Promise<boolean> {
  const resolved = resolveHostTokenDeps(deps);
  // Single-flight per process: concurrent turns must not fire N refreshes (rotation races the file).
  refreshInFlight ??= (async (): Promise<boolean> => {
    try {
      return await runRefresh(resolved);
    } finally {
      refreshInFlight = null;
    }
  })();
  return await refreshInFlight;
}

let refreshInFlight: Promise<boolean> | null = null;

async function runRefresh(deps: ResolvedHostTokenDeps): Promise<boolean> {
  const full = await readHostCredentials(deps.credentialsPath);
  const oauth = full?.claudeAiOauth;
  if (full === null || oauth === undefined) {
    return false;
  }
  const now = deps.now();
  if (!needsRefresh(oauth, now)) {
    return false;
  }
  const refreshed = await requestRefresh(oauth.refreshToken, deps);
  if (refreshed === null) {
    return false;
  }
  const updated: ClaudeAiOauth = {
    ...oauth,
    accessToken: refreshed.access_token,
    expiresAt: now + (secondsToMs(refreshed.expires_in) ?? 0),
    refreshToken: refreshed.refresh_token ?? oauth.refreshToken,
  };
  const wrote = await writeRefreshedCredentials(deps.credentialsPath, full, updated, now);
  if (wrote) {
    getLog().info(
      { event: "host_sub_token_refreshed", expiresAt: updated.expiresAt },
      "agent-sdk: refreshed the host Max-sub OAuth token before spawn",
    );
  }
  return wrote;
}
