// Source sites: a repository-relative file and offset, and its key.

/** One reference: a repository-relative file and the 0-based offset where the name starts. */
export interface Site {
  readonly file: string;
  readonly position: number;
}

export const siteKey = (site: Site): string => `${site.file}:${site.position}`;

const SYNTAX_ROLES = ["read", "write", "type"] as const;
/** `write`: an object literal, JSX attribute or plain assignment gives the property a value. `type`: a type position,
 *  a declaration or an import names it. `read`: everything else. */
export type SyntaxRole = (typeof SYNTAX_ROLES)[number];
