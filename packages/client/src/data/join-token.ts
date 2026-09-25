// The `/join` landing's token handoff (the multi-human invites lane). The server's `GET /join/:token`
// 302s a capable deployment to `/?join=<token>` (entry/http/join.ts) — the SPA consumes the query
// param HERE and immediately scrubs it: the app's URL discipline stays "pinned at /" (UI-Arch §5.1 —
// entity ids never live in the address bar, and a RAW INVITE TOKEN must not linger in it either:
// history/bookmarks/shoulder-surfing are exactly the leak the token-in-POST-body transport shape
// exists to avoid). Read via `location` directly (not router search state): the router deliberately
// has no search schema — this is a one-shot inbound handoff, not navigable state. A signed-out visit moves
// the token into the tab stash (`session-resume.ts`, D259) before the guard redirects to `/login`.

import { clearJoinStash, peekJoinStash, stashJoinToken } from "./session-resume.ts";

/** The address-bar slice this handoff reads and scrubs. Structural, so `#data` still type-checks in the
 *  DOM-less node program its node suites compile under (the `session-resume.ts` `tabStorage` shape). */
interface AddressBar {
  readonly location: { readonly pathname: string; readonly search: string; readonly hash: string };
  readonly history: { readonly replaceState: (data: null, unused: string, url: string) => void };
}

function addressBar(): AddressBar {
  return globalThis as typeof globalThis & AddressBar;
}

/** The inbound `?join=<token>` handoff, or null. */
export function readJoinToken(): string | null {
  const token = new URLSearchParams(addressBar().location.search).get("join");
  return token !== null && token.length > 0 ? token : null;
}

/** Scrub the token from the address bar (history included) — call as soon as the token is captured. */
export function clearJoinParam(): void {
  const { location, history } = addressBar();
  const rawSearch = location.search;
  const fields = rawSearch.slice(1).split("&");
  const remainingFields = fields.filter((field: string) => {
    const equalsIndex = field.indexOf("=");
    const rawKey = equalsIndex === -1 ? field : field.slice(0, equalsIndex);
    // @orb-waive caught-failure-ownership(catch): a malformed percent-encoding falls back to
    // comparing the raw key, a deliberate fail-safe so a garbled field never blocks the scrub. Ends if the
    // fallback comparison stops being equivalent for well-formed keys.
    try {
      return decodeURIComponent(rawKey.replaceAll("+", " ")) !== "join";
    } catch {
      return rawKey !== "join";
    }
  });
  const search = rawSearch === "" || remainingFields.length === 0 ? "" : `?${remainingFields.join("&")}`;
  history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
}

/** The signed-out guard's step before its `/login` redirect: move an inbound `?join=` token into the tab
 *  stash and scrub it from the address bar and history. */
export function stashInboundJoinToken(): void {
  const token = readJoinToken();
  if (token === null) {
    return;
  }
  stashJoinToken(token);
  clearJoinParam();
}

/** The token the signed-in app root opens the join dialog with: the address bar's own `?join=` first, else
 *  the token a signed-out visit stashed before sign-in. Reads only, so it is safe as a state initializer. */
export function peekInboundJoinToken(): string | null {
  return readJoinToken() ?? peekJoinStash();
}

/** Spend the inbound token once the dialog holds it: scrub `?join=` from the address bar and history, and
 *  drop the stash, so neither a reload nor Back replays it. Run it from an effect, never during render. */
export function consumeInboundJoinToken(): void {
  if (readJoinToken() !== null) {
    clearJoinParam();
  }
  clearJoinStash();
}
