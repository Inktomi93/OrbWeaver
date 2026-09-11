// `throwHttpError` — the ONE non-OK-response error for the raw-`fetch` upload seams (import-bundle,
// import-characters, upload-asset — Hono multipart/raw-body routes, not tRPC). Was hand-rolled three
// ways (a body-reading variant, and two status-text-only variants that discarded the server's `{error}`);
// this is the body-reading variant, the canonical shape (C18 — net-negative LOC, no behavior loss).

/** Throw `Error("<prefix>: <status> <statusText> — <server body>")` for a non-OK `Response`. Reads the
 *  body as text (never fails — a malformed/absent body degrades to no suffix) so the server's real
 *  `{error}` message (or whatever it sent) reaches the caller instead of a bare status line. */
export async function throwHttpError(prefix: string, response: Response): Promise<never> {
  // @orb-waive caught-failure-ownership(response.text): documented degrade — a malformed/absent body loses only the message suffix; the function still throws with the status line. Ends if the thrown Error needs the body to be meaningful.
  const detail = await response.text().catch(() => "");
  const suffix = detail === "" ? "" : ` — ${detail}`;
  throw new Error(`${prefix}: ${response.status} ${response.statusText}${suffix}`);
}
