// The `/join` landing's token handoff (the multi-human invites lane). The server's `GET /join/:token`
// 302s a capable deployment to `/?join=<token>` (entry/http/join.ts) — the SPA root consumes the query
// param HERE and immediately scrubs it: the app's URL discipline stays "pinned at /" (UI-Arch §5.1 —
// entity ids never live in the address bar, and a RAW INVITE TOKEN must not linger in it either:
// history/bookmarks/shoulder-surfing are exactly the leak the token-in-POST-body transport shape
// exists to avoid). Read via `location` directly (not router search state): the router deliberately
// has no search schema — this is a one-shot inbound handoff, not navigable state.

/** The inbound `?join=<token>` handoff, or null. Read ONCE at composition mount (app-root.tsx). */
export function readJoinToken(): string | null {
  const token = new URLSearchParams(globalThis.location.search).get("join");
  return token !== null && token.length > 0 ? token : null;
}

/** Scrub the token from the address bar (history included) — call as soon as the token is captured. */
export function clearJoinParam(): void {
  globalThis.history.replaceState(null, "", "/");
}
