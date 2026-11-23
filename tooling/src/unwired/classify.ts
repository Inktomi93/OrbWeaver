// Source sites: a repository-relative file and offset, its key, and the TypeScript 6 parse a site is read from.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

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

/** Source files parsed alone by TypeScript 6, one parse per file for the whole run. */
export class Sources {
  readonly #root: string;
  readonly #parsed = new Map<string, ts.SourceFile>();

  constructor(root: string) {
    this.#root = root;
  }

  get(file: string): ts.SourceFile {
    const found = this.#parsed.get(file);
    if (found !== undefined) {
      return found;
    }
    const parsed = parseAlone(file, readFileSync(join(this.#root, file), "utf8"));
    this.#parsed.set(file, parsed);
    return parsed;
  }

  /** The 1-based line of a site. */
  line(site: Site): number {
    return this.get(site.file).getLineAndCharacterOfPosition(site.position).line + 1;
  }
}

/** A source file parsed alone, for an engine that has positions but no program. */
function parseAlone(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** The name that starts at `position`, or undefined when none does: find-references also reports a `{@link}` in a
 *  doc comment, where no code names the symbol. A string literal's reported span starts inside its quote. */
export function nameAt(source: ts.SourceFile, position: number): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (position >= node.getStart(source) && position < node.getEnd()) {
      found = node;
      ts.forEachChild(node, visit);
    }
  };
  visit(source);
  const start = found?.getStart(source);
  return start === position || (found !== undefined && ts.isStringLiteralLike(found) && start === position - 1) ? found : undefined;
}
