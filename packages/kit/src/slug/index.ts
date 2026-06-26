// slugifyHandle — stable character handle from a display name. Lowercase + NFKD-fold +
// non-alphanumeric → hyphens. Shared because both sides derive handles from names: the server's
// import pipeline collapses ST's case-variant chat dirs ("Block of Cheese" / "Block Of Cheese") onto
// one character, and the client's create flow asks for a NAME (the user's language) and derives the
// handle instead of asking for "a short slug".

/** Runs of any non `[a-z0-9]` char (post-fold) → a single hyphen separator. */
const NON_SLUG_RUN = /[^a-z0-9]+/g;
/** Leading / trailing hyphens left after the collapse — trimmed off the edges. */
const EDGE_HYPHENS = /^-+|-+$/g;
/** Fallback when a name folds to nothing (e.g. all-emoji / all-punctuation). */
const FALLBACK_HANDLE = "unnamed";

export function slugifyHandle(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(NON_SLUG_RUN, "-")
    .replace(EDGE_HYPHENS, "");
  return slug.length > 0 ? slug : FALLBACK_HANDLE;
}
