// The `/join` landing's token handoff (the multi-human invites lane). The server's `GET /join/:token`
// 302s a capable deployment to `/?join=<token>` (entry/http/join.ts) — the SPA consumes the query
// param HERE and immediately scrubs it: the app's URL discipline stays "pinned at /" (UI-Arch §5.1 —
// entity ids never live in the address bar, and a RAW INVITE TOKEN must not linger in it either:
// history/bookmarks/shoulder-surfing are exactly the leak the token-in-POST-body transport shape
// exists to avoid). Read via `location` directly (not router search state): the router deliberately
// has no search schema — this is a one-shot inbound handoff, not navigable state. A signed-out visit moves
// the token into the tab stash (`session-resume.ts`, D259) before the guard redirects to `/login`.

import { withoutUrlSearchParam } from "../lib/url-search.ts";
import { clearJoinStash, peekJoinStash, stashJoinToken } from "./session-resume.ts";

const JOIN_PARAM = "join";

/** The address-bar slice this handoff reads and scrubs. Structural, so `#data` still type-checks in the
 *  DOM-less node program its node suites compile under (the `session-resume.ts` `tabStorage` shape). */
interface AddressBar {
  readonly location: { readonly pathname: string; readonly search: string; readonly hash: string };
}

function addressBar(): AddressBar {
  return globalThis as typeof globalThis & AddressBar;
}

/** The inbound `?join=<token>` handoff, or null.
 *  @public Test-anchored module surface; tests/client/data/join-token.dom.test.ts calls it directly. */
export function readJoinToken(): string | null {
  const token = new URLSearchParams(addressBar().location.search).get(JOIN_PARAM);
  return token !== null && token.length > 0 ? token : null;
}

/** Scrub the token from the address bar (history included) — call as soon as the token is captured.
 *  @public Test-anchored module surface; tests/client/data/join-token.dom.test.ts calls it directly. */
export function clearJoinParam(replaceUrl: (href: string) => void): void {
  replaceUrl(withoutUrlSearchParam(addressBar().location, JOIN_PARAM));
}

/** The signed-out guard's step before its `/login` redirect: copy an inbound `?join=` token into the tab stash.
 *  @remarks It never touches the address bar. The router patches `history.replaceState`, so a scrub inside a
 *  `beforeLoad` starts a second load of `/` that races the redirect and can crash the landing. The redirect
 *  replaces the `/?join=` history entry itself, which removes the token from the address bar and from Back. */
export function stashInboundJoinToken(): void {
  const token = readJoinToken();
  if (token !== null) {
    stashJoinToken(token);
  }
}

/** The token the signed-in app root opens the join dialog with: the address bar's own `?join=` first, else
 *  the token a signed-out visit stashed before sign-in. Reads only, so it is safe as a state initializer. */
export function peekInboundJoinToken(): string | null {
  return readJoinToken() ?? peekJoinStash();
}

/** Spend the inbound token once the dialog holds it: scrub `?join=` from the address bar and history, and
 *  drop the stash, so neither a reload nor Back replays it. Run it from an effect, never during render. */
export function consumeInboundJoinToken(replaceUrl: (href: string) => void): void {
  if (readJoinToken() !== null) {
    clearJoinParam(replaceUrl);
  }
  clearJoinStash();
}
