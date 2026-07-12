// infra/providers/backends/agent-sdk/host-token — PROACTIVE OAuth refresh for the mode-1 Max sub.
//
// WHY THIS EXISTS (the bug it fixes): the mode-1 firewall (env.ts) SYMLINKS the host
// `~/.claude/.credentials.json` into an ephemeral CLAUDE_CONFIG_DIR. When the spawned Claude runtime's
// access token is expired, it DOES refresh (bundled SDK 0.3.206: POST /v1/oauth/token) — but it persists
// the new token by writing a temp file and `rename()`-ing it OVER the config-dir path. That rename REPLACES
// our symlink with a regular file INSIDE the throwaway temp dir, so the refresh never reaches the real host
// file; a fresh process re-symlinks the STALE original → `authentication_failed` every few hours until a
// manual `claude login`. (Verified: the SDK's `Qp` credential writer is tmp+rename; a symlink target is not
// followed by a rename-over.)
//
// THE FIX: before a mode-1 spawn, if the host access token is expired (we read ONLY the non-secret
// `expiresAt`), refresh it OURSELVES using the host's own refresh token against the SAME Anthropic OAuth
// endpoint + client_id the CLI uses, and write the fresh token back to the REAL host file IN PLACE
// (preserving 0600 + every other field). Then the symlink resolves to a fresh token and the spawn succeeds.
//
// SECURITY INVARIANTS (this file is the ONLY reader of the host OAuth token, and it never leaves the box):
//   • The refresh token is used ONLY against Anthropic's own OAuth endpoint — never our HTTP client to a
//     paid/third-party base URL (the st-claude-proxy ban shape). The endpoint host is a hardcoded const.
//   • Public host ⇒ the global SSRF egress firewall permits it (it blocks only private targets); no
//     allowlist entry is needed. A plain `fetch` rides the sanctioned outbound dispatcher.
//   • NO token value is ever logged, echoed, thrown, or put in an error message. We read/write the token
//     bytes but only `expiresAt` (a number) ever appears in a log field.
//   • Best-effort, NEVER fatal: any failure (no file, no refresh token, network/HTTP error, unwritable
//     file) logs a securityEvent and returns — the spawn proceeds and the SDK surfaces its own unchanged
//     `auth_failed`. We never make a turn WORSE than it is today.
//   • This runs for mode-1 (`max-pro-sub`, owner-gated) ONLY. It does NOT touch mode-2/3 (those null every
//     host credential source by design) — the sub token stays structurally unreachable from paid/local paths.

import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import { secondsToMs } from "@orb/kit/time";
import { getLog, securityEvent } from "#foundation/observability";

// ── The Claude Code CLI's own claude.ai (Max-sub) OAuth client — hardcoded in the bundled runtime ────────
// Extracted from the pinned SDK 0.3.206 bundle: the `claudeAiOauth` block's client pairs this CLIENT_ID
// with the platform.claude.com token endpoint (the console/API-key client `22422756-…` is a DIFFERENT
// flow and is deliberately NOT used here). A refresh POST needs only these two + the host refresh token.
const CLI_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const OAUTH_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
/** The beta header the CLI's OAuth client sends on the refresh request (bundle const `oauth-2025-04-20`). */
const OAUTH_BETA_HEADER = "oauth-2025-04-20";

/** Refresh when the access token is expired OR expires within this skew (a turn can outlive a razor-thin
 *  remaining life; refresh a little early rather than mid-turn). Milliseconds. */
const EXPIRY_SKEW_MS = 60_000;
/** The refresh HTTP request budget — a hung token endpoint must never stall a turn's spawn. */
const REFRESH_TIMEOUT_MS = 10_000;
/** File mode for the host credentials file — 0600, matching what `claude login` writes. */
const CREDENTIALS_FILE_MODE = 0o600;

/** The subset of the host `.credentials.json` `claudeAiOauth` block we read/write. Extra fields
 *  (`scopes`/`subscriptionType`/`rateLimitTier`/…) are preserved verbatim on write. */
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

/** The Anthropic OAuth token-endpoint response fields we consume (standard OAuth; `refresh_token` may
 *  rotate — if present it REPLACES the stored one, matching the CLI). */
interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

/** Injectable seams so the refresh is unit-testable without touching the real host file or network.
 *  `now` is REQUIRED — the composition root owns the clock (no ambient `Date.now()` in production; the same
 *  determinism seam tests use). `fetch`/`credentialsPath` default to the real host resources. Nothing here
 *  is per-request — the host token is a machine-level resource. */
export interface HostTokenDeps {
  /** The injected epoch-ms clock, threaded from the spawn entrypoint's `AgentSdkDeps.now`. */
  readonly now: () => number;
  /** Defaults to the global `fetch` (rides the sanctioned SSRF egress dispatcher). */
  readonly fetch?: typeof fetch;
  /** Absolute path to the host `.credentials.json` (defaults to `~/.claude/.credentials.json`). */
  readonly credentialsPath?: string;
}

/** The deps with every seam resolved to a concrete value — the internal shape the refresh flow runs on. */
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

/** Parse the host credentials file into the typed shape, or `null` on any read/parse failure or a shape
 *  that lacks the OAuth block (dev/CI without `claude login`). Never throws. */
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

/** Does the token block need a refresh? Requires a usable refresh token (present + not itself expired) and
 *  an access token at/within the expiry skew. Pure — the ONLY field consulted from the secret block is the
 *  numeric `expiresAt`/`refreshTokenExpiresAt`; token strings are never inspected here. */
function needsRefresh(oauth: ClaudeAiOauth, now: number): boolean {
  if (typeof oauth.refreshToken !== "string" || oauth.refreshToken.length === 0) {
    return false;
  }
  if (typeof oauth.refreshTokenExpiresAt === "number" && oauth.refreshTokenExpiresAt <= now) {
    // The refresh token itself is dead — only a manual `claude login` recovers; don't hammer the endpoint.
    return false;
  }
  if (typeof oauth.expiresAt !== "number") {
    return false;
  }
  return oauth.expiresAt - now <= EXPIRY_SKEW_MS;
}

/** POST the refresh against Anthropic's own OAuth endpoint. Returns the parsed token response, or `null`
 *  on any transport/HTTP/parse failure. NEVER includes the token in an error path. */
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
      // status only — a 400/401 body could echo the token; never surface it.
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
    // network error / timeout / abort — best-effort, the spawn proceeds and surfaces the SDK's own error.
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

/** Write the refreshed credentials back to the REAL host file IN PLACE, preserving 0600 + every unrelated
 *  field. Writes a sibling temp file then renames over the real path (atomic for a single writer). The real
 *  file is a regular file (not a symlink), so this replacement is correct — it does NOT recreate the
 *  ephemeral-dir symlink-clobber bug (that bug was a rename over a SYMLINK inside the throwaway dir). */
async function writeRefreshedCredentials(
  path: string,
  full: HostCredentials,
  updated: ClaudeAiOauth,
  now: number,
): Promise<boolean> {
  const next: HostCredentials = { ...full, claudeAiOauth: updated };
  // A distinct temp name in the SAME dir (rename is atomic only within a filesystem).
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

/**
 * The mode-1 spawn guard the runners call: run the injected `refresh` seam ONLY for the `max-pro-sub`
 * (mode-1) source, a no-op for every other credential (mode-2/3 null every host credential source by design
 * — the sub token must stay unreachable there). Kept here so the source gate lives in ONE place and each
 * spawn entrypoint is a single `await` (no per-runner `if (source === …)` branch inflating its complexity).
 * `refresh` is `AgentSdkDeps.refreshHostSubToken` (real impl in production, a no-op stub in tests).
 */
export async function refreshHostSubTokenIfMode1(
  credential: ResolvedCredential,
  refresh: () => Promise<boolean>,
): Promise<void> {
  if (credential.source !== "max-pro-sub") {
    return;
  }
  await refresh();
}

/**
 * PROACTIVELY refresh the host Max-sub OAuth token if it is expired, writing the fresh token back to the
 * real `~/.claude/.credentials.json` BEFORE a mode-1 spawn. Idempotent + best-effort + NEVER throws — call
 * it (awaited) at every mode-1 spawn entrypoint. Returns `true` if a refresh was performed and persisted,
 * `false` otherwise (already-fresh, no file, no usable refresh token, or a swallowed failure). The token
 * value never appears in a return value, a log, or an error.
 */
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
    // `secondsToMs` is the sanctioned seconds→ms engine (no ad-hoc *1000). expires_in is standard-OAuth seconds.
    expiresAt: now + (secondsToMs(refreshed.expires_in) ?? 0),
    // The refresh token rotates on some grants — persist the new one when returned (matches the CLI).
    refreshToken: refreshed.refresh_token ?? oauth.refreshToken,
  };
  const wrote = await writeRefreshedCredentials(deps.credentialsPath, full, updated, now);
  if (wrote) {
    // Metadata only — the new expiry, never a token. Confirms the auto-refresh path ran.
    getLog().info(
      { event: "host_sub_token_refreshed", expiresAt: updated.expiresAt },
      "agent-sdk: refreshed the host Max-sub OAuth token before spawn",
    );
  }
  return wrote;
}
