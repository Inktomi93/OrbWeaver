// File-name grammar for the numbered kinds: `NNNN-<slug>.md` under `docs/adr/` and `docs/work/`. One
// spelling of the slug and the zero-padding, so a verb that mints and a check that reads agree.
export const ID_WIDTH = 4;
const NUMBERED_NAME_RE = /^(\d{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/u;
const SLUG_MAX_WORDS = 8;

export function padId(id: number): string {
  return String(id).padStart(ID_WIDTH, "0");
}

/** A lowercase hyphenated slug from free text, at most `SLUG_MAX_WORDS` words. Empty input is refused by
 *  the caller, which knows what the text was for. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/`[^`]*`/gu, (span) => span.slice(1, -1))
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "")
    .slice(0, SLUG_MAX_WORDS)
    .join("-");
}

export function isSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

export function numberedName(id: number, slug: string): string {
  return `${padId(id)}-${slug}.md`;
}

/** The id and slug of a numbered file name, or null when the name is not in the grammar. */
export function parseNumberedName(name: string): { readonly id: number; readonly slug: string } | null {
  const match = NUMBERED_NAME_RE.exec(name);
  if (match === null) {
    return null;
  }
  return { id: Number(match[1]), slug: match[2] ?? "" };
}

export function basenameOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}
