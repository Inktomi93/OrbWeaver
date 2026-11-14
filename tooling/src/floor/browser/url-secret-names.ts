// The URL pair and path names whose value is a credential only because a URL carries it. Each is an ordinary field
// name in a JSON body, so the evidence-name predicate (`tooling/src/snap/lib/har-redaction.ts`) stays without them.
//
// The app mints the invite names, and these sets must change with it: `join` is the `/?join=<token>` handoff
// (`packages/client/src/data/join-token.ts`, D259) and the `GET /join/:token` landing
// (`packages/server/src/entry/http/join.ts`); `invite` carries a stashed invite to sign-in
// (`packages/client/src/features/auth/lib/sso-redirect.ts`). Neither home exports the name, and tooling cannot import
// the client's DOM world, so each is spelled here.

/** A credential pair whose value is often an ordinary word (`?key=home`, an OAuth `?code=`). */
export const URL_WORD_PAIR_NAMES: ReadonlySet<string> = new Set(["key", "code"]);

/** A credential pair whose value is a minted token. */
export const URL_SECRET_PAIR_NAMES: ReadonlySet<string> = new Set(["join", "invite", "jwt"]);

/** A path segment whose next segment is a minted token. */
export const URL_SECRET_PATH_NAMES: ReadonlySet<string> = new Set(["join"]);

// The URL parser drops these anywhere in its input, so `jo<TAB>in` is `join`.
const PARSER_DROPPED = /[\t\n\r]/gu;

function segmentName(segment: string): string {
  const name = segment.replace(PARSER_DROPPED, "");
  // a malformed escape is judged as written, which no secret path name matches. Ends if a name needs a malformed escape.
  try {
    return decodeURIComponent(name).toLowerCase();
  } catch {
    return name.toLowerCase();
  }
}

/** `path` with the segment after each secret path name replaced by `mask`, every other byte kept. */
export function maskSecretPathSegments(path: string, mask: string): string {
  const segments = path.split("/");
  return segments
    .map((segment, index) => (index > 0 && segment !== "" && URL_SECRET_PATH_NAMES.has(segmentName(segments[index - 1] ?? "")) ? mask : segment))
    .join("/");
}
