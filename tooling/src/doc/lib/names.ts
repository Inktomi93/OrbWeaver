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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** How a text file refers to the doc at `path`: by its parent folder and file name anywhere (every
 *  relative or repository path to it ends with that pair), or by the bare file name, with or without a
 *  leading `./`, inside its own folder, where a name under another folder is not it. */
export function referencePatterns(path: string): { readonly anywhere: RegExp; readonly sameFolder: RegExp } {
  const parts = path.split("/");
  const name = escapeRegExp(parts.at(-1) ?? "");
  const parent = escapeRegExp(parts.at(-2) ?? "");
  return {
    anywhere: new RegExp(`(?<![\\w-])${parent}/${name}`, "gu"),
    sameFolder: new RegExp(`(?<![\\w-])(?<![\\w-]/)${name}`, "gu"),
  };
}

export function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/") + 1);
}
